import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

export type OracleFilmJob = {
  id: string;
  status: 'queued' | 'generating' | 'stitching' | 'ready' | 'failed' | 'cancelled';
  progress: number;
  chunkCount: number;
  finalMediaUrl: string | null;
  error: string | null;
};

type FilmContext = {
  themes?: string[];
  archetypeTitle?: string | null;
  emotionalWeight?: string | null;
  alignment?: string | null;
};

export function useOracleFilm(sessionId: string | null | undefined) {
  const [job, setJob] = useState<OracleFilmJob | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async (jobId: string) => {
    const { data, error } = await supabase.functions.invoke('oracle-film-job', {
      body: { action: 'status', jobId },
    });
    if (error) throw error;
    if (data?.id) setJob(data as OracleFilmJob);
    return data as OracleFilmJob;
  }, []);

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
    }, 2200);
  }, [poll]);

  const createFilm = useCallback(async (portraitUrl: string, context: FilmContext = {}) => {
    if (!sessionId) return null;
    setJob({ id: 'pending', status: 'queued', progress: 0, chunkCount: 4, finalMediaUrl: null, error: null });
    const { data, error } = await supabase.functions.invoke('oracle-film-job', {
      body: { action: 'create', sessionId, portraitUrl, context },
    });
    if (error) {
      setJob({ id: 'failed', status: 'failed', progress: 0, chunkCount: 4, finalMediaUrl: null, error: error.message || 'Film request failed.' });
      return null;
    }
    setJob(data as OracleFilmJob);
    if (data?.id && !['ready', 'failed', 'cancelled'].includes(data.status)) schedulePoll(data.id);
    return data as OracleFilmJob;
  }, [schedulePoll, sessionId]);

  const cancelFilm = useCallback(async () => {
    if (!job?.id || job.id === 'pending') return;
    if (pollTimer.current) clearTimeout(pollTimer.current);
    const { data } = await supabase.functions.invoke('oracle-film-job', {
      body: { action: 'cancel', jobId: job.id },
    });
    if (data?.id) setJob(data as OracleFilmJob);
  }, [job?.id]);

  useEffect(() => () => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
  }, []);

  return { job, createFilm, cancelFilm };
}