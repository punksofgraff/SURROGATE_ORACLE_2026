/**
 * gemini-portrait-generator — Supabase Edge Function
 *
 * Pipeline:
 *   1. Gemini 2.5 Flash  → enriches the theme prompt into a vivid art description
 *   2. DALL-E 3          → generates the actual image (no `style` param — removed for API compat)
 *   3. Themed static URL → final fallback if both AI providers fail
 *
 * Secrets required (set via: npx supabase secrets set KEY=value --project-ref <ref>):
 *   GOOGLE_AI_API_KEY   — Google AI Studio key (generativelanguage.googleapis.com)
 *   OPENAI_API_KEY      — OpenAI key with DALL-E 3 access
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
  let googleAiGenerated = false;
  let dalleGenerated = false;
  let googleAiError = '';
  let dalleError = '';

  // ── STEP 1: Enhance prompt with Gemini 2.5 Flash ──────────────────────────
  let enhancedPrompt = basePrompt;
  const googleAiApiKey = Deno.env.get('GOOGLE_AI_API_KEY');
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
                text: `You are a visual art prompt engineer. Rewrite this for DALL-E 3 image generation. Keep under 280 characters. Focus on vivid visual details, cyberpunk street art, neon colours. Original: "${basePrompt}"`,
              }],
            }],
            generationConfig: { temperature: 0.85, maxOutputTokens: 180 },
          }),
        }
      );
      if (!r.ok) throw new Error(`Gemini ${r.status}: ${await r.text()}`);
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
    console.warn('⚠️  GOOGLE_AI_API_KEY not set — skipping Gemini enhancement');
  }

  // ── STEP 2: Generate image with DALL-E 3 ──────────────────────────────────
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  if (openaiApiKey) {
    try {
      const r = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt: enhancedPrompt,
          n: 1,
          size: '1024x1024',
          quality: 'standard',
          // NOTE: `style` deliberately omitted — rejected by some API tiers
        }),
      });
      if (!r.ok) throw new Error(`DALL-E ${r.status}: ${await r.text()}`);
      const json = await r.json();
      const url = json.data?.[0]?.url;
      if (!url) throw new Error('No URL in DALL-E response');
      portraitUrl = url;
      dalleGenerated = true;
      console.log('✅ DALL-E portrait generated');
    } catch (e: unknown) {
      dalleError = e instanceof Error ? e.message : String(e);
      console.error('❌ DALL-E failed:', dalleError);
    }
  } else {
    dalleError = 'OPENAI_API_KEY not configured';
    console.warn('⚠️  OPENAI_API_KEY not set — skipping DALL-E generation');
  }

  // ── STEP 3: Themed static fallback ────────────────────────────────────────
  if (!portraitUrl) {
    portraitUrl = getThemedFallback(themes);
    console.log('ℹ️  Using themed static fallback:', portraitUrl);
  }

  // ── Persist to database ───────────────────────────────────────────────────
  const { error: dbError } = await supabase.from('surrogate_portraits').insert({
    session_id: sessionId,
    email: email ?? null,
    conversation_themes: themes,
    dalle_prompt: enhancedPrompt,
    image_url: portraitUrl,
    dalle_generated: dalleGenerated,
    google_ai_generated: googleAiGenerated,
    procedural_framework: {
      style,
      sneakar_branded: true,
      culture_coin_elements: true,
      cyberpunk_aesthetic: true,
      themes,
      generation_method: googleAiGenerated && dalleGenerated
        ? 'gemini-enhanced-dalle'
        : dalleGenerated
          ? 'dall-e-3'
          : 'themed-fallback',
      timestamp: new Date().toISOString(),
    },
  });
  if (dbError) console.error('❌ DB insert error:', dbError);
  else console.log('✅ Portrait saved to surrogate_portraits');

  return new Response(
    JSON.stringify({
      success: !!portraitUrl,           // true even for fallback — portrait exists
      portraitUrl,
      googleAiGenerated,
      dalleGenerated,
      ...(googleAiError && { googleAiError }),
      ...(dalleError && { dalleError }),
      apiUsed: googleAiGenerated && dalleGenerated
        ? 'Gemini 2.5 Flash + DALL-E 3'
        : dalleGenerated
          ? 'DALL-E 3'
          : 'Themed static fallback',
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

// ── Themed static fallbacks (used when AI generation is unavailable) ─────────

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
