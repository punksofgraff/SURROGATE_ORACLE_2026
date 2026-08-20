import { useCallback, useEffect, useRef, useState } from 'react';
import { getAudioContext } from '../lib/oracleSfx';
import { supabase } from '../lib/supabase';

export type LyriaMusicStatus = 'idle' | 'generating' | 'ready' | 'playing' | 'error';

export function useLyriaMusic() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const fadeTimerRef = useRef<number | null>(null);
  const [status, setStatus] = useState<LyriaMusicStatus>('idle');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const ensureGraph = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) throw new Error('Music player is not mounted.');
    const ctx = getAudioContext();
    if (!sourceRef.current) {
      const source = ctx.createMediaElementSource(audio);
      const gain = ctx.createGain();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.82;
      source.connect(gain);
      gain.connect(analyser);
      analyser.connect(ctx.destination);
      sourceRef.current = source;
      gainRef.current = gain;
      analyserRef.current = analyser;
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return { ctx, gain: gainRef.current! };
  }, []);

  const play = useCallback(async () => {
    const { ctx, gain } = ensureGraph();
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    if (fadeTimerRef.current !== null) window.clearInterval(fadeTimerRef.current);
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.001), ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 0.35);
    await audio.play();
    setIsPlaying(true);
    setStatus('playing');
  }, [audioUrl, ensureGraph]);

  const stop = useCallback((fadeMs = 500) => {
    const audio = audioRef.current;
    const gain = gainRef.current;
    if (!audio || !gain) {
      setIsPlaying(false);
      setStatus(audioUrl ? 'ready' : 'idle');
      return;
    }
    const ctx = getAudioContext();
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.001), ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + fadeMs / 1000);
    window.setTimeout(() => {
      audio.pause();
      audio.currentTime = 0;
      gain.gain.setValueAtTime(0, ctx.currentTime);
      setIsPlaying(false);
      setStatus(audioUrl ? 'ready' : 'idle');
    }, fadeMs);
  }, [audioUrl]);

  const generate = useCallback(async (prompt: string) => {
    setStatus('generating');
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('lyria-music-generator', {
        body: { prompt: prompt.slice(0, 600) },
      });
      if (invokeError) throw invokeError;
      if (!data?.audioBase64) throw new Error(data?.error || 'No playable track returned.');
      const binary = atob(data.audioBase64);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const nextUrl = URL.createObjectURL(new Blob([bytes], { type: data.mimeType || 'audio/mpeg' }));
      // Set the element immediately as well as through React state. This keeps
      // the post-generation play attempt from racing the next render (important
      // on mobile, where a stale src otherwise turns a successful generation
      // into a misleading "tap play" state).
      if (audioRef.current) {
        audioRef.current.src = nextUrl;
        audioRef.current.load();
      }
      setAudioUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return nextUrl;
      });
      setStatus('ready');
      return nextUrl;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Lyria generation failed.';
      setError(message);
      setStatus('error');
      return null;
    }
  }, []);

  useEffect(() => () => {
    if (fadeTimerRef.current !== null) window.clearInterval(fadeTimerRef.current);
    audioRef.current?.pause();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  return {
    audioRef,
    analyserRef,
    status,
    audioUrl,
    error,
    isPlaying,
    generate,
    play,
    stop,
  };
}