import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { IllustrationStoryPage, IllustrationStoryVoiceLine } from '../lib/creativeProduction';

export type IllustrationStoryFailureKind =
  | 'provider-safety'
  | 'provider'
  | 'submission'
  | 'audio-gate'
  | null;

export type IllustrationStorySceneState = {
  pageNumber: number;
  sheetIndex: 0 | 1;
  row: number;
  column: number;
  durationSeconds: number;
  seed: number;
  referenceUrl?: string | null;
  referenceAudioUrl?: string | null;
  status: 'planned' | 'queued' | 'generating' | 'ready' | 'failed' | 'cancelled';
  progress: number;
  jobId?: string | null;
  outputUrl?: string | null;
  error?: string | null;
  failureKind?: Exclude<IllustrationStoryFailureKind, 'audio-gate'>;
  recovery?: 'retry' | 'replace' | null;
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
  characterVoiceTracks?: IllustrationStoryCharacterTrack[];
  finalMediaUrl: string | null;
  error: string | null;
  failureKind: IllustrationStoryFailureKind;
  audioGate?: {
    musicReady: boolean;
    narrationReady: boolean;
    verified: boolean;
    passed: boolean;
  };
  finalGate?: {
    everyPageReady: boolean;
    audioReady: boolean;
    passed: boolean;
  };
};

export type IllustrationStoryFilmResult = {
  url: string;
  mediaType: 'video/mp4';
  pageCount: number;
  durationSeconds: number;
  narrationAvailable: boolean;
};

export type IllustrationStoryCharacterTrack = {
  speaker: Exclude<IllustrationStoryVoiceLine['speaker'], 'oracle'>;
  source_voice: string;
  voice_presentation: 'young-masculine' | 'young-feminine' | 'young-neutral';
  octave_shift: number;
  tuning_cents: number;
  transcript: string;
  duration_seconds: number;
  sample_rate_hz: number;
  public_url: string;
  storage_path: string;
  track_key: string;
  status: 'ready';
};

type StoryAsset = { base64: string; mimeType: string };
type NarrationBundle = {
  narration: StoryAsset;
  characterTracks: IllustrationStoryCharacterTrack[];
};
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

async function createNarrationAudio(
  pages: IllustrationStoryPage[],
  sessionId: string,
): Promise<NarrationBundle> {
  const lines: IllustrationStoryVoiceLine[] = pages.flatMap(page => page.voiceover ?? [{
    speaker: 'oracle' as const,
    text: page.narration,
    pauseAfterMs: 260,
  }]);
  const characterLines = lines.filter((line): line is Exclude<IllustrationStoryVoiceLine, { speaker: 'oracle' }> => line.speaker !== 'oracle');
  const [narrationResponse, characterResponse] = await Promise.all([
    supabase.functions.invoke('oracle-chirp-voiceover', { body: { lines } }),
    characterLines.length
      ? supabase.functions.invoke('oracle-character-voice-tracks', {
        body: { sessionId, storyKey: 'illustration-story', lines: characterLines },
      })
      : Promise.resolve({ data: { tracks: [] }, error: null }),
  ]);
  if (narrationResponse.error) {
    throw new Error(`Chirp lore voiceover could not be generated: ${narrationResponse.error.message}`);
  }
  if (characterResponse.error) {
    throw new Error(`Character voice tracks could not be generated: ${characterResponse.error.message}`);
  }
  const data = narrationResponse.data;
  let narration: StoryAsset | null = null;
  if (data instanceof Blob && data.size) {
    narration = { base64: toBase64(new Uint8Array(await data.arrayBuffer())), mimeType: data.type || 'audio/wav' };
  } else if (data instanceof ArrayBuffer && data.byteLength) {
    narration = { base64: toBase64(new Uint8Array(data)), mimeType: 'audio/wav' };
  } else if (data instanceof Uint8Array && data.byteLength) {
    narration = { base64: toBase64(data), mimeType: 'audio/wav' };
  }
  if (!narration) throw new Error('Chirp lore voiceover returned no playable audio.');
  const tracks = Array.isArray(characterResponse.data?.tracks)
    ? characterResponse.data.tracks as IllustrationStoryCharacterTrack[]
    : [];
  if (tracks.length !== new Set(characterLines.map(line => line.speaker)).size) {
    throw new Error('Character voice track response was incomplete.');
  }
  return { narration, characterTracks: tracks };
}

function isTerminal(status: IllustrationStoryFilmJob['status']): boolean {
  return ['ready', 'failed', 'cancelled'].includes(status);
}

export function useIllustrationStoryFilm(sessionId?: string | null) {
  const [job, setJob] = useState<IllustrationStoryFilmJob | null>(null);
  const jobRef = useRef<IllustrationStoryFilmJob | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const localObjectUrlRef = useRef<string | null>(null);
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
    const [panels, music, narrationBundle] = await Promise.all([
      createLockedPanelAssets(sheetUrls, pages),
      urlToBase64(musicUrl),
      createNarrationAudio(pages, sessionId ?? 'anonymous-story-session'),
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
        narrationBase64: narrationBundle.narration.base64,
        narrationMimeType: narrationBundle.narration.mimeType,
        characterVoiceTracks: narrationBundle.characterTracks,
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
    mode: 'retry' | 'replace' = 'retry',
  ) => {
    const currentId = activeJobIdRef.current ?? jobRef.current?.id;
    if (!currentId) throw new Error('There is no saved story film job to retry.');
    const { data, error } = await supabase.functions.invoke('oracle-story-film-job', {
      body: { action: mode, jobId: currentId, pageNumber },
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

  const replaceScene = useCallback(async (
    pageNumber: number,
    onProgress?: (progress: number) => void,
    onJob?: StoryJobListener,
  ) => retryScene(pageNumber, onProgress, onJob, 'replace'), [retryScene]);

  const retryAssembly = useCallback(async (
    onProgress?: (progress: number) => void,
    onJob?: StoryJobListener,
  ) => {
    const currentId = activeJobIdRef.current ?? jobRef.current?.id;
    if (!currentId) throw new Error('There is no saved story film job to stitch.');
    const { data, error } = await supabase.functions.invoke('oracle-story-film-job', {
      body: { action: 'retry-stitch', jobId: currentId },
    });
    if (error) throw error;
    if (!data?.id) throw new Error(data?.error || 'Story stitch retry returned no job.');
    publish(data as IllustrationStoryFilmJob, onJob);
    onProgress?.(data.progress);
    return waitForCompletion(data.id, next => {
      onProgress?.(next.progress);
      onJob?.(next);
    });
  }, [publish, waitForCompletion]);

  const renderLocalStory = useCallback(async (
    sheetUrls: [string, string],
    pages: IllustrationStoryPage[],
    musicUrl: string,
    onProgress?: (progress: number) => void,
  ): Promise<IllustrationStoryFilmResult> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    onProgress?.(8);

    const [sheetOne, sheetTwo, music] = await Promise.all([
      urlToBase64(sheetUrls[0]),
      urlToBase64(sheetUrls[1]),
      urlToBase64(musicUrl),
    ]);
    if (controller.signal.aborted) throw new Error('Story film render cancelled.');
    onProgress?.(20);

    const narrationBundle = await createNarrationAudio(pages, sessionId ?? 'anonymous-story-session');
    if (controller.signal.aborted) throw new Error('Story film render cancelled.');
    onProgress?.(30);

    const response = await fetch(`${import.meta.env.BASE_URL}api/illustration-story-stitch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         sheets: [sheetOne, sheetTwo],
         music,
         narration: narrationBundle.narration,
         characterVoiceTracks: narrationBundle.characterTracks,
         pages,
       }),
      signal: controller.signal,
    });
    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json()).error ?? ''; } catch { /* keep status */ }
      throw new Error(detail || `FFmpeg story stitch failed (${response.status}).`);
    }
    const validatedPageCount = Number(response.headers.get('X-Story-Page-Count'));
    const validatedDuration = Number(response.headers.get('X-Story-Duration'));
    if (validatedPageCount !== pages.length) throw new Error('Story film validation failed: page count mismatch.');
    if (
      !Number.isFinite(validatedDuration)
      || Math.abs(validatedDuration - pages.reduce((sum, page) => sum + page.durationSeconds, 0)) > 0.75
    ) {
      throw new Error('Story film validation failed: duration mismatch.');
    }
    if (response.headers.get('X-Story-Audio') !== 'present') {
      throw new Error('Story film validation failed: audio track missing.');
    }
    const blob = await response.blob();
    if (!blob.size) throw new Error('FFmpeg returned an empty story film.');
    if (localObjectUrlRef.current) URL.revokeObjectURL(localObjectUrlRef.current);
    localObjectUrlRef.current = URL.createObjectURL(blob);
    onProgress?.(100);
    return {
      url: localObjectUrlRef.current,
      mediaType: 'video/mp4',
      pageCount: pages.length,
      durationSeconds: validatedDuration,
      narrationAvailable: response.headers.get('X-Story-Narration') === 'available',
    };
  }, []);

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
    if (localObjectUrlRef.current) URL.revokeObjectURL(localObjectUrlRef.current);
  }, []);

  return { job, renderStory, renderLocalStory, retryScene, replaceScene, retryAssembly, cancel };
}