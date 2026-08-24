/**
 * Server-owned Oracle film job boundary.
 *
 * Replit/Supabase owns job state and orchestration. RunPod owns GPU inference
 * and FFmpeg. The browser only sees a job id and sanitized progress/result.
 *
 * Providers:
 * - fal Seedance 2.5 image-to-video: FAL_API_KEY
 * - RunPod mux worker: RUNPOD_ENDPOINT_ID + RUNPOD_API_KEY
 * - Direct ComfyUI Pod: RUNPOD_COMFYUI_URL
 * - Legacy RunPod Serverless: RUNPOD_ENDPOINT_ID + RUNPOD_API_KEY
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  isAudioVerificationAcceptable,
  mp3Duration as checkedMp3Duration,
  type AudioVerification,
  verifyOutputAudio as checkedVerifyOutputAudio,
} from './audio-verification.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
};
const MAX_CHUNK_SECONDS = 5;
const CHUNK_COUNT = 4;
const RUNPOD_TIMEOUT_MS = 12_000;
const COMFY_TIMEOUT_MS = 20_000;
const FAL_TIMEOUT_MS = 20_000;
const FAL_MODEL = 'bytedance/seedance-2.5/image-to-video';
const FAL_DURATION = '5';

type JobRow = {
  id: string; session_id: string; portrait_url: string; status: string;
  progress: number; chunk_count: number; chunks: unknown; visual_slugs: unknown;
  runpod_job_id: string | null; final_media_url: string | null;
  anchor_audio_url: string | null; anchor_audio_duration_seconds: number | null;
  error_message: string | null; created_at: string; updated_at: string;
};

type ComfyOutput = { filename?: unknown; subfolder?: unknown; type?: unknown };
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function safeText(value: unknown, max = 120): string {
  return typeof value === 'string'
    ? value.replace(/https?:\/\/\S+/gi, '').replace(/["'`{}<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
    : '';
}

function safeUrl(value: unknown, max = 2000): string {
  return typeof value === 'string'
    ? value.replace(/["'`{}<>]/g, '').trim().slice(0, max)
    : '';
}

function safeSlugs(input: unknown): string[] {
  const values = Array.isArray(input) ? input : [];
  return values.map(value => {
    const raw = value && typeof value === 'object' && 'theme' in value
      ? (value as { theme?: unknown }).theme
      : value;
    return safeText(raw, 48).toLowerCase();
  })
    .filter(value => value && !/copyright|artist|singer|celebrity|style of|in the style/i.test(value))
    .slice(0, 8);
}

function publicJob(row: JobRow) {
  return {
    id: row.id,
    provider: row.runpod_job_id?.startsWith('comfy:')
      ? 'comfy'
      : row.runpod_job_id?.startsWith('fal:')
        ? 'fal'
        : row.runpod_job_id?.startsWith('mux:')
          ? 'fal'
          : 'runpod',
    status: row.status, progress: row.progress,
    chunkCount: row.chunk_count, chunks: row.chunks,
    finalMediaUrl: row.final_media_url, error: row.error_message,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

async function falFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const key = Deno.env.get('FAL_API_KEY');
  if (!key) throw new Error('FAL is not configured. Add FAL_API_KEY before requesting a premium film.');
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
  try { data = JSON.parse(raw); } catch { /* handled below */ }
  if (!response.ok) throw new Error(`FAL ${response.status}: ${safeText(data.error ?? raw, 240)}`);
  return data;
}

async function createFalJob(portraitUrl: string, prompt: string, endUserId: string): Promise<string> {
  const data = await falJson(`/${FAL_MODEL}`, {
    method: 'POST',
    body: JSON.stringify({
      prompt,
      image_url: portraitUrl,
      resolution: '480p',
      duration: FAL_DURATION,
      // Lyria is muxed after the visual completes. Never substitute FAL audio.
      generate_audio: false,
      bitrate_mode: 'standard',
      end_user_id: endUserId,
    }),
  });
  const requestId = safeText(data.request_id, 180);
  if (!requestId) throw new Error('FAL did not return a request id.');
  return `fal:${requestId}`;
}

async function falJob(requestId: string): Promise<{ status: string; progress?: number; output?: string; error?: string }> {
  const status = await falJson(`/bytedance/seedance-2.5/requests/${encodeURIComponent(requestId)}/status`);
  const state = safeText(status.status, 24).toUpperCase();
  if (state === 'COMPLETED') {
    const result = await falJson(`/bytedance/seedance-2.5/requests/${encodeURIComponent(requestId)}`);
    const video = result.video && typeof result.video === 'object' ? result.video as Record<string, unknown> : {};
    const output = safeUrl(video.url, 2000);
    return { status: output ? 'completed' : 'failed', progress: 68, output, error: output ? undefined : 'FAL completed without a video URL.' };
  }
  if (['FAILED', 'ERROR'].includes(state)) return { status: 'failed', progress: 10, error: safeText(status.error, 300) || 'FAL video generation failed.' };
  if (['CANCELED', 'CANCELLED'].includes(state)) return { status: 'cancelled', progress: 10, error: 'FAL video generation was cancelled.' };
  return { status: 'processing', progress: state === 'IN_QUEUE' ? 8 : 32 };
}

async function cancelFalJob(requestId: string): Promise<void> {
  await falJson(`/bytedance/seedance-2.5/requests/${encodeURIComponent(requestId)}/cancel`, { method: 'PUT' });
}

async function runpod(path: string, method: string, body?: unknown): Promise<Record<string, unknown>> {
  const key = Deno.env.get('RUNPOD_API_KEY');
  const endpoint = Deno.env.get('RUNPOD_ENDPOINT_ID');
  if (!key || !endpoint) throw new Error('RunPod worker is not configured. Add RUNPOD_ENDPOINT_ID before requesting a film.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RUNPOD_TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.runpod.ai/v2/${endpoint}/${path}`, {
      method,
      signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(text); } catch { /* handled below */ }
    if (!response.ok) throw new Error(`RunPod ${response.status}: ${safeText(data.error ?? text, 220)}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function comfyUrl(path: string): string {
  const base = Deno.env.get('RUNPOD_COMFYUI_URL')?.replace(/\/+$/, '');
  if (!base) throw new Error('ComfyUI Pod is not configured. Add RUNPOD_COMFYUI_URL to enable the GPU film path.');
  return `${base}${path}`;
}

async function comfyFetch(path: string, init: RequestInit = {}, timeoutMs = COMFY_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = new Headers(init.headers);
    return await fetch(comfyUrl(path), { ...init, headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function uploadComfyFile(bytes: Uint8Array, filename: string, mimeType: string, route = '/upload/image'): Promise<string> {
  const form = new FormData();
  form.append('image', new Blob([bytes.slice().buffer as ArrayBuffer], { type: mimeType }), filename);
  form.append('overwrite', 'true');
  let response = await comfyFetch(route, { method: 'POST', body: form });
  if (!response.ok && route === '/upload/audio') {
    response = await comfyFetch('/upload/image', { method: 'POST', body: form });
  }
  const raw = await response.text();
  if (!response.ok) throw new Error(`ComfyUI upload failed (${response.status}): ${safeText(raw, 220)}`);
  const data = JSON.parse(raw) as { name?: string; subfolder?: string; type?: string };
  return [data.subfolder, data.name].filter(Boolean).join('/');
}

function seedancePrompt(image1: string, image2: string, audio: string, shotPrompt: string): Record<string, Record<string, unknown>> {
  return {
    '18': { class_type: 'LoadImage', inputs: { image: image1 } },
    '27': { class_type: 'LoadImage', inputs: { image: image2 } },
    '28': { class_type: 'LoadAudio', inputs: { audio } },
    '19': {
      class_type: 'ByteDance2ReferenceNode',
      inputs: {
        model: 'Seedance 2.0 Mini',
        prompt: shotPrompt,
        resolution: '720p',
        duration: 5,
        camera_fixed: true,
        seed: 580673600,
        image_1: ['18', 0],
        image_2: ['27', 0],
        audio_1: ['28', 0],
      },
    },
    '20': {
      class_type: 'SaveVideo',
      inputs: { video: ['19', 0], filename_prefix: 'oracle-seedance', format: 'auto', codec: 'auto' },
    },
  };
}

async function createComfyJob(
  jobId: string,
  portraitUrl: string,
  audioBase64: string,
  audioMimeType: string,
  shotPrompt: string,
): Promise<string> {
  const portraitResponse = await fetch(portraitUrl);
  if (!portraitResponse.ok) throw new Error(`Portrait fetch failed (${portraitResponse.status}).`);
  const portraitBytes = new Uint8Array(await portraitResponse.arrayBuffer());
  const audioBytes = Uint8Array.from(atob(audioBase64.replace(/\s/g, '')), char => char.charCodeAt(0));
  const image1 = await uploadComfyFile(portraitBytes, `oracle-${jobId}.png`, 'image/png');
  const image2 = image1;
  const audio = await uploadComfyFile(audioBytes, `oracle-${jobId}.mp3`, audioMimeType, '/upload/audio');
  const response = await comfyFetch('/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: `oracle-${jobId}`, prompt: seedancePrompt(image1, image2, audio, shotPrompt) }),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`ComfyUI prompt failed (${response.status}): ${safeText(raw, 240)}`);
  const data = JSON.parse(raw) as { prompt_id?: string };
  if (!data.prompt_id) throw new Error('ComfyUI did not return a prompt id.');
  return `comfy:${data.prompt_id}`;
}

async function comfyJob(promptId: string): Promise<{ status: string; progress?: number; output?: string; error?: string }> {
  const response = await comfyFetch(`/history/${encodeURIComponent(promptId)}`, {}, COMFY_TIMEOUT_MS);
  const raw = await response.text();
  if (!response.ok) throw new Error(`ComfyUI status failed (${response.status}): ${safeText(raw, 220)}`);
  const history = JSON.parse(raw) as Record<string, { status?: { status_str?: string; completed?: boolean; messages?: unknown[] }; outputs?: Record<string, { videos?: ComfyOutput[]; gifs?: ComfyOutput[] }> }>;
  const item = history[promptId];
  if (!item) return { status: 'processing', progress: 12 };
  const status = item.status?.status_str ?? (item.status?.completed ? 'success' : 'processing');
  const output = Object.values(item.outputs ?? {}).flatMap(value => [...(value.videos ?? []), ...(value.gifs ?? [])])[0];
  if (output?.filename) {
    const params = new URLSearchParams({
      filename: String(output.filename),
      subfolder: String(output.subfolder ?? ''),
      type: String(output.type ?? 'output'),
    });
    return { status: 'completed', progress: 92, output: comfyUrl(`/view?${params.toString()}`) };
  }
  return { status: status === 'error' ? 'failed' : 'processing', progress: 55 };
}

async function persistComfyOutput(supabase: ReturnType<typeof createClient>, jobId: string, outputUrl: string): Promise<string> {
  const response = await fetch(outputUrl);
  if (!response.ok) throw new Error(`ComfyUI media fetch failed (${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const path = `films/${jobId}.mp4`;
  const upload = await supabase.storage.from('oracle-films').upload(path, bytes, { contentType: 'video/mp4', upsert: true });
  if (upload.error) throw new Error(`Supabase film upload failed: ${upload.error.message}`);
  const { data } = supabase.storage.from('oracle-films').getPublicUrl(path);
  return data.publicUrl;
}

async function persistAnchorAudio(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<string> {
  const path = `films/${jobId}/anchor.mp3`;
  const upload = await supabase.storage.from('oracle-films').upload(path, bytes, { contentType: mimeType, upsert: true });
  if (upload.error) throw new Error(`Supabase anchor upload failed: ${upload.error.message}`);
  const { data } = supabase.storage.from('oracle-films').getPublicUrl(path);
  return data.publicUrl;
}

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, false);
}

function boxType(bytes: Uint8Array, offset: number): string {
  return new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8));
}

function mp4DurationAndAudio(bytes: Uint8Array): { durationSeconds: number | null; audioStreamPresent: boolean } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let movieTimescale = 0;
  let movieDuration = 0;
  let audioStreamPresent = false;
  const walk = (start: number, end: number, inAudioTrack = false) => {
    let offset = start;
    while (offset + 8 <= end) {
      let size = readU32(view, offset);
      const type = boxType(bytes, offset);
      let header = 8;
      if (size === 1 && offset + 16 <= end) {
        const high = readU32(view, offset + 8);
        const low = readU32(view, offset + 12);
        size = high * 2 ** 32 + low;
        header = 16;
      } else if (size === 0) size = end - offset;
      if (size < header || offset + size > end) break;
      const body = offset + header;
      const child = type === 'moov' || type === 'trak' || type === 'mdia' || type === 'minf' || type === 'stbl';
      let trackIsAudio = inAudioTrack;
      if (type === 'hdlr' && body + 12 <= offset + size) {
        trackIsAudio = new TextDecoder().decode(bytes.subarray(body + 8, body + 12)) === 'soun';
        if (trackIsAudio) audioStreamPresent = true;
      }
      if (type === 'mvhd' && body + 20 <= offset + size) {
        const version = bytes[body];
        const timescaleOffset = version === 1 ? body + 20 : body + 12;
        const durationOffset = version === 1 ? body + 24 : body + 16;
        if (durationOffset + (version === 1 ? 8 : 4) <= offset + size) {
          movieTimescale = readU32(view, timescaleOffset);
          movieDuration = version === 1
            ? readU32(view, durationOffset) * 2 ** 32 + readU32(view, durationOffset + 4)
            : readU32(view, durationOffset);
        }
      }
      if (child) walk(body, offset + size, trackIsAudio);
      offset += size;
    }
  };
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.subarray(4, 8)) === 'ftyp') walk(0, bytes.length);
  return {
    durationSeconds: movieTimescale > 0 ? movieDuration / movieTimescale : null,
    audioStreamPresent,
  };
}

// MPEG frame headers are sufficient to get reliable timing for the supplied
// MP3 without depending on a decoder in the Supabase Edge runtime.
function mp3Duration(bytes: Uint8Array): number | null {
  let offset = 0;
  let duration = 0;
  let frames = 0;
  while (offset + 4 <= bytes.length && frames < 500000) {
    if (bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) { offset++; continue; }
    const version = (bytes[offset + 1] >> 3) & 3;
    const layer = (bytes[offset + 1] >> 1) & 3;
    const bitrateIndex = (bytes[offset + 2] >> 4) & 15;
    const sampleIndex = (bytes[offset + 2] >> 2) & 3;
    const padding = (bytes[offset + 2] >> 1) & 1;
    if (layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || sampleIndex === 3 || version === 1) { offset++; continue; }
    const rates = version === 3 ? [44100, 48000, 32000] : version === 2 ? [22050, 24000, 16000] : [11025, 12000, 8000];
    const kbps = version === 3
      ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320][bitrateIndex]
      : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160][bitrateIndex];
    const frameLength = Math.floor((version === 3 ? 144 : 72) * kbps * 1000 / rates[sampleIndex]) + padding;
    if (frameLength < 5 || offset + frameLength > bytes.length) { offset++; continue; }
    duration += (version === 3 ? 1152 : 576) / rates[sampleIndex];
    offset += frameLength;
    frames++;
  }
  return frames ? duration : null;
}

async function verifyOutputAudio(
  outputBytes: Uint8Array,
  anchorBytes: Uint8Array,
): Promise<AudioVerification> {
  const output = mp4DurationAndAudio(outputBytes);
  const anchorDuration = mp3Duration(anchorBytes);
  const delta = anchorDuration !== null && output.durationSeconds !== null
    ? Math.abs(anchorDuration - output.durationSeconds) : null;
  // Seedance may re-encode the anchor, so byte equality is not a valid test.
  // Container timing is the portable Edge-runtime proxy; a real waveform
  // decoder can be enabled by a worker later without changing this contract.
  const durationMatch = delta !== null && delta <= Math.max(0.75, anchorDuration * 0.05);
  return {
    playable: output.audioStreamPresent && output.durationSeconds !== null,
    anchorDurationSeconds: anchorDuration,
    outputDurationSeconds: output.durationSeconds,
    durationDeltaSeconds: delta,
    audioStreamPresent: output.audioStreamPresent,
    waveformCompared: false,
    waveformMatch: null,
    method: 'mp4-audio-track-and-mp3-frame-timing',
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  let payload: Record<string, unknown> = {};
  if (req.method === 'POST') {
    try { payload = await req.json(); } catch { return json({ error: 'Invalid JSON.' }, 400); }
  } else if (req.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);

  const action = safeText(payload.action ?? new URL(req.url).searchParams.get('action') ?? 'status', 24);
  const jobId = safeText(payload.jobId ?? new URL(req.url).searchParams.get('jobId'), 64);

  if (action === 'create') {
    const sessionId = safeText(payload.sessionId, 100);
    const portraitUrl = safeUrl(payload.portraitUrl, 2000);
    if (!sessionId || !portraitUrl || !/^https?:\/\//i.test(portraitUrl)) {
      return json({ error: 'sessionId and a hosted portraitUrl are required.' }, 400);
    }
     const renderMode = safeText(payload.renderMode || 'premium', 16).toLowerCase();
     if (renderMode !== 'premium') {
       return json({ error: 'Local films are rendered in the browser. Use renderMode=premium for RunPod generation.' }, 400);
     }
     const context = (payload.context && typeof payload.context === 'object') ? payload.context as Record<string, unknown> : {};
    const audioBase64 = typeof payload.audioBase64 === 'string' ? payload.audioBase64 : '';
    const audioMimeType = safeText(payload.audioMimeType || 'audio/mpeg', 80);
     if (!audioBase64) {
       return json({ error: 'Premium films require the existing Lyria soundtrack as audioBase64.' }, 400);
     }
    const slugs = safeSlugs(context.themes ?? context.weightedThemes);
    const archetype = safeText(context.archetypeTitle, 80);
    const emotional = safeText(context.emotionalWeight, 40);
    const continuity = `Oracle materialized film. High-level visual bible: tropical beach bar, palm trees, reggae band, DJ, ocean dusk, ` +
      `surface texture, restrained camera drift, coherent subject silhouette. ${slugs.join(', ')}. ` +
      `${archetype ? `Archetype mood: ${archetype}. ` : ''}${emotional ? `Emotional register: ${emotional}.` : ''}`;
     const requestedProvider = safeText(payload.provider || 'fal', 16).toLowerCase();
     if (!['fal', 'runpod'].includes(requestedProvider)) {
       return json({ error: 'Unsupported premium provider.' }, 400);
     }
     const chunks = Array.from({ length: requestedProvider === 'fal' ? 1 : CHUNK_COUNT }, (_, index) => ({
      index, durationSeconds: MAX_CHUNK_SECONDS,
       prompt: `${continuity} Shot ${index + 1} of ${requestedProvider === 'fal' ? 1 : CHUNK_COUNT}; preserve the portrait identity and palette. ` +
         (index === 0 ? 'Begin with a still reveal.' : index === CHUNK_COUNT - 1 ? 'Resolve into a quiet held frame.' : 'Continue motion from the previous shot.'),
    }));
    const { data: row, error: insertError } = await supabase.from('oracle_film_jobs').insert({
      session_id: sessionId, portrait_url: portraitUrl, chunks,
       chunk_count: chunks.length, visual_slugs: slugs,
    }).select().single();
    if (insertError || !row) return json({ error: 'Could not create film job.', detail: insertError?.message }, 500);
     try {
       let runpodJobId = '';
       let anchorAudioUrl: string | null = null;
       if (audioBase64) {
         const anchorBytes = Uint8Array.from(atob(audioBase64.replace(/\s/g, '')), char => char.charCodeAt(0));
         anchorAudioUrl = await persistAnchorAudio(supabase, row.id, anchorBytes, audioMimeType);
         await supabase.from('oracle_film_jobs').update({
           anchor_audio_url: anchorAudioUrl,
            anchor_audio_duration_seconds: checkedMp3Duration(anchorBytes),
         }).eq('id', row.id);
       }
         if (requestedProvider === 'fal') {
           runpodJobId = await createFalJob(
             portraitUrl,
             `${continuity} ${chunks[0].prompt} ${typeof context.prompt === 'string' ? safeText(context.prompt, 500) : ''}`,
             sessionId,
           );
         } else {
         // Premium generation uses the on-demand Serverless/model-template API
        // by default. Direct ComfyUI is retained only as an explicit legacy
        // route, so an idle Pod is never required by the browser experience.
        const route = safeText(Deno.env.get('RUNPOD_FILM_ROUTE') || 'template', 24).toLowerCase();
        if (route === 'comfy' && Deno.env.get('RUNPOD_COMFYUI_URL') && audioBase64) {
         runpodJobId = await createComfyJob(
           row.id,
           portraitUrl,
           audioBase64,
           audioMimeType,
           `${continuity} Reggae drum and bass soundtrack is the audio anchor; preserve its rhythm and timing. ${typeof context.prompt === 'string' ? safeText(context.prompt, 500) : ''}`,
         );
       } else {
         const run = await runpod('run', 'POST', {
           input: {
             task: 'materialize_oracle_film',
             portrait_url: portraitUrl,
             chunks,
             continuity,
             audio_base64: audioBase64 || undefined,
             audio_mime_type: audioMimeType,
             output: { codec: 'h264', pixelFormat: 'yuv420p', frameRate: 24, audio: Boolean(audioBase64) },
           },
         });
         runpodJobId = typeof run.id === 'string' ? run.id : '';
         }
       }
       if (!runpodJobId) throw new Error(`${requestedProvider === 'fal' ? 'FAL' : 'RunPod'} did not return a job id.`);
      const { data: updated } = await supabase.from('oracle_film_jobs').update({
        status: 'generating', progress: 4, runpod_job_id: runpodJobId, updated_at: new Date().toISOString(),
      }).eq('id', row.id).select().single();
      return json(publicJob((updated ?? row) as JobRow), 202);
    } catch (error) {
       const message = error instanceof Error ? error.message : `${requestedProvider === 'fal' ? 'FAL' : 'RunPod'} request failed.`;
      const { data: failed } = await supabase.from('oracle_film_jobs').update({
        status: 'failed', error_message: message.slice(0, 300), updated_at: new Date().toISOString(),
      }).eq('id', row.id).select().single();
      return json(publicJob((failed ?? row) as JobRow), 503);
    }
  }

  if (!jobId) return json({ error: 'jobId is required.' }, 400);
  const { data: row, error } = await supabase.from('oracle_film_jobs').select('*').eq('id', jobId).maybeSingle();
  if (error || !row) return json({ error: 'Film job not found.' }, 404);
  const current = row as JobRow;

  if (action === 'cancel') {
    if (current.runpod_job_id?.startsWith('fal:') && !['ready', 'failed', 'cancelled'].includes(current.status)) {
      try { await cancelFalJob(current.runpod_job_id.slice('fal:'.length)); } catch { /* close local state even if remote cancel races */ }
      const { data: cancelled } = await supabase.from('oracle_film_jobs').update({
        status: 'cancelled', updated_at: new Date().toISOString(),
      }).eq('id', jobId).select().single();
      return json(publicJob((cancelled ?? current) as JobRow));
    }

   if (current.runpod_job_id && current.runpod_job_id.startsWith('comfy:') && !['ready', 'failed', 'cancelled'].includes(current.status)) {
     try {
       const remote = await comfyJob(current.runpod_job_id.slice('comfy:'.length));
       let finalUrl = current.final_media_url;
       let verified: AudioVerification | null = null;
       if (remote.status === 'completed' && remote.output && current.anchor_audio_url) {
         const [videoResponse, anchorResponse] = await Promise.all([
           fetch(remote.output),
           fetch(current.anchor_audio_url),
         ]);
         if (!videoResponse.ok || !anchorResponse.ok) throw new Error('Could not fetch media for audio verification.');
          verified = await checkedVerifyOutputAudio(
           new Uint8Array(await videoResponse.arrayBuffer()),
           new Uint8Array(await anchorResponse.arrayBuffer()),
         );
          if (!isAudioVerificationAcceptable(verified)) {
            const message = `Seedance output failed audio-anchor verification (audio=${verified.audioStreamPresent}, duration delta=${verified.durationDeltaSeconds ?? 'unknown'}s).`;
            const { data: failed } = await supabase.from('oracle_film_jobs').update({
              status: 'failed', progress: current.progress, final_media_url: null,
              error_message: message, audio_stream_present: verified.audioStreamPresent,
              audio_waveform_match: verified.waveformMatch,
              output_duration_seconds: verified.outputDurationSeconds,
              audio_verification: verified, updated_at: new Date().toISOString(),
            }).eq('id', jobId).select().single();
            return json(publicJob((failed ?? current) as JobRow));
         }
         finalUrl = await persistComfyOutput(supabase, jobId, remote.output);
       }
       const { data: updated } = await supabase.from('oracle_film_jobs').update({
         status: remote.status === 'completed' && finalUrl && verified ? 'ready' : remote.status === 'failed' ? 'failed' : 'generating',
         progress: remote.status === 'completed' && finalUrl && verified ? 100 : Math.max(current.progress, remote.progress ?? 10),
         final_media_url: finalUrl || null, error_message: remote.error ?? null,
         audio_stream_present: verified?.audioStreamPresent ?? null,
         audio_waveform_match: verified?.waveformMatch ?? null,
         output_duration_seconds: verified?.outputDurationSeconds ?? null,
         audio_verification: verified,
         updated_at: new Date().toISOString(),
       }).eq('id', jobId).select().single();
       return json(publicJob((updated ?? current) as JobRow));
     } catch (pollError) {
       return json({ ...publicJob(current), warning: pollError instanceof Error ? pollError.message : 'ComfyUI polling failed; retry shortly.' });
     }
   }

    if (current.runpod_job_id && !current.runpod_job_id.startsWith('comfy:') && !current.runpod_job_id.startsWith('fal:') && !['ready', 'failed', 'cancelled'].includes(current.status)) {
       const remoteId = current.runpod_job_id.startsWith('mux:')
         ? current.runpod_job_id.slice('mux:'.length)
         : current.runpod_job_id;
       try { await runpod(`cancel/${encodeURIComponent(remoteId)}`, 'POST'); } catch { /* state still must close */ }
    }
    const { data: cancelled } = await supabase.from('oracle_film_jobs').update({
      status: 'cancelled', updated_at: new Date().toISOString(),
    }).eq('id', jobId).select().single();
    return json(publicJob((cancelled ?? current) as JobRow));
  }

  if (current.runpod_job_id?.startsWith('fal:') && !['ready', 'failed', 'cancelled'].includes(current.status)) {
    const falRequestId = current.runpod_job_id.slice('fal:'.length);
    if (Date.now() - Date.parse(current.created_at) > 10 * 60 * 1000) {
      try { await cancelFalJob(falRequestId); } catch { /* timeout is already terminal locally */ }
      const { data: timedOut } = await supabase.from('oracle_film_jobs').update({
        status: 'failed', error_message: 'FAL film generation timed out after 10 minutes.',
        updated_at: new Date().toISOString(),
      }).eq('id', jobId).select().single();
      return json(publicJob((timedOut ?? current) as JobRow));
    }
    try {
      const remote = await falJob(falRequestId);
      if (remote.status === 'completed' && remote.output && current.anchor_audio_url) {
        // FAL is visual-only by design. The existing RunPod endpoint performs
        // the small, deterministic FFmpeg mux with the Lyria anchor.
        const mux = await runpod('run', 'POST', {
          input: {
            task: 'mux_oracle_film',
            video_url: remote.output,
            audio_url: current.anchor_audio_url,
          },
        });
        const muxId = typeof mux.id === 'string' ? mux.id : '';
        if (!muxId) throw new Error('RunPod did not return the audio-mux job id.');
        const { data: queuedMux } = await supabase.from('oracle_film_jobs').update({
          status: 'generating', progress: 72, runpod_job_id: `mux:${muxId}`,
          updated_at: new Date().toISOString(),
        }).eq('id', jobId).select().single();
        return json(publicJob((queuedMux ?? current) as JobRow));
      }
      const { data: updated } = await supabase.from('oracle_film_jobs').update({
        status: remote.status === 'failed' ? 'failed' : remote.status === 'cancelled' ? 'cancelled' : 'generating',
        progress: Math.max(current.progress, remote.progress ?? 8),
        error_message: remote.error ?? null,
        updated_at: new Date().toISOString(),
      }).eq('id', jobId).select().single();
      return json(publicJob((updated ?? current) as JobRow));
    } catch (pollError) {
      return json({ ...publicJob(current), warning: pollError instanceof Error ? pollError.message : 'FAL polling failed; retry shortly.' });
    }
  }

  if (current.runpod_job_id && !['ready', 'failed', 'cancelled'].includes(current.status)) {
     try {
       const remoteId = current.runpod_job_id.startsWith('mux:')
         ? current.runpod_job_id.slice('mux:'.length)
         : current.runpod_job_id;
       const remote = await runpod(`status/${encodeURIComponent(remoteId)}`, 'GET');
      const remoteStatus = safeText(remote.status, 24).toLowerCase();
      const output = remote.output && typeof remote.output === 'object' ? remote.output as Record<string, unknown> : {};
       let finalUrl = safeText(output.final_media_url ?? output.finalMediaUrl ?? output.video_url, 2000);
      const failedMessage = safeText(remote.error, 300);
       let verified: AudioVerification | null = null;
       if (remoteStatus === 'completed' && finalUrl && current.anchor_audio_url) {
         const [videoResponse, anchorResponse] = await Promise.all([fetch(finalUrl), fetch(current.anchor_audio_url)]);
         if (!videoResponse.ok || !anchorResponse.ok) throw new Error('Could not fetch media for audio verification.');
          verified = await checkedVerifyOutputAudio(
           new Uint8Array(await videoResponse.arrayBuffer()),
           new Uint8Array(await anchorResponse.arrayBuffer()),
         );
          if (!isAudioVerificationAcceptable(verified)) {
            const message = `RunPod output failed audio-anchor verification (audio=${verified.audioStreamPresent}, duration delta=${verified.durationDeltaSeconds ?? 'unknown'}s).`;
            const { data: failed } = await supabase.from('oracle_film_jobs').update({
              status: 'failed', progress: current.progress, final_media_url: null,
              error_message: message, audio_stream_present: verified.audioStreamPresent,
              audio_waveform_match: verified.waveformMatch,
              output_duration_seconds: verified.outputDurationSeconds,
              audio_verification: verified, updated_at: new Date().toISOString(),
            }).eq('id', jobId).select().single();
            return json(publicJob((failed ?? current) as JobRow));
         }
       }
        const isReady = remoteStatus === 'completed' && Boolean(finalUrl) && Boolean(verified);
       const status = isReady ? 'ready' : remoteStatus === 'failed' ? 'failed' : remoteStatus === 'processing' ? 'generating' : 'queued';
       const progress = status === 'ready' ? 100 : status === 'failed' ? current.progress : Math.max(current.progress, Number(remote.progress) || 10);
      const { data: updated } = await supabase.from('oracle_film_jobs').update({
         status, progress, final_media_url: finalUrl || null,
         error_message: failedMessage || null,
         audio_stream_present: verified?.audioStreamPresent ?? null,
         audio_waveform_match: verified?.waveformMatch ?? null,
         output_duration_seconds: verified?.outputDurationSeconds ?? null,
         audio_verification: verified,
         updated_at: new Date().toISOString(),
      }).eq('id', jobId).select().single();
      return json(publicJob((updated ?? current) as JobRow));
    } catch (pollError) {
      return json({ ...publicJob(current), warning: pollError instanceof Error ? pollError.message : 'Polling failed; retry shortly.' });
    }
  }
  return json(publicJob(current));
});