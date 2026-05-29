/**
 * useOracleConnection.ts
 *
 * Enterprise-grade hook for managing the Oracle audio and video connection.
 * Handles Decart ICE negotiation, vision calibration, and PCM player lifecycle.
 */
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { logStep } from '../components/OracleStepLogger';
import { PCMPlayer } from '../utils/PCMPlayer';
import { calibrateOracle, disposeVisionModel } from '../lib/OracleVisionCalibrator';
import type { DecartClientHandle } from '../components/DecartClient';
import type { VisemeState } from '../lib/visemeDetector';
import type { OracleFaceMap } from '../lib/OracleVisionCalibrator';
import { playOraclePresence } from '../lib/oracleSfx';

interface UseOracleConnectionProps {
  oracleAvatarDataUrl: string;
  oracleAvatarUrl: string;
  playbackRate: number;
  decartClientRef: React.RefObject<DecartClientHandle | null>;
  avatarVideoRef: React.RefObject<HTMLVideoElement | null>;
  onViseme: (state: VisemeState) => void;
  onProcessingChange: (isProcessing: boolean) => void;
}

export function useOracleConnection({
  oracleAvatarDataUrl,
  oracleAvatarUrl,
  playbackRate,
  decartClientRef,
  avatarVideoRef,
  onViseme,
  onProcessingChange,
}: UseOracleConnectionProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionProgress, setConnectionProgress] = useState(0);
  const [isDecartActive, setIsDecartActive] = useState(false);

  const pcmPlayerRef = useRef<PCMPlayer | null>(null);
  const oracleFaceMapRef = useRef<OracleFaceMap | null>(null);
  const isInitializingRef = useRef(false);
  const decartStreamReadyRef = useRef(false);
  const decartFallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDecartActiveRef = useRef(false);
  const isFirstChunkRef = useRef(true);

  // Sync ref for callback closures
  useEffect(() => {
    isDecartActiveRef.current = isDecartActive;
  }, [isDecartActive]);

  const cleanup = useCallback(() => {
    pcmPlayerRef.current?.stop();
    pcmPlayerRef.current = null;
    if (decartFallbackTimeoutRef.current) {
      clearTimeout(decartFallbackTimeoutRef.current);
      decartFallbackTimeoutRef.current = null;
    }
  }, []);

  const fallbackToFreemium = useCallback((interval: ReturnType<typeof setInterval>) => {
    logStep('FREEMIUM PATH READY', 'warn');
    clearInterval(interval);
    if (decartFallbackTimeoutRef.current) {
      clearTimeout(decartFallbackTimeoutRef.current);
      decartFallbackTimeoutRef.current = null;
    }
    setIsConnecting(false);
    setIsDecartActive(false);
    setError(null);
  }, []);

  const initializeOracle = useCallback(async () => {
    if (isInitializingRef.current) return;
    isInitializingRef.current = true;
    
    logStep('DECART INIT', 'ok');
    
    // 1. Vision Calibration
    logStep('CALIBRATING VISION MESH', 'pending');
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = async () => {
      const faceMap = await calibrateOracle(img);
      if (faceMap) {
        oracleFaceMapRef.current = faceMap;
        logStep('VISION CALIBRATION OK', 'ok');
      } else {
        logStep('VISION CALIBRATION FAILED (FALLBACK)', 'warn');
      }
      disposeVisionModel();
    };
    img.src = oracleAvatarUrl;

    setIsConnecting(true);
    setConnectionProgress(0);

    const interval = setInterval(() => {
      setConnectionProgress((p) => {
        if (p < 80) return p + 10;
        if (p >= 98) return 98;
        return parseFloat((p + 0.6).toFixed(1));
      });
    }, 500);

    decartClientRef.current?.setCallbacks({
      onStreamReady: () => {
        logStep('DECART READY ✓', 'ok');
        decartStreamReadyRef.current = true;
        if (decartFallbackTimeoutRef.current) {
          clearTimeout(decartFallbackTimeoutRef.current);
          decartFallbackTimeoutRef.current = null;
        }
        clearInterval(interval);
        setIsConnected(true);
        setIsReady(true);
        setError(null);
        setConnectionProgress(100);
        setIsDecartActive(true);

        if (avatarVideoRef.current) {
          avatarVideoRef.current.classList.add('oracle-avatar-video--materializing');
          setTimeout(() => {
            avatarVideoRef.current?.classList.remove('oracle-avatar-video--materializing');
          }, 2600);
        }

        setTimeout(() => setIsConnecting(false), 400);
      },
      onTalkStarted: () => onProcessingChange(true),
      onTalkEnded:   () => onProcessingChange(false),
      onDisconnected: (reason) => {
        setIsConnected(false); setIsReady(false); setError(`Decart Disconnected: ${reason}`);
        setIsConnecting(false); setIsDecartActive(false);
      },
      onError: (err) => {
        clearInterval(interval); setError(err);
        setIsConnecting(false); setIsDecartActive(false);
      },
    });

    const result = await decartClientRef.current?.initializeStream(oracleAvatarDataUrl, avatarVideoRef.current!);
    if (!result?.success) {
      fallbackToFreemium(interval);
    } else {
      setIsConnected(true);
      decartFallbackTimeoutRef.current = setTimeout(() => {
        if (!decartStreamReadyRef.current) fallbackToFreemium(interval);
      }, 22000);
    }
    isInitializingRef.current = false;
  }, [oracleAvatarUrl, oracleAvatarDataUrl, decartClientRef, avatarVideoRef, onProcessingChange, fallbackToFreemium]);

  const handleOracleResponse = useCallback(async (data: Int16Array | string) => {
    if (isFirstChunkRef.current) {
      playOraclePresence();
      isFirstChunkRef.current = false;
      pcmPlayerRef.current?.setVolume(1.0, 240);
    }

    let pcmData: Int16Array | null = data instanceof Int16Array ? data : null;
    let audioUrl: string | null = typeof data === 'string' ? data : null;

    if (isDecartActiveRef.current && decartClientRef.current?.isStreamActive()) {
      let payload: Blob | string = audioUrl!;
      if (pcmData) {
        const buffer = new ArrayBuffer(44 + pcmData.length * 2);
        const view = new DataView(buffer);
        const writeString = (offset: number, s: string) => {
          for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
        };
        writeString(0, 'RIFF');
        view.setUint32(4, 36 + pcmData.length * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, 24000, true);
        view.setUint32(28, 24000 * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, pcmData.length * 2, true);
        new Int16Array(buffer, 44).set(pcmData);
        payload = new Blob([buffer], { type: 'audio/wav' });
      }
      await decartClientRef.current.sendAudio(payload);
      return;
    }

    if (!pcmPlayerRef.current) {
      const player = new PCMPlayer(24000, playbackRate);
      player.setVisemeCallback(onViseme);
      pcmPlayerRef.current = player;
    }

    if (pcmData) {
      pcmPlayerRef.current.feed(pcmData);
    } else if (audioUrl) {
      try {
        const resp = await fetch(audioUrl);
        const arrayBuf = await resp.arrayBuffer();
        const audioBuf = await pcmPlayerRef.current.getContext().decodeAudioData(arrayBuf);
        const rawData  = audioBuf.getChannelData(0);
        const int16 = new Int16Array(rawData.length);
        for (let i = 0; i < rawData.length; i++) {
          int16[i] = Math.max(-32768, Math.min(32767, rawData[i] * 32768));
        }
        pcmPlayerRef.current.feed(int16);
      } catch (err) {
        console.error('Audio URL decode failed:', err);
      }
    }
    onProcessingChange(true);
  }, [playbackRate, onViseme, onProcessingChange, decartClientRef]);

  const resetFirstChunk = useCallback(() => {
    isFirstChunkRef.current = true;
  }, []);

  const value = useMemo(() => ({
    isConnected,
    isReady,
    error,
    isConnecting,
    isDecartActive,
    pcmPlayer: pcmPlayerRef.current,
    oracleFaceMap: oracleFaceMapRef.current,
    initializeOracle,
    handleOracleResponse,
    resetFirstChunk,
    cleanup,
    setError,
  }), [
    isConnected, isReady, error, isConnecting, 
    isDecartActive, initializeOracle, handleOracleResponse, resetFirstChunk, cleanup
  ]);

  return { ...value, connectionProgress };
}
