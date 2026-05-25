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
  sendAudio: (audioSource: string | Blob) => Promise<{ success: boolean; error?: string }>;
  closeStream: () => Promise<void>;
  isStreamActive: () => boolean;
  setCallbacks: (callbacks: DecartClientCallbacks) => void;
  getDebugInfo: () => DecartDebugInfo;
  setAvatar: (imageUrl: string) => Promise<{ success: boolean; error?: string }>;
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

  // Track active talking segments to prevent flickering during chunked streaming
  const activeTalkSegmentsRef = useRef(0);

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
        //     Post-connect errors and disconnections must be wired via client.on() after connect() resolves.
        //     Model ID 'live-avatar' is the 2026 standard for audio-driven animation.
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
    async (audioSource: string | Blob): Promise<{ success: boolean; error?: string }> => {
      if (!realtimeClientRef.current || !activeRef.current) {
        return { success: false, error: 'No active Decart stream' };
      }

      try {
        debugRef.current.talkCount += 1;

        // Use the Blob directly if provided, otherwise fetch the URL
        const audioBlob = audioSource instanceof Blob 
          ? audioSource 
          : await fetch(audioSource).then((r) => r.blob());

        // Estimate speaking duration from WAV blob
        const estimatedDurationMs = Math.max(
          800,
          ((audioBlob.size - 44) / (24000 * 2)) * 1000 + 400
        );

        activeTalkSegmentsRef.current += 1;
        if (activeTalkSegmentsRef.current === 1) {
          logCallback(`onTalkStarted (#${debugRef.current.talkCount})`);
          callbacksRef.current.onTalkStarted?.();
        }

        const client = realtimeClientRef.current as { playAudio?: (b: Blob) => Promise<void> };
        if (client.playAudio) await client.playAudio(audioBlob);

        // Hold speaking state for the estimated lip-sync duration before signalling end.
        setTimeout(() => {
          activeTalkSegmentsRef.current = Math.max(0, activeTalkSegmentsRef.current - 1);
          if (activeTalkSegmentsRef.current === 0) {
            logCallback('onTalkEnded');
            callbacksRef.current.onTalkEnded?.();
          }
        }, estimatedDurationMs);

        return { success: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        activeTalkSegmentsRef.current = Math.max(0, activeTalkSegmentsRef.current - 1);
        if (activeTalkSegmentsRef.current === 0) {
          callbacksRef.current.onTalkEnded?.(); // ensure speaking state resets on error
        }
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

  const setAvatar = useCallback(async (imageUrl: string) => {
    if (!realtimeClientRef.current || !activeRef.current) {
      return { success: false, error: 'No active Decart stream' };
    }
    try {
      logCallback(`setAvatar → ${imageUrl.slice(0, 40)}...`);
      const client = realtimeClientRef.current as { setImage?: (url: string, opts: any) => Promise<void> };
      if (client.setImage) {
        await client.setImage(imageUrl, { enhance: true });
      }
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logCallback(`setAvatar error: ${msg}`);
      return { success: false, error: msg };
    }
  }, [logCallback]);

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
    setAvatar,
  }));

  return null;
});

DecartClient.displayName = 'DecartClient';
export default DecartClient;
