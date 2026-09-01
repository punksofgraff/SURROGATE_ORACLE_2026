/**
 * Server-owned premium story-film job.
 *
 * A story is not a still-image render. Every page gets its own durable panel
 * reference, FAL Seedance request, and recoverable output. RunPod only receives
 * stable scene URLs after all visual scenes complete, then stitches and muxes
 * the persisted Lyria and Gemini narration tracks into the final MP4.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
};
const PAGE_COUNT = 32;
const FAL_MODEL = 'bytedance/seedance-2.5/image-to-video';
const FAL_QUEUE_MODEL = 'bytedance/seedance-2.5';
const FAL_TIMEOUT_MS = 20_000;
const RUNPOD_TIMEOUT_MS = 12_000;

type StoryScene = {
  pageNumber: number;
  sheetIndex: 0 | 1;
  row: number;
  column: number;
  durationSeconds: number;
  seed: number;
  prompt: string;
  referenceUrl: string | null;
  falRequestId: string | null;
  status: 'planned' | 'queued' | 'generating' | 'ready' | 'failed' | 'cancelled';
  progress: number;
  jobId: string | null;
  outputUrl: string | null;
  error: string | null;
};

type StoryJobRow = {
  id: string;
  session_id: string;
  job_type: string;
  status: string;
  progress: number;
  chunk_count: number;
  chunks: unknown;
  story_scenes: unknown;
  story_manifest: unknown;
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

function decodeBase64(value: unknown): Uint8Array {
  if (typeof value !== 'string' || value.length < 8 || value.length > 20_000_000) {
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

function publicJob(row: StoryJobRow) {
  const scenes = sceneList(row.story_scenes);
  return {
    id: row.id,
    provider: 'fal',
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
      status: scene.status,
      progress: scene.progress,
      jobId: scene.jobId,
      outputUrl: scene.outputUrl,
      error: scene.error,
    })),
    finalMediaUrl: row.final_media_url,
    narrationUrl: row.narration_url,
    musicUrl: row.music_url,
    error: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function falFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const key = Deno.env.get('FAL_API_KEY');
  if (!key) throw new Error('FAL is not configured. Add FAL_API_KEY before starting this premium story.');
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
    throw new Error(`FAL ${response.status}: ${safeText(data.error ?? raw, 240)}`);
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

async function createFalScene(referenceUrl: string, prompt: string, sessionId: string, seed: number): Promise<string> {
  const data = await falJson(`/${FAL_MODEL}`, {
    method: 'POST',
    body: JSON.stringify({
      prompt: providerStoryLanguage(prompt),
      image_url: referenceUrl,
      resolution: '480p',
      duration: '5',
      generate_audio: false,
      bitrate_mode: 'standard',
      seed,
      end_user_id: sessionId,
    }),
  });
  const requestId = safeText(data.request_id, 180);
  if (!requestId) throw new Error('FAL did not return a request id for this story page.');
  return requestId;
}

async function pollFalScene(requestId: string): Promise<{ status: StoryScene['status']; progress: number; output?: string; error?: string }> {
  const status = await falJson(`/${FAL_QUEUE_MODEL}/requests/${encodeURIComponent(requestId)}/status`);
  const state = safeText(status.status, 24).toUpperCase();
  if (state === 'COMPLETED') {
    const result = await falJson(`/${FAL_QUEUE_MODEL}/requests/${encodeURIComponent(requestId)}`);
    const video = result.video && typeof result.video === 'object'
      ? result.video as Record<string, unknown>
      : {};
    const output = safeUrl(video.url, 4000);
    return output
      ? { status: 'ready', progress: 100, output }
      : { status: 'failed', progress: 0, error: 'FAL completed without a video URL.' };
  }
  if (state === 'FAILED' || state === 'ERROR') {
    return { status: 'failed', progress: 0, error: safeText(status.error, 300) || 'FAL page animation failed.' };
  }
  if (state === 'CANCELED' || state === 'CANCELLED') {
    return { status: 'cancelled', progress: 0, error: 'FAL page animation was cancelled.' };
  }
  return { status: state === 'IN_QUEUE' ? 'queued' : 'generating', progress: state === 'IN_QUEUE' ? 8 : 38 };
}

async function cancelFalScene(requestId: string): Promise<void> {
  await falJson(`/${FAL_QUEUE_MODEL}/requests/${encodeURIComponent(requestId)}/cancel`, { method: 'PUT' });
}

async function runpod(path: string, method: string, body?: unknown): Promise<Record<string, unknown>> {
  const key = Deno.env.get('RUNPOD_API_KEY');
  const endpoint = Deno.env.get('RUNPOD_ENDPOINT_ID');
  if (!key || !endpoint) {
    throw new Error('RunPod story stitcher is not configured. Add RUNPOD_ENDPOINT_ID before starting this premium story.');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RUNPOD_TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.runpod.ai/v2/${endpoint}/${path}`, {
      method,
      signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const raw = await response.text();
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(raw); } catch { /* handled below */ }
    if (!response.ok) throw new Error(`RunPod ${response.status}: ${safeText(data.error ?? raw, 240)}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
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
    const remoteId = current.runpod_job_id.slice('story-mux:'.length);
    const remote = await runpod(`status/${encodeURIComponent(remoteId)}`, 'GET');
    const remoteStatus = safeText(remote.status, 24).toLowerCase();
    const output = remote.output && typeof remote.output === 'object'
      ? remote.output as Record<string, unknown>
      : {};
    const finalUrl = safeUrl(output.final_media_url ?? output.finalMediaUrl ?? output.video_url, 4000);
    if (remoteStatus === 'completed' && finalUrl) {
      const audioPresent = output.audio_stream_present === true;
      const renderedDuration = Number(output.duration_seconds);
      const requestedDuration = sceneList(current.story_scenes)
        .reduce((sum, scene) => sum + Number(scene.durationSeconds || 0), 0);
      const durationMatches = Number.isFinite(renderedDuration)
        && Math.abs(renderedDuration - requestedDuration) <= 1;
      if (!audioPresent || !durationMatches) {
        return updateJob(supabase, current.id, {
          status: 'failed',
          progress: current.progress,
          final_media_url: null,
          error_message: `Story output failed the final media gate (audio=${audioPresent}, duration=${Number.isFinite(renderedDuration) ? renderedDuration : 'unknown'}s).`,
          story_manifest: {
            ...(current.story_manifest && typeof current.story_manifest === 'object' ? current.story_manifest : {}),
            audioVerification: {
              audioStreamPresent: audioPresent,
              outputDurationSeconds: Number.isFinite(renderedDuration) ? renderedDuration : null,
              requestedDurationSeconds: requestedDuration,
              durationMatch: durationMatches,
            },
          },
        });
      }
      return updateJob(supabase, current.id, {
        status: 'ready',
        progress: 100,
        final_media_url: finalUrl,
        error_message: null,
        story_manifest: {
          ...(current.story_manifest && typeof current.story_manifest === 'object' ? current.story_manifest : {}),
          audioVerification: {
            audioStreamPresent: audioPresent,
            outputDurationSeconds: renderedDuration,
            requestedDurationSeconds: requestedDuration,
            durationMatch: true,
          },
        },
      });
    }
    if (remoteStatus === 'failed') {
      return updateJob(supabase, current.id, {
        status: 'failed',
        error_message: safeText(remote.error, 300) || 'Server-side story stitching failed.',
      });
    }
    return updateJob(supabase, current.id, {
      status: 'stitching',
      progress: Math.max(current.progress, Number(remote.progress) || 82),
    });
  }

  const scenes = sceneList(current.story_scenes);
  const changed = await Promise.all(scenes.map(async (scene) => {
    if (!scene.falRequestId || !['queued', 'generating'].includes(scene.status)) return scene;
    try {
      const next = await pollFalScene(scene.falRequestId);
      if (next.status === 'ready' && next.output) {
        const stableUrl = await persistRemoteScene(supabase, current.id, scene.pageNumber, next.output);
        return { ...scene, status: 'ready' as const, progress: 100, outputUrl: stableUrl, error: null };
      }
      return { ...scene, status: next.status, progress: next.progress, error: next.error ?? null };
    } catch (error) {
      return {
        ...scene,
        status: 'failed' as const,
        progress: 0,
        error: error instanceof Error ? error.message : 'FAL page retrieval failed.',
      };
    }
  }));

  const readyCount = changed.filter(scene => scene.status === 'ready').length;
  const failedCount = changed.filter(scene => scene.status === 'failed').length;
  const visualProgress = Math.round((readyCount / PAGE_COUNT) * 70);
  const nextScenes = JSON.stringify(changed) !== JSON.stringify(scenes) ? changed : scenes;

  if (failedCount > 0 && readyCount + failedCount === PAGE_COUNT) {
    return updateJob(supabase, current.id, {
      story_scenes: nextScenes,
      status: 'failed',
      progress: Math.max(current.progress, 10 + visualProgress),
      error_message: `${failedCount} page animation${failedCount === 1 ? '' : 's'} failed. Retry the individual page.`,
    });
  }

  if (readyCount === PAGE_COUNT && changed.every(scene => scene.outputUrl)) {
    const stitch = await runpod('run', 'POST', {
      input: {
        task: 'stitch_oracle_story',
        scene_urls: changed.map(scene => scene.outputUrl),
        durations: changed.map(scene => scene.durationSeconds),
        music_url: current.music_url,
        narration_url: current.narration_url,
      },
    });
    const stitchId = typeof stitch.id === 'string' ? stitch.id : '';
    if (!stitchId) throw new Error('RunPod did not return the story stitch job id.');
    return updateJob(supabase, current.id, {
      story_scenes: changed,
      status: 'stitching',
      progress: 78,
      runpod_job_id: `story-mux:${stitchId}`,
      error_message: null,
    });
  }

  return updateJob(supabase, current.id, {
    story_scenes: nextScenes,
    status: 'generating',
    progress: Math.max(current.progress, 10 + visualProgress),
    error_message: failedCount
      ? `${failedCount} page${failedCount === 1 ? '' : 's'} need a retry; remaining pages are still generating.`
      : null,
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

  if (action === 'latest') {
    const sessionId = safeText(payload.sessionId ?? url.searchParams.get('sessionId'), 120);
    if (!sessionId) return json({ error: 'sessionId is required.' }, 400);
    const { data: latest, error: latestError } = await supabase.from('oracle_film_jobs')
      .select('*')
      .eq('session_id', sessionId)
      .eq('job_type', 'illustration-story')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) return json({ error: 'Could not load the latest story film job.' }, 500);
    return json(latest ? publicJob(latest as StoryJobRow) : { job: null });
  }

  if (action === 'create') {
    const sessionId = safeText(payload.sessionId, 120);
    const pages = Array.isArray(payload.pages) ? payload.pages as Record<string, unknown>[] : [];
    const panels = Array.isArray(payload.panels) ? payload.panels as Record<string, unknown>[] : [];
    const musicBase64 = payload.musicBase64;
    const narrationBase64 = payload.narrationBase64;
    if (!sessionId || pages.length !== PAGE_COUNT || panels.length !== PAGE_COUNT) {
      return json({ error: 'sessionId plus exactly 32 pages and 32 locked panel references are required.' }, 400);
    }
    if (typeof musicBase64 !== 'string' || typeof narrationBase64 !== 'string') {
      return json({ error: 'Premium story production requires real Lyria music and Gemini narration audio.' }, 400);
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
      portrait_url: 'story://locked-panel-reference',
      job_type: 'illustration-story',
      status: 'queued',
      progress: 1,
      chunk_count: PAGE_COUNT,
      chunks: pages,
      story_manifest: {
        pageCount: PAGE_COUNT,
        totalDurationSeconds: totalDuration,
        sourceAssets: 'two immutable 4x4 illustration sheets',
        referencePolicy: 'one persisted panel image per page',
        visualProvider: 'fal-seedance-2.5-image-to-video',
        audioPolicy: 'Lyria soundtrack plus Gemini child-friendly narration',
      },
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
          try {
            const panelBytes = decodeBase64(panel?.base64);
            const mimeType = typeof panel?.mimeType === 'string' && panel.mimeType.startsWith('image/')
              ? panel.mimeType
              : 'image/jpeg';
            const referenceUrl = await uploadAsset(
              supabase,
              `films/${row.id}/references/page-${String(index + 1).padStart(2, '0')}.jpg`,
              panelBytes,
              mimeType,
            );
            const seed = 730_000 + index;
            const requestId = await createFalScene(referenceUrl, storyPrompt(page), sessionId, seed);
            return {
              pageNumber: index + 1,
              sheetIndex: Number(page.sheetIndex) as 0 | 1,
              row: Number(page.row),
              column: Number(page.column),
              durationSeconds: Number(page.durationSeconds),
              seed,
              prompt: storyPrompt(page),
              referenceUrl,
              falRequestId: requestId,
              status: 'generating' as const,
              progress: 8,
              jobId: `fal:${requestId}`,
              outputUrl: null,
              error: null,
            };
          } catch (error) {
            return {
              pageNumber: index + 1,
              sheetIndex: Number(page.sheetIndex) as 0 | 1,
              row: Number(page.row),
              column: Number(page.column),
              durationSeconds: Number(page.durationSeconds),
              seed: 730_000 + index,
              prompt: storyPrompt(page),
              referenceUrl: null,
              falRequestId: null,
              status: 'failed' as const,
              progress: 0,
              jobId: null,
              outputUrl: null,
              error: error instanceof Error ? error.message : 'Could not submit this page to FAL.',
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
          ? 'One or more pages failed during submission. Retry them individually.'
          : null,
      });
      return json(publicJob(completed), 202);
    } catch (error) {
      const failed = await updateJob(supabase, row.id, {
        status: 'failed',
        progress: 0,
        error_message: error instanceof Error ? error.message : 'Premium story setup failed.',
      });
      return json(publicJob(failed), 503);
    }
  }

  if (!jobId) return json({ error: 'jobId is required.' }, 400);
  const { data, error } = await supabase.from('oracle_film_jobs').select('*').eq('id', jobId).maybeSingle();
  if (error || !data) return json({ error: 'Story film job not found.' }, 404);
  let current = data as StoryJobRow;
  if (current.job_type !== 'illustration-story') return json({ error: 'Job is not an illustration story.' }, 400);

  if (action === 'resume' && current.status === 'failed') {
    const scenes = sceneList(current.story_scenes);
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
        try { await cancelFalScene(scene.falRequestId); } catch { /* local state remains authoritative */ }
      }
    }));
    if (current.runpod_job_id?.startsWith('story-mux:')) {
      try { await runpod(`cancel/${encodeURIComponent(current.runpod_job_id.slice('story-mux:'.length))}`, 'POST'); } catch { /* close local state */ }
    }
    current = await updateJob(supabase, current.id, {
      status: 'cancelled',
      story_scenes: scenes.map(scene => ['queued', 'generating'].includes(scene.status)
        ? { ...scene, status: 'cancelled', progress: 0, error: null }
        : scene),
      error_message: null,
    });
    return json(publicJob(current));
  }

  if (action === 'retry') {
    const pageNumber = Number(payload.pageNumber);
    const scenes = sceneList(current.story_scenes);
    const scene = scenes.find(item => item.pageNumber === pageNumber);
    if (!scene || !['failed', 'cancelled'].includes(scene.status) || !scene.referenceUrl) {
      return json({ error: 'Only a failed or cancelled page with a persisted reference can be retried.' }, 400);
    }
    try {
      const requestId = await createFalScene(scene.referenceUrl, scene.prompt, current.session_id, scene.seed);
      const nextScenes = scenes.map(item => item.pageNumber === pageNumber
        ? { ...item, falRequestId: requestId, status: 'generating' as const, progress: 8, jobId: `fal:${requestId}`, outputUrl: null, error: null }
        : item);
      current = await updateJob(supabase, current.id, {
        status: 'generating',
        progress: Math.max(10, Math.round(nextScenes.filter(item => item.status === 'ready').length / PAGE_COUNT * 70)),
        runpod_job_id: null,
        story_scenes: nextScenes,
        error_message: null,
      });
      return json(publicJob(current), 202);
    } catch (retryError) {
      current = await updateJob(supabase, current.id, {
        story_scenes: scenes.map(item => item.pageNumber === pageNumber
          ? { ...item, status: 'failed', progress: 0, error: retryError instanceof Error ? retryError.message : 'Page retry failed.' }
          : item),
        status: 'failed',
        error_message: 'The page retry failed before FAL accepted the request.',
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