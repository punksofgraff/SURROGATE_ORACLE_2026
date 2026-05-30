/**
 * useOracleConnection.ts
 *
 * Audio-first Oracle connection hook.
 *
 * PRIMARY PATH (always): PCMPlayer + AudioWorklet → Three.js viseme sync
 * ENTERPRISE PATH (opt-in via VITE_DECART_ENTERPRISE): Decart WebRTC video avatar
 *
 * Three.js never waits on Decart. Decart connects concurrently and becomes
 * an alternate experience when ready — not a fallback from failure.
 */
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { logStep } from '../components/CodeAuditor';
import { PCMPlayer } from '../utils/PCMPlayer';
import { calibrateOracle, disposeVisionModel } from '../lib/OracleVisionCalibrator';
import type { DecartClientHandle } from '../components/DecartClient';
import type { VisemeState } from '../lib/visemeDetector';
import type { OracleFaceMap } from '../lib/OracleVisionCalibrator';
export type { OracleFaceMap };
import { playOraclePresence, getAudioContext } from '../lib/oracleSfx';

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
  const [isConnected, setIsConnected]           = useState(false);
  const [isReady, setIsReady]                   = useState(false);
  const [error, setError]                       = useState<string | null>(null);
  const [isConnecting, setIsConnecting]         = useState(false);
  const [connectionProgress, setConnectionProgress] = useState(0);
  const [isDecartActive, setIsDecartActive]     = useState(false);
  const [oracleFaceMap, setOracleFaceMap]       = useState<OracleFaceMap | null>(null);

  const pcmPlayerRef           = useRef<PCMPlayer | null>(null);
  const oracleFaceMapRef       = useRef<OracleFaceMap | null>(null);
  const isDecartInitializingRef = useRef(false);
  const decartStreamReadyRef   = useRef(false);
  const decartFallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDecartActiveRef      = useRef(false);
  const isFirstChunkRef        = useRef(true);

  useEffect(() => { isDecartActiveRef.current = isDecartActive; }, [isDecartActive]);

  // ── PRIMARY PATH: PCMPlayer init (synchronous, instant) ──────────────────

  const initializePCMPlayer = useCallback(() => {
    if (pcmPlayerRef.current) return;
    const player = new PCMPlayer(24000, playbackRate, getAudioContext());
    player.setVisemeCallback(onViseme);
    player.setProcessingCallback(onProcessingChange);
    pcmPlayerRef.current = player;
    logStep('ENTERPRISE AUDIO WORKLET ACTIVE', 'ok');
  }, [playbackRate, onViseme, onProcessingChange]);

  // ── ENTERPRISE PATH: Decart ICE + vision calibration ─────────────────────

  const fallbackToFreemium = useCallback((interval: ReturnType<typeof setInterval>) => {
    // "Freemium" now means: Three.js primary is fully active, Decart unavailable.
    logStep('FREEMIUM PATH READY', 'warn');
    clearInterval(interval);
    if (decartFallbackTimeoutRef.current) {
      clearTimeout(decartFallbackTimeoutRef.current);
      decartFallbackTimeoutRef.current = null;
    }
    setIsConnecting(false);
    setIsDecartActive(false);
    isDecartActiveRef.current = false;
    setError(null);
  }, []);

  const initializeDecart = useCallback(async () => {
    if (isDecartInitializingRef.current) return;
    isDecartInitializingRef.current = true;

    logStep('DECART INIT', 'ok');

    // Vision calibration — only needed for the 2D OracleFaceRenderer used when Decart is active
    logStep('CALIBRATING VISION MESH', 'pending');
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      const faceMap = await calibrateOracle(img);
      if (faceMap) {
        oracleFaceMapRef.current = faceMap;
        setOracleFaceMap(faceMap);
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
        isDecartActiveRef.current = true;

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
        setIsConnected(false);
        setIsReady(false);
        setError(`Decart Disconnected: ${reason}`);
        setIsConnecting(false);
        setIsDecartActive(false);
        isDecartActiveRef.current = false;
      },
      onError: (err) => {
        clearInterval(interval);
        setError(err);
        setIsConnecting(false);
        setIsDecartActive(false);
        isDecartActiveRef.current = false;
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

    isDecartInitializingRef.current = false;
  }, [oracleAvatarUrl, oracleAvatarDataUrl, decartClientRef, avatarVideoRef, onProcessingChange, fallbackToFreemium]);

  // Compatibility shim — used by BackendControlPanel and legacy call sites.
  // Calls both paths; Decart only when enterprise env flag is set.
  const initializeOracle = useCallback(async () => {
    initializePCMPlayer();
    if (import.meta.env.VITE_DECART_ENTERPRISE === 'true') {
      await initializeDecart();
    }
  }, [initializePCMPlayer, initializeDecart]);

  // ── Audio response handler ────────────────────────────────────────────────

  const handleOracleResponse = useCallback(async (data: Int16Array | string) => {
    if (!pcmPlayerRef.current) {
      // Safety: player should already be up from initializePCMPlayer, but guard anyway
      initializePCMPlayer();
    }
    const player = pcmPlayerRef.current!;

    if (isFirstChunkRef.current) {
      playOraclePresence();
      isFirstChunkRef.current = false;
      player.setVolume(1.0, 240);
    }

    let pcmData: Int16Array | null   = data instanceof Int16Array ? data : null;
    let audioUrl: string | null      = typeof data === 'string' ? data : null;

    // Enterprise: if Decart stream is live, send audio there for video lip-sync
    if (isDecartActiveRef.current && decartClientRef.current?.isStreamActive()) {
      let payload: Blob | string = audioUrl!;
      if (pcmData) {
        const buffer = new ArrayBuffer(44 + pcmData.length * 2);
        const view   = new DataView(buffer);
        const writeStr = (off: number, s: string) => {
          for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
        };
        writeStr(0,  'RIFF');
        view.setUint32(4,  36 + pcmData.length * 2, true);
        writeStr(8,  'WAVE');
        writeStr(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, 24000, true);
        view.setUint32(28, 48000, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeStr(36, 'data');
        view.setUint32(40, pcmData.length * 2, true);
        new Int16Array(buffer, 44).set(pcmData);
        payload = new Blob([buffer], { type: 'audio/wav' });
      }
      await decartClientRef.current.sendAudio(payload);
      // Still feed PCM to player so AudioWorklet emits visemes for Three.js
      if (pcmData) player.feed(pcmData);
      return;
    }

    // Primary Three.js path
    if (pcmData) {
      player.feed(pcmData);
    } else if (audioUrl) {
      try {
        const resp     = await fetch(audioUrl);
        const arrayBuf = await resp.arrayBuffer();
        const audioBuf = await player.getContext().decodeAudioData(arrayBuf);
        const rawData  = audioBuf.getChannelData(0);
        const int16    = new Int16Array(rawData.length);
        for (let i = 0; i < rawData.length; i++) {
          int16[i] = Math.max(-32768, Math.min(32767, rawData[i] * 32768));
        }
        player.feed(int16);
      } catch (err) {
        console.error('Audio URL decode failed:', err);
      }
    }
  }, [initializePCMPlayer, decartClientRef]);

  const resetFirstChunk = useCallback(() => {
    isFirstChunkRef.current = true;
  }, []);

  const cleanup = useCallback(() => {
    pcmPlayerRef.current?.stop();
    pcmPlayerRef.current = null;
    if (decartFallbackTimeoutRef.current) {
      clearTimeout(decartFallbackTimeoutRef.current);
      decartFallbackTimeoutRef.current = null;
    }
    isDecartInitializingRef.current = false;
    decartStreamReadyRef.current    = false;
  }, []);

  const value = useMemo(() => ({
    isConnected,
    isReady,
    error,
    isConnecting,
    isDecartActive,
    pcmPlayer: pcmPlayerRef.current,
    oracleFaceMap,
    initializePCMPlayer,
    initializeDecart,
    initializeOracle,
    handleOracleResponse,
    resetFirstChunk,
    cleanup,
    setError,
  }), [
    isConnected, isReady, error, isConnecting,
    isDecartActive, oracleFaceMap,
    initializePCMPlayer, initializeDecart, initializeOracle,
    handleOracleResponse, resetFirstChunk, cleanup,
  ]);

  return { ...value, connectionProgress };
}
