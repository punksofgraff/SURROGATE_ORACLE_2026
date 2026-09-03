import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  createIllustrationStoryReviewManifest,
} from '../lib/creativeProduction';
import type {
  IllustrationStoryModelOption,
  IllustrationStoryPage,
  IllustrationStoryScene,
  IllustrationStoryReviewAudioSource,
  IllustrationStoryReviewHistoryEntry,
  IllustrationStoryReviewManifest,
  IllustrationStoryReviewRejection,
  IllustrationStoryReviewState,
  IllustrationStorySoundEffect,
  IllustrationStoryVoiceLine,
} from '../lib/creativeProduction';

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
  modelSlug?: string | null;
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
  provider: 'fal' | 'minimax' | 'browser-film' | 'retired-fal';
  modelSlug?: string | null;
  kind: 'illustration-story';
  status: 'queued' | 'generating' | 'stitching' | 'ready' | 'failed' | 'cancelled';
  progress: number;
  chunkCount: number;
  pageCount: number;
  scenes: IllustrationStorySceneState[];
  characterVoiceTracks?: IllustrationStoryCharacterTrack[];
  audioManifest?: {
    soundEffects?: IllustrationStorySoundEffect[];
  };
  finalMediaUrl: string | null;
  narrationUrl?: string | null;
  musicUrl?: string | null;
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
  review?: IllustrationStoryReviewState;
  reviewRejections?: IllustrationStoryReviewRejection[];
  reviewHistory?: IllustrationStoryReviewHistoryEntry[];
  reviewManifest?: IllustrationStoryReviewManifest | null;
  workflow?: {
    mode?: 'single-fal-workflow' | 'ten-h3-chunks' | 'legacy-per-scene-readonly';
    requestId?: string;
    statusUrl?: string;
    responseUrl?: string;
    submissionCount?: number;
    completedAt?: string;
    chunks?: IllustrationStoryH3ChunkState[];
  } | null;
  chunks?: IllustrationStoryH3ChunkState[];
  legacyReadOnly?: boolean;
  sourcePanelManifest?: Array<{
    panelId: string;
    pageNumber: number;
    sheetIndex: 0 | 1;
    row: number;
    column: number;
    durationSeconds: number;
    sourceHash: string;
    referenceUrl: string | null;
  }>;
  coverageCertificate?: {
    version: 1;
    panelCount: 32;
    totalDurationSeconds: number;
    panels: Array<{
      panelId: string;
      pageNumber: number;
      sourceHash: string;
      startSeconds: number;
      endSeconds: number;
    }>;
    audioProvenance: Record<string, unknown>;
  } | null;
  blockedReason?: string | null;
  submissionCount?: number;
};

export type IllustrationStoryFilmResult = {
  url: string;
  mediaType: 'video/mp4';
  pageCount: number;
  durationSeconds: number;
  narrationAvailable: boolean;
  soundEffectsMixed?: number;
  characterTimingApplied?: number;
  audioManifest: IllustrationStoryReviewAudioSource[];
  reviewManifest: IllustrationStoryReviewManifest;
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
  timing_metadata?: {
    format?: 'rhubarb';
    version?: string;
    metadata?: { soundFile?: string; duration?: number };
    mouthCues?: Array<{ start: string; end: string; value: string }>;
    lineCues?: Array<{
      start: string;
      end: string;
      pageNumber: number | null;
      pageOffsetSeconds: number;
    }>;
  };
  rhubarb_url?: string | null;
  public_url: string;
  storage_path: string;
  track_key: string;
  status: 'ready';
};

type StoryAsset = { base64: string; mimeType: string };
export type IllustrationStoryH3ChunkState = {
  chunkNumber: number;
  pageNumbers: number[];
  targetDurationSeconds: number;
  requestedDurationSeconds: number;
  imageUrl?: string | null;
  prompt?: string;
  requestId?: string;
  status: 'queued' | 'generating' | 'ready' | 'failed' | 'cancelled';
  progress: number;
  outputUrl?: string | null;
  error?: string | null;
};
type StoryChunkAsset = StoryAsset & {
  chunkNumber: number;
  pageNumbers: number[];
  targetDurationSeconds: number;
  requestedDurationSeconds: number;
};
type NarrationBundle = {
  narration: StoryAsset;
  characterTracks: IllustrationStoryCharacterTrack[];
};
type StoryJobListener = (job: IllustrationStoryFilmJob) => void;
type LocalStitchInput = {
  sceneUrls?: string[];
  cellUrls?: string[];
  chunkUrls?: string[];
  hostedFilmUrl?: string;
  sheets?: StoryAsset[];
  music?: StoryAsset;
  musicUrl?: string;
  narration?: StoryAsset;
  narrationUrl?: string;
  characterVoiceTracks: IllustrationStoryCharacterTrack[];
  pages: IllustrationStoryPage[];
};

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

const STORY_CHARACTER_SPEAKERS: Array<Exclude<IllustrationStoryVoiceLine['speaker'], 'oracle'>> = [
  'levi',
  'lennon',
  'pickles',
  'ghost-spider',
  'mario-spider-man',
  'donkey',
];

function createStoryAudioManifest({
  narrationAvailable,
  narrationSourceLabel,
  narrationPreviewUrl = null,
  characterTracks = [],
  nativeSceneAudioAvailable = false,
  musicPreviewUrl = null,
  musicSourceLabel = 'Lyria instrumental anchor',
  soundEffectsCount = 0,
}: {
  narrationAvailable: boolean;
  narrationSourceLabel: string;
  narrationPreviewUrl?: string | null;
  characterTracks?: IllustrationStoryCharacterTrack[];
  nativeSceneAudioAvailable?: boolean;
  musicPreviewUrl?: string | null;
  musicSourceLabel?: string;
  soundEffectsCount?: number;
}): IllustrationStoryReviewAudioSource[] {
  const tracksBySpeaker = new Map(characterTracks.map(track => [track.speaker, track]));
  return [
    {
      id: 'narration',
      label: 'Oracle narration',
      status: narrationAvailable ? 'available' : 'missing',
      sourceLabel: narrationSourceLabel,
      previewUrl: narrationPreviewUrl,
      generated: narrationAvailable,
      note: narrationAvailable ? 'Separate story narration source.' : 'No playable generated story narration is attached.',
    },
    ...STORY_CHARACTER_SPEAKERS.map(speaker => {
      const track = tracksBySpeaker.get(speaker);
      return {
        id: `character:${speaker}`,
        label: speaker === 'ghost-spider'
          ? 'Ghost Spider'
          : speaker === 'mario-spider-man'
            ? 'Mario Spider-Man'
            : speaker[0].toUpperCase() + speaker.slice(1),
        status: track?.public_url ? 'available' : 'missing',
        sourceLabel: track?.source_voice
          ? `Gemini catalog voice · ${track.source_voice}`
          : 'No persisted character track',
        previewUrl: track?.public_url ?? null,
        generated: Boolean(track?.public_url),
        note: track?.public_url
          ? 'Separate catalog voice track; not the live Oracle voice.'
          : 'Required character track is not available for review.',
      } satisfies IllustrationStoryReviewAudioSource;
    }),
    {
      id: 'native-scene-audio',
      label: 'MiniMax H3 native scene audio',
      status: nativeSceneAudioAvailable ? 'available' : 'not-requested',
      sourceLabel: nativeSceneAudioAvailable
        ? 'Embedded stereo ambience and movement audio from each H3 scene'
        : 'Not requested outside the MiniMax H3 lane',
      generated: nativeSceneAudioAvailable,
      note: nativeSceneAudioAvailable
        ? 'Preserved under narration, character tracks, Lyria music, and SFX in the assembled mix.'
        : 'FAL and local scenes do not provide a native H3 audio layer.',
    },
    {
      id: 'music',
      label: 'Lyria music bed',
      status: musicPreviewUrl ? 'available' : 'missing',
      sourceLabel: musicSourceLabel,
      previewUrl: musicPreviewUrl,
      generated: Boolean(musicPreviewUrl),
      note: musicPreviewUrl ? 'Looped under the story edit.' : 'No playable music source is attached.',
    },
    {
      id: 'sfx',
      label: 'Sound effects',
      status: soundEffectsCount > 0 ? 'available' : 'not-requested',
      sourceLabel: soundEffectsCount > 0 ? `${soundEffectsCount} authored or persisted cue${soundEffectsCount === 1 ? '' : 's'}` : 'No discrete SFX source',
      generated: soundEffectsCount > 0,
      note: soundEffectsCount > 0 ? 'Cues are mixed into the assembled film.' : 'No separate effect track was supplied.',
    },
  ];
}

function updateAssembledAudioManifest(
  audioManifest: IllustrationStoryReviewAudioSource[],
  soundEffectsCount: number,
): IllustrationStoryReviewAudioSource[] {
  return audioManifest.map(source => source.id !== 'sfx'
    ? source
    : soundEffectsCount > 0
      ? {
      ...source,
      status: 'available',
      sourceLabel: `${soundEffectsCount} authored or persisted cue${soundEffectsCount === 1 ? '' : 's'}`,
      generated: true,
      note: 'Cues are mixed into the assembled film.',
      }
      : {
        ...source,
        status: 'not-requested',
        sourceLabel: 'No discrete SFX source',
        generated: false,
        note: 'No separate effect track was supplied.',
      });
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

async function createH3ChunkAssets(
  sheetUrls: [string, string],
  pages: IllustrationStoryPage[],
): Promise<StoryChunkAsset[]> {
  const sizes = [4, 4, ...Array.from({ length: 8 }, () => 3)];
  const bitmaps = await Promise.all(sheetUrls.map(loadBitmap));
  try {
    const chunks: StoryChunkAsset[] = [];
    let cursor = 0;
    for (let chunkIndex = 0; chunkIndex < sizes.length; chunkIndex += 1) {
      const pageGroup = pages.slice(cursor, cursor + sizes[chunkIndex]);
      cursor += pageGroup.length;
      const columns = pageGroup.length === 4 ? 2 : 3;
      const rows = pageGroup.length === 4 ? 2 : 1;
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const context = canvas.getContext('2d');
      if (!context) throw new Error(`H3 chunk ${chunkIndex + 1} could not be prepared.`);
      context.fillStyle = '#061514';
      context.fillRect(0, 0, canvas.width, canvas.height);
      pageGroup.forEach((page, pageIndex) => {
        const bitmap = bitmaps[page.sheetIndex];
        const sourceWidth = bitmap instanceof ImageBitmap ? bitmap.width : bitmap.naturalWidth;
        const sourceHeight = bitmap instanceof ImageBitmap ? bitmap.height : bitmap.naturalHeight;
        const sourceWidthPerPanel = Math.floor(sourceWidth / 4);
        const sourceHeightPerPanel = Math.floor(sourceHeight / 4);
        const cellWidth = canvas.width / columns;
        const cellHeight = canvas.height / rows;
        const imageSize = Math.floor(Math.min(cellWidth, cellHeight) - 32);
        const imageX = pageIndex % columns * cellWidth + (cellWidth - imageSize) / 2;
        const imageY = Math.floor(pageIndex / columns) * cellHeight + (cellHeight - imageSize) / 2;
        context.fillStyle = 'rgba(0,255,136,0.10)';
        context.fillRect(
          pageIndex % columns * cellWidth + 8,
          Math.floor(pageIndex / columns) * cellHeight + 8,
          cellWidth - 16,
          cellHeight - 16,
        );
        context.drawImage(
          bitmap,
          page.column * sourceWidthPerPanel,
          page.row * sourceHeightPerPanel,
          sourceWidthPerPanel,
          sourceHeightPerPanel,
          imageX,
          imageY,
          imageSize,
          imageSize,
        );
        context.fillStyle = 'rgba(0,8,8,0.82)';
        context.fillRect(imageX + 8, imageY + 8, 118, 30);
        context.fillStyle = '#b8ffe0';
        context.font = '600 18px monospace';
        context.fillText(`CELL ${pageIndex + 1} / P${String(page.pageNumber).padStart(2, '0')}`, imageX + 16, imageY + 29);
      });
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      if (!blob?.size) throw new Error(`H3 chunk ${chunkIndex + 1} produced no composite image.`);
      const targetDurationSeconds = pageGroup.reduce((sum, page) => sum + page.durationSeconds, 0);
      chunks.push({
        base64: toBase64(new Uint8Array(await blob.arrayBuffer())),
        mimeType: 'image/jpeg',
        chunkNumber: chunkIndex + 1,
        pageNumbers: pageGroup.map(page => page.pageNumber),
        targetDurationSeconds,
        requestedDurationSeconds: Math.min(15, Math.max(5, Math.ceil(targetDurationSeconds))),
      });
    }
    if (chunks.length !== 10 || chunks.reduce((sum, chunk) => sum + chunk.pageNumbers.length, 0) !== 32) {
      throw new Error('H3 chunk preparation did not cover all 32 story pages.');
    }
    return chunks;
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
  let storyOffsetSeconds = 0;
  const lines: IllustrationStoryVoiceLine[] = pages.flatMap(page => {
    const pageLines = page.voiceover ?? [{
      speaker: 'oracle' as const,
      text: page.narration,
      pauseAfterMs: 260,
    }];
    const linesWithPlacement = pageLines.map((line, index) => ({
      ...line,
      pageNumber: page.pageNumber,
      pageOffsetSeconds: storyOffsetSeconds
        + (page.durationSeconds * index / Math.max(1, pageLines.length)),
    }));
    storyOffsetSeconds += page.durationSeconds;
    return linesWithPlacement;
  });
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

async function readLocalStitchResponse(
  response: Response,
  pages: IllustrationStoryPage[],
  onProgress: ((progress: number) => void) | undefined,
  localObjectUrlRef: React.MutableRefObject<string | null>,
  audioManifest: IllustrationStoryReviewAudioSource[] = [],
  scenes = [] as IllustrationStoryScene[],
  persistAssembly?: (
    blob: Blob,
    reviewManifest: IllustrationStoryReviewManifest,
    pageCount: number,
    durationSeconds: number,
  ) => Promise<IllustrationStoryReviewManifest>,
): Promise<IllustrationStoryFilmResult> {
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
  const soundEffectsMixed = Number(response.headers.get('X-Story-SFX') || 0);
  const resolvedAudioManifest = audioManifest.length
    ? updateAssembledAudioManifest(audioManifest, soundEffectsMixed)
    : createStoryAudioManifest({
      narrationAvailable: response.headers.get('X-Story-Narration') === 'available',
      narrationSourceLabel: response.headers.get('X-Story-Narration') === 'available'
        ? 'Generated story narration'
        : 'No generated story narration',
      soundEffectsCount: soundEffectsMixed,
    });
  const localReviewManifest = createIllustrationStoryReviewManifest(
    pages,
    scenes,
    localObjectUrlRef.current,
    resolvedAudioManifest,
  );
  const reviewManifest = persistAssembly
    ? await persistAssembly(blob, localReviewManifest, pages.length, validatedDuration)
    : localReviewManifest;
  return {
    url: reviewManifest.finalMediaUrl ?? localObjectUrlRef.current,
    mediaType: 'video/mp4',
    pageCount: pages.length,
    durationSeconds: validatedDuration,
    narrationAvailable: response.headers.get('X-Story-Narration') === 'available',
    soundEffectsMixed,
    characterTimingApplied: Number(response.headers.get('X-Story-Character-Timing') || 0),
    audioManifest: resolvedAudioManifest,
    reviewManifest,
  };
}

export function useIllustrationStoryFilm(
  sessionId?: string | null,
  ownerKey?: string | null,
) {
  const [job, setJob] = useState<IllustrationStoryFilmJob | null>(null);
  const jobRef = useRef<IllustrationStoryFilmJob | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const localObjectUrlRef = useRef<string | null>(null);
  const activeJobIdRef = useRef<string | null>(null);
  const pollingRef = useRef(false);
  const reviewPersistenceRef = useRef<Promise<void>>(Promise.resolve());
  const stableOwnerKey = ownerKey || sessionId || 'anonymous-story-session';

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
      body: { action: 'status', jobId, ownerKey: stableOwnerKey },
    });
    if (error) throw error;
    if (!data?.id) throw new Error('Story film status returned no job.');
    const next = data as IllustrationStoryFilmJob;
    publish(next, listener);
    return next;
  }, [publish, stableOwnerKey]);

  const persistAssembly = useCallback(async (
    blob: Blob,
    reviewManifest: IllustrationStoryReviewManifest,
    pageCount: number,
    durationSeconds: number,
  ): Promise<IllustrationStoryReviewManifest> => {
    const currentId = activeJobIdRef.current ?? jobRef.current?.id;
    if (!currentId) throw new Error('There is no saved story film job to persist.');
    const mediaBase64 = toBase64(new Uint8Array(await blob.arrayBuffer()));
    const { data, error } = await supabase.functions.invoke('oracle-story-film-job', {
      body: {
        action: 'persist-assembly',
        jobId: currentId,
        ownerKey: stableOwnerKey,
        mediaBase64,
        pageCount,
        durationSeconds,
        reviewManifest,
      },
    });
    if (error) throw new Error(`Story film persistence failed: ${error.message}`);
    if (!data?.id || !data.finalMediaUrl) {
      throw new Error(data?.error || 'Story film persistence returned no durable media URL.');
    }
    const next = data as IllustrationStoryFilmJob;
    publish(next);
    return (next.reviewManifest ?? {
      ...reviewManifest,
      finalMediaUrl: next.finalMediaUrl,
    }) as IllustrationStoryReviewManifest;
  }, [publish, stableOwnerKey]);

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
      : new Error('Hosted story film timed out. Persisted state remains available for an explicit new workflow.');
  }, [poll]);

  const renderStory = useCallback(async (
    sheetUrls: [string, string],
    pages: IllustrationStoryPage[],
    musicUrl: string,
    model: IllustrationStoryModelOption,
    onProgress?: (progress: number) => void,
    onJob?: StoryJobListener,
  ): Promise<IllustrationStoryFilmResult> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    onProgress?.(2);

    if (pages.length !== 32) throw new Error('Hosted story production requires exactly 32 pages.');
    const isH3ChunkLane = model.slug === 'minimax/h3/image-to-video';
    const [visualInputs, music, narrationBundle] = await Promise.all([
      isH3ChunkLane
        ? createH3ChunkAssets(sheetUrls, pages)
        : createLockedPanelAssets(sheetUrls, pages),
      urlToBase64(musicUrl),
      createNarrationAudio(pages, sessionId ?? 'anonymous-story-session'),
    ]);
    if (controller.signal.aborted) throw new Error('Story film production cancelled.');
    onProgress?.(6);

    const { data, error } = await supabase.functions.invoke('oracle-story-film-job', {
      body: {
        action: 'create',
        sessionId: sessionId ?? 'anonymous-story-session',
        ownerKey: stableOwnerKey,
          provider: model.provider ?? 'fal',
         modelSlug: model.slug,
         confirmed: true,
        pages,
        ...(isH3ChunkLane
          ? { chunks: visualInputs }
          : { panels: visualInputs }),
        musicBase64: music.base64,
        musicMimeType: music.mimeType,
        narrationBase64: narrationBundle.narration.base64,
        narrationMimeType: narrationBundle.narration.mimeType,
        characterVoiceTracks: narrationBundle.characterTracks,
      },
    });
    if (error) throw new Error(`Hosted story job could not start: ${error.message}`);
    if (!data?.id) throw new Error(data?.error || 'Hosted story job returned no id.');
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
       throw new Error('Hosted story film status was lost; the saved server job remains recoverable.');
    }
    if (complete.status !== 'ready') {
       throw new Error(complete.error || 'Hosted story film did not produce 32 playable visual scenes.');
    }
    const hostedAudioManifest = createStoryAudioManifest({
      narrationAvailable: Boolean(complete.narrationUrl) || Boolean(narrationBundle.narration),
      narrationSourceLabel: complete.narrationUrl
        ? 'Persisted generated story narration'
        : 'Generated story narration',
      narrationPreviewUrl: complete.narrationUrl ?? null,
      characterTracks: complete.characterVoiceTracks?.length
        ? complete.characterVoiceTracks
        : narrationBundle.characterTracks,
      nativeSceneAudioAvailable: complete.provider === 'minimax'
        || complete.workflow?.mode === 'ten-h3-chunks',
      musicPreviewUrl: complete.musicUrl ?? musicUrl,
      musicSourceLabel: complete.musicUrl
        ? 'Persisted Lyria instrumental anchor'
        : 'Lyria instrumental anchor',
      soundEffectsCount: complete.audioManifest?.soundEffects?.length ?? 0,
    });
    if (complete.finalMediaUrl && complete.workflow?.mode !== 'single-fal-workflow'
      && complete.workflow?.mode !== 'ten-h3-chunks') {
      onProgress?.(100);
      return {
        url: complete.finalMediaUrl,
        mediaType: 'video/mp4',
        pageCount: complete.pageCount,
        durationSeconds: pages.reduce((sum, page) => sum + page.durationSeconds, 0),
        narrationAvailable: true,
        audioManifest: hostedAudioManifest,
        reviewManifest: complete.reviewManifest ?? createIllustrationStoryReviewManifest(
          pages,
          complete.scenes,
          complete.finalMediaUrl,
          hostedAudioManifest,
        ),
      };
    }
    const sceneUrls = complete.scenes
      .sort((a, b) => a.pageNumber - b.pageNumber)
      .map(scene => scene.outputUrl)
      .filter((url): url is string => Boolean(url));
    const chunkUrls = complete.chunks
      ?.slice()
      .sort((a, b) => a.chunkNumber - b.chunkNumber)
      .map(chunk => chunk.outputUrl)
      .filter((url): url is string => Boolean(url)) ?? [];
    const hostedFilmUrl = complete.workflow?.mode === 'single-fal-workflow'
      ? complete.finalMediaUrl ?? undefined
      : undefined;
    const usingH3Chunks = complete.workflow?.mode === 'ten-h3-chunks';
    if (complete.workflow?.mode === 'single-fal-workflow' && !hostedFilmUrl) {
      throw new Error('The shared FAL workflow completed without a playable hosted film URL.');
    }
    if (usingH3Chunks && chunkUrls.length !== 10) {
      throw new Error('MiniMax H3 completed without ten playable chunk videos.');
    }
    if (!usingH3Chunks && !hostedFilmUrl && sceneUrls.length !== pages.length) {
       throw new Error('Hosted provider returned an incomplete visual scene set.');
    }
    onProgress?.(82);
    const stitchResponse = await fetch(`${import.meta.env.BASE_URL}api/illustration-story-stitch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
         ...(sceneUrls.length && !hostedFilmUrl && !usingH3Chunks ? { sceneUrls } : {}),
        ...(usingH3Chunks ? { chunkUrls } : {}),
        ...(hostedFilmUrl ? { hostedFilmUrl } : {}),
        music,
        narration: narrationBundle.narration,
        characterVoiceTracks: narrationBundle.characterTracks,
        pages,
      } satisfies LocalStitchInput),
      signal: controller.signal,
    });
    if (!stitchResponse.ok) {
      let detail = '';
      try { detail = (await stitchResponse.json()).error ?? ''; } catch { /* keep status */ }
      throw new Error(detail || `Local FFmpeg story assembly failed (${stitchResponse.status}).`);
    }
    return readLocalStitchResponse(
      stitchResponse,
      pages,
      onProgress,
      localObjectUrlRef,
      hostedAudioManifest,
      complete.scenes,
      persistAssembly,
    );
  }, [persistAssembly, publish, sessionId, stableOwnerKey, waitForCompletion]);

  const retryAssembly = useCallback(async (
    onProgress?: (progress: number) => void,
    onJob?: StoryJobListener,
  ) => {
    const currentId = activeJobIdRef.current ?? jobRef.current?.id;
    if (!currentId) throw new Error('There is no saved story film job to assemble.');
    const { data, error } = await supabase.functions.invoke('oracle-story-film-job', {
      body: { action: 'retry-stitch', jobId: currentId, ownerKey: stableOwnerKey },
    });
    if (error) throw error;
    if (!data?.id) throw new Error(data?.error || 'Story stitch retry returned no job.');
    publish(data as IllustrationStoryFilmJob, onJob);
    onProgress?.(data.progress);
    return waitForCompletion(data.id, next => {
      onProgress?.(next.progress);
      onJob?.(next);
    });
  }, [publish, stableOwnerKey, waitForCompletion]);

  const recoverAssembly = useCallback(async (
    pages: IllustrationStoryPage[],
    onProgress?: (progress: number) => void,
    onJob?: StoryJobListener,
  ): Promise<IllustrationStoryFilmResult> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const current = jobRef.current;
    if (!current) throw new Error('There is no saved FAL story film job to recover.');
    if (current.provider === 'retired-fal') {
      throw new Error('This historical FAL job cannot be locally recovered; start a new story with an approved hosted model.');
    }
    if (pages.length !== 32) throw new Error('Hosted story recovery requires exactly 32 saved pages.');
    if (!current.musicUrl || !current.narrationUrl) {
      throw new Error('Persisted story audio is unavailable or expired (music and narration are required).');
    }
    const orderedScenes = [...current.scenes].sort((a, b) => a.pageNumber - b.pageNumber);
    const hostedFilmUrl = current.workflow?.mode === 'single-fal-workflow'
      ? current.finalMediaUrl ?? undefined
      : undefined;
    const h3ChunkUrls = current.workflow?.mode === 'ten-h3-chunks'
      ? (current.chunks ?? [])
        .slice()
        .sort((a, b) => a.chunkNumber - b.chunkNumber)
        .map(chunk => chunk.outputUrl)
        .filter((url): url is string => Boolean(url))
      : [];
    if (current.workflow?.mode === 'ten-h3-chunks' && h3ChunkUrls.length !== 10) {
      throw new Error('Persisted MiniMax H3 story chunks are incomplete or expired; no new request was submitted.');
    }
    if (!hostedFilmUrl && current.workflow?.mode !== 'ten-h3-chunks'
      && (orderedScenes.length !== pages.length || orderedScenes.some((scene, index) =>
      scene.pageNumber !== index + 1 || scene.status !== 'ready' || !scene.outputUrl
      ))) {
      throw new Error('Persisted hosted scenes are incomplete or expired; no new scene request was submitted.');
    }
    if (controller.signal.aborted) throw new Error('Story film recovery cancelled.');
    onProgress?.(82);

    let reviewedCellUrls: string[] | null = null;
    if (current.provider === 'browser-film') {
      const { data: stitchOrderData, error: stitchOrderError } = await supabase.functions.invoke('oracle-story-film-job', {
        body: {
          action: 'stitch-order',
          jobId: current.id,
          ownerKey: stableOwnerKey,
        },
      });
      if (stitchOrderError) throw new Error(`Story cell order recovery failed: ${stitchOrderError.message}`);
      if (!Array.isArray(stitchOrderData?.cellUrls) || stitchOrderData.cellUrls.length !== pages.length) {
        throw new Error(stitchOrderData?.error || 'Persisted story cell order is incomplete or expired.');
      }
      reviewedCellUrls = stitchOrderData.cellUrls;
      if (stitchOrderData.job?.id) publish(stitchOrderData.job as IllustrationStoryFilmJob);
    }

    const persistedSoundEffects = current.audioManifest?.soundEffects ?? [];
    const recoveredPages = pages.map(page => page.soundEffects?.length || page.sfx?.length
      ? page
      : {
        ...page,
        soundEffects: persistedSoundEffects.filter(effect => effect.pageNumber === page.pageNumber),
      });
    const stitchResponse = await fetch(`${import.meta.env.BASE_URL}api/illustration-story-stitch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(hostedFilmUrl
          ? { hostedFilmUrl }
          : h3ChunkUrls.length === 10
            ? { chunkUrls: h3ChunkUrls }
          : reviewedCellUrls
            ? { cellUrls: reviewedCellUrls }
          : {
            sceneUrls: orderedScenes
              .map(scene => scene.outputUrl)
              .filter((url): url is string => Boolean(url)),
          }),
        musicUrl: current.musicUrl,
        narrationUrl: current.narrationUrl,
        characterVoiceTracks: current.characterVoiceTracks ?? [],
        pages: recoveredPages,
      } satisfies LocalStitchInput),
      signal: controller.signal,
    });
    if (!stitchResponse.ok) {
      let detail = '';
      try { detail = (await stitchResponse.json()).error ?? ''; } catch { /* keep status */ }
      throw new Error(detail || `Local FFmpeg story recovery failed (${stitchResponse.status}).`);
    }
    onJob?.(current);
    const recoveredAudioManifest = createStoryAudioManifest({
      narrationAvailable: Boolean(current.narrationUrl),
      narrationSourceLabel: 'Persisted generated story narration',
      narrationPreviewUrl: current.narrationUrl,
      characterTracks: current.characterVoiceTracks ?? [],
      nativeSceneAudioAvailable: current.provider === 'minimax'
        || current.workflow?.mode === 'ten-h3-chunks',
      musicPreviewUrl: current.musicUrl,
      musicSourceLabel: 'Persisted Lyria instrumental anchor',
      soundEffectsCount: persistedSoundEffects.length,
    });
    return readLocalStitchResponse(
      stitchResponse,
      recoveredPages,
      onProgress,
      localObjectUrlRef,
      recoveredAudioManifest,
      orderedScenes,
      persistAssembly,
    );
  }, [persistAssembly, publish, stableOwnerKey]);

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

    const [panels, music] = await Promise.all([
      createLockedPanelAssets(sheetUrls, pages),
      urlToBase64(musicUrl),
    ]);
    if (controller.signal.aborted) throw new Error('Story film render cancelled.');
    onProgress?.(20);

    const narrationBundle = await createNarrationAudio(pages, sessionId ?? 'anonymous-story-session');
    if (controller.signal.aborted) throw new Error('Story film render cancelled.');
    onProgress?.(30);

    const { data: localJobData, error: localJobError } = await supabase.functions.invoke('oracle-story-film-job', {
      body: {
        action: 'create-local',
        sessionId: sessionId ?? 'anonymous-story-session',
        ownerKey: stableOwnerKey,
        pages,
        panels,
        musicBase64: music.base64,
        musicMimeType: music.mimeType,
        narrationBase64: narrationBundle.narration.base64,
        narrationMimeType: narrationBundle.narration.mimeType,
        characterVoiceTracks: narrationBundle.characterTracks,
      },
    });
    if (localJobError) throw new Error(`Local story review record could not start: ${localJobError.message}`);
    if (!localJobData?.id) throw new Error(localJobData?.error || 'Local story review record returned no id.');
    activeJobIdRef.current = localJobData.id;
    publish(localJobData as IllustrationStoryFilmJob);

    const { data: stitchOrderData, error: stitchOrderError } = await supabase.functions.invoke('oracle-story-film-job', {
      body: {
        action: 'stitch-order',
        jobId: localJobData.id,
        ownerKey: stableOwnerKey,
      },
    });
    if (stitchOrderError) throw new Error(`Story cell order review failed: ${stitchOrderError.message}`);
    if (!Array.isArray(stitchOrderData?.cellUrls) || stitchOrderData.cellUrls.length !== pages.length) {
      throw new Error(stitchOrderData?.error || 'Story cell order review returned an incomplete list.');
    }
    if (stitchOrderData.job?.id) publish(stitchOrderData.job as IllustrationStoryFilmJob);

    const response = await fetch(`${import.meta.env.BASE_URL}api/illustration-story-stitch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cellUrls: stitchOrderData.cellUrls,
        music,
        narration: narrationBundle.narration,
        characterVoiceTracks: narrationBundle.characterTracks,
        pages,
      } satisfies LocalStitchInput),
      signal: controller.signal,
    });
    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json()).error ?? ''; } catch { /* keep status */ }
      throw new Error(detail || `FFmpeg story stitch failed (${response.status}).`);
    }
    const audioManifest = createStoryAudioManifest({
      narrationAvailable: Boolean(narrationBundle.narration),
      narrationSourceLabel: 'Generated story narration',
      characterTracks: narrationBundle.characterTracks,
      musicPreviewUrl: musicUrl,
      musicSourceLabel: 'Lyria instrumental anchor',
      soundEffectsCount: pages.reduce(
        (sum, page) => sum + (page.soundEffects?.length || page.sfx?.length || 0),
        0,
      ),
    });
    return readLocalStitchResponse(
      response,
      pages,
      onProgress,
      localObjectUrlRef,
      audioManifest,
      (stitchOrderData.job?.scenes ?? localJobData.scenes ?? []) as IllustrationStoryScene[],
      persistAssembly,
    );
  }, [persistAssembly, publish, sessionId, stableOwnerKey]);

  const cancel = useCallback(async () => {
    abortRef.current?.abort();
    if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
    const currentId = activeJobIdRef.current ?? jobRef.current?.id;
    if (currentId && !isTerminal(jobRef.current?.status ?? 'queued')) {
      const { data } = await supabase.functions.invoke('oracle-story-film-job', {
        body: { action: 'cancel', jobId: currentId, ownerKey: stableOwnerKey },
      });
      if (data?.id) publish(data as IllustrationStoryFilmJob);
    }
  }, [publish, stableOwnerKey]);

  const persistReview = useCallback(async (
    review: IllustrationStoryReviewState,
    rejections: IllustrationStoryReviewRejection[] = [],
    reviewHistoryEntry?: Pick<IllustrationStoryReviewHistoryEntry, 'action' | 'reviewer' | 'pageNumber' | 'reason'>,
  ) => {
    const request = reviewPersistenceRef.current
      .catch(() => undefined)
      .then(async () => {
        const currentId = activeJobIdRef.current ?? jobRef.current?.id;
        if (!currentId) throw new Error('There is no saved story film job to review.');
        const { data, error } = await supabase.functions.invoke('oracle-story-film-job', {
          body: {
            action: 'review',
            jobId: currentId,
            ownerKey: stableOwnerKey,
            review,
            rejections,
            ...(reviewHistoryEntry ? { reviewHistoryEntry } : {}),
          },
        });
        if (error) throw error;
        if (!data?.id) throw new Error('Story review persistence returned no job.');
        publish(data as IllustrationStoryFilmJob);
      });
    reviewPersistenceRef.current = request.catch(() => undefined);
    return request;
  }, [publish, stableOwnerKey]);

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
      body: { action: 'latest', sessionId, ownerKey: stableOwnerKey },
    }).then(({ data }) => {
      if (data?.id) {
        activeJobIdRef.current = data.id;
        publish(data as IllustrationStoryFilmJob);
      }
    }).catch(() => {
      // A missing server job should not interrupt the Oracle conversation.
    });
  }, [publish, sessionId, stableOwnerKey]);

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

  return {
    job,
    renderStory,
    renderLocalStory,
    retryAssembly,
    recoverAssembly,
    cancel,
    persistReview,
  };
}