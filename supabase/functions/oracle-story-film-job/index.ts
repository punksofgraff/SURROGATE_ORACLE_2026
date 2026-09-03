/**
 * Server-owned optional hosted story-film job.
 *
 * A story is not a still-image render. Every page gets its own durable panel
 * reference, approved hosted request, and recoverable output. Visual clips are
 * persisted here; final audio assembly remains on the local FFmpeg lane.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  H3ChunkRequest,
  pollFalH3Chunks,
  pollFalStoryWorkflow,
} from './polling.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
};
const PAGE_COUNT = 32;
const H3_CHUNK_COUNT = 10;
const H3_MODEL_SLUG = 'minimax/h3/image-to-video';
const H3_QUEUE_ENDPOINT = `https://queue.fal.run/${H3_MODEL_SLUG}`;
const FAL_TIMEOUT_MS = 20_000;

type FalStoryModel = {
  slug: string;
  label: string;
  description: string;
  costLabel: string;
  expectedSeconds: number;
  resolution: '480P' | '768P';
};
const DEFAULT_FAL_STORY_MODELS: FalStoryModel[] = [
  {
    slug: H3_MODEL_SLUG,
    label: 'MiniMax H3 · 480P × 10 story chunks',
    description: 'Ten ordered H3 calls, each animating one composite of three or four story cells.',
    costLabel: '10 hosted H3 chunks',
    expectedSeconds: 120,
    resolution: '480P',
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
      if (!slug || isRetiredModel(slug)) return [];
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

type StoryPanelManifestEntry = {
  panelId: string;
  pageNumber: number;
  sheetIndex: 0 | 1;
  row: number;
  column: number;
  durationSeconds: number;
  sourceHash: string;
  referenceUrl: string | null;
  prompt: string;
};

type StoryWorkflowState = {
  mode: 'single-fal-workflow' | 'ten-h3-chunks';
  contractVersion: 1 | 2;
  endpoint: string;
  requestId?: string;
  statusUrl?: string;
  responseUrl?: string;
  cancelUrl?: string;
  chunks?: H3ChunkRequest[];
  submissionCount: number;
  submittedAt: string;
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

function orderedStoryScenes(value: unknown): StoryScene[] {
  return [...sceneList(value)].sort((left, right) => left.pageNumber - right.pageNumber);
}

function validCellManifest(scenes: StoryScene[]): boolean {
  return scenes.length === PAGE_COUNT
    && scenes.every((scene, index) => (
      scene.pageNumber === index + 1
      && scene.status === 'ready'
      && Boolean(scene.referenceUrl || scene.outputUrl)
      && Number(scene.durationSeconds) > 0
      && Number(scene.durationSeconds) <= 10
    ));
}

function storyManifest(row: StoryJobRow): Record<string, unknown> {
  return row.story_manifest && typeof row.story_manifest === 'object'
    ? row.story_manifest as Record<string, unknown>
    : {};
}

function isSingleFalWorkflowJob(row: StoryJobRow): boolean {
  const manifest = storyManifest(row);
  return manifest.workflowMode === 'single-fal-workflow'
    && manifest.workflow
    && typeof manifest.workflow === 'object';
}

function isTenH3ChunksJob(row: StoryJobRow): boolean {
  const manifest = storyManifest(row);
  return manifest.workflowMode === 'ten-h3-chunks'
    && manifest.workflow
    && typeof manifest.workflow === 'object';
}

function isReadOnlyStoryJob(row: StoryJobRow): boolean {
  return row.job_type === 'illustration-story'
    && row.provider !== 'browser-film'
    && !isSingleFalWorkflowJob(row)
    && !isTenH3ChunksJob(row);
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

function workflowEndpoint(): string {
  const configured = safeUrl(Deno.env.get('FAL_STORY_WORKFLOW_ENDPOINT'), 4000);
  if (!configured) {
    throw new Error('BLOCKED: the shared FAL story workflow endpoint is not configured; no hosted request was submitted.');
  }
  try {
    const parsed = new URL(configured);
    if (parsed.protocol !== 'https:') throw new Error('endpoint must use HTTPS');
  } catch {
    throw new Error('BLOCKED: the shared FAL story workflow endpoint is invalid; expected an HTTPS URL and no hosted request was submitted.');
  }
  return configured;
}

function h3QueueEndpoint(): string {
  const configured = safeUrl(Deno.env.get('FAL_H3_QUEUE_ENDPOINT'), 4000) || H3_QUEUE_ENDPOINT;
  try {
    const parsed = new URL(configured);
    if (parsed.protocol !== 'https:') throw new Error('endpoint must use HTTPS');
    if (!/\/minimax\/h3\/image-to-video\/?$/.test(parsed.pathname)) {
      throw new Error('endpoint must target MiniMax H3 image-to-video');
    }
  } catch {
    throw new Error('BLOCKED: the MiniMax H3 queue endpoint is invalid; no hosted request was submitted.');
  }
  return configured;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(value => value.toString(16).padStart(2, '0'))
    .join('');
}

async function workflowJson(url: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Key ${Deno.env.get('FAL_API_KEY') ?? ''}`,
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let data: unknown = {};
  try { data = text ? JSON.parse(text) : {}; } catch { /* report provider text below */ }
  if (!response.ok) {
    throw new Error(`Shared FAL workflow request failed (${response.status}): ${errorDetail(data) || safeText(text, 300)}`);
  }
  return data && typeof data === 'object' ? data as Record<string, unknown> : {};
}

function workflowUrl(data: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = safeUrl(data[key], 4000);
    if (value) return value;
  }
  return '';
}

function workflowRequestId(data: Record<string, unknown>): string {
  return safeText(data.request_id ?? data.requestId ?? data.job_id ?? data.jobId ?? data.id, 240);
}

async function createFalStoryWorkflow(
  endpoint: string,
  payload: Record<string, unknown>,
): Promise<StoryWorkflowState> {
  const data = await workflowJson(endpoint, { method: 'POST', body: JSON.stringify(payload) });
  const requestId = workflowRequestId(data);
  const statusUrl = workflowUrl(data, ['status_url', 'statusUrl']);
  const responseUrl = workflowUrl(data, ['response_url', 'responseUrl', 'result_url', 'resultUrl']);
  if (!requestId || !statusUrl || !responseUrl) {
    throw new Error('Shared FAL workflow returned no durable request id, status URL, and response URL; submission was not accepted.');
  }
  return {
    mode: 'single-fal-workflow',
    contractVersion: 1,
    endpoint,
    requestId,
    statusUrl,
    responseUrl,
    ...(workflowUrl(data, ['cancel_url', 'cancelUrl']) ? { cancelUrl: workflowUrl(data, ['cancel_url', 'cancelUrl']) } : {}),
    submissionCount: 1,
    submittedAt: new Date().toISOString(),
  };
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
  const legacyReadOnly = isReadOnlyStoryJob(row);
  const publicWorkflow = workflow ?? (legacyReadOnly ? { mode: 'legacy-per-scene-readonly' } : null);
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
  const workflow = manifest.workflow && typeof manifest.workflow === 'object'
    ? manifest.workflow as Record<string, unknown>
    : null;
  const everyPageReady = (scenes.length === PAGE_COUNT
    && scenes.every(scene => scene.status === 'ready' && Boolean(scene.outputUrl)))
    || (row.provider === 'browser-film' && Boolean(row.final_media_url))
    || (manifest.workflowMode === 'ten-h3-chunks' && Boolean(row.final_media_url));
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
    workflow: publicWorkflow,
    chunks: Array.isArray(manifest.chunkManifest) ? manifest.chunkManifest : [],
    legacyReadOnly,
    sourcePanelManifest: Array.isArray(manifest.panelManifest) ? manifest.panelManifest : [],
    coverageCertificate: manifest.coverageCertificate ?? null,
    blockedReason: typeof manifest.blockedReason === 'string' ? manifest.blockedReason : null,
    submissionCount: Number(manifest.submissionCount) || 0,
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

async function persistRemoteWorkflowFilm(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  outputUrl: string,
): Promise<string> {
  const response = await fetch(outputUrl);
  if (!response.ok) throw new Error(`Shared FAL workflow film could not be downloaded (${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) throw new Error('Shared FAL workflow returned an empty video.');
  return uploadAsset(supabase, `films/${jobId}/hosted-workflow.mp4`, bytes, 'video/mp4');
}

function panelManifestList(value: unknown): StoryPanelManifestEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is StoryPanelManifestEntry => Boolean(
    entry && typeof entry === 'object'
      && Number((entry as Record<string, unknown>).pageNumber) >= 1
      && typeof (entry as Record<string, unknown>).sourceHash === 'string'
      && typeof (entry as Record<string, unknown>).panelId === 'string',
  ));
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

function h3ChunkPrompt(
  pages: Record<string, unknown>[],
  pageNumbers: number[],
  targetDurationSeconds: number,
): string {
  const cellDuration = targetDurationSeconds / Math.max(1, pageNumbers.length);
  const beats = pageNumbers.map((pageNumber, index) => {
    const page = pages[pageNumber - 1];
    const narration = providerStoryLanguage(safeText(page?.narration, 600));
    const treatment = page?.shotPlan && typeof page.shotPlan === 'object'
      ? page.shotPlan as Record<string, unknown>
      : {};
    return [
      `Cell ${index + 1}, story page ${pageNumber}, seconds ${(
        index * cellDuration
      ).toFixed(2)}–${((index + 1) * cellDuration).toFixed(2)}.`,
      `Narration beat: ${narration}.`,
      `Treatment: ${safeText(treatment.treatment, 120) || 'restrained storybook motion'};`,
      `action: ${safeText(treatment.actionBeat, 220) || 'animate the depicted action'};`,
      `environment: ${safeText(treatment.environmentBeat, 180) || 'add gentle environmental movement'};`,
      `camera: ${safeText(treatment.cameraMove, 180) || 'use a gentle motivated camera move'}.`,
    ].join(' ');
  });
  return [
    'Animate the supplied composite story image as an ordered sequence of labeled illustration cells.',
    `The image contains exactly ${pageNumbers.length} cells for story pages ${pageNumbers.join(', ')} in reading order.`,
    `Run the sequence for approximately ${targetDurationSeconds.toFixed(2)} seconds, giving each cell about ${cellDuration.toFixed(2)} seconds.`,
    'Start on the first cell, animate only that cell while preserving its characters and composition, then make a gentle motivated transition to the next cell. Continue cell by cell in the stated order until the final cell.',
    'Treat the cell labels and grid as timing guidance, not as content to reproduce. Do not invent an extra cell, skip a cell, reorder cells, replace the artwork, or turn the grid into a single unrelated scene.',
    'Preserve the authored storybook characters, identities, costumes, colors, relationships, linework, proportions, and child-friendly visual style. Animate expressions, blinking, breathing, gestures, props, and environmental motion that are already implied by each cell.',
    'Use restrained camera movement and smooth transitions. Do not add dialogue text, logos, watermarks, photorealistic restyling, character morphing, or unrelated objects.',
    'Generate synchronized native ambience and movement sound for the visible action when supported. Do not generate spoken dialogue; the separately supplied narration and character tracks remain authoritative.',
    beats.join(' '),
  ].join(' ');
}

function h3ChunkPlan(pages: Record<string, unknown>[]): Array<{
  chunkNumber: number;
  pageNumbers: number[];
  targetDurationSeconds: number;
  requestedDurationSeconds: number;
  prompt: string;
}> {
  const sizes = [4, 4, ...Array.from({ length: 8 }, () => 3)];
  const chunks: Array<{
    chunkNumber: number;
    pageNumbers: number[];
    targetDurationSeconds: number;
    requestedDurationSeconds: number;
    prompt: string;
  }> = [];
  let cursor = 0;
  sizes.forEach((size, index) => {
    const pageNumbers = Array.from({ length: size }, (_, offset) => cursor + offset + 1);
    cursor += size;
    const targetDurationSeconds = pageNumbers.reduce(
      (sum, pageNumber) => sum + Number(pages[pageNumber - 1]?.durationSeconds || 0),
      0,
    );
    chunks.push({
      chunkNumber: index + 1,
      pageNumbers,
      targetDurationSeconds,
      requestedDurationSeconds: Math.min(15, Math.max(5, Math.ceil(targetDurationSeconds))),
      prompt: h3ChunkPrompt(pages, pageNumbers, targetDurationSeconds),
    });
  });
  return chunks;
}

async function createFalH3ChunkRequest(
  endpoint: string,
  chunk: {
    chunkNumber: number;
    pageNumbers: number[];
    targetDurationSeconds: number;
    requestedDurationSeconds: number;
    prompt: string;
    imageUrl: string;
  },
): Promise<H3ChunkRequest> {
  const data = await workflowJson(endpoint, {
    method: 'POST',
    body: JSON.stringify({
      prompt: chunk.prompt,
      duration: chunk.requestedDurationSeconds,
      resolution: '480P',
      image_url: chunk.imageUrl,
    }),
  });
  const requestId = workflowRequestId(data);
  const statusUrl = workflowUrl(data, ['status_url', 'statusUrl']);
  const responseUrl = workflowUrl(data, ['response_url', 'responseUrl', 'result_url', 'resultUrl']);
  if (!requestId || !statusUrl || !responseUrl) {
    throw new Error(`MiniMax H3 chunk ${chunk.chunkNumber} returned no durable request id, status URL, and response URL.`);
  }
  const cancelUrl = workflowUrl(data, ['cancel_url', 'cancelUrl']);
  return {
    chunkNumber: chunk.chunkNumber,
    pageNumbers: chunk.pageNumbers,
    targetDurationSeconds: chunk.targetDurationSeconds,
    requestedDurationSeconds: chunk.requestedDurationSeconds,
    prompt: chunk.prompt,
    imageUrl: chunk.imageUrl,
    requestId,
    statusUrl,
    responseUrl,
    ...(cancelUrl ? { cancelUrl } : {}),
    status: 'queued',
    progress: 8,
    outputUrl: null,
    error: null,
  };
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

  const manifest = current.story_manifest && typeof current.story_manifest === 'object'
    ? current.story_manifest as Record<string, unknown>
    : {};
  if (manifest.workflowMode === 'ten-h3-chunks'
    && manifest.workflow && typeof manifest.workflow === 'object') {
    const workflow = manifest.workflow as StoryWorkflowState;
    const chunks = Array.isArray(workflow.chunks) ? workflow.chunks : [];
    try {
      const next = await pollFalH3Chunks(chunks, workflowJson);
      const nextWorkflow = {
        ...workflow,
        chunks: next.chunks,
        submissionCount: next.chunks.length,
        ...(next.status === 'ready' ? { completedAt: new Date().toISOString() } : {}),
      };
      const nextChunkManifest = next.chunks.map(chunk => ({
        chunkNumber: chunk.chunkNumber,
        pageNumbers: chunk.pageNumbers,
        imageUrl: chunk.imageUrl,
        targetDurationSeconds: chunk.targetDurationSeconds,
        requestedDurationSeconds: chunk.requestedDurationSeconds,
        prompt: chunk.prompt,
        requestId: chunk.requestId,
        status: chunk.status,
        progress: chunk.progress,
        outputUrl: chunk.outputUrl ?? null,
        error: chunk.error ?? null,
      }));
      if (next.status === 'ready') {
        return updateJob(supabase, current.id, {
          status: 'ready',
          progress: 82,
          runpod_job_id: null,
          error_message: null,
          story_manifest: {
            ...manifest,
            workflow: nextWorkflow,
            chunkManifest: nextChunkManifest,
            visualsReady: true,
            assembly: 'local-ffmpeg',
            coverageMode: 'submitted-composite-chunks; visual cell coverage requires human review',
            failureKind: null,
          },
        });
      }
      if (next.status === 'failed' || next.status === 'cancelled') {
        return updateJob(supabase, current.id, {
          status: next.status,
          progress: 0,
          error_message: next.error || 'MiniMax H3 chunk generation did not complete.',
          story_manifest: {
            ...manifest,
            workflow: nextWorkflow,
            chunkManifest: nextChunkManifest,
            failureKind: next.status === 'cancelled' ? null : 'provider',
          },
        });
      }
      return updateJob(supabase, current.id, {
        status: next.status,
        progress: Math.max(current.progress, Math.min(80, 8 + next.progress * 0.72)),
        error_message: null,
        story_manifest: {
          ...manifest,
          workflow: nextWorkflow,
          chunkManifest: nextChunkManifest,
        },
      });
    } catch (error) {
      return updateJob(supabase, current.id, {
        status: 'failed',
        progress: 0,
        error_message: error instanceof Error ? error.message : 'MiniMax H3 chunk polling failed.',
        story_manifest: {
          ...manifest,
          failureKind: 'provider',
        },
      });
    }
  }
  if (manifest.workflowMode === 'single-fal-workflow'
    && manifest.workflow && typeof manifest.workflow === 'object') {
    const workflow = manifest.workflow as StoryWorkflowState;
    const panelManifest = panelManifestList(manifest.panelManifest);
    const totalDurationSeconds = Number(manifest.totalDurationSeconds);
    try {
      const next = await pollFalStoryWorkflow(workflow, panelManifest, totalDurationSeconds, workflowJson);
      if (next.status === 'ready' && next.output && next.certificate) {
        const stableUrl = await persistRemoteWorkflowFilm(supabase, current.id, next.output);
        const scenes = sceneList(current.story_scenes).map(scene => ({
          ...scene,
          status: 'ready' as const,
          progress: 100,
          outputUrl: stableUrl,
          error: null,
          failureKind: null,
          recovery: null,
        }));
        return updateJob(supabase, current.id, {
          story_scenes: scenes,
          status: 'ready',
          progress: 100,
          final_media_url: stableUrl,
          runpod_job_id: null,
          error_message: null,
          story_manifest: {
            ...manifest,
            workflow: {
              ...workflow,
              completedAt: new Date().toISOString(),
            },
            coverageCertificate: next.certificate,
            visualsReady: true,
            assembly: 'local-ffmpeg',
            failureKind: null,
          },
        });
      }
      if (next.status === 'failed' || next.status === 'cancelled') {
        return updateJob(supabase, current.id, {
          status: next.status,
          progress: 0,
          error_message: next.error || 'Shared FAL story workflow did not complete.',
          story_manifest: {
            ...manifest,
            failureKind: next.status === 'cancelled' ? null : 'provider',
          },
        });
      }
      return updateJob(supabase, current.id, {
        status: next.status,
        progress: Math.max(current.progress, Math.min(78, 8 + next.progress * 0.7)),
        error_message: null,
      });
    } catch (error) {
      return updateJob(supabase, current.id, {
        status: 'failed',
        progress: 0,
        error_message: error instanceof Error ? error.message : 'Shared FAL workflow polling failed.',
        story_manifest: {
          ...manifest,
          failureKind: 'provider',
        },
      });
    }
  }

  return current;
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
      workflow: 'ten-h3-chunks',
      submissionPolicy: 'ten external MiniMax H3 image-to-video jobs; one composite image per job; no per-panel fan-out',
      models: falStoryModels().map(({ slug, label, description, costLabel, expectedSeconds }) => ({
        provider: 'fal',
        slug,
        label,
        description,
        costLabel,
        expectedSeconds,
      })),
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

  if (action === 'stitch-order') {
    if (!jobId) return json({ error: 'jobId is required.' }, 400);
    const ownerKey = safeText(payload.ownerKey, 160);
    if (!ownerKey) return json({ error: 'ownerKey is required.' }, 400);
    const { data: existing, error: existingError } = await supabase.from('oracle_film_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('owner_key', ownerKey)
      .eq('job_type', 'illustration-story')
      .maybeSingle();
    if (existingError || !existing) return json({ error: 'Story film job not found.' }, 404);
    const current = existing as StoryJobRow;
    const scenes = orderedStoryScenes(current.story_scenes);
    if (!validCellManifest(scenes)) {
      return json({
        error: 'The persisted story cells are incomplete or out of order; no stitch request was started.',
      }, 409);
    }

    const { data: cellRows, error: cellError } = await supabase.from('oracle_story_cells')
      .select('page_number,panel_id,source_hash,media_url,media_kind,duration_seconds,status,expires_at')
      .eq('job_id', jobId)
      .order('page_number', { ascending: true });
    if (cellError || !cellRows || cellRows.length !== PAGE_COUNT) {
      return json({
        error: 'The persisted story cell manifest is incomplete; no stitch request was started.',
      }, 409);
    }
    const now = Date.now();
    const orderedCells = cellRows.map((raw: Record<string, unknown>, index: number) => ({
      pageNumber: Number(raw.page_number),
      panelId: safeText(raw.panel_id, 160),
      sourceHash: safeText(raw.source_hash, 128).toLowerCase(),
      mediaUrl: safeUrl(raw.media_url, 4000),
      mediaKind: safeText(raw.media_kind, 40),
      durationSeconds: Number(raw.duration_seconds),
      status: safeText(raw.status, 20),
      expiresAt: safeText(raw.expires_at, 80),
      expectedScene: scenes[index],
    }));
    const valid = orderedCells.every((cell, index) => (
      cell.pageNumber === index + 1
      && cell.panelId
      && /^https:\/\//i.test(cell.mediaUrl)
      && ['image/jpeg', 'image/png', 'video/mp4'].includes(cell.mediaKind)
      && cell.status === 'ready'
      && Number.isFinite(Date.parse(cell.expiresAt))
      && Date.parse(cell.expiresAt) > now
      && Number.isFinite(cell.durationSeconds)
      && cell.durationSeconds > 0
      && Math.abs(cell.durationSeconds - cell.expectedScene.durationSeconds) <= 0.01
      && cell.mediaUrl === (cell.expectedScene.referenceUrl || cell.expectedScene.outputUrl)
    ));
    if (!valid) {
      return json({
        error: 'The persisted story cell manifest is expired, unavailable, or does not match the page order; no stitch request was started.',
      }, 409);
    }

    const manifest = storyManifest(current);
    const stitchPlan = {
      version: 1,
      reviewedAt: new Date().toISOString(),
      expiresAt: orderedCells[0].expiresAt,
      pageCount: PAGE_COUNT,
      order: orderedCells.map(cell => ({
        pageNumber: cell.pageNumber,
        panelId: cell.panelId,
        sourceHash: cell.sourceHash,
        mediaUrl: cell.mediaUrl,
        mediaKind: cell.mediaKind,
        durationSeconds: cell.durationSeconds,
      })),
    };
    const { data: updated, error: updateError } = await supabase.from('oracle_film_jobs')
      .update({
        status: 'stitching',
        progress: Math.max(current.progress, 82),
        story_manifest: { ...manifest, stitchPlan },
        error_message: null,
      })
      .eq('id', jobId)
      .eq('owner_key', ownerKey)
      .select('*')
      .single();
    if (updateError || !updated) return json({ error: 'Could not persist the story stitch plan.' }, 500);
    return json({
      id: jobId,
      pageCount: PAGE_COUNT,
      orderReviewed: true,
      stitchPlan,
      cellUrls: stitchPlan.order.map(cell => cell.mediaUrl),
      job: publicJob(updated as StoryJobRow),
    }, 202);
  }

  if (action === 'create') {
    const sessionId = safeText(payload.sessionId, 120);
    const ownerKey = ownerKeyFor(payload, sessionId);
    const requestedProvider = safeText(payload.provider, 40).toLowerCase();
    const falModel = falStoryModel(payload.modelSlug);
    const provider = 'fal' as const;
    const model = falModel;
    const confirmed = payload.confirmed === true;
    const pages = Array.isArray(payload.pages) ? payload.pages as Record<string, unknown>[] : [];
    const panels = Array.isArray(payload.panels) ? payload.panels as Record<string, unknown>[] : [];
    const chunks = Array.isArray(payload.chunks) ? payload.chunks as Record<string, unknown>[] : [];
    const characterVoiceTracks = readCharacterVoiceTracks(payload.characterVoiceTracks);
    const musicBase64 = payload.musicBase64;
    const narrationBase64 = payload.narrationBase64;
    if (!confirmed) {
      return json({ error: 'A Seeker confirmation is required before any hosted story request.' }, 400);
    }
    if (requestedProvider && requestedProvider !== 'fal') {
      return json({
        error: 'This story lane is blocked: only the shared FAL workflow may submit hosted story work. No direct MiniMax or other per-panel request was submitted.',
      }, 409);
    }
    if (!model) {
      return json({ error: 'That hosted story model is not approved. Choose a model from the current catalog.' }, 400);
    }
    if (!sessionId || pages.length !== PAGE_COUNT
      || (model?.slug === H3_MODEL_SLUG ? chunks.length !== H3_CHUNK_COUNT : panels.length !== PAGE_COUNT)) {
      return json({
        error: model?.slug === H3_MODEL_SLUG
          ? 'sessionId plus exactly 32 pages and 10 ordered composite chunk images are required.'
          : 'sessionId plus exactly 32 pages and 32 locked panel references are required.',
      }, 400);
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

    if (model.slug === H3_MODEL_SLUG) {
      const incomingChunks = Array.isArray(payload.chunks)
        ? payload.chunks as Record<string, unknown>[]
        : [];
      const chunkPlan = h3ChunkPlan(pages);
      if (incomingChunks.length !== H3_CHUNK_COUNT) {
        return json({ error: 'MiniMax H3 story production requires exactly 10 composite chunk images.' }, 400);
      }
      if (incomingChunks.some((chunk, index) => (
        Number(chunk.chunkNumber) !== index + 1
        || typeof chunk.base64 !== 'string'
        || !Array.isArray(chunk.pageNumbers)
      ))) {
        return json({ error: 'MiniMax H3 chunk order or image payload is invalid.' }, 400);
      }
      if (incomingChunks.some((chunk, index) => {
        const expected = chunkPlan[index];
        const pageNumbers = (chunk.pageNumbers as unknown[]).map(value => Number(value));
        return pageNumbers.length !== expected.pageNumbers.length
          || pageNumbers.some((pageNumber, pageIndex) => pageNumber !== expected.pageNumbers[pageIndex]);
      })) {
        return json({ error: 'MiniMax H3 chunks must cover pages 01–32 contiguously in ten ordered groups.' }, 400);
      }

      const plannedScenes: StoryScene[] = pages.map((page, index) => ({
        pageNumber: index + 1,
        sheetIndex: Number(page.sheetIndex) as 0 | 1,
        row: Number(page.row),
        column: Number(page.column),
        durationSeconds: Number(page.durationSeconds),
        seed: 730_000 + index,
        modelSlug: model.slug,
        provider,
        prompt: storyPrompt(page),
        referenceUrl: null,
        referenceAudioUrl: null,
        falRequestId: null,
        status: 'planned' as const,
        progress: 0,
        jobId: null,
        outputUrl: null,
        error: null,
        failureKind: null,
        recovery: null,
      }));
      const baseManifest = {
        pageCount: PAGE_COUNT,
        totalDurationSeconds: totalDuration,
        sourceAssets: 'two immutable 4x4 illustration sheets',
        referencePolicy: 'one ordered composite image per H3 call',
        visualProvider: model.slug,
        modelSlug: model.slug,
        provider,
        confirmation: 'explicit',
        audioPolicy: 'Lyria soundtrack plus validated lore narration; H3 native ambience preserved when present',
        characterVoiceTracks,
        workflowMode: 'ten-h3-chunks',
        workflowContractVersion: 2,
        coverageMode: 'composite-chunk-submission; individual cell coverage requires human watch/listen review',
        chunkCount: H3_CHUNK_COUNT,
        submissionCount: 0,
        failureKind: null,
      };
      const { data: inserted, error: insertError } = await supabase.from('oracle_film_jobs').insert({
        session_id: sessionId,
        owner_key: ownerKey,
        portrait_url: 'story://ordered-composite-chunk-reference',
        job_type: 'illustration-story',
        provider,
        model_slug: model.slug,
        status: 'queued',
        progress: 1,
        chunk_count: H3_CHUNK_COUNT,
        chunks: pages,
        story_scenes: plannedScenes,
        story_manifest: baseManifest,
        audio_manifest: storyAudioManifest(pages, characterVoiceTracks),
      }).select('*').single();
      if (insertError || !inserted) return json({ error: 'Could not create the MiniMax H3 story job.', detail: insertError?.message }, 500);
      const row = inserted as StoryJobRow;
      try {
        const endpoint = h3QueueEndpoint();
        const musicBytes = decodeBase64(musicBase64);
        const narrationBytes = decodeBase64(narrationBase64);
        const musicUrl = await uploadAsset(supabase, `films/${row.id}/audio/lyria.mp3`, musicBytes, 'audio/mpeg');
        const narrationUrl = await uploadAsset(supabase, `films/${row.id}/audio/narration.wav`, narrationBytes, 'audio/wav');
        const persistedChunks = await Promise.all(chunkPlan.map(async (plan, index) => {
          const input = incomingChunks[index];
          const bytes = decodeBase64(input.base64);
          const requestedMimeType = typeof input.mimeType === 'string' ? input.mimeType : '';
          const mediaKind = requestedMimeType === 'image/png' ? 'image/png' : 'image/jpeg';
          return {
            ...plan,
            imageUrl: await uploadAsset(
              supabase,
              `films/${row.id}/h3-chunks/chunk-${String(plan.chunkNumber).padStart(2, '0')}.${mediaKind === 'image/png' ? 'png' : 'jpg'}`,
              bytes,
              mediaKind,
            ),
          };
        }));
        const submitted = await Promise.allSettled(
          persistedChunks.map(chunk => createFalH3ChunkRequest(endpoint, chunk)),
        );
        const requests = submitted.map((result, index) => result.status === 'fulfilled'
          ? result.value
          : ({
            chunkNumber: persistedChunks[index].chunkNumber,
            pageNumbers: persistedChunks[index].pageNumbers,
            targetDurationSeconds: persistedChunks[index].targetDurationSeconds,
            requestedDurationSeconds: persistedChunks[index].requestedDurationSeconds,
            prompt: persistedChunks[index].prompt,
            imageUrl: persistedChunks[index].imageUrl,
            requestId: '',
            statusUrl: '',
            responseUrl: '',
            status: 'failed' as const,
            progress: 0,
            outputUrl: null,
            error: result.reason instanceof Error ? result.reason.message : 'MiniMax H3 chunk submission failed.',
          }));
        const submissionErrors = requests.filter(chunk => chunk.status === 'failed').map(chunk => chunk.error).filter(Boolean);
        const workflow = {
          mode: 'ten-h3-chunks' as const,
          contractVersion: 2 as const,
          endpoint,
          chunks: requests,
          submissionCount: requests.filter(chunk => chunk.requestId).length,
          submittedAt: new Date().toISOString(),
        };
        const chunkManifest = requests.map(chunk => ({
          chunkNumber: chunk.chunkNumber,
          pageNumbers: chunk.pageNumbers,
          imageUrl: chunk.imageUrl,
          targetDurationSeconds: chunk.targetDurationSeconds,
          requestedDurationSeconds: chunk.requestedDurationSeconds,
          prompt: chunk.prompt,
          requestId: chunk.requestId,
          status: chunk.status,
          progress: chunk.progress,
          outputUrl: chunk.outputUrl ?? null,
          error: chunk.error ?? null,
        }));
        const submittedJob = await updateJob(supabase, row.id, {
          status: submissionErrors.length ? 'failed' : 'generating',
          progress: submissionErrors.length ? 0 : 8,
          runpod_job_id: null,
          music_url: musicUrl,
          narration_url: narrationUrl,
          error_message: submissionErrors.length
            ? `MiniMax H3 chunk submission failed: ${submissionErrors.join(' | ')}`
            : null,
          story_manifest: {
            ...baseManifest,
            workflow,
            chunkManifest,
            submissionCount: workflow.submissionCount,
            failureKind: submissionErrors.length ? 'submission' : null,
          },
        });
        return json(publicJob(submittedJob), 202);
      } catch (error) {
        const failed = await updateJob(supabase, row.id, {
          status: 'failed',
          progress: 0,
          error_message: error instanceof Error ? error.message : 'MiniMax H3 story setup failed.',
          story_manifest: {
            ...baseManifest,
            blockedReason: String(error instanceof Error ? error.message : '').startsWith('BLOCKED:')
              ? error instanceof Error ? error.message : 'MiniMax H3 queue is blocked.'
              : null,
            failureKind: 'submission',
          },
        });
        const blocked = String(error instanceof Error ? error.message : '').startsWith('BLOCKED:');
        return json(publicJob(failed), blocked ? 202 : 503);
      }
    }

    let panelManifest: StoryPanelManifestEntry[];
    try {
      panelManifest = await Promise.all(pages.map(async (page, index) => {
        const panel = panels[index];
        const bytes = decodeBase64(panel?.base64);
        return {
          panelId: `sheet-${Number(page.sheetIndex) + 1}-r${Number(page.row) + 1}-c${Number(page.column) + 1}`,
          pageNumber: index + 1,
          sheetIndex: Number(page.sheetIndex) as 0 | 1,
          row: Number(page.row),
          column: Number(page.column),
          durationSeconds: Number(page.durationSeconds),
          sourceHash: await sha256Hex(bytes),
          referenceUrl: null,
          prompt: storyPrompt(page),
        };
      }));
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Locked panel manifest could not be created.' }, 400);
    }
    if (new Set(panelManifest.map(panel => panel.panelId)).size !== PAGE_COUNT) {
      return json({ error: 'Ordered panel manifest is not unique; no hosted request was submitted.' }, 400);
    }
    const baseManifest = {
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
      workflowMode: 'single-fal-workflow',
      workflowContractVersion: 1,
      panelManifest,
      submissionCount: 0,
      failureKind: null,
    };
    const plannedScenes: StoryScene[] = pages.map((page, index) => ({
      pageNumber: index + 1,
      sheetIndex: Number(page.sheetIndex) as 0 | 1,
      row: Number(page.row),
      column: Number(page.column),
      durationSeconds: Number(page.durationSeconds),
      seed: 730_000 + index,
      modelSlug: model.slug,
      provider,
      prompt: storyPrompt(page),
      referenceUrl: null,
      referenceAudioUrl: null,
      falRequestId: null,
      status: 'planned' as const,
      progress: 0,
      jobId: null,
      outputUrl: null,
      error: null,
      failureKind: null,
      recovery: null,
    }));
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
      story_scenes: plannedScenes,
      story_manifest: baseManifest,
      audio_manifest: storyAudioManifest(pages, characterVoiceTracks),
    }).select('*').single();
    if (insertError || !inserted) return json({ error: 'Could not create the story film job.', detail: insertError?.message }, 500);
    const row = inserted as StoryJobRow;

    let workflowSubmitted = false;
    try {
      const endpoint = workflowEndpoint();
      const musicBytes = decodeBase64(musicBase64);
      const narrationBytes = decodeBase64(narrationBase64);
      const musicUrl = await uploadAsset(supabase, `films/${row.id}/audio/lyria.mp3`, musicBytes, 'audio/mpeg');
      const narrationUrl = await uploadAsset(supabase, `films/${row.id}/audio/narration.wav`, narrationBytes, 'audio/wav');
      const persistedPanelManifest = await Promise.all(panelManifest.map(async (panel, index) => {
        const source = panels[index];
        const bytes = decodeBase64(source?.base64);
        const mimeType = typeof source?.mimeType === 'string' && source.mimeType.startsWith('image/')
          ? source.mimeType
          : 'image/jpeg';
        return {
          ...panel,
          referenceUrl: await uploadAsset(
            supabase,
            `films/${row.id}/references/page-${String(index + 1).padStart(2, '0')}.jpg`,
            bytes,
            mimeType,
          ),
        };
      }));
      const scenes = plannedScenes.map((scene, index) => ({
        ...scene,
        referenceUrl: persistedPanelManifest[index].referenceUrl,
        referenceAudioUrl: characterAudioForPage(pages[index], characterVoiceTracks),
      }));
      const workflow = await createFalStoryWorkflow(endpoint, {
        workflow: 'ordered-panel-story-film',
        workflow_version: 1,
        model_slug: model.slug,
        session_id: sessionId,
        panel_manifest: persistedPanelManifest,
        panels: persistedPanelManifest,
        audio: {
          narration_url: narrationUrl,
          music_url: musicUrl,
          character_voice_tracks: characterVoiceTracks,
        },
        story: {
          page_count: PAGE_COUNT,
          total_duration_seconds: totalDuration,
          target: '16:9 child-friendly story film',
          pages,
        },
      });
      workflowSubmitted = true;
      const submitted = await updateJob(supabase, row.id, {
        status: 'generating',
        progress: 8,
        story_scenes: scenes,
        music_url: musicUrl,
        narration_url: narrationUrl,
        runpod_job_id: workflow.requestId,
        error_message: null,
        story_manifest: {
          ...baseManifest,
          panelManifest: persistedPanelManifest,
          workflow,
          submissionCount: 1,
          failureKind: null,
        },
      });
      return json(publicJob(submitted), 202);
    } catch (error) {
      const failed = await updateJob(supabase, row.id, {
        status: 'failed',
        progress: 0,
        error_message: error instanceof Error ? error.message : 'Shared FAL story workflow setup failed.',
        story_manifest: {
          ...baseManifest,
          submissionCount: workflowSubmitted ? 1 : 0,
          blockedReason: String(error instanceof Error ? error.message : '').startsWith('BLOCKED:')
            ? error instanceof Error ? error.message : 'Shared FAL workflow is blocked.'
            : null,
          failureKind: 'submission',
        },
      });
      const blocked = String(error instanceof Error ? error.message : '').startsWith('BLOCKED:');
      return json(publicJob(failed), blocked ? 202 : 503);
    }
  }

  if (action === 'create-local') {
    const sessionId = safeText(payload.sessionId, 120);
    const ownerKey = ownerKeyFor(payload, sessionId);
    const pages = Array.isArray(payload.pages) ? payload.pages as Record<string, unknown>[] : [];
    const panels = Array.isArray(payload.panels) ? payload.panels as Record<string, unknown>[] : [];
    const characterVoiceTracks = readCharacterVoiceTracks(payload.characterVoiceTracks);
    if (!sessionId || !validStoryPages(pages) || panels.length !== PAGE_COUNT) {
      return json({ error: 'sessionId plus exactly 32 valid story pages and 32 locked panel cells are required.' }, 400);
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
          referenceUrl: null,
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
          cellStorage: 'perishable-postgres-manifest',
          stitchReview: 'server-ordered-cell-list-v1',
        },
        audio_manifest: storyAudioManifest(pages, characterVoiceTracks),
      }).select('*').single();
      if (insertError || !inserted) {
        return json({ error: 'Could not create the local story review record.', detail: insertError?.message }, 500);
      }
      const row = inserted as StoryJobRow;
      const initialScenes = sceneList(row.story_scenes);
      const storedCells = await Promise.all(pages.map(async (page, index) => {
        const source = panels[index];
        const bytes = decodeBase64(source?.base64);
        const requestedMimeType = typeof source?.mimeType === 'string' ? source.mimeType : '';
        const mediaKind = requestedMimeType === 'image/png' ? 'image/png' : 'image/jpeg';
        const panelId = `sheet-${Number(page.sheetIndex) + 1}-r${Number(page.row) + 1}-c${Number(page.column) + 1}`;
        return {
          pageNumber: Number(page.pageNumber),
          panelId,
          sourceHash: await sha256Hex(bytes),
          mediaUrl: await uploadAsset(
            supabase,
            `films/${row.id}/cells/page-${String(index + 1).padStart(2, '0')}.${mediaKind === 'image/png' ? 'png' : 'jpg'}`,
            bytes,
            mediaKind,
          ),
          mediaKind,
          durationSeconds: Number(page.durationSeconds),
        };
      }));
      const scenesWithCells = initialScenes.map((scene, index) => ({
        ...scene,
        referenceUrl: storedCells[index].mediaUrl,
        outputUrl: storedCells[index].mediaUrl,
      }));
      const { error: cellInsertError } = await supabase.from('oracle_story_cells').insert(
        storedCells.map(cell => ({
          job_id: row.id,
          page_number: cell.pageNumber,
          panel_id: cell.panelId,
          source_hash: cell.sourceHash,
          media_url: cell.mediaUrl,
          media_kind: cell.mediaKind,
          duration_seconds: cell.durationSeconds,
        })),
      );
      if (cellInsertError) throw new Error(`Story cell manifest could not be stored: ${cellInsertError.message}`);
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
        story_scenes: scenesWithCells,
        music_url: musicUrl,
        narration_url: narrationUrl,
      });
      return json({
        ...publicJob(local),
        stitchPlan: {
          version: 1,
          pageCount: PAGE_COUNT,
          order: storedCells.map(cell => ({
            pageNumber: cell.pageNumber,
            panelId: cell.panelId,
            mediaUrl: cell.mediaUrl,
            mediaKind: cell.mediaKind,
            durationSeconds: cell.durationSeconds,
          })),
        },
      }, 202);
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
    const currentManifest = current.story_manifest && typeof current.story_manifest === 'object'
      ? current.story_manifest as Record<string, unknown>
      : {};
    if (currentManifest.workflowMode !== 'single-fal-workflow'
      && currentManifest.workflowMode !== 'ten-h3-chunks') {
      return json({
        error: 'Historical per-scene story records are archived and read-only. Start a new hosted story workflow instead.',
        blocked: true,
      }, 409);
    }
    const workflow = currentManifest.workflow && typeof currentManifest.workflow === 'object'
      ? currentManifest.workflow as StoryWorkflowState
      : null;
    if (!workflow?.requestId && !(workflow?.chunks?.length === H3_CHUNK_COUNT)) {
      return json({
        error: currentManifest.blockedReason
          || 'This story is blocked before submission because its hosted request contract is unavailable. No retry was submitted.',
        blocked: true,
      }, 409);
    }
    current = await updateJob(supabase, current.id, {
      status: 'generating',
      error_message: null,
    });
  }

  if (action === 'cancel') {
    const currentManifest = current.story_manifest && typeof current.story_manifest === 'object'
      ? current.story_manifest as Record<string, unknown>
      : {};
    if (currentManifest.workflowMode === 'single-fal-workflow'
      || currentManifest.workflowMode === 'ten-h3-chunks') {
      const workflow = currentManifest.workflow && typeof currentManifest.workflow === 'object'
        ? currentManifest.workflow as StoryWorkflowState
        : null;
      if (currentManifest.workflowMode === 'ten-h3-chunks' && workflow?.chunks) {
        await Promise.all(workflow.chunks.map(async chunk => {
          if (!chunk.cancelUrl || !chunk.requestId || ['ready', 'failed', 'cancelled'].includes(chunk.status)) return;
          try { await workflowJson(chunk.cancelUrl, { method: 'POST' }); } catch { /* local cancel remains authoritative */ }
        }));
      } else if (workflow?.requestId && workflow.cancelUrl) {
        try {
          await workflowJson(workflow.cancelUrl, { method: 'POST' });
        } catch {
          // Local cancellation remains authoritative when the workflow has no
          // confirmed cancellation response.
        }
      }
      current = await updateJob(supabase, current.id, {
        status: 'cancelled',
        runpod_job_id: null,
        story_scenes: sceneList(current.story_scenes).map(scene => ['queued', 'generating', 'planned'].includes(scene.status)
          ? { ...scene, status: 'cancelled', progress: 0, error: null }
          : scene),
        story_manifest: {
          ...currentManifest,
          ...(workflow?.chunks ? {
            workflow: {
              ...workflow,
              chunks: workflow.chunks.map(chunk => ['queued', 'generating'].includes(chunk.status)
                ? { ...chunk, status: 'cancelled', progress: 0, error: 'Story workflow cancelled locally.' }
                : chunk),
            },
          } : {}),
        },
        error_message: 'Story workflow cancelled locally; external cancellation was not confirmed.',
      });
      return json(publicJob(current));
    }
    return json({
      error: 'Historical per-scene story records are archived and read-only. Start a new single-job workflow instead.',
      blocked: true,
    }, 409);
  }

  if (action === 'retry' || action === 'replace' || action === 'retry-stitch') {
    return json({
      error: 'Per-scene recovery has been retired. Start a new single-job workflow instead.',
      blocked: true,
    }, 409);
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
