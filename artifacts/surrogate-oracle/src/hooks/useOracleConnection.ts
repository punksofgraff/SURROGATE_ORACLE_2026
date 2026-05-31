/**
 * useOracleConnection.ts
 *
 * Audio-first Oracle connection hook.
 *
 * PRIMARY PATH: PCMPlayer + AudioWorklet → Three.js viseme sync
 */
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { logStep } from '../components/CodeAuditor';
import { PCMPlayer } from '../utils/PCMPlayer';
import type { VisemeState } from '../lib/visemeDetector';
import { playOraclePresence, getAudioContext } from '../lib/oracleSfx';

interface UseOracleConnectionProps {
  playbackRate: number;
  onViseme: (state: VisemeState) => void;
  onProcessingChange: (isProcessing: boolean) => void;
}

export function useOracleConnection({
  playbackRate,
  onViseme,
  onProcessingChange,
}: UseOracleConnectionProps) {
  const [error, setError]                       = useState<string | null>(null);
  const pcmPlayerRef           = useRef<PCMPlayer | null>(null);
  const isFirstChunkRef        = useRef(true);

  // ── PRIMARY PATH: PCMPlayer init (synchronous, instant) ──────────────────

  const initializePCMPlayer = useCallback(() => {
    if (pcmPlayerRef.current) return;
    const player = new PCMPlayer(24000, playbackRate, getAudioContext());
    player.setVisemeCallback(onViseme);
    player.setProcessingCallback(onProcessingChange);
    pcmPlayerRef.current = player;
    logStep('ENTERPRISE AUDIO WORKLET ACTIVE', 'ok');
  }, [playbackRate, onViseme, onProcessingChange]);

  const initializeOracle = useCallback(async () => {
    initializePCMPlayer();
  }, [initializePCMPlayer]);

  // ── Audio response handler ────────────────────────────────────────────────

  const handleOracleResponse = useCallback(async (data: Int16Array | string) => {
    if (!pcmPlayerRef.current) {
      initializePCMPlayer();
    }
    const player = pcmPlayerRef.current!;

    if (isFirstChunkRef.current) {
      playOraclePresence();
      isFirstChunkRef.current = false;
      player.setVolume(1.4, 240);
    }

    let pcmData: Int16Array | null   = data instanceof Int16Array ? data : null;
    let audioUrl: string | null      = typeof data === 'string' ? data : null;

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
  }, [initializePCMPlayer]);

  const resetFirstChunk = useCallback(() => {
    isFirstChunkRef.current = true;
  }, []);

  const cleanup = useCallback(() => {
    pcmPlayerRef.current?.stop();
    pcmPlayerRef.current = null;
  }, []);

  const value = useMemo(() => ({
    error,
    pcmPlayer: pcmPlayerRef.current,
    initializePCMPlayer,
    initializeOracle,
    handleOracleResponse,
    resetFirstChunk,
    cleanup,
    setError,
  }), [
    error,
    initializePCMPlayer, initializeOracle,
    handleOracleResponse, resetFirstChunk, cleanup,
  ]);

  return value;
}
