/**
 * Live video-model resolver for Co-pilot and seeker model choice.
 *
 * Replicate is queried for the current public model catalog. A small Gemini
 * request ranks the live results against the brief; it never invents a slug
 * or claims a model is available without a Replicate response.
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
};

const GEMINI_MODEL = 'gemini-3.7-flash';
const GEMINI_REST_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const FAL_MINIMAX_H3_MAX_SLUG = 'minimax/h3-max/image-to-video';
const FALLBACK_MODELS = [
  { slug: FAL_MINIMAX_H3_MAX_SLUG, label: 'MiniMax H3 Max · 768P', description: 'FAL-hosted MiniMax H3 Max motion from each locked still anchor.', costLabel: 'Hosted H3 Max scene' },
];
type ReplicateModel = {
  slug: string;
  label: string;
  description: string;
  costLabel: string;
  provider: 'replicate';
  availability: 'available' | 'unavailable' | 'unknown';
  modelUrl?: string;
  versionId?: string;
  runCount?: number;
};

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

function modelSlug(owner: unknown, name: unknown): string {
  const cleanOwner = cleanText(owner, 80).replace(/[^a-zA-Z0-9_-]/g, '');
  const cleanName = cleanText(name, 120).replace(/[^a-zA-Z0-9_.-]/g, '');
  return cleanOwner && cleanName ? `${cleanOwner}/${cleanName}` : '';
}

function normalizeReplicateModel(raw: unknown): ReplicateModel | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const model = record.model && typeof record.model === 'object'
    ? record.model as Record<string, unknown>
    : record;
  const slug = cleanText(model.slug, 180) || modelSlug(model.owner, model.name);
  if (!slug || !slug.includes('/')) return null;
  const latestVersion = model.latest_version && typeof model.latest_version === 'object'
    ? model.latest_version as Record<string, unknown>
    : {};
  const description = cleanText(model.description, 360);
  const label = cleanText(model.name, 120) || slug.split('/').pop() || slug;
  return {
    slug,
    label,
    description: description || 'Public Replicate model.',
    costLabel: 'Replicate public model',
    provider: 'replicate',
    availability: 'available',
    modelUrl: cleanText(model.url, 400) || `https://replicate.com/${slug}`,
    versionId: cleanText(latestVersion.id, 180) || undefined,
    runCount: Number(model.run_count) > 0 ? Number(model.run_count) : undefined,
  };
}

async function replicateRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const token = Deno.env.get('REPLICATE_API_TOKEN') || Deno.env.get('REPLICATE_API_KEY');
  if (!token) throw new Error('Replicate model search is not configured.');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');
  return fetch(`https://api.replicate.com${path}`, { ...init, headers });
}

async function searchReplicateModels(query: string): Promise<ReplicateModel[]> {
  const response = await replicateRequest(`/v1/search?query=${encodeURIComponent(query)}`);
  if (!response.ok) throw new Error(`Replicate search ${response.status}`);
  const data = await response.json() as Record<string, unknown>;
  const rawResults = Array.isArray(data.models)
    ? data.models
    : Array.isArray(data.results)
      ? data.results
      : [];
  const unique = new Map<string, ReplicateModel>();
  for (const raw of rawResults) {
    const normalized = normalizeReplicateModel(raw);
    if (normalized && !unique.has(normalized.slug)) unique.set(normalized.slug, normalized);
  }
  return Array.from(unique.values()).slice(0, 12);
}

async function exactReplicateModel(query: string): Promise<ReplicateModel | null> {
  const match = query.trim().match(/^([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (!match) return null;
  const response = await replicateRequest(`/v1/models/${encodeURIComponent(match[1])}/${encodeURIComponent(match[2])}`);
  if (response.status === 404) {
    return {
      slug: `${match[1]}/${match[2]}`,
      label: match[2],
      description: 'Replicate did not return this public model.',
      costLabel: 'Not available on Replicate',
      provider: 'replicate',
      availability: 'unavailable',
      modelUrl: `https://replicate.com/${match[1]}/${match[2]}`,
    };
  }
  if (!response.ok) throw new Error(`Replicate model lookup ${response.status}`);
  return normalizeReplicateModel(await response.json());
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
    const action = cleanText(body.action, 40) || 'advise';
    const brief = cleanText(body.brief, 1200);
    const query = cleanText(body.query ?? body.modelQuery, 180);
    const models = approvedModels();
    if (action === 'resolve') {
      if (!query) return json({ success: false, error: 'Name a video model or describe the kind of motion you want.' }, 400);
      const exact = await exactReplicateModel(query);
      const candidates = exact?.availability === 'available'
        ? [exact, ...(await searchReplicateModels(query)).filter(model => model.slug !== exact.slug)]
        : await searchReplicateModels(query);
      return json({
        success: true,
        query,
        availability: exact?.availability ?? (candidates.length ? 'available' : 'unknown'),
        resolvedModel: exact?.availability === 'available' ? exact : candidates[0] ?? null,
        candidates,
        source: 'replicate',
      });
    }
    if (!brief) return json({ success: false, error: 'A story brief is required.' }, 400);
    const replicateCandidates = query ? await searchReplicateModels(query) : [];
    const apiKey = Deno.env.get('GOOGLE_AI_API_KEY');
    if (!apiKey) return json({ success: false, error: 'Co-pilot advisor is not configured.' }, 503);

    const prompt = [
       'You are Co-pilot advising a creator who is choosing a video model.',
       'Recommend only from the live Replicate candidates or the approved hosted catalog. Never invent a slug, never submit a job, and never promise an exact result.',
      'The visual source is a locked 32-panel 4x4 illustration story. Preserve the supplied artwork; the local lane is free and should remain the default.',
      `Story brief: ${brief}`,
       `Approved hosted catalog: ${JSON.stringify(models)}`,
       `Live Replicate candidates: ${JSON.stringify(replicateCandidates)}`,
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
    const approved = new Map([
      ...models.map(model => [model.slug, { ...model, provider: 'fal' as const, availability: 'unknown' as const }]),
      ...replicateCandidates.map(model => [model.slug, model]),
    ]);
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
       summary: cleanText(parsed.summary, 360) || 'The local lane remains the default; live Replicate results show whether a requested model is currently available.',
      submittedJob: false,
    });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : 'Advisor failed.' }, 500);
  }
});