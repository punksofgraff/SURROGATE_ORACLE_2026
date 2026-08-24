import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const REMOTE_POLL_INTERVAL_MS = 10_000;

export type OracleFilmJob = {
  id: string;
  provider?: 'browser' | 'runpod' | 'comfy';
  status: 'queued' | 'generating' | 'stitching' | 'ready' | 'failed' | 'cancelled';
  progress: number;
  chunkCount: number;
  finalMediaUrl: string | null;
  mediaType?: string;
  error: string | null;
};

export type FilmRenderMode = 'local' | 'premium';

export function useOracleFilm(sessionId: string | null | undefined) {
  const [job, setJob] = useState<OracleFilmJob | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const localObjectUrlRef = useRef<string | null>(null);
  const localCancelRef = useRef(false);
  const announcedJobRef = useRef<string | null>(null);

  const persistRemoteJob = useCallback((next: OracleFilmJob | null) => {
    if (!sessionId || typeof window === 'undefined') return;
    const key = `oracle_film_job_${sessionId}`;
    if (next?.provider !== 'browser') localStorage.setItem(key, JSON.stringify(next));
  }, [sessionId]);

  const announceReady = useCallback((next: OracleFilmJob | null) => {
    if (!next || next.status !== 'ready' || !next.finalMediaUrl || announcedJobRef.current === next.id) return;
    announcedJobRef.current = next.id;
    window.dispatchEvent(new CustomEvent('oracle:film-ready', {
      detail: { job: next, finalMediaUrl: next.finalMediaUrl },
    }));
  }, []);

  const poll = useCallback(async (jobId: string) => {
    const { data, error } = await supabase.functions.invoke('oracle-film-job', {
      body: { action: 'status', jobId },
    });
    if (error) throw error;
    if (data?.id) {
      const next = data as OracleFilmJob;
      setJob(next);
      persistRemoteJob(next);
      announceReady(next);
    }
    return data as OracleFilmJob;
  }, [announceReady, persistRemoteJob]);

  const schedulePoll = useCallback((jobId: string) => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = setTimeout(async () => {
      try {
        const next = await poll(jobId);
        if (next && !['ready', 'failed', 'cancelled'].includes(next.status)) schedulePoll(jobId);
      } catch {
        // A transient network error should not turn a running GPU job into a
        // false failure. The next user-visible action can poll again.
      }
    }, REMOTE_POLL_INTERVAL_MS);
  }, [poll]);

  useEffect(() => {
    if (!sessionId || typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(`oracle_film_job_${sessionId}`);
      if (!saved) return;
      const restored = JSON.parse(saved) as OracleFilmJob;
      if (!restored?.id || !restored.status) return;
      setJob(restored);
      announceReady(restored);
      if (!['ready', 'failed', 'cancelled'].includes(restored.status) && restored.provider !== 'browser') {
        schedulePoll(restored.id);
      }
    } catch {
      localStorage.removeItem(`oracle_film_job_${sessionId}`);
    }
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [announceReady, schedulePoll, sessionId]);

  const createFilm = useCallback(async (
    portraitUrl: string,
    audioUrl?: string | null,
    prompt?: string | null,
    renderMode: FilmRenderMode = 'local',
  ) => {
    if (recorderRef.current || !portraitUrl) return null;
    localCancelRef.current = false;
    if (localObjectUrlRef.current) URL.revokeObjectURL(localObjectUrlRef.current);
    localObjectUrlRef.current = null;

    const canvas = document.createElement('canvas');
    canvas.width = 720;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    if (!ctx || !('MediaRecorder' in window) || !canvas.captureStream) {
      setJob({
        id: 'browser-unsupported', provider: 'browser', status: 'failed', progress: 0,
        chunkCount: 1, finalMediaUrl: null, error: 'This browser cannot render a free film locally.',
      });
      return null;
    }

    const image = new Image();
    image.crossOrigin = 'anonymous';
    setJob({ id: 'browser-pending', provider: 'browser', status: 'queued', progress: 0, chunkCount: 1, finalMediaUrl: null, error: null });
    try {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('The portrait cannot be rendered locally. Use the GPU fallback instead.'));
        image.src = portraitUrl;
      });

      // Only premium renders upload the audio anchor. The local renderer must
      // remain a genuinely free path and should not make a remote media request.
      let audioBase64: string | undefined;
      if (renderMode === 'premium' && audioUrl) {
        try {
          const response = await fetch(audioUrl);
          if (response.ok) {
            const bytes = new Uint8Array(await response.arrayBuffer());
            if (bytes.byteLength <= 12 * 1024 * 1024) {
              let binary = '';
              for (let index = 0; index < bytes.length; index += 0x8000) {
                binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
              }
              audioBase64 = btoa(binary);
            }
          }
        } catch {
          // The browser renderer does not need the optional audio anchor.
        }
      }

      if (renderMode === 'premium') {
        try {
          const { data: remoteJob, error: invokeError } = await supabase.functions.invoke('oracle-film-job', {
            body: {
              action: 'create',
              renderMode,
              sessionId,
              portraitUrl,
              audioBase64,
              audioMimeType: 'audio/mpeg',
              context: { prompt: prompt ?? 'reggae drum and bass beach bar music video' },
            },
          });
          if (!invokeError && remoteJob?.id && remoteJob?.provider !== 'browser') {
            const next = remoteJob as OracleFilmJob;
            setJob(next);
            persistRemoteJob(next);
            schedulePoll(remoteJob.id);
            return remoteJob as OracleFilmJob;
          }
          throw new Error(
            remoteJob?.error ||
            invokeError?.message ||
            'Premium RunPod model-template rendering is unavailable.',
          );
        } catch (error) {
          const failed = {
            id: 'premium-failed',
            provider: 'runpod' as const,
            status: 'failed' as const,
            progress: 0,
            chunkCount: 4,
            finalMediaUrl: null,
            error: error instanceof Error
              ? error.message
              : 'Premium RunPod model-template rendering failed.',
          };
          setJob(failed);
          return failed;
        }
      }

      const stream = canvas.captureStream(24);
      const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
        .find(type => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error('This browser does not support free WebM video export.');
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 3_500_000 });
      recorderRef.current = recorder;
      const parts: Blob[] = [];
      recorder.ondataavailable = event => { if (event.data.size) parts.push(event.data); };
      const finished = new Promise<Blob>((resolve, reject) => {
        recorder.onerror = () => reject(new Error('Local film recording failed.'));
        recorder.onstop = () => resolve(new Blob(parts, { type: mimeType }));
      });
      recorder.start(250);
      setJob({ id: 'browser-rendering', provider: 'browser', status: 'generating', progress: 2, chunkCount: 1, finalMediaUrl: null, mediaType: mimeType, error: null });

      const startedAt = performance.now();
      const durationMs = 8000;
      const paint = (now: number) => {
        const elapsed = now - startedAt;
        const progress = Math.min(96, Math.round((elapsed / durationMs) * 96));
        const phase = elapsed / durationMs;
        ctx.fillStyle = '#02040b';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const glow = ctx.createRadialGradient(360, 340, 60, 360, 340, 520);
        glow.addColorStop(0, 'rgba(0,255,170,.18)');
        glow.addColorStop(1, 'rgba(0,20,45,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const scale = 1.03 + Math.sin(phase * Math.PI * 2) * 0.035;
        const size = Math.max(image.width, image.height) * scale;
        const x = 360 - size / 2 + Math.sin(phase * Math.PI * 2) * 8;
        const y = 360 - size / 2 - Math.cos(phase * Math.PI * 2) * 6;
        ctx.globalAlpha = 0.96;
        ctx.drawImage(image, x, y, size, size);
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(0,255,180,.12)';
        for (let i = 0; i < 18; i++) {
          const px = (i * 97 + elapsed * (8 + i % 3)) % 760 - 20;
          const py = (i * 53 + Math.sin(phase * 8 + i) * 18) % 720;
          ctx.fillRect(px, py, 2, 2);
        }
        ctx.fillStyle = 'rgba(0,0,0,.2)';
        for (let y = 0; y < 720; y += 6) ctx.fillRect(0, y, 720, 1);
        setJob(current => current?.provider === 'browser' ? { ...current, progress } : current);
        if (elapsed < durationMs && recorderRef.current === recorder) requestAnimationFrame(paint);
        else if (recorder.state !== 'inactive') recorder.stop();
      };
      requestAnimationFrame(paint);
      const blob = await finished;
      recorderRef.current = null;
      if (localCancelRef.current) {
        const cancelled = { id: 'browser-cancelled', provider: 'browser' as const, status: 'cancelled' as const, progress: 0, chunkCount: 1, finalMediaUrl: null, mediaType: mimeType, error: null };
        setJob(cancelled);
        return cancelled;
      }
      const url = URL.createObjectURL(blob);
      localObjectUrlRef.current = url;
      const ready = { id: 'browser-ready', provider: 'browser' as const, status: 'ready' as const, progress: 100, chunkCount: 1, finalMediaUrl: url, mediaType: mimeType, error: null };
      setJob(ready);
      return ready;
    } catch (error) {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
      recorderRef.current = null;
      if (localCancelRef.current) {
        const cancelled = { id: 'browser-cancelled', provider: 'browser' as const, status: 'cancelled' as const, progress: 0, chunkCount: 1, finalMediaUrl: null, error: null };
        setJob(cancelled);
        return cancelled;
      }
      const failed = { id: 'browser-failed', provider: 'browser' as const, status: 'failed' as const, progress: 0, chunkCount: 1, finalMediaUrl: null, error: error instanceof Error ? error.message : 'Free film rendering failed.' };
      setJob(failed);
      return failed;
    }
  }, [persistRemoteJob, schedulePoll, sessionId]);

  const cancelFilm = useCallback(async () => {
    if (!job?.id || job.id === 'pending') return;
    if (pollTimer.current) clearTimeout(pollTimer.current);
    if (job.provider === 'browser') {
      localCancelRef.current = true;
      if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
      recorderRef.current = null;
      setJob(current => current ? { ...current, status: 'cancelled', error: null } : current);
      return;
    }
    const { data } = await supabase.functions.invoke('oracle-film-job', {
      body: { action: 'cancel', jobId: job.id },
    });
    if (data?.id) setJob(data as OracleFilmJob);
  }, [job?.id, job?.provider]);

  useEffect(() => () => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
  }, []);

  useEffect(() => () => {
    if (localObjectUrlRef.current) URL.revokeObjectURL(localObjectUrlRef.current);
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
  }, []);

  return { job, createFilm, cancelFilm };
}