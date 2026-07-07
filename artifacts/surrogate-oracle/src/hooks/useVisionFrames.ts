/**
 * useVisionFrames.ts
 *
 * Additive camera-vision feed for the Oracle's Gemini Live session. Reuses the
 * camera <video> element that useXRMode already keeps alive for local face
 * tracking, grabs a low-rate JPEG snapshot, and forwards it over the SAME
 * WebSocket connection the audio path already uses — same message envelope
 * (`client.realtimeInput` / `media_chunks`), just an `image/jpeg` chunk instead
 * of `audio/pcm`. The gemini-live-proxy edge function forwards `realtimeInput`
 * generically, so no proxy change is required.
 *
 * Gating is intentionally stricter than `isConnected`: `isConnected` flips true
 * at `ws.onopen`, which is BEFORE Gemini has confirmed `session.created`. Frames
 * sent that early would land mid-handshake. Instead this hook gates on
 * `sessionBootedRef` (exported by useGeminiSession) so frames only flow once the
 * session is actually live, and pauses automatically across reconnects because
 * `sessionBootedRef` is cleared to false on every disconnect.
 *
 * Frames are drop-not-queue: if a tick fires while the gate is closed, that
 * frame is simply skipped (never buffered) — a stale frame delivered late after
 * a reconnect would be worse than a missed one, and this mirrors how the proxy
 * itself treats pre-`geminiReady` traffic.
 *
 * Never touches audio cadence, VAD, or the WS handshake — runs on its own
 * independent interval, entirely decoupled from `onaudioprocess`.
 */
import { useEffect, useRef, type MutableRefObject } from 'react';

export interface UseVisionFramesParams {
  /** The already-active camera <video> element from useXRMode (may be null/absent). */
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  /** Mirrors useXRMode's cameraActive — camera permission granted and stream attached. */
  active?: boolean;
  wsRef: MutableRefObject<WebSocket | null>;
  sessionBootedRef: MutableRefObject<boolean>;
  /**
   * Optional cost-reduction gate. When provided, frames are skipped unless this
   * ref is `true`. Intended to be driven by conversational activity (user/Oracle
   * speaking) so frames pause during extended silences and resume immediately when
   * either party speaks. When omitted, frames flow continuously (original behaviour).
   */
  conversationActiveRef?: MutableRefObject<boolean>;
  /** Ms between frame captures. Default 2000 (0.5 fps) — enough for "what am I
   *  holding up" style prompts without meaningfully taxing bandwidth/tokens. */
  intervalMs?: number;
  /** Longest-edge cap in pixels before JPEG encode. Default 768. */
  maxDimension?: number;
  /** JPEG quality (0-1). Default 0.65. */
  quality?: number;
  /** Called after each frame is actually sent — optional debug counter hook. */
  onFrameSent?: () => void;
}

/**
 * Streams periodic camera snapshots into the Oracle's Gemini Live session.
 * No-op whenever `videoRef`/`active` are absent — safe to call unconditionally.
 */
export function useVisionFrames({
  videoRef,
  active,
  wsRef,
  sessionBootedRef,
  conversationActiveRef,
  intervalMs = 2000,
  maxDimension = 768,
  quality = 0.65,
  onFrameSent,
}: UseVisionFramesParams): void {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onFrameSentRef = useRef(onFrameSent);
  useEffect(() => { onFrameSentRef.current = onFrameSent; }, [onFrameSent]);

  useEffect(() => {
    if (!videoRef || !active) return;

    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    if (!ctx) return;

    const tick = () => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || !sessionBootedRef.current) return;
      // Cost gate: skip frame if a conversationActiveRef is wired up but currently false.
      // This pauses vision during extended silences — frames resume the moment either
      // party speaks. When the ref is absent the hook behaves as before (always on).
      if (conversationActiveRef && !conversationActiveRef.current) return;

      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) return;

      const { videoWidth: vw, videoHeight: vh } = video;
      const scale = Math.min(1, maxDimension / Math.max(vw, vh));
      const w = Math.max(1, Math.round(vw * scale));
      const h = Math.max(1, Math.round(vh * scale));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;

      try {
        ctx.drawImage(video, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
        if (!base64) return;

        ws.send(JSON.stringify({
          type: 'client.realtimeInput',
          realtimeInput: {
            media_chunks: [{ data: base64, mimeType: 'image/jpeg' }],
          },
        }));
        onFrameSentRef.current?.();
      } catch (err) {
        // Non-fatal — a single dropped frame (e.g. transient canvas/security error)
        // should never interrupt the voice conversation. Rate-limited via console.warn
        // (not logStep) since this can fire every tick if persistently broken.
        console.warn('[useVisionFrames] frame capture/send failed:', err);
      }
    };

    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [videoRef, active, wsRef, sessionBootedRef, conversationActiveRef, intervalMs, maxDimension, quality]);
}
