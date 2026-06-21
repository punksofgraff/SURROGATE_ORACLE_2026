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
  const flushVersionRef        = useRef(0);

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

  const setVolume = useCallback((vol: number, rampMs = 150) => {
    pcmPlayerRef.current?.setVolume(vol, rampMs);
  }, []);

  // ── Audio response handler ────────────────────────────────────────────────

  const handleOracleResponse = useCallback(async (data: Int16Array | string) => {
    if (!pcmPlayerRef.current) {
      initializePCMPlayer();
    }
    const player = pcmPlayerRef.current!;

    if (isFirstChunkRef.current) {
      playOraclePresence();
      isFirstChunkRef.current = false;
      
      // Start muted if oracle_session_muted is set to true
      const isMuted = localStorage.getItem('oracle_session_muted') === 'true';
      player.setVolume(isMuted ? 0.0001 : 2.50, 40);
    }

    let pcmData: Int16Array | null   = data instanceof Int16Array ? data : null;
    let audioUrl: string | null      = typeof data === 'string' ? data : null;

    // Capture current flush version to prevent feeding stale async MP3 buffers
    const capturedFlushVersion = flushVersionRef.current;

    if (pcmData) {
      if (capturedFlushVersion === flushVersionRef.current) {
        player.feed(pcmData);
      }
    } else if (audioUrl) {
      try {
        const resp     = await fetch(audioUrl);
        const arrayBuf = await resp.arrayBuffer();
        const audioBuf = await player.getContext().decodeAudioData(arrayBuf);
        const rawData  = audioBuf.getChannelData(0);
        
        // Resample the decoded audio data to exactly 24000Hz (the rate expected by PCMPlayer)
        // to prevent pitch/speed stretching on systems where the AudioContext runs at 44.1kHz or 48kHz.
        const targetRate = 24000;
        const sourceRate = audioBuf.sampleRate;
        let int16: Int16Array;
        
        if (sourceRate === targetRate) {
          int16 = new Int16Array(rawData.length);
          for (let i = 0; i < rawData.length; i++) {
            int16[i] = Math.max(-32768, Math.min(32767, rawData[i] * 32768));
          }
        } else {
          const ratio = targetRate / sourceRate;
          const targetLength = Math.floor(rawData.length * ratio);
          int16 = new Int16Array(targetLength);
          for (let i = 0; i < targetLength; i++) {
            const srcIdx = i / ratio;
            const lo = Math.floor(srcIdx);
            const hi = Math.min(lo + 1, rawData.length - 1);
            const frac = srcIdx - lo;
            const sample = rawData[lo] * (1 - frac) + rawData[hi] * frac;
            int16[i] = Math.max(-32768, Math.min(32767, sample * 32768));
          }
        }

        if (capturedFlushVersion === flushVersionRef.current) {
          player.feed(int16);
        } else {
          console.warn('[Audio] Ignored delayed MP3 feed because playback was flushed');
        }
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
    flushVersionRef.current += 1;
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
    setVolume,
  }), [
    error,
    initializePCMPlayer, initializeOracle,
    handleOracleResponse, resetFirstChunk, cleanup, boostMicVolume, getAnalyser, setTransmissionQ,
    flushPlayback, startQuestionTracking, getQuestionPlaybackMs, getQuestionBufferedMs,
    startLoreTracking, getLorePlaybackMs, getLoreBufferedMs, setVolume,
  ]);

  return value;
}
