import { useCallback, useEffect, useRef, useState } from 'react';
import { getAudioContext } from '../lib/oracleSfx';
import { supabase } from '../lib/supabase';
import { traceEvent } from '../lib/sessionTrace';

export type LyriaMusicStatus = 'idle' | 'generating' | 'ready' | 'playing' | 'error';

// Decode in bounded pieces instead of creating one giant binary string and a
// second full-size Uint8Array. The provider still returns one base64 response,
// but releasing each piece after Blob construction avoids the transient
// string+binary peak that was especially punishing on mobile Safari.
function base64ToBlob(base64: string, mimeType: string): Blob {
  const parts: Uint8Array<ArrayBuffer>[] = [];
  const chunkChars = 512 * 1024;
  for (let offset = 0; offset < base64.length; offset += chunkChars) {
    const binary = atob(base64.slice(offset, offset + chunkChars));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    parts.push(bytes);
  }
  return new Blob(parts, { type: mimeType });
}

export function useLyriaMusic() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const fadeTimerRef = useRef<number | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  const [status, setStatus] = useState<LyriaMusicStatus>('idle');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);

  const handleLoadedMetadata = useCallback(() => {
    const duration = audioRef.current?.duration;
    if (typeof duration === 'number' && Number.isFinite(duration) && duration > 0) {
      setDurationSeconds(duration);
      traceEvent('lyria_duration_decoded', { duration_seconds: Math.round(duration * 100) / 100 });
    }
  }, []);

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
    if (fadeTimerRef.current !== null) {
      window.clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
    if (!audio || !gain) {
      setIsPlaying(false);
      setStatus(audioUrlRef.current ? 'ready' : 'idle');
      return;
    }
    const ctx = getAudioContext();
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.001), ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + fadeMs / 1000);
    fadeTimerRef.current = window.setTimeout(() => {
      audio.pause();
      audio.currentTime = 0;
      gain.gain.setValueAtTime(0, ctx.currentTime);
      setIsPlaying(false);
      setStatus(audioUrlRef.current ? 'ready' : 'idle');
      fadeTimerRef.current = null;
    }, fadeMs);
  }, []);

  const release = useCallback(() => {
    // Invalidate a provider response that is still decoding or in flight.
    // Closing the music surface must not let a late response remount an audio
    // URL after the Oracle has already been restored.
    generationRef.current += 1;
    if (fadeTimerRef.current !== null) {
      window.clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
    const audio = audioRef.current;
    audio?.pause();
    if (audio) {
      audio.removeAttribute('src');
      audio.load();
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setAudioUrl(null);
    setDurationSeconds(null);
    setIsPlaying(false);
    setStatus('idle');
  }, []);

  const generate = useCallback(async (prompt: string) => {
    const generationId = generationRef.current + 1;
    generationRef.current = generationId;
    const requestedPrompt = prompt.trim().slice(0, 600);
    setStatus('generating');
    setError(null);
    setPrompt(requestedPrompt || null);
    setModel(null);
    setRequestId(null);
    setDurationSeconds(null);
    traceEvent('lyria_request', {
      prompt: requestedPrompt,
      prompt_chars: requestedPrompt.length,
    });
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('lyria-music-generator', {
        body: { prompt: requestedPrompt },
      });
      if (invokeError) {
        const context = (invokeError as { context?: Response }).context;
        let detail = invokeError.message;
        if (context) {
          try {
            const body = await context.clone().json() as {
              error?: string;
              code?: string;
              providerStatus?: number;
              providerMessage?: string;
              requestId?: string;
            };
            const parts = [
              body.code,
              body.providerStatus ? `HTTP ${body.providerStatus}` : null,
              body.providerMessage,
              body.requestId ? `ref ${body.requestId}` : null,
            ].filter(Boolean);
            if (parts.length) detail = parts.join(' — ');
            else if (body.error) detail = body.error;
          } catch {
            // Keep the SDK error when the function response is not JSON.
          }
        }
        traceEvent('lyria_error', { message: detail.slice(0, 500) });
        throw new Error(detail || 'Lyria generation failed.');
      }
      if (!data?.audioBase64) throw new Error(data?.error || 'No playable track returned.');
      setPrompt(typeof data.prompt === 'string' ? data.prompt : requestedPrompt);
      setModel(typeof data.model === 'string' ? data.model : null);
      setRequestId(typeof data.requestId === 'string' ? data.requestId : null);
      traceEvent('lyria_response', {
        request_id: typeof data.requestId === 'string' ? data.requestId : null,
        interaction_id: typeof data.interactionId === 'string' ? data.interactionId : null,
        model: typeof data.model === 'string' ? data.model : null,
        response_shape: data.responseShape ?? null,
        output_text_present: typeof data.outputText === 'string' && data.outputText.length > 0,
      });
      if (generationRef.current !== generationId) return null;
      const cleanedBase64 = data.audioBase64.replace(/\s/g, '');
      const blob = base64ToBlob(cleanedBase64, data.mimeType || 'audio/mpeg');
      const nextUrl = URL.createObjectURL(blob);
      // Set the element immediately as well as through React state. This keeps
      // the post-generation play attempt from racing the next render (important
      // on mobile, where a stale src otherwise turns a successful generation
      // into a misleading "tap play" state).
      if (audioRef.current) {
        audioRef.current.src = nextUrl;
        audioRef.current.load();
      }
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = nextUrl;
      setAudioUrl(nextUrl);
      setStatus('ready');
      return nextUrl;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Lyria generation failed.';
      setError(message);
      traceEvent('lyria_error', { message: message.slice(0, 500) });
      setStatus('error');
      return null;
    }
  }, []);

  useEffect(() => () => {
    generationRef.current += 1;
    if (fadeTimerRef.current !== null) window.clearTimeout(fadeTimerRef.current);
    audioRef.current?.pause();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
  }, []);

  return {
    audioRef,
    analyserRef,
    status,
    audioUrl,
    error,
    isPlaying,
    prompt,
    model,
    requestId,
    durationSeconds,
    handleLoadedMetadata,
    generate,
    play,
    stop,
    release,
  };
}