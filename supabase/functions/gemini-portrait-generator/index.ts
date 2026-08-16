/**
 * gemini-portrait-generator — Supabase Edge Function
 *
 * Generation cascade (first success wins):
 *   1. Gemini 3.7 Flash       → enriches the theme prompt into a vivid art description
 *   2. Gemini 2.5 Flash Image → PRIMARY image generation (same key, no extra cost)
 *   3. Replicate flux-schnell → free-tier AI image gen
 *   4. HuggingFace FLUX.1     → free-tier AI image gen
 *   5. Pollinations.ai        → zero-config, no key needed
 *   6. DeepAI                 → key-gated fallback
 *   7. Themed Unsplash        → static fallback if every AI path fails
 *
 * Secrets required (set via: npx supabase secrets set KEY=value --project-ref <ref>):
 *   GOOGLE_AI_API_KEY   — Google AI Studio key (covers both Gemini text + imagen)
 *   REPLICATE_API_TOKEN — Replicate token (flux-schnell free tier)
 *   HUGGINGFACE_API_KEY — HuggingFace Inference API key
 *   DEEPAI_API_KEY      — DeepAI text2img key (optional)
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

  const { sessionId, email, themes, context, style = 'freakdali-graff-punks', userPrompt } = body;

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

  // ── STEP 2: Gemini 2.5 Flash Image Generation (PRIMARY — cheapest AI path) ─
  // Uses the same GOOGLE_AI_API_KEY — no extra billing setup needed.
  // NOTE: gemini-2.0-flash-preview-image-generation was retired (404 as of Aug 2026).
  if (googleAiApiKey && !portraitUrl) {
    try {
      console.log('🎨 Trying Gemini 2.5 Flash image generation…');
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${googleAiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: enhancedPrompt }],
            }],
            generationConfig: {
              responseModalities: ['TEXT', 'IMAGE'],
            },
          }),
        }
      );
      if (!r.ok) {
        const errText = await r.text();
        throw new Error(`Gemini imagen ${r.status}: ${errText}`);
      }
      const json = await r.json();
      // Find the inline image part
      const parts = json.candidates?.[0]?.content?.parts ?? [];
      const imgPart = parts.find((p: { inlineData?: { data?: string; mimeType?: string } }) => p.inlineData?.data);
      if (!imgPart?.inlineData?.data) throw new Error('Gemini imagen: no inlineData in response');

      const mimeType = imgPart.inlineData.mimeType ?? 'image/png';
      const b64 = imgPart.inlineData.data;
      const imgBuffer = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;

      // Try to store in Supabase Storage → fall back to data URL
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('portraits')
        .upload(`${sessionId}-gemini-${Date.now()}.png`, imgBuffer, {
          contentType: mimeType,
          upsert: true,
        });

      if (uploadErr) {
        portraitUrl = `data:${mimeType};base64,${b64}`;
        console.log('✅ Gemini imagen portrait as base64 data URL');
      } else {
        const { data: { publicUrl } } = supabase.storage.from('portraits').getPublicUrl(uploadData.path);
        portraitUrl = publicUrl;
        console.log('✅ Gemini imagen portrait uploaded to Supabase Storage:', publicUrl.slice(0, 60));
      }
      generationMethod = 'gemini-imagen';
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('❌ Gemini imagen failed:', msg);
      imageErrors.push(`Gemini imagen: ${msg}`);
    }
  }

  // ── STEP 3: Replicate flux-schnell (free tier) ─────────────────────────────
  const replicateToken = Deno.env.get('REPLICATE_API_TOKEN');
  if (replicateToken && !portraitUrl) {
    try {
      console.log('🎨 Trying Replicate flux-schnell…');
      const startR = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${replicateToken}`,
          'Content-Type': 'application/json',
          'Prefer': 'wait',
        },
        body: JSON.stringify({
          input: {
            prompt: enhancedPrompt,
            num_outputs: 1,
            aspect_ratio: '1:1',
            output_format: 'webp',
            output_quality: 80,
          },
        }),
      });
      if (!startR.ok) throw new Error(`Replicate start ${startR.status}: ${await startR.text()}`);
      const pred = await startR.json();

      // Replicate returns `output` as a string URL for single-output models and an
      // array for multi-output ones. Indexing a string with [0] yields its first
      // CHARACTER ("h") — which then gets persisted as the portrait URL. Handle both.
      const firstUrl = (out: unknown): string | null => {
        if (typeof out === 'string' && out.startsWith('http')) return out;
        if (Array.isArray(out) && typeof out[0] === 'string') return out[0];
        return null;
      };

      let outputUrl: string | null = firstUrl(pred.output);
      if (!outputUrl && pred.id) {
        const pollUrl = `https://api.replicate.com/v1/predictions/${pred.id}`;
        for (let i = 0; i < 15 && !outputUrl; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const pollR = await fetch(pollUrl, { headers: { 'Authorization': `Bearer ${replicateToken}` } });
          const pollData = await pollR.json();
          if (pollData.status === 'succeeded') outputUrl = firstUrl(pollData.output);
          if (pollData.status === 'failed') throw new Error(`Replicate prediction failed: ${pollData.error}`);
        }
      }
      if (!outputUrl) throw new Error('Replicate returned no output URL');
      portraitUrl = outputUrl;
      generationMethod = 'replicate-flux-schnell';
      console.log('✅ Replicate flux-schnell portrait generated');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('❌ Replicate failed:', msg);
      imageErrors.push(`Replicate: ${msg}`);
    }
  }

  // ── STEP 4: HuggingFace FLUX.1-schnell ────────────────────────────────────
  const hfKey = Deno.env.get('HUGGINGFACE_API_KEY');
  if (hfKey && !portraitUrl) {
    try {
      console.log('🎨 Trying Hugging Face FLUX.1-schnell…');
      // api-inference.huggingface.co no longer resolves — HF moved to router.huggingface.co
      const r = await fetch(
        'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell',
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${hfKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputs: enhancedPrompt }),
        }
      );
      if (!r.ok) throw new Error(`HuggingFace ${r.status}: ${await r.text()}`);
      const imgBuffer = await r.arrayBuffer();
      if (imgBuffer.byteLength < 1000) throw new Error('HuggingFace returned empty image');
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('portraits')
        .upload(`${sessionId}-hf-${Date.now()}.jpg`, imgBuffer, {
          contentType: 'image/jpeg',
          upsert: true,
        });
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

  // ── STEP 5: Pollinations.ai — zero config, no key, free forever ────────────
  if (!portraitUrl) {
    try {
      const seed = Math.floor(Date.now() / 1000);
      const encoded = encodeURIComponent(enhancedPrompt.slice(0, 400));
      portraitUrl = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&nologo=true&model=flux&seed=${seed}`;
      generationMethod = 'pollinations-flux';
      console.log('✅ Pollinations.ai portrait URL constructed');
    } catch (e: unknown) {
      console.error('❌ Pollinations URL construction failed:', e);
    }
  }

  // ── STEP 6: DeepAI (optional key) ─────────────────────────────────────────
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
      if (!r.ok) throw new Error(`DeepAI ${r.status}: ${await r.text()}`);
      const json = await r.json();
      if (!json.output_url) throw new Error('No output_url in DeepAI response');
      portraitUrl = json.output_url;
      generationMethod = 'deepai';
      console.log('✅ DeepAI portrait generated');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('❌ DeepAI failed:', msg);
      imageErrors.push(`DeepAI: ${msg}`);
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
