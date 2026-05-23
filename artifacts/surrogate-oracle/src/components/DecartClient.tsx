/**
 * DecartClient — Real-time lip-sync avatar using Decart live-avatar WebRTC model
 * Uses @decartai/sdk: portrait image + audio → animated talking avatar video stream
 */
import { useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import { createDecartClient, models } from '@decartai/sdk';

export interface DecartClientCallbacks {
  // onConnected is intentionally removed — DecartClient no longer calls it
  // (it was firing before connect() started, not after). Parent handles
  // connected state after initializeStream() returns { success: true }.
  onStreamReady?: () => void;
  onTalkStarted?: () => void;
  onTalkEnded?: () => void;
  onDisconnected?: (reason: string) => void;
  onError?: (error: string) => void;
}

export interface DecartDebugInfo {
  isActive: boolean;
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'error';
  lastError: string | null;
  streamStartedAt: number | null;
  streamUptimeMs: number | null;
  talkCount: number;
  recentCallbacks: string[]; // last 10 "[HH:MM:SS] callbackName" entries
}

export interface DecartClientHandle {
  initializeStream: (
    imageUrl: string,
    videoElement: HTMLVideoElement
  ) => Promise<{ success: boolean; error?: string }>;
  sendAudio: (audioUrl: string) => Promise<{ success: boolean; error?: string }>;
  closeStream: () => Promise<void>;
  isStreamActive: () => boolean;
  setCallbacks: (callbacks: DecartClientCallbacks) => void;
  getDebugInfo: () => DecartDebugInfo;
}

const DecartClient = forwardRef<DecartClientHandle>((_, ref) => {
  const realtimeClientRef = useRef<Awaited<ReturnType<ReturnType<typeof createDecartClient>['realtime']['connect']>> | null>(null);
  const callbacksRef = useRef<DecartClientCallbacks>({});
  const activeRef = useRef(false);

  // ── Debug tracking ──────────────────────────────────────────────────────
  const debugRef = useRef<DecartDebugInfo>({
    isActive: false,
    connectionState: 'disconnected',
    lastError: null,
    streamStartedAt: null,
    streamUptimeMs: null,
    talkCount: 0,
    recentCallbacks: [],
  });

  const logCallback = useCallback((name: string) => {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
    debugRef.current.recentCallbacks = [
      `[${ts}] ${name}`,
      ...debugRef.current.recentCallbacks,
    ].slice(0, 10);
  }, []);

  const setCallbacks = useCallback((callbacks: DecartClientCallbacks) => {
    callbacksRef.current = callbacks;
  }, []);

  const initializeStream = useCallback(
    async (
      imageUrl: string,
      videoElement: HTMLVideoElement
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        debugRef.current.connectionState = 'connecting';
        logCallback('initializeStream');
        const { supabase } = await import('../lib/supabase');

        // Fetch short-lived token from the edge function
        const { data, error } = await supabase.functions.invoke('decart-live-token', {
          method: 'POST'
        });

        if (error) {
          throw new Error(error.message || 'Failed to fetch Decart token');
        }

        if (!data?.success || !data?.token) {
          throw new Error(data?.error || 'Invalid response from Decart token endpoint');
        }

        const decartClient = createDecartClient({ apiKey: data.token });
        // Note: onConnected is intentionally NOT called here. Firing it after
        // createDecartClient() is premature — connect() hasn't started yet.
        // The parent (SurrogateOracleImmersion) fires onConnected semantics after
        // initializeStream() returns { success: true }, which is the correct point.
        debugRef.current.connectionState = 'connecting';

        // ⚠️  Decart SDK v0.0.63: connect() only accepts { model, onRemoteStream, initialState, customizeOffer }.
        //     onDisconnect/onError are NOT in the Zod schema and are stripped silently.
        //     Post-connect errors and disconnections must be wired via client.on() after connect() resolves.
        const connectOptions = {
          model: models.realtime('live-avatar'),
          initialState: { image: imageUrl },
          onRemoteStream: (videoStream: MediaStream) => {
            videoElement.srcObject = videoStream;
            videoElement.play().catch(console.warn);
            debugRef.current.isActive = true;
            debugRef.current.streamStartedAt = Date.now();
            logCallback('onStreamReady');
            callbacksRef.current.onStreamReady?.();
            activeRef.current = true;
          },
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const realtimeClient = await decartClient.realtime.connect(null, connectOptions as any);

        // Wire post-connect events via the SDK's event emitter (onDisconnect/onError in options are ignored by Zod)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (realtimeClient as any).on('error', (err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          debugRef.current.lastError = msg;
          debugRef.current.connectionState = 'error';
          logCallback(`event:error ${msg.slice(0, 40)}`);
          callbacksRef.current.onError?.(msg);
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (realtimeClient as any).on('connectionChange', (state: string) => {
          logCallback(`event:connectionChange → ${state}`);
          if (state === 'disconnected' || state === 'error') {
            activeRef.current = false;
            debugRef.current.isActive = false;
            debugRef.current.connectionState = state === 'error' ? 'error' : 'disconnected';
            callbacksRef.current.onDisconnected?.(state);
          }
        });

        realtimeClientRef.current = realtimeClient;
        return { success: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        callbacksRef.current.onError?.(msg);
        return { success: false, error: msg };
      }
    },
    []
  );

  const sendAudio = useCallback(
    async (audioUrl: string): Promise<{ success: boolean; error?: string }> => {
      if (!realtimeClientRef.current || !activeRef.current) {
        return { success: false, error: 'No active Decart stream' };
      }

      try {
        debugRef.current.talkCount += 1;

        // Fetch the blob once — used both for playAudio and duration measurement.
        // Avoids double-fetch and handles revocation: blob URL is consumed here and
        // doesn't need to remain valid after this function returns.
        const audioBlob = await fetch(audioUrl).then((r) => r.blob());

        // Estimate speaking duration from WAV blob so we can time onTalkEnded
        // accurately. playAudio() resolves when audio is *submitted* to Decart, not
        // when lip-sync is *finished* — without this, the cabinet voice-pulse (and
        // any speaking-state CSS) stops early while the avatar is still moving.
        // WAV: 44-byte header, then 16-bit PCM samples at 24kHz.
        // duration(s) = (blobSize - 44) / (24000 * 2)
        // Add 400ms for Decart's own internal playback latency / lip-sync tail.
        const estimatedDurationMs = Math.max(
          800,
          ((audioBlob.size - 44) / (24000 * 2)) * 1000 + 400
        );

        logCallback(`onTalkStarted (#${debugRef.current.talkCount})`);
        callbacksRef.current.onTalkStarted?.();

        const client = realtimeClientRef.current as { playAudio?: (b: Blob) => Promise<void> };
        if (client.playAudio) await client.playAudio(audioBlob);

        // Hold speaking state for the estimated lip-sync duration before signalling end.
        setTimeout(() => {
          logCallback('onTalkEnded');
          callbacksRef.current.onTalkEnded?.();
        }, estimatedDurationMs);

        return { success: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        callbacksRef.current.onTalkEnded?.(); // ensure speaking state resets on error
        callbacksRef.current.onError?.(msg);
        return { success: false, error: msg };
      }
    },
    [logCallback]
  );

  const closeStream = useCallback(async () => {
    if (realtimeClientRef.current) {
      realtimeClientRef.current.disconnect();
      realtimeClientRef.current = null;
    }
    activeRef.current = false;
    debugRef.current.isActive = false;
    debugRef.current.connectionState = 'disconnected';
    logCallback('closeStream');
  }, [logCallback]);

  const isStreamActive = useCallback(() => activeRef.current, []);

  const getDebugInfo = useCallback((): DecartDebugInfo => ({
    ...debugRef.current,
    streamUptimeMs: debugRef.current.streamStartedAt
      ? Date.now() - debugRef.current.streamStartedAt
      : null,
  }), []);

  useImperativeHandle(ref, () => ({
    initializeStream,
    sendAudio,
    closeStream,
    isStreamActive,
    setCallbacks,
    getDebugInfo,
  }));

  return null;
});

DecartClient.displayName = 'DecartClient';
export default DecartClient;
