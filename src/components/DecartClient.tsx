import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';

export interface DecartClientHandle {
  initializeStream: (staticImageUrl: string, canvas: HTMLCanvasElement) => Promise<{ success: boolean; error?: string }>;
  sendAudio: (audioUrl: string) => Promise<{ success: boolean; error?: string }>;
  closeStream: () => Promise<void>;
  isStreamActive: () => boolean;
  setCallbacks: (callbacks: ClientCallbacks) => void;
}

interface ClientCallbacks {
  onConnected?: () => void;
  onDisconnected?: (state: string) => void;
  onStreamReady?: () => void;
  onTalkStarted?: () => void;
  onTalkEnded?: () => void;
  onError?: (error: string) => void;
}

const DecartClient = forwardRef<DecartClientHandle, {}>(({}, ref) => {
  const websocketRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const callbacksRef = useRef<ClientCallbacks>({});

  const isStreamActiveRef = useRef(false);
  const isProcessingAudioRef = useRef(false);

  useImperativeHandle(ref, () => ({
    initializeStream: async (staticImageUrl: string, canvas: HTMLCanvasElement) => {
      canvasRef.current = canvas;
      ctxRef.current = canvas.getContext('2d');
      if (!ctxRef.current) {
        return { success: false, error: 'Failed to get canvas context' };
      }

      // Draw the static image onto the canvas initially
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (canvasRef.current && ctxRef.current) {
          canvasRef.current.width = img.width;
          canvasRef.current.height = img.height;
          ctxRef.current.drawImage(img, 0, 0, img.width, img.height);
        }
      };
      img.onerror = (e) => {
        console.error('Error loading static image for Decart:', e);
        callbacksRef.current.onError?.('Failed to load static image for avatar');
      };
      img.src = staticImageUrl;

      try {
        const decartApiKey = import.meta.env.VITE_DECART_API_KEY;
        if (!decartApiKey) {
          throw new Error('VITE_DECART_API_KEY is not set');
        }

        const wsUrl = `wss://api.decart.ai/v1/models/lipsync-live/stream?api_key=${decartApiKey}`;
        websocketRef.current = new WebSocket(wsUrl);

        websocketRef.current.onopen = () => {
          console.log('Decart WebSocket connected');
          isStreamActiveRef.current = true;
          callbacksRef.current.onConnected?.();
          callbacksRef.current.onStreamReady?.(); // Decart is ready once connected
        };

        websocketRef.current.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.type === 'video_frame' && data.frame_base64) {
            const videoFrame = new Image();
            videoFrame.onload = () => {
              if (canvasRef.current && ctxRef.current) {
                canvasRef.current.width = videoFrame.width;
                canvasRef.current.height = videoFrame.height;
                ctxRef.current.drawImage(videoFrame, 0, 0, videoFrame.width, videoFrame.height);
              }
            };
            videoFrame.src = `data:image/jpeg;base64,${data.frame_base64}`;
          } else if (data.type === 'status') {
            if (data.status === 'processing_started') {
              isProcessingAudioRef.current = true;
              callbacksRef.current.onTalkStarted?.();
            } else if (data.status === 'processing_finished') {
              isProcessingAudioRef.current = false;
              callbacksRef.current.onTalkEnded?.();
            }
          } else if (data.type === 'error') {
            console.error('Decart API error:', data.message);
            callbacksRef.current.onError?.(`Decart API Error: ${data.message}`);
          }
        };

        websocketRef.current.onclose = () => {
          console.log('Decart WebSocket disconnected');
          isStreamActiveRef.current = false;
          callbacksRef.current.onDisconnected?.('closed');
        };

        websocketRef.current.onerror = (error) => {
          console.error('Decart WebSocket error:', error);
          callbacksRef.current.onError?.(`Decart WebSocket Error: ${error}`);
          websocketRef.current?.close();
        };

        return { success: true };
      } catch (error: any) {
        console.error('Decart initialization failed:', error);
        callbacksRef.current.onError?.(`Decart Initialization Failed: ${error.message}`);
        return { success: false, error: error.message };
      }
    },
    sendAudio: async (audioUrl: string) => {
      if (!websocketRef.current || websocketRef.current.readyState !== WebSocket.OPEN) {
        return { success: false, error: 'Decart WebSocket not connected' };
      }
      if (isProcessingAudioRef.current) {
        return { success: false, error: 'Decart is already processing audio' };
      }

      try {
        const response = await fetch(audioUrl);
        const audioBlob = await response.blob();
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        await new Promise<void>((resolve, reject) => {
          reader.onloadend = () => {
            const base64Audio = (reader.result as string).split(',')[1];
            websocketRef.current?.send(JSON.stringify({
              type: 'audio_chunk',
              audio_base64: base64Audio,
              format: 'mp3' // Assuming ElevenLabs provides MP3
            }));
            resolve();
          };
          reader.onerror = reject;
        });
        return { success: true };
      } catch (error: any) {
        console.error('Failed to send audio to Decart:', error);
        callbacksRef.current.onError?.(`Failed to send audio: ${error.message}`);
        return { success: false, error: error.message };
      }
    },
    closeStream: async () => {
      console.log('Closing Decart stream...');
      if (websocketRef.current) {
        websocketRef.current.close();
        websocketRef.current = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }
      isStreamActiveRef.current = false;
      isProcessingAudioRef.current = false;
      callbacksRef.current.onDisconnected?.('closed');
    },
    isStreamActive: () => isStreamActiveRef.current,
    setCallbacks: (callbacks: ClientCallbacks) => {
      callbacksRef.current = { ...callbacksRef.current, ...callbacks };
    },
  }));

  useEffect(() => {
    return () => {
      websocketRef.current?.close();
      mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    };
  }, []);

  return null; // This component doesn't render anything directly
});

export default DecartClient;