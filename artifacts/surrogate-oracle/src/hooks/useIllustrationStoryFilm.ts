import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { IllustrationStoryPage } from '../lib/creativeProduction';

export type IllustrationStorySceneState = {
  pageNumber: number;
  sheetIndex: 0 | 1;
  row: number;
  column: number;
  durationSeconds: number;
  seed: number;
  referenceUrl?: string | null;
  status: 'planned' | 'queued' | 'generating' | 'ready' | 'failed' | 'cancelled';
  progress: number;
  jobId?: string | null;
  outputUrl?: string | null;
  error?: string | null;
};

export type IllustrationStoryFilmJob = {
  id: string;
  provider: 'fal';
  kind: 'illustration-story';
  status: 'queued' | 'generating' | 'stitching' | 'ready' | 'failed' | 'cancelled';
  progress: number;
  chunkCount: number;
  pageCount: number;
  scenes: IllustrationStorySceneState[];
  finalMediaUrl: string | null;
  error: string | null;
};

export type IllustrationStoryFilmResult = {
  url: string;
  mediaType: 'video/mp4';
  pageCount: number;
  durationSeconds: number;
  narrationAvailable: boolean;
};

type StoryAsset = { base64: string; mimeType: string };
type StoryJobListener = (job: IllustrationStoryFilmJob) => void;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

async function urlToBase64(url: string): Promise<StoryAsset> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Story asset could not be read (${response.status}).`);
  const blob = await response.blob();
  return {
    base64: toBase64(new Uint8Array(await blob.arrayBuffer())),
    mimeType: blob.type || 'audio/mpeg',
  };
}

async function loadBitmap(url: string): Promise<ImageBitmap | HTMLImageElement> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Story source could not be read (${response.status}).`);
  const blob = await response.blob();
  if ('createImageBitmap' in window) return createImageBitmap(blob);
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Story source could not be decoded.'));
      element.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function cropPanel(bitmap: ImageBitmap | HTMLImageElement, page: IllustrationStoryPage): Promise<StoryAsset> {
  const sourceWidth = bitmap instanceof ImageBitmap ? bitmap.width : bitmap.naturalWidth;
  const sourceHeight = bitmap instanceof ImageBitmap ? bitmap.height : bitmap.naturalHeight;
  const width = Math.floor(sourceWidth / 4);
  const height = Math.floor(sourceHeight / 4);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context || !width || !height) throw new Error(`Story panel ${page.pageNumber} could not be prepared.`);
  context.drawImage(bitmap, page.column * width, page.row * height, width, height, 0, 0, width, height);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.94));
  if (!blob?.size) throw new Error(`Story panel ${page.pageNumber} produced no reference image.`);
  return { base64: toBase64(new Uint8Array(await blob.arrayBuffer())), mimeType: 'image/jpeg' };
}

async function createLockedPanelAssets(
  sheetUrls: [string, string],
  pages: IllustrationStoryPage[],
): Promise<StoryAsset[]> {
  const bitmaps = await Promise.all(sheetUrls.map(loadBitmap));
  try {
    return Promise.all(pages.map(page => cropPanel(bitmaps[page.sheetIndex], page)));
  } finally {
    bitmaps.forEach(bitmap => {
      if (bitmap instanceof ImageBitmap) bitmap.close();
    });
  }
}

async function createNarrationAudio(script: string): Promise<StoryAsset> {
  const { data, error } = await supabase.functions.invoke('oracle-filler-tts', {
    body: {
      prompt: `Read this as one warm, gentle bedtime story for a young child. Keep the pace calm, expressive, and clear. Do not add words, page labels, or commentary. ${script}`,
    },
  });
  if (error) throw new Error(`Gemini narration could not be generated: ${error.message}`);
  if (data instanceof Blob && data.size) {
    return { base64: toBase64(new Uint8Array(await data.arrayBuffer())), mimeType: data.type || 'audio/wav' };
  }
  if (data instanceof ArrayBuffer && data.byteLength) {
    return { base64: toBase64(new Uint8Array(data)), mimeType: 'audio/wav' };
  }
  if (data instanceof Uint8Array && data.byteLength) {
    return { base64: toBase64(data), mimeType: 'audio/wav' };
  }
  throw new Error('Gemini narration returned no playable audio.');
}

function isTerminal(status: IllustrationStoryFilmJob['status']): boolean {
  return ['ready', 'failed', 'cancelled'].includes(status);
}

export function useIllustrationStoryFilm(sessionId?: string | null) {
  const [job, setJob] = useState<IllustrationStoryFilmJob | null>(null);
  const jobRef = useRef<IllustrationStoryFilmJob | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeJobIdRef = useRef<string | null>(null);
  const pollingRef = useRef(false);

  const publish = useCallback((next: IllustrationStoryFilmJob, listener?: StoryJobListener) => {
    jobRef.current = next;
    setJob(next);
    listener?.(next);
    if (sessionId && typeof window !== 'undefined') {
      localStorage.setItem(`oracle_story_film_job_${sessionId}`, JSON.stringify(next));
    }
  }, [sessionId]);

  const poll = useCallback(async (jobId: string, listener?: StoryJobListener) => {
    const { data, error } = await supabase.functions.invoke('oracle-story-film-job', {
      body: { action: 'status', jobId },
    });
    if (error) throw error;
    if (!data?.id) throw new Error('Story film status returned no job.');
    const next = data as IllustrationStoryFilmJob;
    publish(next, listener);
    return next;
  }, [publish]);

  const waitForCompletion = useCallback(async (jobId: string, listener?: StoryJobListener) => {
    if (pollingRef.current) return jobRef.current;
    pollingRef.current = true;
    let lastError: unknown = null;
    try {
      for (let attempt = 0; attempt < 360; attempt += 1) {
        if (abortRef.current?.signal.aborted) throw new Error('Story film production cancelled.');
        try {
          const next = await poll(jobId, listener);
          if (isTerminal(next.status)) return next;
          lastError = null;
        } catch (error) {
          if (abortRef.current?.signal.aborted) throw new Error('Story film production cancelled.');
          lastError = error;
        }
        await new Promise(resolve => window.setTimeout(resolve, lastError ? 3000 : 4000));
      }
    } finally {
      pollingRef.current = false;
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('Premium story film timed out. Completed scenes remain available for retry.');
  }, [poll]);

  const renderStory = useCallback(async (
    sheetUrls: [string, string],
    pages: IllustrationStoryPage[],
    musicUrl: string,
    onProgress?: (progress: number) => void,
    onJob?: StoryJobListener,
  ): Promise<IllustrationStoryFilmResult> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    onProgress?.(2);

    if (pages.length !== 32) throw new Error('Premium story production requires exactly 32 pages.');
    const [panels, music, narration] = await Promise.all([
      createLockedPanelAssets(sheetUrls, pages),
      urlToBase64(musicUrl),
      createNarrationAudio(pages.map(page => page.narration).join(' ')),
    ]);
    if (controller.signal.aborted) throw new Error('Story film production cancelled.');
    onProgress?.(6);

    const { data, error } = await supabase.functions.invoke('oracle-story-film-job', {
      body: {
        action: 'create',
        sessionId: sessionId ?? 'anonymous-story-session',
        pages,
        panels,
        musicBase64: music.base64,
        musicMimeType: music.mimeType,
        narrationBase64: narration.base64,
        narrationMimeType: narration.mimeType,
      },
    });
    if (error) throw new Error(`Premium story job could not start: ${error.message}`);
    if (!data?.id) throw new Error(data?.error || 'Premium story job returned no id.');
    activeJobIdRef.current = data.id;
    const initial = data as IllustrationStoryFilmJob;
    publish(initial, onJob);
    onProgress?.(initial.progress);

    const complete = isTerminal(initial.status)
      ? initial
      : await waitForCompletion(initial.id, next => {
        onProgress?.(next.progress);
        onJob?.(next);
      });
    if (!complete) {
      throw new Error('Premium story film status was lost; the saved server job remains recoverable.');
    }
    if (complete.status !== 'ready' || !complete.finalMediaUrl) {
      throw new Error(complete.error || 'Premium story film did not produce a playable MP4.');
    }
    onProgress?.(100);
    return {
      url: complete.finalMediaUrl,
      mediaType: 'video/mp4',
      pageCount: complete.pageCount,
      durationSeconds: pages.reduce((sum, page) => sum + page.durationSeconds, 0),
      narrationAvailable: true,
    };
  }, [publish, sessionId, waitForCompletion]);

  const retryScene = useCallback(async (
    pageNumber: number,
    onProgress?: (progress: number) => void,
    onJob?: StoryJobListener,
  ) => {
    const currentId = activeJobIdRef.current ?? jobRef.current?.id;
    if (!currentId) throw new Error('There is no saved story film job to retry.');
    const { data, error } = await supabase.functions.invoke('oracle-story-film-job', {
      body: { action: 'retry', jobId: currentId, pageNumber },
    });
    if (error) throw error;
    if (!data?.id) throw new Error(data?.error || 'Story page retry returned no job.');
    publish(data as IllustrationStoryFilmJob, onJob);
    onProgress?.(data.progress);
    const complete = await waitForCompletion(data.id, next => {
      onProgress?.(next.progress);
      onJob?.(next);
    });
    return complete;
  }, [publish, waitForCompletion]);

  const cancel = useCallback(async () => {
    abortRef.current?.abort();
    if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
    const currentId = activeJobIdRef.current ?? jobRef.current?.id;
    if (currentId && !isTerminal(jobRef.current?.status ?? 'queued')) {
      const { data } = await supabase.functions.invoke('oracle-story-film-job', {
        body: { action: 'cancel', jobId: currentId },
      });
      if (data?.id) publish(data as IllustrationStoryFilmJob);
    }
  }, [publish]);

  useEffect(() => {
    if (!sessionId || typeof window === 'undefined') return;
    const stored = localStorage.getItem(`oracle_story_film_job_${sessionId}`);
    if (!stored) return;
    try {
      const restored = JSON.parse(stored) as IllustrationStoryFilmJob;
      if (restored?.id && restored?.kind === 'illustration-story') {
        activeJobIdRef.current = restored.id;
        publish(restored);
      }
    } catch {
      localStorage.removeItem(`oracle_story_film_job_${sessionId}`);
    }
    return () => {
      if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
    };
  }, [publish, sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    void supabase.functions.invoke('oracle-story-film-job', {
      body: { action: 'latest', sessionId },
    }).then(({ data }) => {
      if (data?.id) {
        activeJobIdRef.current = data.id;
        publish(data as IllustrationStoryFilmJob);
      }
    }).catch(() => {
      // A missing server job should not interrupt the Oracle conversation.
    });
  }, [publish, sessionId]);

  useEffect(() => {
    if (!job || isTerminal(job.status) || pollingRef.current) return;
    void waitForCompletion(job.id).catch(() => {
      // Keep the persisted server job recoverable; a later refresh or explicit
      // retry can resume without inventing a local failure.
    });
  }, [job, waitForCompletion]);

  useEffect(() => () => {
    abortRef.current?.abort();
    if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
  }, []);

  return { job, renderStory, retryScene, cancel };
}