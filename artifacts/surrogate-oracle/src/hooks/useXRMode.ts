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

export interface UseXRModeReturn {
  isXRMode: boolean;
  cameraVideoRef: React.RefObject<HTMLVideoElement | null>;
  cameraReady: boolean;
  cameraError: string | null;
  markerActive: boolean;
  autoStart: boolean; // ?autostart param — skips tap gesture, boots immediately
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
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [markerActive, setMarkerActive] = useState(false);

  const autoStart = isXRMode && new URLSearchParams(window.location.search).has('autostart');

  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Keep latest marker callback in ref — avoids stale closure in postMessage handler
  const onMarkerRef = useRef(onMarkerDetected);
  useEffect(() => { onMarkerRef.current = onMarkerDetected; }, [onMarkerDetected]);

  const startCamera = useCallback(async () => {
    if (streamRef.current) return; // already running
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const vid = cameraVideoRef.current;
      if (vid) {
        vid.srcObject = stream;
        vid.play().catch(() => {});
      }
      setCameraReady(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Camera unavailable';
      setCameraError(msg);
      console.warn('[XR] Camera failed:', msg);
    }
  }, []);

  // Main XR setup effect
  useEffect(() => {
    if (!isXRMode) return;

    // Transparent body so WebView overlay composites against the HolodeXR camera feed
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';

    startCamera();

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
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  // startCamera is stable (useCallback []), isXRMode triggers re-setup only if it flips
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isXRMode]);

  // Notify HolodeXR parent when camera stream is live
  useEffect(() => {
    if (!isXRMode || !cameraReady) return;
    try { window.parent.postMessage({ type: 'oracle:camera-ready' }, '*'); } catch {}
  }, [isXRMode, cameraReady]);

  return { isXRMode, cameraVideoRef, cameraReady, cameraError, markerActive, autoStart };
}
