/**
 * useXRMode — XR overlay mode detection + camera passthrough + HolodeXR bridge
 *
 * Activation (any one of these triggers XR mode):
 *   1. URL param ?xr, ?holodexr, or ?sneakar-xr
 *   2. Running inside an iframe (HolodeXR WebView overlay)
 *   3. window.parent.postMessage({ type: 'holodexr:init' })
 *   4. window.SurrogateXR.launch() called directly
 *
 * HolodeXR postMessage protocol (incoming):
 *   { type: 'holodexr:init', sessionId? }            → activate XR, start camera
 *   { type: 'holodexr:marker-detected', markerId? }  → auto-awaken the Oracle
 *   { type: 'holodexr:marker-lost' }                 → Oracle goes dormant (optional)
 *
 * Oracle → HolodeXR postMessage (outgoing):
 *   { type: 'oracle:ready', version: '2.0' }
 *   { type: 'oracle:camera-ready' }
 *   { type: 'oracle:awakened' }
 *   { type: 'oracle:dormant' }
 *   { type: 'oracle:session-end', totemLevel, coins, alignment, sessionId, version: '2.0' }
 *
 * window.SurrogateXR global API (for direct HolodeXR JS bridge):
 *   SurrogateXR.version          → '2.0'
 *   SurrogateXR.launch()         → activate XR mode + start camera
 *   SurrogateXR.markerDetected() → trigger Oracle awaken sequence
 *   SurrogateXR.markerLost()     → Oracle returns to dormant
 *   SurrogateXR.getStatus()      → { xrMode, cameraReady, markerActive, phase }
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';

const THREE_MathUtils = THREE.MathUtils;

export interface SeekerMotion {
  phoneTilt: { x: number; y: number }; // normalized -1 to 1 (DeviceOrientation)
  facePos:  { x: number; y: number }; // normalized -1 to 1 (FaceDetector or skin-tone centroid)
  hasFace:  boolean;
}

/** Natural-video-pixel bounding box of detected face, for AR overlay positioning. */
export interface FaceBounds {
  x: number; y: number; w: number; h: number;
}

export interface UseXRModeReturn {
  isXRMode: boolean;
  /** Camera passthrough is ACTIVE (user opted in). Separate from isXRMode (context). */
  cameraActive: boolean;
  /** True when a face was detected in the last ~1.5s. */
  faceDetected: boolean;
  /** Latest face bounding box in natural video pixel coords. Read in RAF loops — not state. */
  faceBoundsRef: React.RefObject<FaceBounds | null>;
  /** Activate full XR mode + camera from hamburger menu. */
  activateXRMode: () => void;
  /** Deactivate XR mode — back to alley. */
  deactivateXRMode: () => void;
  /** User explicitly activates camera passthrough — opt-in, not automatic. */
  activateCamera: () => void;
  /** User deactivates camera — returns to alley background. */
  deactivateCamera: () => void;
  cameraVideoRef: React.RefObject<HTMLVideoElement | null>;
  cameraReady: boolean;
  cameraError: string | null;
  markerActive: boolean;
  autoStart: boolean; // ?autostart param — skips tap gesture, boots immediately
  seekerMotionRef: React.RefObject<SeekerMotion>;
}

// Detect XR mode synchronously from URL (stable across renders)
function detectXRMode(): boolean {
  if (typeof window === 'undefined') return false;
  const p = new URLSearchParams(window.location.search);
  // ── Standard mode override: ?standard or ?noXR forces normal mode even in iframe ──
  // This is the escape hatch for Replit preview (which is itself an iframe) and any
  // other host that embeds the page but doesn't want XR/camera mode activated.
  if (p.has('standard') || p.has('noXR') || p.has('no-xr')) return false;
  // Explicit XR params → always XR
  if (p.has('xr') || p.has('holodexr') || p.has('sneakar-xr')) return true;
  // Iframe detection → HolodeXR WebView context (NOT Replit preview when ?standard set)
  try { return window.self !== window.top; } catch { return true; /* cross-origin iframe */ }
}

export function useXRMode(onMarkerDetected?: () => void): UseXRModeReturn {
  const [isXRMode, setIsXRMode] = useState(detectXRMode);
  // Camera passthrough is NOT automatic — user must explicitly opt in.
  // Exception: holodexr:init postMessage activates it (headset context).
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [markerActive, setMarkerActive] = useState(false);

  const autoStart = isXRMode && new URLSearchParams(window.location.search).has('autostart');

  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const seekerMotionRef = useRef<SeekerMotion>({
    phoneTilt: { x: 0, y: 0 },
    facePos:   { x: 0, y: 0 },
    hasFace:   false
  });

  // ── Device Orientation Listener ──
  useEffect(() => {
    // Only track if XR or camera is active (seeker allowed motion)
    if (!isXRMode && !cameraActive) return;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (!e.beta || !e.gamma) return;
      // beta: -180 to 180 (front/back tilt), gamma: -90 to 90 (left/right tilt)
      // Normalize to -1...1 range for the Oracle's gaze
      const x = THREE_MathUtils.clamp(e.gamma / 30, -1, 1);
      const y = THREE_MathUtils.clamp((e.beta - 45) / 30, -1, 1); // 45deg is 'neutral' holding angle
      seekerMotionRef.current.phoneTilt = { x, y };
    };

    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, [isXRMode, cameraActive]);

  // ── Face Tracking ──────────────────────────────────────────────────────────
  // Primary: Shape Detection API FaceDetector (Chrome/Android — hardware-accelerated).
  // Fallback: YCrCb skin-tone centroid on a 60×45 thumbnail. Both beat luminance
  // centroid which tracks bright lights, not faces.
  const [faceDetected, setFaceDetected] = useState(false);
  const faceBoundsRef = useRef<FaceBounds | null>(null);
  const faceDetectedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!cameraActive) return;

    let rafId: number;
    let frameCount = 0;
    let detecting = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasFaceAPI = 'FaceDetector' in window;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const detector = hasFaceAPI ? new (window as any).FaceDetector({ fastMode: true, maxDetectedFaces: 1 }) : null;

    const canvas = document.createElement('canvas');
    canvas.width = 60;
    canvas.height = 45;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    let smoothX = 0;
    let smoothY = 0;
    const ALPHA = 0.12;

    const updateGaze = (rawX: number, rawY: number) => {
      smoothX += ALPHA * (rawX - smoothX);
      smoothY += ALPHA * (rawY - smoothY);
      seekerMotionRef.current.facePos = {
        x: THREE_MathUtils.clamp(smoothX, -1, 1),
        y: THREE_MathUtils.clamp(smoothY, -1, 1),
      };
    };

    const markFaceFound = (bb: { x: number; y: number; width: number; height: number }, vw: number, vh: number) => {
      faceBoundsRef.current = { x: bb.x, y: bb.y, w: bb.width, h: bb.height };
      // Mirror X for Oracle gaze: front cam raw coords are un-mirrored in the browser
      const cx = -(bb.x + bb.width  / 2) / vw * 2 + 1;
      const cy = -((bb.y + bb.height / 2) / vh * 2 - 1);
      updateGaze(cx, cy);
      seekerMotionRef.current.hasFace = true;
      if (faceDetectedTimerRef.current) clearTimeout(faceDetectedTimerRef.current);
      setFaceDetected(true);
      // Hold "detected" for 1.5s after the last confirmed frame to avoid flicker
      faceDetectedTimerRef.current = setTimeout(() => {
        faceBoundsRef.current = null;
        setFaceDetected(false);
        seekerMotionRef.current.hasFace = false;
        seekerMotionRef.current.facePos = { x: 0, y: 0 };
      }, 1500);
    };

    // YCrCb skin-tone centroid fallback — runs every frame when FaceDetector unavailable.
    // Peer et al. skin rule: YCrCb thresholds reliably isolate face skin vs. background.
    const skinCentroidTick = () => {
      const video = cameraVideoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0) return;
      ctx.drawImage(video, 0, 0, 60, 45);
      const { data } = ctx.getImageData(0, 0, 60, 45);
      let totalW = 0, wx = 0, wy = 0;
      for (let py = 0; py < 45; py++) {
        for (let px = 0; px < 60; px++) {
          const i = (py * 60 + px) * 4;
          const r = data[i], g = data[i + 1], b = data[i + 2];
          const yy  =  0.299 * r + 0.587 * g + 0.114 * b;
          const cr  = (r - yy) * 0.713 + 128;
          const cb  = (b - yy) * 0.564 + 128;
          if (yy > 40 && cr > 133 && cr < 177 && cb > 77 && cb < 127) {
            totalW += yy; wx += yy * px; wy += yy * py;
          }
        }
      }
      if (totalW > 800) {
        // Centroid in 60×45 thumbnail space → scale to real video pixels
        const cx = wx / totalW;
        const cy = wy / totalW;
        const scaleX = video.videoWidth  / 60;
        const scaleY = video.videoHeight / 45;
        // Synthetic bounding box centred on skin centroid.
        // markFaceFound sets faceDetected=true + faceBoundsRef (drives face-frame overlay)
        // and calls updateGaze with correct axis signs matching the FaceDetector path.
        const faceW = video.videoWidth  * 0.35;
        const faceH = video.videoHeight * 0.45;
        markFaceFound(
          { x: cx * scaleX - faceW / 2, y: cy * scaleY - faceH / 2, width: faceW, height: faceH },
          video.videoWidth,
          video.videoHeight,
        );
      }
    };

    const tick = () => {
      rafId = requestAnimationFrame(tick);
      frameCount++;
      const video = cameraVideoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0) return;

      if (detector && frameCount % 4 === 0 && !detecting) {
        detecting = true;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        detector.detect(video).then((faces: any[]) => {
          detecting = false;
          if (faces.length > 0) {
            markFaceFound(faces[0].boundingBox, video.videoWidth, video.videoHeight);
          } else {
            skinCentroidTick(); // hardware missed — fall through to skin-tone centroid
          }
        }).catch(() => { detecting = false; skinCentroidTick(); });
      } else if (!detector) {
        skinCentroidTick();
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      if (faceDetectedTimerRef.current) clearTimeout(faceDetectedTimerRef.current);
    };
  }, [cameraActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep latest marker callback in ref — avoids stale closure in postMessage handler
  const onMarkerRef = useRef(onMarkerDetected);
  useEffect(() => { onMarkerRef.current = onMarkerDetected; }, [onMarkerDetected]);

  const startCamera = useCallback(async () => {
    if (streamRef.current) return; // already running
    setCameraError(null); // clear any previous error so the retry safety-net doesn't fire immediately
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 1280 },
        },
        audio: false,
      });
      streamRef.current = stream;
      // cameraVideoRef.current may be null here — the <video> element only renders
      // after setCameraActive(true) triggers a re-render. The useEffect below
      // attaches the stream once the element is in the DOM.
      setCameraReady(true);
      setCameraActive(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Camera unavailable';
      setCameraError(msg);
      setCameraActive(false);
      console.warn('[XR] Camera failed:', msg);
    }
  }, []);

  // Attach stream to video element once it renders (cameraActive flip triggers re-render)
  useEffect(() => {
    const vid = cameraVideoRef.current;
    if (!vid || !streamRef.current) return;
    if (vid.srcObject !== streamRef.current) {
      vid.srcObject = streamRef.current;
      vid.play().catch(() => {});
    }
  }, [cameraActive]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraReady(false);
    setCameraActive(false);
    seekerMotionRef.current.hasFace = false;
    seekerMotionRef.current.facePos = { x: 0, y: 0 };
    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }
  }, []);

  const activateXRMode = useCallback(() => {
    setIsXRMode(true);
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    startCamera();
  }, [startCamera]);

  const deactivateXRMode = useCallback(() => {
    stopCamera();
    setIsXRMode(false);
    document.documentElement.style.background = '';
    document.body.style.background = '';
  }, [stopCamera]);

  const activateCamera = useCallback(() => {
    startCamera();
  }, [startCamera]);

  const deactivateCamera = useCallback(() => {
    stopCamera();
  }, [stopCamera]);

  // Main XR setup effect
  useEffect(() => {
    if (!isXRMode) return;

    // Keep body transparent in XR context — WebView overlay may composite against
    // camera feed when user opts in. Does not auto-start camera.
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';

    // ── Camera does NOT auto-start here — user must choose their immersion. ──
    // HolodeXR explicitly sends holodexr:init which will start the camera.

    // ── HolodeXR postMessage bridge ──────────────────────────────────────────
    const handleMessage = (e: MessageEvent) => {
      const msg = e.data as { type?: string; markerId?: string };
      if (typeof msg?.type !== 'string' || !msg.type.startsWith('holodexr:')) return;

      switch (msg.type) {
        case 'holodexr:init':
          setIsXRMode(true);
          startCamera();
          try { (e.source as Window)?.postMessage({ type: 'oracle:ready', version: '2.0' }, '*'); } catch {}
          break;

        case 'holodexr:marker-detected':
          setMarkerActive(true);
          onMarkerRef.current?.();
          try { (e.source as Window)?.postMessage({ type: 'oracle:awakened' }, '*'); } catch {}
          break;

        case 'holodexr:marker-lost':
          setMarkerActive(false);
          try { (e.source as Window)?.postMessage({ type: 'oracle:dormant' }, '*'); } catch {}
          break;
      }
    };

    window.addEventListener('message', handleMessage);

    // ── window.SurrogateXR global API (HolodeXR JS bridge) ──────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).SurrogateXR = {
      version: '2.0',
      launch: () => {
        setIsXRMode(true);
        startCamera();
      },
      markerDetected: (markerId?: string) => {
        console.log('[XR] Marker detected:', markerId ?? '(no id)');
        setMarkerActive(true);
        onMarkerRef.current?.();
      },
      markerLost: () => {
        setMarkerActive(false);
      },
      getStatus: () => ({
        xrMode: isXRMode,
        cameraReady,
        markerActive,
        phase: document.querySelector('.oracle-stage')?.getAttribute('data-oracle-state') ?? 'unknown',
      }),
    };

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  // startCamera is stable (useCallback []), isXRMode triggers re-setup only if it flips
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isXRMode]);

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, []);

  // Notify HolodeXR parent when camera stream is live
  useEffect(() => {
    if (!isXRMode || !cameraReady) return;
    try { window.parent.postMessage({ type: 'oracle:camera-ready' }, '*'); } catch {}
  }, [isXRMode, cameraReady]);

  return { isXRMode, cameraActive, faceDetected, faceBoundsRef, activateXRMode, deactivateXRMode, activateCamera, deactivateCamera, cameraVideoRef, cameraReady, cameraError, markerActive, autoStart, seekerMotionRef };
}
