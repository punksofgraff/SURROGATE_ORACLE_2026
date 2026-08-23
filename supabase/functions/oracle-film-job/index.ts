/**
 * Server-owned Oracle film job boundary.
 *
 * Replit/Supabase owns job state and orchestration. RunPod owns GPU inference
 * and FFmpeg. The browser only sees a job id and sanitized progress/result.
 *
 * Providers:
 * - Direct ComfyUI Pod: RUNPOD_COMFYUI_URL + RUNPOD_API_KEY
 * - Legacy RunPod Serverless: RUNPOD_ENDPOINT_ID + RUNPOD_API_KEY
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
};
const MAX_CHUNK_SECONDS = 5;
const CHUNK_COUNT = 4;
const RUNPOD_TIMEOUT_MS = 12_000;
const COMFY_TIMEOUT_MS = 20_000;

type JobRow = {
  id: string; session_id: string; portrait_url: string; status: string;
  progress: number; chunk_count: number; chunks: unknown; visual_slugs: unknown;
  runpod_job_id: string | null; final_media_url: string | null;
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
    provider: row.runpod_job_id?.startsWith('comfy:') ? 'comfy' : 'runpod',
    status: row.status, progress: row.progress,
    chunkCount: row.chunk_count, chunks: row.chunks,
    finalMediaUrl: row.final_media_url, error: row.error_message,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
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
  if (!base) throw new Error('Seedance Pod is not configured. Add RUNPOD_COMFYUI_URL to enable the GPU film path.');
  return `${base}${path}`;
}

async function comfyFetch(path: string, init: RequestInit = {}, timeoutMs = COMFY_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = new Headers(init.headers);
    const key = Deno.env.get('RUNPOD_API_KEY');
    if (key) headers.set('Authorization', `Bearer ${key}`);
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
    const portraitUrl = safeText(payload.portraitUrl, 2000);
    if (!sessionId || !portraitUrl || !/^https?:\/\//i.test(portraitUrl)) {
      return json({ error: 'sessionId and a hosted portraitUrl are required.' }, 400);
    }
    const context = (payload.context && typeof payload.context === 'object') ? payload.context as Record<string, unknown> : {};
    const audioBase64 = typeof payload.audioBase64 === 'string' ? payload.audioBase64 : '';
    const audioMimeType = safeText(payload.audioMimeType || 'audio/mpeg', 80);
    const slugs = safeSlugs(context.themes ?? context.weightedThemes);
    const archetype = safeText(context.archetypeTitle, 80);
    const emotional = safeText(context.emotionalWeight, 40);
    const continuity = `Oracle materialized film. High-level visual bible: tropical beach bar, palm trees, reggae band, DJ, ocean dusk, ` +
      `surface texture, restrained camera drift, coherent subject silhouette. ${slugs.join(', ')}. ` +
      `${archetype ? `Archetype mood: ${archetype}. ` : ''}${emotional ? `Emotional register: ${emotional}.` : ''}`;
    const chunks = Array.from({ length: CHUNK_COUNT }, (_, index) => ({
      index, durationSeconds: MAX_CHUNK_SECONDS,
      prompt: `${continuity} Shot ${index + 1} of ${CHUNK_COUNT}; preserve the portrait identity and palette. ` +
        (index === 0 ? 'Begin with a still reveal.' : index === CHUNK_COUNT - 1 ? 'Resolve into a quiet held frame.' : 'Continue motion from the previous shot.'),
    }));
    const { data: row, error: insertError } = await supabase.from('oracle_film_jobs').insert({
      session_id: sessionId, portrait_url: portraitUrl, chunks,
      chunk_count: CHUNK_COUNT, visual_slugs: slugs,
    }).select().single();
    if (insertError || !row) return json({ error: 'Could not create film job.', detail: insertError?.message }, 500);
     try {
       let runpodJobId = '';
       if (Deno.env.get('RUNPOD_COMFYUI_URL') && audioBase64) {
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
      if (!runpodJobId) throw new Error('RunPod did not return a job id.');
      const { data: updated } = await supabase.from('oracle_film_jobs').update({
        status: 'generating', progress: 4, runpod_job_id: runpodJobId, updated_at: new Date().toISOString(),
      }).eq('id', row.id).select().single();
      return json(publicJob((updated ?? row) as JobRow), 202);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'RunPod request failed.';
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
   if (current.runpod_job_id && current.runpod_job_id.startsWith('comfy:') && !['ready', 'failed', 'cancelled'].includes(current.status)) {
     try {
       const remote = await comfyJob(current.runpod_job_id.slice('comfy:'.length));
       let finalUrl = current.final_media_url;
       if (remote.status === 'completed' && remote.output) finalUrl = await persistComfyOutput(supabase, jobId, remote.output);
       const nextStatus = remote.status === 'completed' && finalUrl ? 'ready' : remote.status === 'failed' ? 'failed' : 'generating';
       const { data: updated } = await supabase.from('oracle_film_jobs').update({
         status: nextStatus, progress: nextStatus === 'ready' ? 100 : Math.max(current.progress, remote.progress ?? 10),
         final_media_url: finalUrl, error_message: remote.error ?? null, updated_at: new Date().toISOString(),
       }).eq('id', jobId).select().single();
       return json(publicJob((updated ?? current) as JobRow));
     } catch (pollError) {
       return json({ ...publicJob(current), warning: pollError instanceof Error ? pollError.message : 'ComfyUI polling failed; retry shortly.' });
     }
   }

   if (current.runpod_job_id && !current.runpod_job_id.startsWith('comfy:') && !['ready', 'failed', 'cancelled'].includes(current.status)) {
      try { await runpod(`cancel/${encodeURIComponent(current.runpod_job_id)}`, 'POST'); } catch { /* state still must close */ }
    }
    const { data: cancelled } = await supabase.from('oracle_film_jobs').update({
      status: 'cancelled', updated_at: new Date().toISOString(),
    }).eq('id', jobId).select().single();
    return json(publicJob((cancelled ?? current) as JobRow));
  }

  if (current.runpod_job_id && !['ready', 'failed', 'cancelled'].includes(current.status)) {
    try {
      const remote = await runpod(`status/${encodeURIComponent(current.runpod_job_id)}`, 'GET');
      const remoteStatus = safeText(remote.status, 24).toLowerCase();
      const output = remote.output && typeof remote.output === 'object' ? remote.output as Record<string, unknown> : {};
      const finalUrl = safeText(output.final_media_url ?? output.finalMediaUrl ?? output.video_url, 2000);
      const failedMessage = safeText(remote.error, 300);
      const nextStatus = remoteStatus === 'completed' && finalUrl ? 'ready'
        : remoteStatus === 'failed' ? 'failed'
        : remoteStatus === 'processing' ? 'generating' : 'queued';
      const progress = nextStatus === 'ready' ? 100 : nextStatus === 'failed' ? current.progress : Math.max(current.progress, Number(remote.progress) || 10);
      const { data: updated } = await supabase.from('oracle_film_jobs').update({
        status: nextStatus, progress, final_media_url: finalUrl || null,
        error_message: failedMessage || null, updated_at: new Date().toISOString(),
      }).eq('id', jobId).select().single();
      return json(publicJob((updated ?? current) as JobRow));
    } catch (pollError) {
      return json({ ...publicJob(current), warning: pollError instanceof Error ? pollError.message : 'Polling failed; retry shortly.' });
    }
  }
  return json(publicJob(current));
});