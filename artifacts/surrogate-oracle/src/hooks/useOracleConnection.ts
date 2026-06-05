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
      player.setVolume(2.50, 40);
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
        
        const isLore = audioUrl.includes('lore-narration.mp3');
        const speed = isLore ? 0.90 : 1.0;
        const newLen = Math.floor(rawData.length / speed);
        const int16    = new Int16Array(newLen);
        for (let i = 0; i < newLen; i++) {
          const srcIdx = i * speed;
          const lo = Math.floor(srcIdx);
          const hi = Math.min(lo + 1, rawData.length - 1);
          const fract = srcIdx - lo;
          const val = rawData[lo] * (1 - fract) + rawData[hi] * fract;
          int16[i] = Math.max(-32768, Math.min(32767, val * 32768));
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

  const boostMicVolume = useCallback((multiplier: number) => {
    pcmPlayerRef.current?.boostVolume(multiplier, 50);
  }, []);

  const getAnalyser = useCallback(() => pcmPlayerRef.current?.getAnalyser() ?? null, []);

  const setTransmissionQ = useCallback((q: number, rampMs = 0) => {
    pcmPlayerRef.current?.setTransmissionQ(q, rampMs);
  }, []);

  const startQuestionTracking = useCallback(() => {
    pcmPlayerRef.current?.startQuestionTracking();
  }, []);

  const getQuestionPlaybackMs = useCallback(() =>
    pcmPlayerRef.current?.getQuestionPlaybackMs() ?? 0, []);

  const getQuestionBufferedMs = useCallback(() =>
    pcmPlayerRef.current?.getQuestionBufferedMs() ?? 0, []);

  const startLoreTracking = useCallback(() => {
    pcmPlayerRef.current?.startLoreTracking();
  }, []);

  const getLorePlaybackMs = useCallback(() =>
    pcmPlayerRef.current?.getLorePlaybackMs() ?? 0, []);

  const getLoreBufferedMs = useCallback(() =>
    pcmPlayerRef.current?.getLoreBufferedMs() ?? 0, []);

  // Stable callback — always reads live ref, never stale. Use for barge-in flush.
  const flushPlayback = useCallback(() => {
    pcmPlayerRef.current?.stop();
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
    boostMicVolume,
    getAnalyser,
    setTransmissionQ,
    flushPlayback,
    startQuestionTracking,
    getQuestionPlaybackMs,
    getQuestionBufferedMs,
    startLoreTracking,
    getLorePlaybackMs,
    getLoreBufferedMs,
  }), [
    error,
    initializePCMPlayer, initializeOracle,
    handleOracleResponse, resetFirstChunk, cleanup, boostMicVolume, getAnalyser, setTransmissionQ,
    flushPlayback, startQuestionTracking, getQuestionPlaybackMs, getQuestionBufferedMs,
    startLoreTracking, getLorePlaybackMs, getLoreBufferedMs,
  ]);

  return value;
}
