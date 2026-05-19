/**
 * DecartClient — Real-time lip-sync avatar using Decart live-avatar WebRTC model
 * Uses @decartai/sdk: portrait image + audio → animated talking avatar video stream
 */
import { useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import { createDecartClient, models } from '@decartai/sdk';

export interface DecartClientCallbacks {
  onConnected?: () => void;
  onStreamReady?: () => void;
  onTalkStarted?: () => void;
  onTalkEnded?: () => void;
  onDisconnected?: (reason: string) => void;
  onError?: (error: string) => void;
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
}

const DecartClient = forwardRef<DecartClientHandle>((_, ref) => {
  const realtimeClientRef = useRef<Awaited<ReturnType<ReturnType<typeof createDecartClient>['realtime']['connect']>> | null>(null);
  const callbacksRef = useRef<DecartClientCallbacks>({});
  const activeRef = useRef(false);

  const setCallbacks = useCallback((callbacks: DecartClientCallbacks) => {
    callbacksRef.current = callbacks;
  }, []);

  const initializeStream = useCallback(
    async (
      imageUrl: string,
      videoElement: HTMLVideoElement
    ): Promise<{ success: boolean; error?: string }> => {
      try {
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

        callbacksRef.current.onConnected?.();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const connectOptions: any = {
          model: models.realtime('live-avatar'),
          initialState: { image: imageUrl },
          onRemoteStream: (videoStream: MediaStream) => {
            videoElement.srcObject = videoStream;
            videoElement.play().catch(console.warn);
            callbacksRef.current.onStreamReady?.();
            activeRef.current = true;
          },
          onDisconnect: (reason: string) => {
            activeRef.current = false;
            callbacksRef.current.onDisconnected?.(reason);
          },
          onError: (err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            callbacksRef.current.onError?.(msg);
          },
        };
        const realtimeClient = await decartClient.realtime.connect(null, connectOptions);

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
        callbacksRef.current.onTalkStarted?.();
        const audioBlob = await fetch(audioUrl).then((r) => r.blob());
        const client = realtimeClientRef.current as { playAudio?: (b: Blob) => Promise<void> };
        if (client.playAudio) await client.playAudio(audioBlob);
        callbacksRef.current.onTalkEnded?.();
        return { success: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        callbacksRef.current.onError?.(msg);
        return { success: false, error: msg };
      }
    },
    []
  );

  const closeStream = useCallback(async () => {
    if (realtimeClientRef.current) {
      realtimeClientRef.current.disconnect();
      realtimeClientRef.current = null;
    }
    activeRef.current = false;
  }, []);

  const isStreamActive = useCallback(() => activeRef.current, []);

  useImperativeHandle(ref, () => ({
    initializeStream,
    sendAudio,
    closeStream,
    isStreamActive,
    setCallbacks,
  }));

  return null;
});

DecartClient.displayName = 'DecartClient';
export default DecartClient;
