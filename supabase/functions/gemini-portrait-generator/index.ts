/**
 * gemini-portrait-generator — Supabase Edge Function
 *
 * Generation cascade (first success wins):
 *   1. Gemini 2.5 Flash       → enriches the theme prompt into a vivid art description
 *   2. Gemini 2.0 Flash       → PRIMARY image generation (cheap, same key, no extra cost)
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

interface PortraitRequest {
  sessionId: string;
  email?: string;
  themes: string[];
  style?: string;
  userPrompt?: string;
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

  const { sessionId, email, themes, style = 'freakdali-graff-punks', userPrompt } = body;

  if (!sessionId || !themes?.length) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: sessionId, themes' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log(`🎨 Portrait request — session: ${sessionId}, themes: ${themes.join(', ')}`);

  const basePrompt = userPrompt ?? buildBasePrompt(themes);
  let portraitUrl = '';
  let generationMethod = 'themed-fallback';
  let googleAiGenerated = false;
  let googleAiError = '';
  let imageErrors: string[] = [];

  const googleAiApiKey = Deno.env.get('GOOGLE_AI_API_KEY');

  // ── STEP 1: Enhance prompt with Gemini 2.5 Flash (text-only) ──────────────
  let enhancedPrompt = basePrompt;
  if (googleAiApiKey) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${googleAiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `You are a visual art prompt engineer. Rewrite this for AI image generation. Keep under 280 characters. Focus on vivid visual details, cyberpunk street art, neon colours. Original: "${basePrompt}"`,
              }],
            }],
            generationConfig: { temperature: 0.85, maxOutputTokens: 180 },
          }),
        }
      );
      if (!r.ok) throw new Error(`Gemini text ${r.status}: ${await r.text()}`);
      const json = await r.json();
      const candidate = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (candidate) {
        enhancedPrompt = candidate;
        googleAiGenerated = true;
        console.log('✅ Gemini enhanced:', enhancedPrompt.slice(0, 80) + '…');
      }
    } catch (e: unknown) {
      googleAiError = e instanceof Error ? e.message : String(e);
      console.error('❌ Gemini enhancement failed (using base prompt):', googleAiError);
    }
  } else {
    googleAiError = 'GOOGLE_AI_API_KEY not configured';
    console.warn('⚠️  GOOGLE_AI_API_KEY not set — skipping prompt enhancement');
  }

  // ── STEP 2: Gemini 2.0 Flash Image Generation (PRIMARY — cheapest AI path) ─
  // Uses the same GOOGLE_AI_API_KEY — no extra billing setup needed.
  if (googleAiApiKey && !portraitUrl) {
    try {
      console.log('🎨 Trying Gemini 2.0 Flash image generation…');
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${googleAiApiKey}`,
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

      let outputUrl: string | null = pred.output?.[0] ?? null;
      if (!outputUrl && pred.id) {
        const pollUrl = `https://api.replicate.com/v1/predictions/${pred.id}`;
        for (let i = 0; i < 15 && !outputUrl; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const pollR = await fetch(pollUrl, { headers: { 'Authorization': `Bearer ${replicateToken}` } });
          const pollData = await pollR.json();
          if (pollData.status === 'succeeded') outputUrl = pollData.output?.[0] ?? null;
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
      const r = await fetch(
        'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell',
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
  const { error: dbError } = await supabase.from('surrogate_portraits').insert({
    session_id: sessionId,
    email: email ?? null,
    conversation_themes: themes,
    dalle_prompt: enhancedPrompt,
    image_url: portraitUrl,
    google_ai_generated: googleAiGenerated,
    procedural_framework: {
      style,
      sneakar_branded: true,
      culture_coin_elements: true,
      cyberpunk_aesthetic: true,
      themes,
      generation_method: generationMethod,
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
      ...(googleAiError && { googleAiError }),
      ...(imageErrors.length && { imageErrors }),
      apiUsed: generationMethod,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildBasePrompt(themes: string[]): string {
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
  const desc = themes.map(t => themeMap[t] ?? t).filter(Boolean).join(', ');
  return `FreakDali cyberpunk graffiti oracle portrait: ${desc}. SNEAKAR branded elements, Culture Coin golden accents, neon geometric face patterns, holographic effects. High quality digital art masterpiece, portrait orientation.`;
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
