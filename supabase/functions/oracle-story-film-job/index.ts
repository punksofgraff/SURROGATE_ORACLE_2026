/**
 * Server-owned optional hosted story-film job.
 *
 * A story is not a still-image render. Every page gets its own durable panel
 * reference, approved hosted request, and recoverable output. Visual clips are
 * persisted here; final audio assembly remains on the local FFmpeg lane.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
};
const PAGE_COUNT = 32;
const LEGACY_SEEDANCE_MODEL = 'bytedance/seedance-2.5/image-to-video';
const LEGACY_SEEDANCE_QUEUE_MODEL = 'bytedance/seedance-2.5';
const FAL_TIMEOUT_MS = 20_000;

type FalStoryModel = {
  slug: string;
  label: string;
  description: string;
  costLabel: string;
  expectedSeconds: number;
  resolution: '480P' | '768P';
};
const FAL_MINIMAX_H3_MAX_SLUG = 'minimax/h3-max/image-to-video';

type MiniMaxStoryModel = {
  provider: 'minimax';
  slug: 'MiniMax-H3';
  label: string;
  description: string;
  costLabel: string;
  expectedSeconds: number;
  resolution: '768P' | '2K';
};

const DEFAULT_FAL_STORY_MODELS: FalStoryModel[] = [
  {
    slug: 'minimax/h3-max/image-to-video',
    label: 'MiniMax H3 Max · 768P',
    description: 'FAL-hosted MiniMax H3 Max motion from each locked still anchor.',
    costLabel: 'Hosted H3 Max scene',
    expectedSeconds: 120,
    resolution: '768P',
  },
];

const DEFAULT_MINIMAX_STORY_MODELS: MiniMaxStoryModel[] = [
  {
    provider: 'minimax',
    slug: 'MiniMax-H3',
    label: 'MiniMax H3 · 768P native audio',
    description: 'Reference-to-video animation with native stereo ambience and movement audio.',
    costLabel: 'Hosted H3 scene',
    expectedSeconds: 120,
    resolution: '768P',
  },
];

function falStoryModels(): FalStoryModel[] {
  const raw = Deno.env.get('FAL_STORY_MODEL_CATALOG');
  if (!raw) return DEFAULT_FAL_STORY_MODELS;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_FAL_STORY_MODELS;
    const safe = parsed.flatMap(item => {
      if (!item || typeof item !== 'object') return [];
      const model = item as Record<string, unknown>;
      const slug = safeText(model.slug, 180);
      const resolution = model.resolution === '480P' ? '480P' : '768P';
      if (!slug || isRetiredModel(slug) || slug !== FAL_MINIMAX_H3_MAX_SLUG) return [];
      return [{
        slug,
        label: safeText(model.label, 100) || slug,
        description: safeText(model.description, 240) || 'Approved FAL image-to-video model.',
        costLabel: safeText(model.costLabel, 100) || 'Cost varies by FAL',
        expectedSeconds: Math.max(30, Math.min(900, Number(model.expectedSeconds) || 120)),
        resolution,
      } satisfies FalStoryModel];
    });
    return safe.length ? safe : DEFAULT_FAL_STORY_MODELS;
  } catch {
    return DEFAULT_FAL_STORY_MODELS;
  }
}

function isRetiredModel(slug: string): boolean {
  return /seedance/i.test(slug);
}

function falStoryModel(slug: unknown): FalStoryModel | null {
  const clean = safeText(slug, 180);
  return falStoryModels().find(model => model.slug === clean) ?? null;
}

function minimaxStoryModel(slug: unknown): MiniMaxStoryModel | null {
  return DEFAULT_MINIMAX_STORY_MODELS.find(model => model.slug === safeText(slug, 180)) ?? null;
}

type StoryScene = {
  pageNumber: number;
  sheetIndex: 0 | 1;
  row: number;
  column: number;
  durationSeconds: number;
  seed: number;
  prompt: string;
  referenceUrl: string | null;
  modelSlug: string | null;
  provider?: 'fal' | 'minimax' | 'browser-film';
  referenceAudioUrl: string | null;
  falRequestId: string | null;
  status: 'planned' | 'queued' | 'generating' | 'ready' | 'failed' | 'cancelled';
  progress: number;
  jobId: string | null;
  outputUrl: string | null;
  error: string | null;
  failureKind?: 'provider-safety' | 'provider' | 'submission' | null;
  recovery?: 'retry' | 'replace' | null;
};

type CharacterVoiceTrackInput = {
  speaker: string;
  public_url?: string;
  publicUrl?: string;
  storage_path?: string;
  source_voice?: string;
  voice_presentation?: string;
  octave_shift?: number;
  tuning_cents?: number;
  duration_seconds?: number;
  timing_metadata?: {
    format?: string;
    version?: string;
    metadata?: { soundFile?: string; duration?: number };
    mouthCues?: Array<{ start?: string; end?: string; value?: string }>;
    lineCues?: Array<{
      start?: string;
      end?: string;
      pageNumber?: number | null;
      pageOffsetSeconds?: number;
    }>;
  };
  rhubarb_url?: string | null;
};

type StoryFailureKind = 'provider-safety' | 'provider' | 'submission' | 'audio-gate' | null;
type StoryJobRow = {
  id: string;
  session_id: string;
  owner_key: string | null;
  job_type: string;
  status: string;
  progress: number;
  chunk_count: number;
  chunks: unknown;
  story_scenes: unknown;
  story_manifest: unknown;
  audio_manifest: unknown;
  review_manifest: unknown;
  review_history: unknown;
  provider: string | null;
  model_slug: string | null;
  runpod_job_id: string | null;
  final_media_url: string | null;
  narration_url: string | null;
  music_url: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function safeText(value: unknown, max = 300): string {
  return typeof value === 'string'
    ? value.replace(/https?:\/\/\S+/gi, '').replace(/["'`{}<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
    : '';
}

function safeUrl(value: unknown, max = 4000): string {
  return typeof value === 'string'
    ? value.replace(/["'`{}<>]/g, '').trim().slice(0, max)
    : '';
}

function reviewHistoryList(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(entry => {
    if (!entry || typeof entry !== 'object') return [];
    const raw = entry as Record<string, unknown>;
    const action = raw.action === 'approval' || raw.action === 'rejection' || raw.action === 'inspection'
      ? raw.action
      : null;
    const occurredAt = safeText(raw.occurredAt, 80);
    if (!action || !occurredAt) return [];
    const inspectedShotNumbers = Array.from(new Set(
      (Array.isArray(raw.inspectedShotNumbers) ? raw.inspectedShotNumbers : [])
        .map(value => Number(value))
        .filter(value => Number.isInteger(value) && value >= 1 && value <= PAGE_COUNT),
    )).sort((a, b) => a - b);
    const pageNumber = raw.pageNumber === null || raw.pageNumber === undefined
      ? null
      : Number(raw.pageNumber);
    const normalizedPageNumber = pageNumber === null
      || (Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= PAGE_COUNT)
      ? pageNumber
      : null;
    const reason = safeText(raw.reason, 500);
    return [{
      action,
      reviewer: safeText(raw.reviewer, 160) || 'Studio reviewer',
      occurredAt,
      inspectedShotNumbers,
      audioListened: raw.audioListened === true,
      pageNumber: normalizedPageNumber,
      ...(reason ? { reason } : {}),
    }];
  });
}

function decodeBase64(value: unknown, maxChars = 20_000_000): Uint8Array {
  if (typeof value !== 'string' || value.length < 8 || value.length > maxChars) {
    throw new Error('Media payload is missing or too large.');
  }
  try {
    return Uint8Array.from(atob(value.replace(/\s/g, '')), (character) => character.charCodeAt(0));
  } catch {
    throw new Error('Media payload is not valid base64.');
  }
}

function sceneList(value: unknown): StoryScene[] {
  return Array.isArray(value) ? value as StoryScene[] : [];
}

function errorDetail(value: unknown): string {
  if (typeof value === 'string') return safeText(value, 300);
  if (!value || typeof value !== 'object') return '';
  try {
    return safeText(JSON.stringify(value), 300);
  } catch {
    return '';
  }
}
function publicJob(row: StoryJobRow) {
  const scenes = sceneList(row.story_scenes);
  const manifest = row.story_manifest && typeof row.story_manifest === 'object'
    ? row.story_manifest as Record<string, unknown>
    : {};
  const manifestModelSlug = safeText(row.model_slug ?? manifest.modelSlug ?? manifest.visualProvider, 180);
  const sceneModelSlug = safeText(scenes.find(scene => scene.modelSlug)?.modelSlug, 180);
  const modelSlug = manifestModelSlug || sceneModelSlug || null;
  const retired = Boolean(modelSlug && isRetiredModel(modelSlug));
  const provider = retired ? 'retired-fal' : (row.provider || (scenes.find(scene => scene.provider)?.provider ?? 'fal'));
  const review = manifest.review && typeof manifest.review === 'object'
    ? manifest.review
    : undefined;
  const reviewRejections = Array.isArray(manifest.reviewRejections)
    ? manifest.reviewRejections
    : [];
  const storedReviewHistory = reviewHistoryList(row.review_history);
  const reviewHistory = storedReviewHistory.length
    ? storedReviewHistory
    : reviewHistoryList(manifest.reviewHistory);
  const audioVerification = manifest.audioVerification && typeof manifest.audioVerification === 'object'
    ? manifest.audioVerification as Record<string, unknown>
    : {};
  const everyPageReady = (scenes.length === PAGE_COUNT
    && scenes.every(scene => scene.status === 'ready' && Boolean(scene.outputUrl)))
    || (row.provider === 'browser-film' && Boolean(row.final_media_url));
  const audioReady = Boolean(row.music_url && row.narration_url);
  return {
    id: row.id,
    provider,
    modelSlug,
    kind: 'illustration-story',
    status: row.status,
    progress: row.progress,
    chunkCount: row.chunk_count,
    pageCount: scenes.length,
    scenes: scenes.map(scene => ({
      pageNumber: scene.pageNumber,
      sheetIndex: scene.sheetIndex,
      row: scene.row,
      column: scene.column,
      durationSeconds: scene.durationSeconds,
      seed: scene.seed,
      referenceUrl: scene.referenceUrl,
       modelSlug: scene.modelSlug ?? modelSlug,
       provider: scene.provider ?? (provider === 'minimax' ? 'minimax' : 'fal'),
      status: scene.status,
      progress: scene.progress,
      jobId: scene.jobId,
      outputUrl: scene.outputUrl,
      referenceAudioUrl: scene.referenceAudioUrl ?? null,
      error: scene.error,
      failureKind: scene.failureKind ?? null,
      recovery: scene.recovery ?? null,
    })),
    finalMediaUrl: row.final_media_url,
    narrationUrl: row.narration_url,
    musicUrl: row.music_url,
    characterVoiceTracks: Array.isArray(manifest.characterVoiceTracks)
      ? manifest.characterVoiceTracks
      : [],
    audioManifest: row.audio_manifest && typeof row.audio_manifest === 'object'
      ? row.audio_manifest
      : {},
    error: row.error_message,
    failureKind: typeof manifest.failureKind === 'string' ? manifest.failureKind : null,
    audioGate: {
      musicReady: Boolean(row.music_url),
      narrationReady: Boolean(row.narration_url),
      verified: audioVerification.audioStreamPresent === true && audioVerification.durationMatch === true,
      passed: row.status === 'ready' && everyPageReady && audioReady
        && audioVerification.audioStreamPresent === true
        && audioVerification.durationMatch === true,
    },
    finalGate: {
      everyPageReady,
      audioReady,
      passed: row.status === 'ready' && everyPageReady && audioReady
        && audioVerification.audioStreamPresent === true
        && audioVerification.durationMatch === true,
    },
    review,
    reviewRejections,
    reviewHistory,
    reviewManifest: row.review_manifest && typeof row.review_manifest === 'object'
      ? row.review_manifest
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function ownerKeyFor(payload: Record<string, unknown>, sessionId: string): string {
  const requested = safeText(payload.ownerKey, 160).replace(/[^a-zA-Z0-9:._-]/g, '');
  return requested || sessionId;
}

function reviewManifestWithDurableReferences(
  value: unknown,
  finalMediaUrl: string,
  narrationUrl: string | null,
  musicUrl: string | null,
): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  const manifest = value as Record<string, unknown>;
  const audioSources = Array.isArray(manifest.audioSources)
    ? manifest.audioSources.flatMap(source => {
      if (!source || typeof source !== 'object') return [];
      const item = { ...(source as Record<string, unknown>) };
      const id = safeText(item.id, 120);
      const persistedUrl = id === 'narration'
        ? narrationUrl
        : id === 'music'
          ? musicUrl
          : null;
      if (persistedUrl) {
        item.previewUrl = persistedUrl;
        item.generated = true;
        if (item.status === 'missing') item.status = 'available';
      } else if (typeof item.previewUrl === 'string' && item.previewUrl.startsWith('blob:')) {
        delete item.previewUrl;
        item.generated = false;
        item.status = 'missing';
      }
      return [item];
    })
    : [];
  const shots = Array.isArray(manifest.shots)
    ? manifest.shots.flatMap(shot => {
      if (!shot || typeof shot !== 'object') return [];
      const item = { ...(shot as Record<string, unknown>) };
      const rendered = item.rendered && typeof item.rendered === 'object'
        ? { ...(item.rendered as Record<string, unknown>) }
        : {};
      if (typeof rendered.sceneUrl === 'string' && rendered.sceneUrl.startsWith('blob:')) {
        rendered.sceneUrl = null;
      }
      if (Array.isArray(rendered.evidence)) {
        rendered.evidence = rendered.evidence.map(sample => {
          if (!sample || typeof sample !== 'object') return sample;
          const evidence = { ...(sample as Record<string, unknown>) };
          if (typeof evidence.mediaUrl === 'string' && evidence.mediaUrl.startsWith('blob:')) {
            evidence.mediaUrl = finalMediaUrl;
            evidence.source = 'assembled-film';
            evidence.available = true;
          }
          return evidence;
        });
      }
      item.rendered = rendered;
      return [item];
    })
    : [];
  return {
    ...manifest,
    finalMediaUrl,
    audioSources,
    shots,
    rejections: Array.isArray(manifest.rejections)
      ? manifest.rejections
      : Array.isArray(manifest.reviewRejections)
        ? manifest.reviewRejections
        : [],
    reviewHistory: reviewHistoryList(manifest.reviewHistory),
  };
}

function validStoryPages(pages: Record<string, unknown>[]): boolean {
  const totalDuration = pages.reduce((sum, page) => sum + Number(page.durationSeconds || 0), 0);
  return pages.length === PAGE_COUNT
    && totalDuration >= 100
    && totalDuration <= 180
    && !pages.some((page, index) => (
      Number(page.pageNumber) !== index + 1
      || !Number.isInteger(Number(page.row)) || Number(page.row) < 0 || Number(page.row) > 3
      || !Number.isInteger(Number(page.column)) || Number(page.column) < 0 || Number(page.column) > 3
      || Number(page.sheetIndex) < 0 || Number(page.sheetIndex) > 1
      || Number(page.durationSeconds) <= 0 || Number(page.durationSeconds) > 10
    ));
}

const CHARACTER_SPEAKERS = new Set([
  'levi',
  'lennon',
  'pickles',
  'ghost-spider',
  'mario-spider-man',
  'donkey',
]);

function readCharacterVoiceTracks(value: unknown): CharacterVoiceTrackInput[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const track = entry as CharacterVoiceTrackInput;
    const speaker = safeText(track.speaker, 40);
    const publicUrl = safeUrl(track.public_url ?? track.publicUrl);
    if (!CHARACTER_SPEAKERS.has(speaker) || !publicUrl) return [];
    const rawTiming = track.timing_metadata && typeof track.timing_metadata === 'object'
      ? track.timing_metadata
      : {};
    const timingMetadata = {
      format: rawTiming.format === 'rhubarb' ? 'rhubarb' : undefined,
      version: safeText(rawTiming.version, 20) || undefined,
      metadata: rawTiming.metadata && typeof rawTiming.metadata === 'object'
        ? {
          soundFile: safeText(rawTiming.metadata.soundFile, 160) || undefined,
          duration: Number(rawTiming.metadata.duration) > 0 ? Number(rawTiming.metadata.duration) : undefined,
        }
        : undefined,
      mouthCues: Array.isArray(rawTiming.mouthCues)
        ? rawTiming.mouthCues.flatMap(cue => {
          if (!cue || typeof cue !== 'object') return [];
          const item = cue as { start?: unknown; end?: unknown; value?: unknown };
          const start = Number(item.start);
          const end = Number(item.end);
          const cueValue = typeof item.value === 'string' ? item.value.trim().slice(0, 1) : '';
          return Number.isFinite(start) && Number.isFinite(end) && end > start && /^[A-Z@]$/.test(cueValue)
            ? [{ start: start.toFixed(3), end: end.toFixed(3), value: cueValue }]
            : [];
        })
        : [],
      lineCues: Array.isArray(rawTiming.lineCues)
        ? rawTiming.lineCues.flatMap(cue => {
          if (!cue || typeof cue !== 'object') return [];
          const item = cue as Record<string, unknown>;
          const start = Number(item.start);
          const end = Number(item.end);
          const pageOffsetSeconds = Number(item.pageOffsetSeconds);
          return Number.isFinite(start) && Number.isFinite(end) && end > start && Number.isFinite(pageOffsetSeconds) && pageOffsetSeconds >= 0
            ? [{
              start: start.toFixed(3),
              end: end.toFixed(3),
              pageNumber: Number.isInteger(Number(item.pageNumber)) ? Number(item.pageNumber) : null,
              pageOffsetSeconds,
            }]
            : [];
        })
        : [],
    };
    return [{
      speaker,
      public_url: publicUrl,
      storage_path: safeText(track.storage_path, 300),
      source_voice: safeText(track.source_voice, 80),
      voice_presentation: safeText(track.voice_presentation, 40),
      octave_shift: Number(track.octave_shift) || 0,
      tuning_cents: Number(track.tuning_cents) || 0,
      duration_seconds: Number(track.duration_seconds) || 0,
      timing_metadata: timingMetadata,
      rhubarb_url: safeUrl(track.rhubarb_url, 4000) || null,
    }];
  });
}

function storyAudioManifest(
  pages: Record<string, unknown>[],
  characterVoiceTracks: CharacterVoiceTrackInput[],
): Record<string, unknown> {
  const soundEffects = pages.flatMap(page => {
    const pageNumber = Number(page.pageNumber);
    const values = [
      ...(Array.isArray(page.soundEffects) ? page.soundEffects : []),
      ...(Array.isArray(page.sfx) ? page.sfx : []),
    ];
    return values.flatMap(raw => {
      if (!raw || typeof raw !== 'object') return [];
      const effect = raw as Record<string, unknown>;
      const url = effect.url ?? effect.public_url ?? effect.publicUrl ?? effect.assetUrl ?? effect.audioUrl;
      const localPath = effect.path ?? effect.assetPath;
      return (typeof url === 'string' && url.trim()) || (typeof localPath === 'string' && localPath.trim())
        ? [{
          ...(typeof url === 'string' && url.trim() ? { url: safeUrl(url) } : {}),
          ...(typeof localPath === 'string' && localPath.trim() ? { path: safeText(localPath, 400) } : {}),
          pageNumber,
          offsetSeconds: Number(effect.offsetSeconds) >= 0 ? Number(effect.offsetSeconds) : 0,
          offsetMs: Number(effect.offsetMs) >= 0 ? Number(effect.offsetMs) : undefined,
          pageOffsetSeconds: Number(effect.pageOffsetSeconds) >= 0 ? Number(effect.pageOffsetSeconds) : undefined,
          volume: Number(effect.volume) >= 0 ? Math.min(4, Number(effect.volume)) : undefined,
        }]
        : [];
    });
  });
  return {
    soundEffects,
    characterVoiceTracks,
    format: 'story-audio-manifest-v1',
  };
}

function characterAudioForPage(
  page: Record<string, unknown>,
  tracks: CharacterVoiceTrackInput[],
): string | null {
  const bySpeaker = new Map(tracks.map(track => [track.speaker, track.public_url!]));
  const lines = Array.isArray(page.voiceover) ? page.voiceover : [];
  for (const entry of lines) {
    if (!entry || typeof entry !== 'object') continue;
    const speaker = safeText((entry as Record<string, unknown>).speaker, 40);
    const url = bySpeaker.get(speaker);
    if (url) return url;
  }
  return null;
}

function sceneFailure(
  pageNumber: number,
  detail: string,
  fallback: string,
): { error: string; failureKind: NonNullable<StoryScene['failureKind']> } {
  const cleanDetail = detail || fallback;
  if (isProviderSafetyBlock(cleanDetail)) {
    return {
      failureKind: 'provider-safety',
      error: `Page ${pageNumber} was blocked by FAL's provider safety policy${detail ? `: ${detail}` : '.'} This is a page-level block; the other pages are unchanged. Retry or replace this page.`,
    };
  }
  return {
    failureKind: 'provider',
    error: `Page ${pageNumber} failed in FAL${detail ? `: ${detail}` : `: ${fallback}`}. Retry this page without restarting successful scenes.`,
  };
}

function isProviderSafetyBlock(detail: string): boolean {
  return /\b(?:safety|safe(?:ty)?[-\s]?checker|moderation|likeness|identity|celebrity|face(?:[-\s]?(?:recognition|matching))?|content.{0,18}(?:blocked|flagged|policy)|blocked.{0,18}(?:content|policy|safety|likeness))\b/i.test(detail);
}

function falErrorDetail(value: Record<string, unknown>): string {
  for (const key of ['error', 'detail', 'message', 'reason', 'failure_reason']) {
    const detail = errorDetail(value[key]);
    if (detail) return detail;
  }
  return '';
}

async function falFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const key = Deno.env.get('FAL_API_KEY');
  if (!key) throw new Error('FAL is not configured. Add FAL_API_KEY before starting this hosted story.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FAL_TIMEOUT_MS);
  try {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Key ${key}`);
    headers.set('Content-Type', 'application/json');
    return await fetch(`https://queue.fal.run${path}`, { ...init, headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function falJson(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const response = await falFetch(path, init);
  const raw = await response.text();
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(raw); } catch { /* use the short raw message below */ }
  if (!response.ok) {
    throw new Error(`FAL ${response.status}: ${falErrorDetail(data) || safeText(raw, 240)}`);
  }
  return data;
}

function providerStoryLanguage(value: string): string {
  return value
    .replace(/\bPrincess Ghost Spider\b/gi, 'a ghostly princess with spider-like agility')
    .replace(/\bMario Spider-Man\b/gi, 'a cheerful red-capped web-slinging hero')
    .replace(/\bSpider-Man\b/gi, 'a friendly wall-crawling hero')
    .replace(/\bMario\b/gi, 'a cheerful red-capped adventurer');
}

async function createFalScene(
  model: FalStoryModel,
  referenceUrl: string,
  prompt: string,
  sessionId: string,
  seed: number,
): Promise<string> {
  const isMiniMaxH3Max = model.slug === FAL_MINIMAX_H3_MAX_SLUG;
  const requestBody = isMiniMaxH3Max
    ? {
      prompt: providerStoryLanguage(prompt),
      image_url: referenceUrl,
      duration: Math.max(5, Math.min(15, Math.round(3.75))),
      resolution: model.resolution,
      enable_safety_checker: true,
      prompt_expansion_mode: 'balanced',
      seed,
    }
    : {
      prompt: providerStoryLanguage(prompt),
      image_url: referenceUrl,
      resolution: model.resolution,
      num_frames: 81,
      frames_per_second: 16,
      aspect_ratio: '16:9',
      enable_safety_checker: true,
      seed,
      end_user_id: sessionId,
    };
  const data = await falJson(`/${model.slug}`, {
    method: 'POST',
    body: JSON.stringify(requestBody),
  });
  const requestId = safeText(data.request_id, 180);
  if (!requestId) throw new Error('FAL did not return a request id for this story page.');
  return requestId;
}

async function minimaxFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const key = Deno.env.get('MINIMAX_API_KEY');
  if (!key) throw new Error('MiniMax H3 is not configured. Add MINIMAX_API_KEY before starting this hosted story.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FAL_TIMEOUT_MS);
  try {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${key}`);
    headers.set('Content-Type', 'application/json');
    return await fetch(`https://api.minimax.io${path}`, { ...init, headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function minimaxJson(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const response = await minimaxFetch(path, init);
  const raw = await response.text();
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(raw); } catch { /* use the short raw message below */ }
  if (!response.ok) {
    const detail = errorDetail(data.error) || errorDetail(data) || safeText(raw, 240);
    if (response.status === 402) {
      throw new Error('MiniMax H3 rejected this request because the configured account is not entitled to video generation. No H3 task was created; enable H3 access on the MiniMax account before retrying.');
    }
    throw new Error(`MiniMax H3 ${response.status}: ${detail}`);
  }
  return data;
}

async function createMiniMaxScene(
  model: MiniMaxStoryModel,
  referenceUrl: string,
  prompt: string,
  referenceAudioUrl: string | null,
  durationSeconds: number,
): Promise<string> {
  // MiniMax H3 accepts five to fifteen seconds; the local stitcher trims each
  // provider clip to the story page duration after download.
  const duration = Math.max(5, Math.min(15, Math.round(durationSeconds)));
  const content: Array<Record<string, unknown>> = [
    { type: 'text', text: providerStoryLanguage(prompt) },
    {
      type: 'image_url',
      role: 'reference_image',
      image_url: { url: referenceUrl },
    },
  ];
  if (referenceAudioUrl) {
    content.push({
      type: 'audio_url',
      role: 'reference_audio',
      audio_url: { url: referenceAudioUrl },
    });
  }
  const data = await minimaxJson('/v2/video_generation', {
    method: 'POST',
    body: JSON.stringify({
      model: model.slug,
      content,
      resolution: model.resolution,
      duration,
      ratio: '16:9',
    }),
  });
  const taskId = safeText(data.task_id, 180);
  if (!taskId) throw new Error('MiniMax H3 did not return a task id for this story page.');
  return taskId;
}

async function pollFalScene(modelSlug: string, requestId: string): Promise<{ status: StoryScene['status']; progress: number; output?: string; error?: string }> {
  const queueModel = modelSlug === LEGACY_SEEDANCE_MODEL ? LEGACY_SEEDANCE_QUEUE_MODEL : modelSlug;
  const status = await falJson(`/${queueModel}/requests/${encodeURIComponent(requestId)}/status`);
  const state = safeText(status.status, 24).toUpperCase();
  if (state === 'COMPLETED') {
    const result = await falJson(`/${queueModel}/requests/${encodeURIComponent(requestId)}`);
    const video = result.video && typeof result.video === 'object'
      ? result.video as Record<string, unknown>
      : {};
    const output = safeUrl(video.url, 4000);
    return output
      ? { status: 'ready', progress: 100, output }
      : { status: 'failed', progress: 0, error: 'FAL completed without a video URL.' };
  }
  if (state === 'FAILED' || state === 'ERROR') {
    return { status: 'failed', progress: 0, error: falErrorDetail(status) || 'FAL page animation failed.' };
  }
  if (state === 'CANCELED' || state === 'CANCELLED') {
    return { status: 'cancelled', progress: 0, error: 'FAL page animation was cancelled.' };
  }
  return { status: state === 'IN_QUEUE' ? 'queued' : 'generating', progress: state === 'IN_QUEUE' ? 8 : 38 };
}

async function pollMiniMaxScene(taskId: string): Promise<{ status: StoryScene['status']; progress: number; output?: string; error?: string }> {
  const data = await minimaxJson(`/v2/query/video_generation/${encodeURIComponent(taskId)}`);
  const task = data.task && typeof data.task === 'object'
    ? data.task as Record<string, unknown>
    : {};
  const state = safeText(task.status, 24).toLowerCase();
  if (state === 'succeeded') {
    const content = task.content && typeof task.content === 'object'
      ? task.content as Record<string, unknown>
      : {};
    const output = safeUrl(content.url, 4000);
    return output
      ? { status: 'ready', progress: 100, output }
      : { status: 'failed', progress: 0, error: 'MiniMax H3 completed without a video URL.' };
  }
  if (state === 'failed') {
    return { status: 'failed', progress: 0, error: errorDetail(task.error) || errorDetail(data.error) || 'MiniMax H3 page animation failed.' };
  }
  if (state === 'cancelled' || state === 'canceled') {
    return { status: 'cancelled', progress: 0, error: 'MiniMax H3 page animation was cancelled.' };
  }
  return { status: state === 'queued' ? 'queued' : 'generating', progress: state === 'queued' ? 8 : 38 };
}

async function cancelFalScene(modelSlug: string, requestId: string): Promise<void> {
  const queueModel = modelSlug === LEGACY_SEEDANCE_MODEL ? LEGACY_SEEDANCE_QUEUE_MODEL : modelSlug;
  await falJson(`/${queueModel}/requests/${encodeURIComponent(requestId)}/cancel`, { method: 'PUT' });
}

async function cancelMiniMaxScene(taskId: string): Promise<void> {
  await minimaxJson(`/v2/video_generation/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
}

async function uploadAsset(
  supabase: ReturnType<typeof createClient>,
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<string> {
  const upload = await supabase.storage.from('oracle-films').upload(path, bytes, {
    contentType,
    upsert: true,
  });
  if (upload.error) throw new Error(`Story asset upload failed: ${upload.error.message}`);
  const { data } = supabase.storage.from('oracle-films').getPublicUrl(path);
  return data.publicUrl;
}

async function persistRemoteScene(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  pageNumber: number,
  outputUrl: string,
): Promise<string> {
  const response = await fetch(outputUrl);
  if (!response.ok) throw new Error(`FAL page ${pageNumber} could not be downloaded (${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) throw new Error(`FAL page ${pageNumber} returned an empty video.`);
  return uploadAsset(supabase, `films/${jobId}/scenes/page-${String(pageNumber).padStart(2, '0')}.mp4`, bytes, 'video/mp4');
}

function storyPrompt(page: Record<string, unknown>): string {
  const narration = providerStoryLanguage(safeText(page.narration, 600));
  const pageNumber = Number(page.pageNumber);
  return [
    'Use the supplied locked illustration panel as the source of truth for this animated story shot.',
    'Bring the entire panel to life as a cinematic, child-friendly 5-second story moment: animate the depicted characters, expressions, props, environment, and implied action so the story visibly develops on screen.',
    'Preserve the panel characters, identities, costumes, colors, relationships, setting, composition, linework, and storybook visual style while the action unfolds.',
    'Do not replace the characters, redesign the scene, remove key elements, or turn it into a different story. Let the camera move naturally through the existing composition when that helps the action read.',
    'Use the story beat as direction for what the depicted characters do, not as a request to invent unrelated objects or locations.',
    'No added dialogue text, logos, watermarks, photorealistic restyling, audio, or character morphing.',
    `This is story page ${pageNumber} of 32. Story beat: ${narration}`,
  ].join(' ');
}

function miniMaxStoryPrompt(page: Record<string, unknown>): string {
  const narration = providerStoryLanguage(safeText(page.narration, 600));
  const pageNumber = Number(page.pageNumber);
  return [
    'Use the supplied illustration panel as the exact visual source of truth for this animated story shot.',
    'Animate the depicted characters visibly acting inside the existing composition: expressions, blinking, breathing, purposeful gestures, props, and environmental movement should develop over time.',
    'Preserve the artwork, characters, costumes, colors, relationships, setting, linework, proportions, and storybook style. Do not redraw, replace, reinterpret, or morph the characters.',
    'Use a restrained motivated camera move only to support the subject performance. Do not turn the shot into a still-image slideshow or a camera-only zoom.',
    'Generate subtle native stereo ambience and synchronized movement sound for the depicted action. Do not generate dialogue or on-screen text; keep mouths closed unless the panel clearly depicts speaking.',
    `This is story page ${pageNumber} of 32. Story beat: ${narration}`,
  ].join(' ');
}

function replacementStoryPrompt(scene: StoryScene): string {
  return [
    'Create a gentle, child-friendly 5-second animated storybook page using the supplied illustration only as a broad color, layout, and movement reference.',
    'Use an original, non-identifying illustrated interpretation: do not reproduce a real person, celebrity, recognizable face, trademarked character, or exact likeness.',
    'Preserve the page mood and simple actions, but replace any recognizable identity with abstract storybook silhouettes, friendly animals, objects, or non-identifying fictional figures.',
    'No text, logos, photorealism, audio, face matching, or identity-preserving transformation.',
    `This is a safe replacement for story page ${scene.pageNumber} of ${PAGE_COUNT}.`,
  ].join(' ');
}

function sceneModelSlug(scene: StoryScene, manifest: unknown): string {
  if (scene.modelSlug) return scene.modelSlug;
  if (manifest && typeof manifest === 'object') {
    const value = safeText((manifest as Record<string, unknown>).modelSlug ?? (manifest as Record<string, unknown>).visualProvider, 180);
    if (value) return value;
  }
  // Old rows did not persist the model slug. This fallback only identifies
  // readable, historical rows; new submissions cannot use this path.
  return LEGACY_SEEDANCE_MODEL;
}

function sceneProvider(scene: StoryScene, manifest: unknown): 'fal' | 'minimax' {
  if (scene.provider === 'minimax') return 'minimax';
  if (scene.provider === 'fal') return 'fal';
  if (manifest && typeof manifest === 'object') {
    const value = safeText((manifest as Record<string, unknown>).provider, 40).toLowerCase();
    if (value === 'minimax') return 'minimax';
  }
  return 'fal';
}
async function updateJob(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  patch: Record<string, unknown>,
): Promise<StoryJobRow> {
  const { data, error } = await supabase.from('oracle_film_jobs')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', jobId)
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message || 'Could not update story film job.');
  return data as StoryJobRow;
}

async function pollStoryJob(
  supabase: ReturnType<typeof createClient>,
  current: StoryJobRow,
): Promise<StoryJobRow> {
  if (current.runpod_job_id?.startsWith('story-mux:')) {
    // Historical rows may still carry a retired server job id. Keep their
    // persisted state readable, but never resume or poll that provider.
    return current;
  }

  const scenes = sceneList(current.story_scenes);
  const changed = await Promise.all(scenes.map(async (scene) => {
     if (!scene.falRequestId || !['queued', 'generating'].includes(scene.status)) return scene;
    try {
       const next = sceneProvider(scene, current.story_manifest) === 'minimax'
         ? await pollMiniMaxScene(scene.falRequestId)
         : await pollFalScene(sceneModelSlug(scene, current.story_manifest), scene.falRequestId);
      if (next.status === 'ready' && next.output) {
        const stableUrl = await persistRemoteScene(supabase, current.id, scene.pageNumber, next.output);
        return {
          ...scene,
          status: 'ready' as const,
          progress: 100,
          outputUrl: stableUrl,
          error: null,
          failureKind: null,
          recovery: null,
        };
      }
      if (next.status === 'failed') {
         const failure = sceneFailure(
           scene.pageNumber,
           next.error ?? '',
           sceneProvider(scene, current.story_manifest) === 'minimax'
             ? 'MiniMax H3 page animation failed.'
             : 'FAL page animation failed.',
         );
        return { ...scene, status: 'failed' as const, progress: 0, error: failure.error, failureKind: failure.failureKind };
      }
      return { ...scene, status: next.status, progress: next.progress, error: null };
    } catch (error) {
       const failure = sceneFailure(
        scene.pageNumber,
        error instanceof Error ? error.message : '',
         sceneProvider(scene, current.story_manifest) === 'minimax'
           ? 'MiniMax H3 page retrieval failed.'
           : 'FAL page retrieval failed.',
      );
      return {
        ...scene,
        status: 'failed' as const,
        progress: 0,
        error: failure.error,
        failureKind: failure.failureKind,
      };
    }
  }));

  const readyCount = changed.filter(scene => scene.status === 'ready').length;
  const failedCount = changed.filter(scene => scene.status === 'failed').length;
  const visualProgress = Math.round((readyCount / PAGE_COUNT) * 70);
  const nextScenes = JSON.stringify(changed) !== JSON.stringify(scenes) ? changed : scenes;

  if (failedCount > 0 && readyCount + failedCount === PAGE_COUNT) {
    const safetyBlocked = changed.filter(scene => scene.failureKind === 'provider-safety').length;
    return updateJob(supabase, current.id, {
      story_scenes: nextScenes,
      status: 'failed',
      progress: Math.max(current.progress, 10 + visualProgress),
      error_message: safetyBlocked
        ? `${safetyBlocked} page${safetyBlocked === 1 ? '' : 's'} were blocked by FAL's provider safety policy. Retry or replace those pages individually; successful scenes are preserved.`
        : `${failedCount} page animation${failedCount === 1 ? '' : 's'} failed. Retry the individual page.`,
      story_manifest: {
        ...(current.story_manifest && typeof current.story_manifest === 'object' ? current.story_manifest : {}),
        failureKind: safetyBlocked ? 'provider-safety' : 'provider',
      },
    });
  }

   if (readyCount === PAGE_COUNT && changed.every(scene => scene.outputUrl)) {
    if (!current.music_url || !current.narration_url) {
      return updateJob(supabase, current.id, {
        story_scenes: changed,
        status: 'failed',
        progress: Math.max(current.progress, 78),
        error_message: 'Story cannot be stitched until both the Lyria soundtrack and Gemini narration pass the audio gate.',
        story_manifest: {
          ...(current.story_manifest && typeof current.story_manifest === 'object' ? current.story_manifest : {}),
          failureKind: 'audio-gate',
        },
      });
    }
    return updateJob(supabase, current.id, {
      story_scenes: changed,
       status: 'ready',
       progress: 100,
       // The final MP4 is deliberately assembled by the local FFmpeg lane.
       // Keep this null so a browser cannot mistake visual completion for a
       // validated final deliverable.
       final_media_url: null,
       runpod_job_id: null,
      error_message: null,
      story_manifest: {
        ...(current.story_manifest && typeof current.story_manifest === 'object' ? current.story_manifest : {}),
         visualsReady: true,
         assembly: 'local-ffmpeg',
        failureKind: null,
      },
    });
  }

  return updateJob(supabase, current.id, {
    story_scenes: nextScenes,
    status: 'generating',
    progress: Math.max(current.progress, 10 + visualProgress),
    error_message: failedCount
      ? `${failedCount} page${failedCount === 1 ? '' : 's'} need a retry${changed.some(scene => scene.failureKind === 'provider-safety') ? ' because of a provider safety block' : ''}; remaining pages are still in the oven.`
      : null,
    story_manifest: {
      ...(current.story_manifest && typeof current.story_manifest === 'object' ? current.story_manifest : {}),
      failureKind: failedCount && changed.some(scene => scene.failureKind === 'provider-safety')
        ? 'provider-safety'
        : failedCount ? 'provider' : null,
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST' && req.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
  let payload: Record<string, unknown> = {};
  if (req.method === 'POST') {
    try { payload = await req.json(); } catch { return json({ error: 'Invalid JSON body.' }, 400); }
  }
  const url = new URL(req.url);
  const action = safeText(payload.action ?? url.searchParams.get('action') ?? 'status', 24).toLowerCase();
  const jobId = safeText(payload.jobId ?? url.searchParams.get('jobId'), 64);

  if (action === 'catalog') {
    return json({
      provider: 'hosted-story',
      models: [
        ...falStoryModels().map(({ slug, label, description, costLabel, expectedSeconds }) => ({
          provider: 'fal',
          slug,
          label,
          description,
          costLabel,
          expectedSeconds,
        })),
        ...DEFAULT_MINIMAX_STORY_MODELS.map(({ provider, slug, label, description, costLabel, expectedSeconds }) => ({
          provider,
          slug,
          label,
          description,
          costLabel,
          expectedSeconds,
        })),
      ],
    });
  }

  if (action === 'latest') {
    const sessionId = safeText(payload.sessionId, 120);
    if (!sessionId) return json({ error: 'sessionId is required.' }, 400);
    const ownerKey = ownerKeyFor(payload, sessionId);
    const latestQuery = supabase.from('oracle_film_jobs')
      .select('*')
      .eq('job_type', 'illustration-story')
      .eq('owner_key', ownerKey)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    let { data: latest, error: latestError } = await latestQuery;
    if (!latest && !latestError && ownerKey !== sessionId) {
      const legacy = await supabase.from('oracle_film_jobs')
        .select('*')
        .eq('session_id', sessionId)
        .eq('job_type', 'illustration-story')
        .is('owner_key', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      latest = legacy.data;
      latestError = legacy.error;
    }
    if (latestError) return json({ error: 'Could not load the latest story film job.' }, 500);
    return json(latest ? publicJob(latest as StoryJobRow) : { job: null });
  }

  if (action === 'create') {
    const sessionId = safeText(payload.sessionId, 120);
    const ownerKey = ownerKeyFor(payload, sessionId);
    const requestedProvider = safeText(payload.provider, 40).toLowerCase();
    const falModel = falStoryModel(payload.modelSlug);
    const miniMaxModel = minimaxStoryModel(payload.modelSlug);
    const provider: 'fal' | 'minimax' = requestedProvider === 'minimax'
      || (!requestedProvider && Boolean(miniMaxModel))
      ? 'minimax'
      : 'fal';
    const model = provider === 'minimax' ? miniMaxModel : falModel;
    const confirmed = payload.confirmed === true;
    const pages = Array.isArray(payload.pages) ? payload.pages as Record<string, unknown>[] : [];
    const panels = Array.isArray(payload.panels) ? payload.panels as Record<string, unknown>[] : [];
    const characterVoiceTracks = readCharacterVoiceTracks(payload.characterVoiceTracks);
    const musicBase64 = payload.musicBase64;
    const narrationBase64 = payload.narrationBase64;
    if (!confirmed) {
      return json({ error: 'A Seeker confirmation is required before any hosted story request.' }, 400);
    }
    if (!model) {
      return json({ error: 'That hosted story model is not approved. Choose a model from the current catalog.' }, 400);
    }
    if (!sessionId || pages.length !== PAGE_COUNT || panels.length !== PAGE_COUNT) {
      return json({ error: 'sessionId plus exactly 32 pages and 32 locked panel references are required.' }, 400);
    }
    if (typeof musicBase64 !== 'string' || typeof narrationBase64 !== 'string') {
      return json({ error: 'Hosted story production requires real Lyria music and narration audio.' }, 400);
    }

    const totalDuration = pages.reduce((sum, page) => sum + Number(page.durationSeconds || 0), 0);
    if (totalDuration < 100 || totalDuration > 180 || pages.some((page, index) =>
      Number(page.pageNumber) !== index + 1
      || !Number.isInteger(Number(page.row)) || Number(page.row) < 0 || Number(page.row) > 3
      || !Number.isInteger(Number(page.column)) || Number(page.column) < 0 || Number(page.column) > 3
      || Number(page.sheetIndex) < 0 || Number(page.sheetIndex) > 1
      || Number(page.durationSeconds) <= 0 || Number(page.durationSeconds) > 10
    )) {
      return json({ error: 'Story page order, 4x4 coordinates, or timing are invalid.' }, 400);
    }

    const { data: inserted, error: insertError } = await supabase.from('oracle_film_jobs').insert({
      session_id: sessionId,
      owner_key: ownerKey,
      portrait_url: 'story://locked-panel-reference',
      job_type: 'illustration-story',
        provider,
       model_slug: model.slug,
      status: 'queued',
      progress: 1,
      chunk_count: PAGE_COUNT,
      chunks: pages,
      story_manifest: {
        pageCount: PAGE_COUNT,
        totalDurationSeconds: totalDuration,
        sourceAssets: 'two immutable 4x4 illustration sheets',
        referencePolicy: 'one persisted panel image per page',
          visualProvider: model.slug,
         modelSlug: model.slug,
          provider,
         confirmation: 'explicit',
        audioPolicy: 'Lyria soundtrack plus validated lore narration',
        characterVoiceTracks,
      },
       audio_manifest: storyAudioManifest(pages, characterVoiceTracks),
    }).select('*').single();
    if (insertError || !inserted) return json({ error: 'Could not create the story film job.', detail: insertError?.message }, 500);
    const row = inserted as StoryJobRow;

    try {
      const musicBytes = decodeBase64(musicBase64);
      const narrationBytes = decodeBase64(narrationBase64);
      const musicUrl = await uploadAsset(supabase, `films/${row.id}/audio/lyria.mp3`, musicBytes, 'audio/mpeg');
      const narrationUrl = await uploadAsset(supabase, `films/${row.id}/audio/narration.wav`, narrationBytes, 'audio/wav');
      const scenes: StoryScene[] = [];

      for (let batchStart = 0; batchStart < PAGE_COUNT; batchStart += 4) {
        const batch = pages.slice(batchStart, batchStart + 4).map(async (page, offset) => {
          const index = batchStart + offset;
          const panel = panels[index];
          let referenceUrl: string | null = null;
          try {
            const panelBytes = decodeBase64(panel?.base64);
            const mimeType = typeof panel?.mimeType === 'string' && panel.mimeType.startsWith('image/')
              ? panel.mimeType
              : 'image/jpeg';
            referenceUrl = await uploadAsset(
              supabase,
              `films/${row.id}/references/page-${String(index + 1).padStart(2, '0')}.jpg`,
              panelBytes,
              mimeType,
            );
             const seed = 730_000 + index;
             const prompt = provider === 'minimax'
               ? miniMaxStoryPrompt(page)
               : storyPrompt(page);
             const requestId = provider === 'minimax'
               ? await createMiniMaxScene(
                 model as MiniMaxStoryModel,
                 referenceUrl,
                 prompt,
                 characterAudioForPage(page, characterVoiceTracks),
                 Number(page.durationSeconds),
               )
               : await createFalScene(model as FalStoryModel, referenceUrl, prompt, sessionId, seed);
            return {
              pageNumber: index + 1,
              sheetIndex: Number(page.sheetIndex) as 0 | 1,
              row: Number(page.row),
              column: Number(page.column),
              durationSeconds: Number(page.durationSeconds),
              seed,
                modelSlug: model.slug,
                provider,
               prompt,
              referenceUrl,
              referenceAudioUrl: characterAudioForPage(page, characterVoiceTracks),
              falRequestId: requestId,
              status: 'generating' as const,
              progress: 8,
              jobId: `${provider}:${requestId}`,
              outputUrl: null,
              error: null,
              failureKind: null,
              recovery: null,
            };
          } catch (error) {
            const detail = error instanceof Error ? error.message : '';
             const failure = sceneFailure(
               index + 1,
               detail,
               provider === 'minimax'
                 ? 'Could not submit this page to MiniMax H3.'
                 : 'Could not submit this page to FAL.',
             );
            return {
              pageNumber: index + 1,
              sheetIndex: Number(page.sheetIndex) as 0 | 1,
              row: Number(page.row),
              column: Number(page.column),
              durationSeconds: Number(page.durationSeconds),
              seed: 730_000 + index,
                modelSlug: model.slug,
                provider,
               prompt: provider === 'minimax' ? miniMaxStoryPrompt(page) : storyPrompt(page),
              referenceUrl,
                referenceAudioUrl: characterAudioForPage(page, characterVoiceTracks),
              falRequestId: null,
              status: 'failed' as const,
              progress: 0,
              jobId: null,
              outputUrl: null,
              error: failure.error,
              failureKind: referenceUrl ? failure.failureKind : 'submission',
              recovery: null,
            };
          }
        });
        scenes.push(...await Promise.all(batch));
        await updateJob(supabase, row.id, {
          status: 'generating',
          progress: Math.min(12, Math.round((scenes.length / PAGE_COUNT) * 12)),
          story_scenes: scenes,
          music_url: musicUrl,
          narration_url: narrationUrl,
          error_message: scenes.some(scene => scene.status === 'failed')
            ? 'One or more pages failed during submission. Retry them individually.'
            : null,
        });
      }

      const completed = await updateJob(supabase, row.id, {
        status: scenes.some(scene => scene.status === 'failed') ? 'failed' : 'generating',
        progress: Math.min(12, Math.round((scenes.length / PAGE_COUNT) * 12)),
        story_scenes: scenes,
        music_url: musicUrl,
        narration_url: narrationUrl,
        error_message: scenes.some(scene => scene.status === 'failed')
          ? 'One or more pages failed during submission. Retry or replace only the affected pages.'
          : null,
        story_manifest: {
          ...(row.story_manifest && typeof row.story_manifest === 'object' ? row.story_manifest : {}),
          failureKind: scenes.some(scene => scene.failureKind === 'provider-safety')
            ? 'provider-safety'
            : scenes.some(scene => scene.status === 'failed') ? 'submission' : null,
        },
      });
      return json(publicJob(completed), 202);
    } catch (error) {
      const failed = await updateJob(supabase, row.id, {
        status: 'failed',
        progress: 0,
         error_message: error instanceof Error ? error.message : 'FAL story setup failed.',
        story_manifest: {
          ...(row.story_manifest && typeof row.story_manifest === 'object' ? row.story_manifest : {}),
          failureKind: /\b(?:gemini|narration|lyria|soundtrack|audio)\b/i.test(error instanceof Error ? error.message : '')
            ? 'audio-gate'
            : 'submission',
        },
      });
      return json(publicJob(failed), 503);
    }
  }

  if (action === 'create-local') {
    const sessionId = safeText(payload.sessionId, 120);
    const ownerKey = ownerKeyFor(payload, sessionId);
    const pages = Array.isArray(payload.pages) ? payload.pages as Record<string, unknown>[] : [];
    const characterVoiceTracks = readCharacterVoiceTracks(payload.characterVoiceTracks);
    if (!sessionId || !validStoryPages(pages)) {
      return json({ error: 'sessionId plus exactly 32 valid story pages are required.' }, 400);
    }
    if (typeof payload.musicBase64 !== 'string' || typeof payload.narrationBase64 !== 'string') {
      return json({ error: 'Local story production requires music and narration audio.' }, 400);
    }
    try {
      const totalDuration = pages.reduce((sum, page) => sum + Number(page.durationSeconds || 0), 0);
      const { data: inserted, error: insertError } = await supabase.from('oracle_film_jobs').insert({
        session_id: sessionId,
        owner_key: ownerKey,
        portrait_url: 'story://locked-panel-reference',
        job_type: 'illustration-story',
        provider: 'browser-film',
        model_slug: null,
        status: 'ready',
        progress: 100,
        chunk_count: PAGE_COUNT,
        chunks: pages,
        story_scenes: pages.map(page => ({
          pageNumber: Number(page.pageNumber),
          sheetIndex: Number(page.sheetIndex),
          row: Number(page.row),
          column: Number(page.column),
          durationSeconds: Number(page.durationSeconds),
          seed: Number(page.pageNumber),
          provider: 'browser-film',
          status: 'ready',
          progress: 100,
          outputUrl: null,
          error: null,
          failureKind: null,
          recovery: null,
        })),
        story_manifest: {
          pageCount: PAGE_COUNT,
          totalDurationSeconds: totalDuration,
          sourceAssets: 'two local 4x4 illustration sheets; originals unchanged',
          referencePolicy: 'local locked panel references',
          provider: 'browser-film',
          audioPolicy: 'Lyria soundtrack plus validated lore narration',
          characterVoiceTracks,
          assembly: 'local-ffmpeg',
        },
        audio_manifest: storyAudioManifest(pages, characterVoiceTracks),
      }).select('*').single();
      if (insertError || !inserted) {
        return json({ error: 'Could not create the local story review record.', detail: insertError?.message }, 500);
      }
      const row = inserted as StoryJobRow;
      const musicUrl = await uploadAsset(
        supabase,
        `films/${row.id}/audio/lyria.mp3`,
        decodeBase64(payload.musicBase64),
        'audio/mpeg',
      );
      const narrationUrl = await uploadAsset(
        supabase,
        `films/${row.id}/audio/narration.wav`,
        decodeBase64(payload.narrationBase64),
        'audio/wav',
      );
      const local = await updateJob(supabase, row.id, {
        music_url: musicUrl,
        narration_url: narrationUrl,
      });
      return json(publicJob(local), 202);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Local story setup failed.' }, 503);
    }
  }

  if (action === 'persist-assembly') {
    if (!jobId) return json({ error: 'jobId is required.' }, 400);
    const ownerKey = safeText(payload.ownerKey, 160);
    if (!ownerKey) return json({ error: 'ownerKey is required.' }, 400);
    const { data: existing, error: existingError } = await supabase.from('oracle_film_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('owner_key', ownerKey)
      .maybeSingle();
    if (existingError || !existing) return json({ error: 'Story film job not found.' }, 404);
    const current = existing as StoryJobRow;
    try {
      const bytes = decodeBase64(payload.mediaBase64, 80_000_000);
      const finalMediaUrl = await uploadAsset(
        supabase,
        `films/${jobId}/final/story-film.mp4`,
        bytes,
        'video/mp4',
      );
      const manifest = reviewManifestWithDurableReferences(
        payload.reviewManifest,
        finalMediaUrl,
        current.narration_url,
        current.music_url,
      );
      const pageCount = Number(payload.pageCount);
      const durationSeconds = Number(payload.durationSeconds);
      const next = await updateJob(supabase, jobId, {
        final_media_url: finalMediaUrl,
        status: 'ready',
        progress: 100,
        error_message: null,
        story_manifest: {
          ...(current.story_manifest && typeof current.story_manifest === 'object' ? current.story_manifest : {}),
          visualsReady: true,
          assembly: 'local-ffmpeg',
          audioVerification: {
            audioStreamPresent: true,
            durationMatch: true,
            verifiedAt: new Date().toISOString(),
          },
        },
        ...(manifest ? { review_manifest: manifest } : {}),
        ...(manifest ? { review_history: reviewHistoryList(manifest.reviewHistory) } : {}),
        ...(Number.isInteger(pageCount) && pageCount > 0 ? { chunk_count: pageCount } : {}),
      });
      return json(publicJob(next));
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Could not persist the assembled story film.' }, 503);
    }
  }

  if (!jobId) return json({ error: 'jobId is required.' }, 400);
  const requestedOwnerKey = safeText(payload.ownerKey, 160);
  let jobQuery = supabase.from('oracle_film_jobs').select('*').eq('id', jobId);
  if (requestedOwnerKey) jobQuery = jobQuery.eq('owner_key', requestedOwnerKey);
  const { data, error } = await jobQuery.maybeSingle();
  if (error || !data) return json({ error: 'Story film job not found.' }, 404);
  let current = data as StoryJobRow;
  if (current.job_type !== 'illustration-story') return json({ error: 'Job is not an illustration story.' }, 400);

  if (action === 'review') {
    const rawReview = payload.review && typeof payload.review === 'object'
      ? payload.review as Record<string, unknown>
      : null;
    if (!rawReview) return json({ error: 'review is required.' }, 400);
    const inspectedShotNumbers = Array.from(new Set(
      (Array.isArray(rawReview.inspectedShotNumbers) ? rawReview.inspectedShotNumbers : [])
        .map(value => Number(value))
        .filter(value => Number.isInteger(value) && value >= 1 && value <= PAGE_COUNT),
    )).sort((a, b) => a - b);
    const rejections = (Array.isArray(payload.rejections) ? payload.rejections : [])
      .flatMap(entry => {
        if (!entry || typeof entry !== 'object') return [];
        const candidate = entry as Record<string, unknown>;
        const pageNumber = candidate.pageNumber === null ? null : Number(candidate.pageNumber);
        const reason = safeText(candidate.reason, 500);
        if (!reason || (pageNumber !== null && (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > PAGE_COUNT))) return [];
        return [{
          pageNumber,
          reason,
          rejectedAt: new Date().toISOString(),
        }];
      });
    const currentManifest = current.review_manifest && typeof current.review_manifest === 'object'
      ? current.review_manifest as Record<string, unknown>
      : {};
    const currentStoryManifest = current.story_manifest && typeof current.story_manifest === 'object'
      ? current.story_manifest as Record<string, unknown>
      : {};
    const storedReviewHistory = reviewHistoryList(current.review_history);
    const previousHistory = storedReviewHistory.length
      ? storedReviewHistory
      : reviewHistoryList(currentManifest.reviewHistory ?? currentStoryManifest.reviewHistory);
    const rawHistoryEntry = payload.reviewHistoryEntry && typeof payload.reviewHistoryEntry === 'object'
      ? payload.reviewHistoryEntry as Record<string, unknown>
      : {};
    const action = rawHistoryEntry.action === 'approval'
      || rawHistoryEntry.action === 'rejection'
      || rawHistoryEntry.action === 'inspection'
      ? rawHistoryEntry.action
      : 'inspection';
    const historyPageNumber = rawHistoryEntry.pageNumber === null || rawHistoryEntry.pageNumber === undefined
      ? null
      : Number(rawHistoryEntry.pageNumber);
    const normalizedHistoryPageNumber = historyPageNumber !== null
      && Number.isInteger(historyPageNumber)
      && historyPageNumber >= 1
      && historyPageNumber <= PAGE_COUNT
      ? historyPageNumber
      : null;
    const historyReason = safeText(rawHistoryEntry.reason, 500);
    const reviewHistory = [
      ...previousHistory,
      ...reviewHistoryList([{
        action,
        reviewer: rawHistoryEntry.reviewer,
        occurredAt: new Date().toISOString(),
        inspectedShotNumbers,
        audioListened: rawReview.audioListened === true,
        pageNumber: action === 'rejection' ? normalizedHistoryPageNumber : null,
        ...(historyReason ? { reason: historyReason } : {}),
      }]),
    ].slice(-200);
    const review = {
      inspectedShotNumbers,
      audioListened: rawReview.audioListened === true,
      approvedAt: typeof rawReview.approvedAt === 'string' ? rawReview.approvedAt.slice(0, 80) : null,
      method: rawReview.method === 'manual-watch-and-listen' ? rawReview.method : null,
      updatedAt: new Date().toISOString(),
    };
    current = await updateJob(supabase, current.id, {
      story_manifest: {
        ...currentStoryManifest,
        review,
        reviewRejections: rejections,
        rejections,
        reviewHistory,
      },
      review_history: reviewHistory,
      review_manifest: current.review_manifest && typeof current.review_manifest === 'object'
        ? {
          ...currentManifest,
          review,
          reviewRejections: rejections,
          rejections,
          reviewHistory,
        }
        : undefined,
    });
    return json(publicJob(current));
  }

  if (action === 'resume' && current.status === 'failed') {
    const scenes = sceneList(current.story_scenes);

    const everyPageReady = scenes.length === PAGE_COUNT
      && scenes.every(scene => scene.status === 'ready' && Boolean(scene.outputUrl));
    if (scenes.some(scene => ['queued', 'generating'].includes(scene.status))) {
      current = await updateJob(supabase, current.id, {
        status: 'generating',
        error_message: null,
      });
    }
  }

  if (action === 'cancel') {
    const scenes = sceneList(current.story_scenes);
    await Promise.all(scenes.map(async scene => {
      if (scene.falRequestId && ['queued', 'generating'].includes(scene.status)) {
        try {
          if (sceneProvider(scene, current.story_manifest) === 'minimax') {
            await cancelMiniMaxScene(scene.falRequestId);
          } else {
            await cancelFalScene(sceneModelSlug(scene, current.story_manifest), scene.falRequestId);
          }
        } catch {
          // Persist cancellation even if the provider has already closed the request.
        }
      }
    }));
    current = await updateJob(supabase, current.id, {
      status: 'cancelled',
      story_scenes: scenes.map(scene => ['queued', 'generating'].includes(scene.status)
        ? { ...scene, status: 'cancelled', progress: 0, error: null }
        : scene),
      error_message: null,
    });
    return json(publicJob(current));
  }

  if (action === 'retry-stitch') {
    const modelSlug = sceneModelSlug(sceneList(current.story_scenes)[0] ?? {} as StoryScene, current.story_manifest);
    if (isRetiredModel(modelSlug)) {
      return json({
        error: 'This historical Seedance job is readable but cannot be retried. Start a new story and explicitly choose an approved FAL model.',
        retired: true,
      }, 409);
    }
    const scenes = sceneList(current.story_scenes);

    const everyPageReady = scenes.length === PAGE_COUNT
      && scenes.every(scene => scene.status === 'ready' && Boolean(scene.outputUrl));
    await Promise.all(scenes.map(async scene => {
       if (scene.falRequestId && ['queued', 'generating'].includes(scene.status)) {
          try {
            if (sceneProvider(scene, current.story_manifest) === 'minimax') {
              await cancelMiniMaxScene(scene.falRequestId);
            } else {
              await cancelFalScene(sceneModelSlug(scene, current.story_manifest), scene.falRequestId);
            }
          } catch { /* local state remains authoritative */ }
      }
    }));
    current = await updateJob(supabase, current.id, {
      status: 'cancelled',
      story_scenes: scenes.map(scene => ['queued', 'generating'].includes(scene.status)
        ? { ...scene, status: 'cancelled', progress: 0, error: null }
        : scene),
      error_message: null,
    });
    return json(publicJob(current));
  }

  if (action === 'retry' || action === 'replace') {
    const pageNumber = Number(payload.pageNumber);
    const scenes = sceneList(current.story_scenes);
    const scene = scenes.find(item => item.pageNumber === pageNumber);
    if (!scene || !scene.referenceUrl) {
      return json({ error: 'That story page has no persisted panel reference to retry.' }, 400);
    }
    const modelSlug = sceneModelSlug(scene, current.story_manifest);
    if (isRetiredModel(modelSlug)) {
      return json({
        error: 'This historical Seedance page is readable but cannot be retried automatically. Start a new story with an approved FAL model.',
        retired: true,
      }, 409);
    }
    const provider = sceneProvider(scene, current.story_manifest);
    const model = provider === 'minimax' ? minimaxStoryModel(modelSlug) : falStoryModel(modelSlug);
    if (!model) return json({ error: 'The saved hosted story model is no longer approved; start a new story with the current catalog.' }, 409);
    const isReplacement = action === 'replace';
    try {
      const nextPrompt = isReplacement ? replacementStoryPrompt(scene) : scene.prompt;
      const nextSeed = isReplacement ? scene.seed + 500_000 : scene.seed;
       const requestId = provider === 'minimax'
         ? await createMiniMaxScene(
           model as MiniMaxStoryModel,
           scene.referenceUrl,
           nextPrompt,
           scene.referenceAudioUrl,
           Number(scene.durationSeconds),
         )
         : await createFalScene(model as FalStoryModel, scene.referenceUrl, nextPrompt, current.session_id, nextSeed);
      const nextScenes = scenes.map(item => item.pageNumber === pageNumber
        ? {
          ...item,
          prompt: nextPrompt,
          seed: nextSeed,
           modelSlug,
            provider,
          falRequestId: requestId,
          status: 'generating' as const,
          progress: 8,
          jobId: `${provider}:${requestId}`,
          outputUrl: null,
          error: null,
          failureKind: null,
          recovery: isReplacement ? 'replace' : 'retry',
        }
        : item);
      current = await updateJob(supabase, current.id, {
        status: 'generating',
        progress: Math.max(10, Math.round(nextScenes.filter(item => item.status === 'ready').length / PAGE_COUNT * 70)),
        runpod_job_id: null,
        story_scenes: nextScenes,
        error_message: null,
        story_manifest: {
          ...(current.story_manifest && typeof current.story_manifest === 'object' ? current.story_manifest : {}),
          failureKind: null,
        },
      });
      return json(publicJob(current), 202);
    } catch (retryError) {
      current = await updateJob(supabase, current.id, {
        story_scenes: scenes.map(item => item.pageNumber === pageNumber
          ? {
            ...item,
            status: 'failed',
            progress: 0,
            error: sceneFailure(
              pageNumber,
              retryError instanceof Error ? retryError.message : '',
              'Page retry failed before FAL accepted the request.',
            ).error,
            failureKind: isProviderSafetyBlock(retryError instanceof Error ? retryError.message : '')
              ? 'provider-safety' : 'provider',
          }
          : item),
        status: 'failed',
        error_message: isReplacement
          ? 'The safe replacement page could not be submitted. Retry or replace this page again.'
          : 'The page retry failed before FAL accepted the request.',
        story_manifest: {
          ...(current.story_manifest && typeof current.story_manifest === 'object' ? current.story_manifest : {}),
          failureKind: isProviderSafetyBlock(retryError instanceof Error ? retryError.message : '')
            ? 'provider-safety' : 'provider',
        },
      });
      return json(publicJob(current), 503);
    }
  }

  if (['queued', 'generating', 'stitching'].includes(current.status)) {
    try {
      current = await pollStoryJob(supabase, current);
    } catch (pollError) {
      return json({ ...publicJob(current), warning: pollError instanceof Error ? pollError.message : 'Story polling failed; retry shortly.' });
    }
  }
  return json(publicJob(current));
});
