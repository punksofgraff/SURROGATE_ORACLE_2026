/**
 * Co-pilot model advisor for the optional FAL story lane.
 *
 * This function may recommend an approved model slug, but it never submits a
 * FAL request. The browser still needs an explicit confirmation before the
 * story job function will accept a hosted render.
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
};

const GEMINI_MODEL = 'gemini-3.7-flash';
const GEMINI_REST_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const FALLBACK_MODELS = [
  { slug: 'fal-ai/wan-i2v', label: 'Wan 2.1 I2V · 480p', description: 'Lowest-cost short motion from each locked still anchor.', costLabel: '$0.20 / scene at 480p' },
  { slug: 'fal-ai/wan-pro/image-to-video', label: 'Wan Pro I2V', description: 'Higher-fidelity motion for a deliberately premium pass.', costLabel: 'Higher-cost premium scene' },
];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function cleanText(value: unknown, max = 500): string {
  return typeof value === 'string'
    ? value.replace(/https?:\/\/\S+/gi, '').replace(/["'`{}<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
    : '';
}

function approvedModels(): typeof FALLBACK_MODELS {
  const raw = Deno.env.get('FAL_STORY_MODEL_CATALOG');
  if (!raw) return FALLBACK_MODELS;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return FALLBACK_MODELS;
    const models = parsed.flatMap(item => {
      if (!item || typeof item !== 'object') return [];
      const record = item as Record<string, unknown>;
      const slug = cleanText(record.slug, 180);
      if (!slug || /seedance/i.test(slug)) return [];
      return [{
        slug,
        label: cleanText(record.label, 100) || slug,
        description: cleanText(record.description, 240) || 'Approved FAL image-to-video model.',
        costLabel: cleanText(record.costLabel, 100) || 'Cost varies by FAL',
      }];
    });
    return models.length ? models : FALLBACK_MODELS;
  } catch {
    return FALLBACK_MODELS;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ success: false, error: 'POST required.' }, 405);

  try {
    const body = await req.json() as Record<string, unknown>;
    const brief = cleanText(body.brief, 1200);
    const models = approvedModels();
    if (!brief) return json({ success: false, error: 'A story brief is required.' }, 400);
    const apiKey = Deno.env.get('GOOGLE_AI_API_KEY');
    if (!apiKey) return json({ success: false, error: 'Co-pilot advisor is not configured.' }, 503);

    const prompt = [
      'You are Co-pilot advising a creator who is deciding whether to use an optional hosted FAL image-to-video model.',
      'Recommend only from the supplied approved catalog. Never invent a slug, never submit a job, and never promise an exact result.',
      'The visual source is a locked 32-panel 4x4 illustration story. Preserve the supplied artwork; the local lane is free and should remain the default.',
      `Story brief: ${brief}`,
      `Approved catalog: ${JSON.stringify(models)}`,
      'Return JSON only with this shape: {"recommendations":[{"slug":"approved slug","reason":"brief reason","fit":"low|medium|high"}],"summary":"one sentence tradeoff"}',
      'Return at most two recommendations and include the cost/duration tradeoff in the summary.',
    ].join('\n\n');

    const response = await fetch(`${GEMINI_REST_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1200, responseMimeType: 'application/json' },
      }),
    });
    if (!response.ok) return json({ success: false, error: `Gemini advisor ${response.status}` }, 502);
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text).filter(Boolean).join('') ?? '';
    let parsed: { recommendations?: unknown; summary?: unknown } = {};
    try { parsed = JSON.parse(text); } catch { /* validation below returns a safe fallback */ }
    const approved = new Map(models.map(model => [model.slug, model]));
    const recommendations = Array.isArray(parsed.recommendations)
      ? parsed.recommendations.flatMap(item => {
        if (!item || typeof item !== 'object') return [];
        const record = item as Record<string, unknown>;
        const model = approved.get(cleanText(record.slug, 180));
        if (!model) return [];
        return [{
          ...model,
          slug: model.slug,
          reason: cleanText(record.reason, 280) || model.description,
          fit: ['low', 'medium', 'high'].includes(String(record.fit)) ? String(record.fit) : 'medium',
        }];
      }).slice(0, 2)
      : [];
    return json({
      success: true,
      recommendations,
      summary: cleanText(parsed.summary, 360) || 'The free local lane remains the default; hosted motion adds cost and wait time.',
      submittedJob: false,
    });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : 'Advisor failed.' }, 500);
  }
});