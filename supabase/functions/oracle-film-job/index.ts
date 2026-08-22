/**
 * Server-owned Oracle film job boundary.
 *
 * Replit/Supabase owns job state and orchestration. RunPod owns GPU inference
 * and FFmpeg. The browser only sees a job id and sanitized progress/result.
 *
 * RunPod worker contract:
 * POST /run
 * { input: { task: "materialize_oracle_film", portrait_url, chunks,
 *            continuity, output: { codec: "h264", audio: false } } }
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

type JobRow = {
  id: string; session_id: string; portrait_url: string; status: string;
  progress: number; chunk_count: number; chunks: unknown; visual_slugs: unknown;
  runpod_job_id: string | null; final_media_url: string | null;
  error_message: string | null; created_at: string; updated_at: string;
};

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
    id: row.id, status: row.status, progress: row.progress,
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
    const slugs = safeSlugs(context.themes ?? context.weightedThemes);
    const archetype = safeText(context.archetypeTitle, 80);
    const emotional = safeText(context.emotionalWeight, 40);
    const continuity = `Oracle materialized film. High-level visual bible: neon alley, stitched phosphor, ` +
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
      const run = await runpod('run', 'POST', {
        input: { task: 'materialize_oracle_film', portrait_url: portraitUrl, chunks, continuity,
          output: { codec: 'h264', pixelFormat: 'yuv420p', frameRate: 24, audio: false } },
      });
      const runpodJobId = typeof run.id === 'string' ? run.id : '';
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
    if (current.runpod_job_id && !['ready', 'failed', 'cancelled'].includes(current.status)) {
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