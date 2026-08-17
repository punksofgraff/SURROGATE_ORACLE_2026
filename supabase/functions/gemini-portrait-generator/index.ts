/**
 * gemini-portrait-generator — Supabase Edge Function
 *
 * Generation cascade (first success wins):
 *   1. Gemini 3.7 Flash        → distills conversation context into a visual prompt
 *   2a. Vertex AI Imagen       → PRIMARY image generation (low cost per image)
 *       Guarded by a persistent circuit breaker: 3× 429/5xx opens it, with
 *       escalating cool-downs of 15 min → 1 h → 4 h → 12 h → 24 h (persisted
 *       in public.provider_breaker so cold starts don't reset the schedule).
 *   2b. Gemini Flash image     → same GOOGLE_AI_API_KEY, modern image models
 *   3. HuggingFace FLUX.1-schnell → keyless free-tier; authenticated if HUGGINGFACE_API_KEY set
 *   4. DeepAI                  → optional key-gated fallback
 *   5. Replicate flux-schnell  → last paid resort; output RE-HOSTED to the
 *       portraits bucket (replicate.delivery URLs expire in ~1 h)
 *   6. Pollinations.ai         → zero-config, no key, always free
 *   7. Themed Unsplash         → static fallback if every AI path fails
 *
 * Secrets (set via Replit Secrets or: supabase secrets set KEY=value --project-ref <ref>):
 *   GOOGLE_AI_API_KEY   — Google AI Studio key for Gemini 3.7 Flash text distillation
 *   VERTEX_AI_API_KEY   — Google Cloud API key for Vertex AI Imagen 3
 *   VERTEX_PROJECT_ID   — Google Cloud project ID (optional; defaults to key's linked project)
 *   HUGGINGFACE_API_KEY — HuggingFace token for authenticated inference (optional)
 *   DEEPAI_API_KEY      — DeepAI text2img key (optional)
 *   REPLICATE_API_TOKEN — Replicate token for flux-schnell last-resort path (optional)
 *
 * Deploy:
 *   npx supabase functions deploy gemini-portrait-generator --project-ref <ref> --use-api
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
};

interface PortraitContext {
  weightedThemes?: Array<{ theme: string; weight: number }>;
  emotionalWeight?: string;
  alignment?: string;
  archetypeTitle?: string;
  sessionPhase?: string;
  seekerLines?: string[];
}

interface PortraitRequest {
  sessionId: string;
  email?: string;
  themes: string[];
  context?: PortraitContext;
  style?: string;
  userPrompt?: string;
  /** Optional integer seed forwarded to Pollinations. When supplied, both the
   *  sacred and profane requests in an isolation trial share the same seed so
   *  any visual difference is attributable to the alignment clause alone and
   *  not to different random initialisation. */
  fixedSeed?: number;
}

const DISTILL_TOKEN_CAPS = [1536, 768, 384] as const;
const DISTILL_RECOVERY_MS = 5 * 60 * 1000;
const DISTILL_COOLDOWN_MS = 30 * 1000;
let distillThrottleLevel = 0;
let distillCooldownUntil = 0;
let distillLastThrottleAt = 0;

function getDistillTokenCap(): number | null {
  const now = Date.now();
  if (distillCooldownUntil > now) return null;
  if (distillThrottleLevel > 0 && now - distillLastThrottleAt >= DISTILL_RECOVERY_MS) {
    distillThrottleLevel = 0;
  }
  return DISTILL_TOKEN_CAPS[distillThrottleLevel];
}

function noteDistillThrottle(status: number): void {
  const now = Date.now();
  if (status === 429) {
    distillThrottleLevel = Math.min(distillThrottleLevel + 1, DISTILL_TOKEN_CAPS.length - 1);
    distillLastThrottleAt = now;
    distillCooldownUntil = now + DISTILL_COOLDOWN_MS * (distillThrottleLevel + 1);
  } else if (status === 503) {
    distillCooldownUntil = now + DISTILL_COOLDOWN_MS;
  }
}

// ── Persistent provider circuit breaker ──────────────────────────────────────
// Quota/server failures (429 or 5xx) increment a counter in public.provider_breaker.
// Three strikes open the breaker with escalating cool-downs: 15 min → 1 h → 4 h →
// 12 h → 24 h (then holds at 24 h). A success closes it and resets the schedule.
// Persisted in the DB so edge-function cold starts don't forget the backoff level.
// Auth errors (401/403) and other 4xx do NOT trip it — they fail fast per-request
// and resolve the moment the key is fixed.
const BREAKER_BACKOFF_MS = [
  15 * 60 * 1000,       // 15 minutes
  60 * 60 * 1000,       // 1 hour
  4 * 60 * 60 * 1000,   // 4 hours
  12 * 60 * 60 * 1000,  // 12 hours
  24 * 60 * 60 * 1000,  // 24 hours (holds here)
] as const;
const BREAKER_TRIP_COUNT = 3;

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

async function breakerIsOpen(supabase: SupabaseLike, provider: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('provider_breaker')
      .select('open_until')
      .eq('provider', provider)
      .maybeSingle();
    return !!(data?.open_until && new Date(data.open_until).getTime() > Date.now());
  } catch {
    return false; // breaker storage unavailable → never block the provider
  }
}

function breakerTripsOn(status: number): boolean {
  return status === 429 || status >= 500;
}

async function breakerRecordFailure(supabase: SupabaseLike, provider: string, status: number): Promise<void> {
  if (!breakerTripsOn(status)) return;
  try {
    const { data } = await supabase
      .from('provider_breaker')
      .select('fail_count, backoff_level')
      .eq('provider', provider)
      .maybeSingle();
    let failCount = (data?.fail_count ?? 0) + 1;
    let backoffLevel = data?.backoff_level ?? 0;
    let openUntil: string | null = null;
    if (failCount >= BREAKER_TRIP_COUNT) {
      const waitMs = BREAKER_BACKOFF_MS[Math.min(backoffLevel, BREAKER_BACKOFF_MS.length - 1)];
      openUntil = new Date(Date.now() + waitMs).toISOString();
      backoffLevel = Math.min(backoffLevel + 1, BREAKER_BACKOFF_MS.length - 1);
      failCount = 0;
      console.warn(`⛔ ${provider} breaker OPEN for ${Math.round(waitMs / 60000)} min (level ${backoffLevel})`);
    }
    await supabase.from('provider_breaker').upsert({
      provider,
      fail_count: failCount,
      backoff_level: backoffLevel,
      open_until: openUntil,
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('⚠️ breaker record-failure skipped:', e instanceof Error ? e.message : String(e));
  }
}

async function breakerRecordSuccess(supabase: SupabaseLike, provider: string): Promise<void> {
  try {
    await supabase.from('provider_breaker').upsert({
      provider,
      fail_count: 0,
      backoff_level: 0,
      open_until: null,
      updated_at: new Date().toISOString(),
    });
  } catch {
    // non-fatal
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  let body: PortraitRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { sessionId, email, themes, context, style = 'freakdali-graff-punks', userPrompt, fixedSeed } = body;

  if (!sessionId || !themes?.length) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: sessionId, themes' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const hasFluidContext = !!(
    context && (
      context.weightedThemes?.length ||
      context.seekerLines?.length ||
      context.emotionalWeight ||
      context.archetypeTitle ||
      context.alignment
    )
  );
  console.log(`🎨 Portrait request — session: ${sessionId}, themes: ${themes.join(', ')}, fluid-context: ${hasFluidContext}`);

  const basePrompt = userPrompt ?? buildBasePrompt(themes, hasFluidContext ? context : undefined);
  let portraitUrl = '';
  let generationMethod = 'themed-fallback';
  let googleAiGenerated = false;
  let googleAiError = '';
  let imageErrors: string[] = [];

  const googleAiApiKey = Deno.env.get('GOOGLE_AI_API_KEY');

  // ── STEP 1: Enhance prompt with Gemini 3.7 Flash (text-only) ──────────────
  // With fluid context this is a true DISTILLATION step: the seeker's own words
  // and the session's scoring signals go into Gemini here, and only the distilled
  // visual prompt travels onward to third-party image providers. Without context
  // it degrades to the original theme-prompt rewrite.
  let enhancedPrompt = basePrompt;
  if (googleAiApiKey) {
    const tokenCap = getDistillTokenCap();
    if (tokenCap === null) {
      googleAiError = 'Gemini distillation temporarily throttled; using base prompt';
      console.warn('⚠️ Gemini distillation cooldown active — using base prompt');
    } else try {
      const distillInstruction = hasFluidContext && context
        ? buildDistillInstruction(basePrompt, context)
        : `You are a visual art prompt engineer. Rewrite this for AI image generation. Keep under 280 characters. Focus on vivid visual details, cyberpunk street art, neon colours. Original: "${basePrompt}"`;
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent?key=${googleAiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: distillInstruction }],
            }],
            // gemini-3.7-flash thought tokens count against this cap; 180 starved
            // the rewritten prompt. 1024 = thinking + the <280-char output.
            // Fluid-context distillation outputs up to ~400 chars → 1536 headroom.
            generationConfig: { temperature: 0.85, maxOutputTokens: hasFluidContext ? tokenCap : Math.min(tokenCap, 768) },
          }),
        }
      );
      if (!r.ok) {
        noteDistillThrottle(r.status);
        throw new Error(`Gemini text ${r.status}: ${await r.text()}`);
      }
      const json = await r.json();
      const candidate = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (candidate) {
        // Deterministic privacy boundary: if the distilled prompt reproduces any
        // seeker line (4-word n-gram), REJECT it — fall back to the context-aware
        // base prompt, which is built purely from themes/signals and contains no
        // seeker text. Instructions to the model are not a boundary; this check is.
        if (context?.seekerLines?.length && promptLeaksSeekerLines(candidate, context.seekerLines, basePrompt)) {
          console.warn('🛑 Distilled prompt leaked seeker line n-gram — rejected, using base prompt');
        } else {
          enhancedPrompt = candidate;
          googleAiGenerated = true;
          console.log(`✅ Gemini ${hasFluidContext ? 'distilled (fluid context)' : 'enhanced'}:`, enhancedPrompt.slice(0, 80) + '…');
        }
      }
    } catch (e: unknown) {
      googleAiError = e instanceof Error ? e.message : String(e);
      console.error('❌ Gemini enhancement failed (using base prompt):', googleAiError);
    }
  } else {
    googleAiError = 'GOOGLE_AI_API_KEY not configured';
    console.warn('⚠️  GOOGLE_AI_API_KEY not set — skipping prompt enhancement');
  }

  // ── STEP 2a: Vertex AI Imagen (express mode — fractions of a cent) ─────────
  // API keys only authenticate against Vertex EXPRESS endpoints (no project/
  // location in the path). Project-scoped Vertex URLs require OAuth and will
  // always 401 with an API key. Requires a Vertex-express-enabled key in
  // VERTEX_AI_API_KEY; falls through cleanly if the key is absent or invalid.
  const vertexApiKey = Deno.env.get('VERTEX_AI_API_KEY');
  if (vertexApiKey && !portraitUrl && await breakerIsOpen(supabase, 'vertex-imagen')) {
    console.warn('⛔ Vertex Imagen breaker open — skipping this rung');
    imageErrors.push('Vertex Imagen: circuit breaker open (cooling down after repeated 429/5xx)');
  } else if (vertexApiKey && !portraitUrl) {
    try {
      console.log('🎨 Trying Vertex AI Imagen (express)…');
      const r = await fetch(
        `https://aiplatform.googleapis.com/v1/publishers/google/models/imagen-3.0-generate-002:predict?key=${vertexApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instances: [{ prompt: enhancedPrompt }],
            parameters: { sampleCount: 1, aspectRatio: '1:1' },
          }),
        }
      );
      if (!r.ok) {
        await breakerRecordFailure(supabase, 'vertex-imagen', r.status);
        throw new Error(`Vertex Imagen ${r.status}: ${await r.text()}`);
      }
      const json = await r.json();
      const b64 = json.predictions?.[0]?.bytesBase64Encoded;
      if (!b64) throw new Error('Vertex Imagen: no image in response');
      const imgBuffer = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('portraits')
        .upload(`${sessionId}-vertex-${Date.now()}.jpg`, imgBuffer, {
          contentType: 'image/jpeg',
          upsert: true,
        });
      if (uploadErr) {
        portraitUrl = `data:image/jpeg;base64,${b64}`;
        console.log('✅ Vertex Imagen portrait as base64 data URL');
      } else {
        const { data: { publicUrl } } = supabase.storage.from('portraits').getPublicUrl(uploadData.path);
        portraitUrl = publicUrl;
        console.log('✅ Vertex Imagen portrait uploaded:', publicUrl.slice(0, 60));
      }
      generationMethod = 'vertex-imagen';
      await breakerRecordSuccess(supabase, 'vertex-imagen');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('❌ Vertex Imagen failed:', msg);
      imageErrors.push(`Vertex Imagen: ${msg}`);
    }
  }

  // ── STEP 2b: Gemini 3.1 Flash Image (modern; 2.5-image retires Sep 2026) ───
  // Same GOOGLE_AI_API_KEY as text distillation. Lite variant as second try —
  // separate quota bucket, cheaper.
  if (googleAiApiKey && !portraitUrl) {
    for (const model of ['gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image']) {
      if (portraitUrl) break;
      try {
        console.log(`🎨 Trying ${model}…`);
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${googleAiApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: enhancedPrompt }] }],
              generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
            }),
          }
        );
        if (!r.ok) throw new Error(`${model} ${r.status}: ${await r.text()}`);
        const json = await r.json();
        const parts = json.candidates?.[0]?.content?.parts ?? [];
        const imgPart = parts.find((p: { inlineData?: { data?: string; mimeType?: string } }) => p.inlineData?.data);
        if (!imgPart?.inlineData?.data) throw new Error(`${model}: no inlineData in response`);
        const mimeType = imgPart.inlineData.mimeType ?? 'image/png';
        const b64 = imgPart.inlineData.data;
        const imgBuffer = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('portraits')
          .upload(`${sessionId}-gemini-${Date.now()}.png`, imgBuffer, {
            contentType: mimeType,
            upsert: true,
          });
        if (uploadErr) {
          portraitUrl = `data:${mimeType};base64,${b64}`;
          console.log(`✅ ${model} portrait as base64 data URL`);
        } else {
          const { data: { publicUrl } } = supabase.storage.from('portraits').getPublicUrl(uploadData.path);
          portraitUrl = publicUrl;
          console.log(`✅ ${model} portrait uploaded:`, publicUrl.slice(0, 60));
        }
        generationMethod = 'gemini-image';
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`❌ ${model} failed:`, msg.slice(0, 140));
        imageErrors.push(`${model}: ${msg}`);
      }
    }
  }

  // ── STEP 3: HuggingFace FLUX.1-schnell (keyless free-tier) ────────────────
  // The HF Inference API allows keyless requests at low rate limits; an
  // optional HUGGINGFACE_API_KEY gives authenticated higher throughput.
  // router.huggingface.co is the current endpoint (api-inference.huggingface.co
  // was retired). NOTE: FLUX.1-dev returns 410 (deprecated on hf-inference);
  // FLUX.1-schnell is the supported free model.
  if (!portraitUrl) {
    const hfKey = Deno.env.get('HUGGINGFACE_API_KEY');
    const hfHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (hfKey) hfHeaders['Authorization'] = `Bearer ${hfKey}`;
    try {
      console.log('🎨 Trying HuggingFace FLUX.1-schnell…');
      const r = await fetch(
        'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell',
        { method: 'POST', headers: hfHeaders, body: JSON.stringify({ inputs: enhancedPrompt }) }
      );
      if (!r.ok) throw new Error(`HuggingFace ${r.status}: ${await r.text()}`);
      const imgBuffer = await r.arrayBuffer();
      if (imgBuffer.byteLength < 1000) throw new Error('HuggingFace returned empty image');
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('portraits')
        .upload(`${sessionId}-hf-${Date.now()}.jpg`, imgBuffer, { contentType: 'image/jpeg', upsert: true });
      if (uploadErr) {
        const b64 = btoa(String.fromCharCode(...new Uint8Array(imgBuffer)));
        portraitUrl = `data:image/jpeg;base64,${b64}`;
        console.log('✅ HuggingFace portrait as base64 data URL');
      } else {
        const { data: { publicUrl } } = supabase.storage.from('portraits').getPublicUrl(uploadData.path);
        portraitUrl = publicUrl;
        console.log('✅ HuggingFace portrait uploaded to Supabase Storage');
      }
      generationMethod = 'huggingface-flux';
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('❌ HuggingFace failed:', msg);
      imageErrors.push(`HuggingFace: ${msg}`);
    }
  }

  // ── STEP 4: DeepAI (optional key) ─────────────────────────────────────────
  const deepAiKey = Deno.env.get('DEEPAI_API_KEY');
  if (deepAiKey && !portraitUrl) {
    try {
      console.log('🎨 Trying DeepAI text2img…');
      const form = new FormData();
      form.append('text', enhancedPrompt);
      const r = await fetch('https://api.deepai.org/api/text2img', {
        method: 'POST',
        headers: { 'api-key': deepAiKey },
        body: form,
      });
      if (!r.ok) {
        await breakerRecordFailure(supabase, 'deepai', r.status);
        throw new Error(`DeepAI ${r.status}: ${await r.text()}`);
      }
      const json = await r.json();
      if (!json.output_url) throw new Error('No output_url in DeepAI response');
      portraitUrl = json.output_url;
      generationMethod = 'deepai';
      await breakerRecordSuccess(supabase, 'deepai');
      console.log('✅ DeepAI portrait generated');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('❌ DeepAI failed:', msg);
      imageErrors.push(`DeepAI: ${msg}`);
    }
  }

  // ── STEP 5: Replicate flux-schnell — last paid resort ────────────────────
  // Runs only when Vertex/Gemini/HF/DeepAI all failed. Output MUST be re-hosted:
  // replicate.delivery URLs expire in ~1 hour, so we download and upload to the
  // portraits bucket; on upload failure we fall through to Pollinations rather
  // than persist a URL that will go blank.
  const replicateToken = Deno.env.get('REPLICATE_API_TOKEN') ?? Deno.env.get('REPLICATE_API_KEY');
  if (replicateToken && !portraitUrl) {
    try {
      console.log('🎨 Trying Replicate flux-schnell…');
      const r = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${replicateToken}`,
          'Content-Type': 'application/json',
          'Prefer': 'wait',
        },
        body: JSON.stringify({
          input: { prompt: enhancedPrompt, aspect_ratio: '1:1', output_format: 'jpg' },
        }),
      });
      if (!r.ok) throw new Error(`Replicate ${r.status}: ${await r.text()}`);
      let json = await r.json();
      // `Prefer: wait` can return early with status "processing"/"starting" —
      // poll the prediction URL until it settles (flux-schnell finishes in
      // seconds, so a short poll budget is plenty).
      const pollUrl = json.urls?.get;
      for (let i = 0; i < 15 && pollUrl && (json.status === 'processing' || json.status === 'starting'); i++) {
        await new Promise(res => setTimeout(res, 2000));
        const pr = await fetch(pollUrl, { headers: { 'Authorization': `Bearer ${replicateToken}` } });
        if (!pr.ok) throw new Error(`Replicate poll ${pr.status}`);
        json = await pr.json();
      }
      if (json.status !== 'succeeded') {
        throw new Error(`Replicate: prediction ${json.status}${json.error ? `: ${json.error}` : ''}`);
      }
      // flux-schnell may return output as a string OR an array of strings.
      const outUrl = typeof json.output === 'string'
        ? json.output
        : Array.isArray(json.output) ? json.output[0] : null;
      if (!outUrl || typeof outUrl !== 'string' || !outUrl.startsWith('http')) {
        throw new Error(`Replicate: unexpected output shape (status ${json.status})`);
      }
      const imgResp = await fetch(outUrl);
      if (!imgResp.ok) throw new Error(`Replicate image fetch ${imgResp.status}`);
      const imgBuffer = await imgResp.arrayBuffer();
      if (imgBuffer.byteLength < 1000) throw new Error('Replicate returned empty image');
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('portraits')
        .upload(`${sessionId}-replicate-${Date.now()}.jpg`, imgBuffer, {
          contentType: 'image/jpeg',
          upsert: true,
        });
      if (uploadErr) {
        // Do NOT persist the raw replicate.delivery URL — it expires in ~1 h.
        throw new Error(`Replicate re-host failed: ${uploadErr.message}`);
      }
      const { data: { publicUrl } } = supabase.storage.from('portraits').getPublicUrl(uploadData.path);
      portraitUrl = publicUrl;
      generationMethod = 'replicate-flux';
      console.log('✅ Replicate portrait re-hosted:', publicUrl.slice(0, 60));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('❌ Replicate failed:', msg);
      imageErrors.push(`Replicate: ${msg}`);
    }
  }

  // ── STEP 6: Pollinations.ai — zero config, no key, always free ───────────
  if (!portraitUrl) {
    try {
      // Seed selection:
      // - `fixedSeed` (integer): caller-supplied seed for controlled experiments
      //   (e.g. sacred/profane isolation tests where both requests share the same
      //   seed so any visual difference is attributable to the alignment clause alone).
      // - Default: session-derived hash + epoch so concurrent requests with the same
      //   prompt receive independent seeds and do not produce byte-identical images.
      const sidHash = sessionId.split('').reduce(
        (h: number, c: string) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 0
      );
      const seed = (typeof fixedSeed === 'number' && Number.isInteger(fixedSeed) && fixedSeed > 0)
        ? fixedSeed
        : (Math.abs(sidHash) + Math.floor(Date.now() / 1000)) % 2147483647;
      // 800-char limit: the alignment clause (sacred/profane) appears around char
      // 450 in a typical base prompt — truncating at 400 silently drops it, making
      // sacred and profane portraits visually identical through this fallback path.
      const encoded = encodeURIComponent(enhancedPrompt.slice(0, 800));
      portraitUrl = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&nologo=true&model=flux&seed=${seed}`;
      generationMethod = 'pollinations-flux';
      console.log('✅ Pollinations.ai portrait URL constructed');
    } catch (e: unknown) {
      console.error('❌ Pollinations URL construction failed:', e);
    }
  }

  // ── STEP 7: Themed static fallback ────────────────────────────────────────
  if (!portraitUrl) {
    portraitUrl = getThemedFallback(themes);
    generationMethod = 'themed-fallback';
    console.log('ℹ️  Using themed static fallback:', portraitUrl);
  }

  // ── Persist to database ───────────────────────────────────────────────────
  // surrogate_portraits.session_id has an FK to surrogate_sessions.session_id, but the
  // session row is only created when compact-conversation first persists (several turns
  // in). A portrait minted before that would fail the FK and silently never persist —
  // so ensure the session row exists first (no-op if it already does).
  const { error: sessErr } = await supabase
    .from('surrogate_sessions')
    .upsert({ session_id: sessionId }, { onConflict: 'session_id', ignoreDuplicates: true });
  if (sessErr) console.error('⚠️ session ensure failed (portrait insert may fail):', sessErr.message);

  // NOTE: column is `dalle_generated` (legacy name from the DALL-E era) — there is
  // no `google_ai_generated` column; inserting one fails with PGRST204 and the
  // portrait is silently never persisted.
  const { error: dbError } = await supabase.from('surrogate_portraits').insert({
    session_id: sessionId,
    email: email ?? null,
    conversation_themes: themes,
    dalle_prompt: enhancedPrompt,
    image_url: portraitUrl,
    dalle_generated: googleAiGenerated,
    procedural_framework: {
      style,
      sneakar_branded: true,
      culture_coin_elements: true,
      cyberpunk_aesthetic: true,
      themes,
      generation_method: generationMethod,
      fluid_context: hasFluidContext,
      ...(hasFluidContext && context?.weightedThemes?.length && {
        weighted_themes: context.weightedThemes,
      }),
      ...(hasFluidContext && context?.emotionalWeight && { emotional_weight: context.emotionalWeight }),
      timestamp: new Date().toISOString(),
    },
  });
  if (dbError) console.error('❌ DB insert error:', dbError);
  else console.log('✅ Portrait saved to surrogate_portraits');

  return new Response(
    JSON.stringify({
      success: !!portraitUrl,
      portraitUrl,
      googleAiGenerated,
      generationMethod,
      // The distilled prompt actually sent to image providers — returned to the
      // requesting session so differential verification can confirm two different
      // conversations produce different prompts. Contains no raw transcript.
      promptUsed: enhancedPrompt,
      fluidContext: hasFluidContext,
      ...(googleAiError && { googleAiError }),
      ...(imageErrors.length && { imageErrors }),
      apiUsed: generationMethod,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});

// ── Prompt builder ────────────────────────────────────────────────────────────

// Emotional register → palette/mood language. The scoring system already tracks
// these five states; each maps to a distinct visual treatment so the portrait's
// atmosphere mirrors where the seeker ended up emotionally.
const EMOTIONAL_PALETTES: Record<string, string> = {
  raw:      'exposed nerve palette — bleeding reds, torn edges, dripping wet paint, unguarded open expression',
  defended: 'armored palette — cold steel blues, layered stencil masks, geometric barriers over the face',
  numb:     'desaturated fog palette — muted greys with one faint neon pulse, distant vacant gaze, static haze',
  present:  'grounded luminous palette — warm amber and living green, direct steady gaze, crisp clean linework',
  cracked:  'fracture palette — split-face composition, gold light leaking through broken porcelain seams, kintsugi veins',
};

/**
 * Deterministic transcript-leakage guard. The distill instruction TELLS Gemini
 * not to quote the seeker, but instructions are not a boundary — a model can
 * reproduce input text (including via prompt injection inside a seeker line).
 * Before the distilled prompt reaches ANY sink (image providers, DB row,
 * response body, client logs), reject it if it contains:
 *   - any sensitive token from a seeker line (email, URL, @handle, phone/ID
 *     digit runs, Unicode-lettered words, long alphanumeric IDs), or
 *   - any 3+ consecutive-word span of a seeker line, or
 *   - any 2-word span / distinctive single token from a seeker line that is
 *     NOT already part of the transcript-free base prompt vocabulary
 *     (theme/brand words legitimately overlap; seeker-unique words must not).
 * On rejection the caller falls back to the base prompt, which is built purely
 * from themes/signals and contains no seeker text. Returns true if leaking.
 */
const GUARD_STOPWORDS = new Set([
  'the','and','that','this','with','for','was','are','but','not','you','all','can','her','his','she','him','they',
  'have','had','has','were','been','from','into','out','our','your','their','them','then','than','what','when',
  'where','who','how','why','will','would','could','should','still','just','like','one','two','more','very',
  'about','over','under','some','every','never','always','there','here','because','only','even','also','after','before',
]);
function promptLeaksSeekerLines(prompt: string, seekerLines: string[], basePrompt: string): boolean {
  // Keep Unicode letters/digits — ASCII-only normalization would erase
  // non-Latin identifiers and leave them unguarded.
  const norm = (s: string) =>
    s.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const p = norm(prompt);
  const pRaw = prompt.toLowerCase();
  const baseVocab = new Set(norm(basePrompt).split(' '));

  for (const line of seekerLines) {
    const raw = line.toLowerCase();

    // ── Sensitive tokens (pattern-based, checked against raw + normalized) ──
    const sensitive: string[] = [
      ...(raw.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g) ?? []),      // emails
      ...(raw.match(/(?:https?:\/\/|www\.)\S+/g) ?? []),         // URLs
      ...(raw.match(/(?<![\w.])@[a-z0-9_]{3,}/g) ?? []),         // @handles
      ...((raw.match(/\d[\d\s().-]{2,}\d/g) ?? [])
        .filter(m => (m.match(/\d/g) ?? []).length >= 4)),       // phone / account digit runs
    ];
    for (const tok of sensitive) {
      const nt = norm(tok);
      if (pRaw.includes(tok) || (nt && p.includes(nt)) || (nt && p.includes(nt.replace(/\s/g, '')))) return true;
    }

    const words = norm(line).split(' ').filter(Boolean);

    // ── Identifier-shaped single tokens: Unicode, digit-bearing, or long IDs ──
    for (const w of words) {
      const isUnicode = /[^\x00-\x7f]/.test(w);
      const hasDigit = /\p{N}/u.test(w);
      const isLongId = w.length >= 12;
      if ((isUnicode || hasDigit || isLongId) && w.length >= 2 && p.includes(w)) return true;
    }

    // ── Distinctive single tokens not in the transcript-free base vocabulary ──
    // (unique names like "zephrandius" — common theme/brand words are exempt
    // because they already exist in the base prompt independent of the seeker)
    for (const w of words) {
      if (w.length >= 5 && !GUARD_STOPWORDS.has(w) && !baseVocab.has(w) && p.includes(w)) return true;
    }

    // ── Word-span n-grams ──
    if (words.length === 1) continue; // single-word lines covered above
    if (words.length === 2) {
      if (p.includes(words.join(' '))) return true;
      continue;
    }
    for (let i = 0; i + 3 <= words.length; i++) {
      if (p.includes(words.slice(i, i + 3).join(' '))) return true;
    }
    for (let i = 0; i + 2 <= words.length; i++) {
      const [a, b] = words.slice(i, i + 2);
      if (!GUARD_STOPWORDS.has(a) && !GUARD_STOPWORDS.has(b) &&
          !(baseVocab.has(a) && baseVocab.has(b)) &&
          p.includes(`${a} ${b}`)) return true;
    }
  }
  return false;
}

/** Build the distillation instruction for fluid-context requests. The seeker's
 *  lines are distilled HERE (inside Gemini) — only the resulting visual prompt
 *  travels onward to third-party image providers, never the raw transcript. */
function buildDistillInstruction(basePrompt: string, ctx: PortraitContext): string {
  const parts: string[] = [
    'You are a visual art prompt engineer for a cyberpunk graffiti oracle. Create ONE image-generation prompt, under 400 characters, plain text only.',
    `MANDATORY base style (always keep): "${basePrompt.slice(0, 300)}"`,
  ];
  if (ctx.weightedThemes?.length) {
    const total = ctx.weightedThemes.reduce((s, t) => s + Math.max(1, t.weight), 0);
    const ranked = ctx.weightedThemes
      .slice(0, 6)
      .map(t => `${t.theme} (${Math.round((Math.max(1, t.weight) / total) * 100)}%)`)
      .join(', ');
    parts.push(`Theme dominance — give each theme visual space PROPORTIONAL to its percentage; the top theme must visibly dominate: ${ranked}.`);
  }
  if (ctx.emotionalWeight && EMOTIONAL_PALETTES[ctx.emotionalWeight]) {
    parts.push(`Emotional register "${ctx.emotionalWeight}" — infuse this mood: ${EMOTIONAL_PALETTES[ctx.emotionalWeight]}.`);
  }
  if (ctx.archetypeTitle) {
    parts.push(`The subject's revealed archetype is "${ctx.archetypeTitle}" — let this title shape the figure's posture and iconography.`);
  }
  if (ctx.alignment) {
    parts.push(`Alignment: ${ctx.alignment === 'sacred' ? 'sacred — halo geometry, ascending light' : 'profane — inverted glyphs, smoldering underglow'}.`);
  }
  if (ctx.seekerLines?.length) {
    parts.push(
      'What the seeker confessed (distill into 1-2 symbolic visual elements woven into the portrait — do NOT quote or transcribe their words into the prompt):',
      ...ctx.seekerLines.map(l => `- "${l.replace(/"/g, "'")}"`),
    );
  }
  parts.push('Output ONLY the final image prompt.');
  return parts.join('\n');
}

function buildBasePrompt(themes: string[], context?: PortraitContext): string {
  const themeMap: Record<string, string> = {
    oracle:          'mystical digital consciousness with prophetic vision',
    cyberpunk:       'neon-lit digital rebellion and cyber aesthetic',
    graffiti:        'street art spray paint with raw urban energy',
    mystical:        'ethereal cosmic oracle energy and astral glow',
    consciousness:   'expanded awareness, transcendence, neural webs',
    wisdom:          'ancient knowledge channelled through modern circuitry',
    sneakar:         'streetwear prophet with holographic SNEAKAR elements',
    neon:            'glowing geometric neon light patterns',
    digital:         'pixelated digital consciousness and data streams',
    'hip-hop':       'urban oracle, rhythm and cultural power',
    'culture-coin':  'golden cultural currency aura and mystical wealth',
    punk:            'rebellious street energy, spikes, spray paint',
    future:          'evolutionary transcendence in underground trainyard',
    transformation:  'metamorphosis with SNEAKAR branded wings',
    connection:      'interconnected culture networks pulsing with light',
  };
  // With fluid context, order themes by session weight (heaviest first) and
  // mark the dominant one — so even when Gemini distillation is unavailable,
  // the raw prompt sent to image providers reflects the session's shape.
  let ordered = themes;
  let dominantClause = '';
  if (context?.weightedThemes?.length) {
    ordered = [...context.weightedThemes]
      .sort((a, b) => b.weight - a.weight)
      .map(t => t.theme);
    const top = ordered[0];
    dominantClause = ` Dominant motif (give it the most visual space): ${themeMap[top] ?? top}.`;
  }
  const desc = ordered.map(t => themeMap[t] ?? t).filter(Boolean).join(', ');
  const mood = context?.emotionalWeight && EMOTIONAL_PALETTES[context.emotionalWeight]
    ? ` Mood: ${EMOTIONAL_PALETTES[context.emotionalWeight]}.`
    : '';
  const archetype = context?.archetypeTitle
    ? ` The figure embodies the archetype "${context.archetypeTitle}".`
    : '';
  const alignment = context?.alignment === 'sacred'
    ? ' Sacred alignment: halo geometry, ascending light, gilded reverence.'
    : context?.alignment === 'profane'
      ? ' Profane alignment: inverted glyphs, smoldering underglow, defiant shadow.'
      : '';
  return `FreakDali cyberpunk graffiti oracle portrait: ${desc}.${dominantClause}${mood}${archetype}${alignment} SNEAKAR branded elements, Culture Coin golden accents, neon geometric face patterns, holographic effects. High quality digital art masterpiece, portrait orientation.`;
}

// ── Themed static fallbacks (used when all AI generation paths fail) ──────────

function getThemedFallback(themes: string[]): string {
  const fallbacks: Record<string, string> = {
    mystical:        'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1024&h=1024&fit=crop',
    cyberpunk:       'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=1024&h=1024&fit=crop',
    graffiti:        'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=1024&h=1024&fit=crop',
    sneakar:         'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=1024&h=1024&fit=crop',
    'culture-coin':  'https://images.unsplash.com/photo-1621932992265-e3df5ee52fb4?w=1024&h=1024&fit=crop',
    oracle:          'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=1024&h=1024&fit=crop',
    neon:            'https://images.unsplash.com/photo-1534330207526-8e81f10ec6fc?w=1024&h=1024&fit=crop',
    consciousness:   'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=1024&h=1024&fit=crop',
    'hip-hop':       'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1024&h=1024&fit=crop',
    punk:            'https://images.unsplash.com/photo-1571867424488-4565932edb41?w=1024&h=1024&fit=crop',
  };
  const match = themes.find(t => fallbacks[t]);
  return match ? fallbacks[match] : `https://picsum.photos/seed/${themes.join('-')}/1024/1024`;
}
