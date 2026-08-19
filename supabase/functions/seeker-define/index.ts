/**
 * seeker-define — Supabase Edge Function
 *
 * Out-of-band web-grounded identity resolution for the Returning Seeker.
 *
 * The live Oracle voice (gemini-live-proxy) runs tools:[] — no uplink, no search,
 * "signal ends at 2027." That is canon and must not change. This function is the
 * SEPARATE, backend-only path: given the name + handles a Seeker volunteers in
 * conversation, it runs a Gemini `generateContent` call WITH the `googleSearch`
 * grounding tool and returns a concise IRL dossier + its sources. The result is
 * persisted to seeker_echo for our side — it is NOT spoken back by the Oracle
 * (that would break the no-uplink persona; see SURROGATE_BUILD_CONTRACT.md).
 *
 * POST { name: string, handles?: string[], territory?: string, themes?: string[] }
 *   → { success, definition: string, confident: boolean, sources: {title,uri}[] }
 *
 * Secrets: GOOGLE_AI_API_KEY (shared with gemini-live-proxy / oracle-conversation).
 *
 * Deploy: npx supabase functions deploy seeker-define --no-verify-jwt
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey, x-oracle-request-id, x-oracle-session-id',
};

// generateContent (REST) + googleSearch grounding.
// gemini-3.7-flash: project standard for all non-multimodal text generation.
const GEMINI_MODEL = 'gemini-3.7-flash';
const GEMINI_REST_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

interface DefineRequest {
  name?: string;
  handles?: string[];
  territory?: string;
  themes?: string[];
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  // Dev-trace correlation: echo client-supplied ids into function logs (no-op for real seekers).
  { const _rid = req.headers.get('x-oracle-request-id'); if (_rid) console.log('[trace] rid=' + _rid + ' sid=' + (req.headers.get('x-oracle-session-id') ?? '')); }
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);

  try {
    const body: DefineRequest = await req.json();
    const name = (body.name ?? '').trim();
    const handles = (body.handles ?? []).map(h => String(h).trim()).filter(Boolean);

    if (!name && handles.length === 0) {
      return json({ success: false, error: 'name or handles required' }, 400);
    }

    const apiKey = Deno.env.get('GOOGLE_AI_API_KEY');
    if (!apiKey) return json({ success: false, error: 'GOOGLE_AI_API_KEY not configured' }, 500);

    // The identity signal the Seeker volunteered. Handles are the disambiguator —
    // a bare first name resolves poorly, so we lean on whatever they offered.
    const signal = [
      name ? `Name: ${name}` : null,
      handles.length ? `Handles / links they gave: ${handles.join(', ')}` : null,
      body.territory ? `They chose the frequency "${body.territory}".` : null,
      body.themes?.length ? `Themes in play: ${body.themes.join(', ')}.` : null,
    ].filter(Boolean).join('\n');

    const prompt =
      `You are a careful research assistant resolving a real person's public identity ` +
      `from what they volunteered about themselves. Use web search.\n\n${signal}\n\n` +
      `Compile a concise factual dossier (3–5 sentences) of who this person appears to be ` +
      `in real life: what they do, where, what they're known for. Only state what the ` +
      `volunteered handles/links actually support — do NOT guess at a different person who ` +
      `merely shares a common first name. If you cannot confidently resolve them, begin your ` +
      `answer with the single token "UNRESOLVED:" and then say briefly why.`;

    const r = await fetch(`${GEMINI_REST_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        tools: [{ googleSearch: {} }], // ← the web tool. Lives here, NOT in the live WS.
        // gemini-3.7-flash thinking + grounded search both eat into this cap
        // (grounded calls can spend 2000+ thought tokens); 500 would truncate.
        generationConfig: { temperature: 0.4, maxOutputTokens: 3072 },
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      console.error(`❌ seeker-define Gemini ${r.status}:`, errText);
      return json({ success: false, error: `Gemini ${r.status}` }, 502);
    }

    const data = await r.json();
    const candidate = data.candidates?.[0];
    const definition: string = candidate?.content?.parts?.map((p: any) => p.text).filter(Boolean).join(' ').trim() ?? '';
    const confident = definition.length > 0 && !definition.startsWith('UNRESOLVED:');

    // groundingMetadata.groundingChunks[].web → the sources the model actually used.
    const chunks = candidate?.groundingMetadata?.groundingChunks ?? [];
    const sources = chunks
      .map((c: any) => c?.web ? { title: c.web.title ?? '', uri: c.web.uri ?? '' } : null)
      .filter(Boolean)
      .slice(0, 8);

    console.log(`🔎 seeker-define: ${name || handles[0]} → confident=${confident}, ${sources.length} sources`);

    return json({ success: true, definition, confident, sources });
  } catch (e) {
    console.error('❌ seeker-define error:', e);
    return json({ success: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
