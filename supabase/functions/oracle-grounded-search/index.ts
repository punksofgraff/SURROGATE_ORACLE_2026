/**
 * On-demand, explicitly requested web grounding for the live Oracle.
 * One bounded Gemini Search request; provider credentials remain server-side.
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
};

const GEMINI_MODEL = 'gemini-3.7-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_QUERY_LENGTH = 800;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);

  const apiKey = Deno.env.get('GOOGLE_AI_KEY_PAID') ??
    Deno.env.get('GOOGLE_GENERATIVE_AI_API_KEY') ??
    Deno.env.get('GOOGLE_AI_API_KEY');
  if (!apiKey) return json({ success: false, error: 'Grounded search is not configured.' }, 503);

  try {
    const body = await req.json();
    const query = typeof body?.query === 'string' ? body.query.trim().slice(0, MAX_QUERY_LENGTH) : '';
    if (query.length < 4) return json({ success: false, error: 'Add a question or topic to search.' }, 400);

    const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{
            text: [
              'Answer the seeker’s request using Google Search grounding. Prioritize current, verifiable information.',
              'Be concise and factual. If evidence is incomplete or conflicting, say so. Never invent facts or sources.',
              `Seeker request:\n${query}`,
            ].join('\n\n'),
          }],
        }],
        tools: [{ googleSearch: {} }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
      }),
    });

    if (!response.ok) {
      const detail = (await response.text()).replace(/\s+/g, ' ').slice(0, 300);
      console.error(`oracle-grounded-search Gemini ${response.status}: ${detail}`);
      return json({ success: false, error: `Grounded search provider returned ${response.status}.` }, 502);
    }

    const payload = await response.json();
    const candidate = payload.candidates?.[0];
    const answer = candidate?.content?.parts
      ?.map((part: { text?: unknown }) => typeof part.text === 'string' ? part.text : '')
      .filter(Boolean)
      .join('\n')
      .trim();
    if (!answer) return json({ success: false, error: 'Grounded search returned no answer.' }, 502);

    const seen = new Set<string>();
    const sources: Array<{ title: string; uri: string }> = [];
    for (const chunk of candidate?.groundingMetadata?.groundingChunks ?? []) {
      const uri = typeof chunk?.web?.uri === 'string' ? chunk.web.uri : '';
      if (!/^https?:\/\//i.test(uri) || seen.has(uri)) continue;
      seen.add(uri);
      sources.push({
        title: String(chunk.web.title ?? '').slice(0, 200),
        uri,
      });
      if (sources.length === 8) break;
    }

    return json({ success: true, answer: answer.slice(0, 7000), sources });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('oracle-grounded-search failed:', message);
    return json({ success: false, error: 'Grounded search failed. Please try again.' }, 502);
  }
});
