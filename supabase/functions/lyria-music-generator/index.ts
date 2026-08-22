/**
 * Generate a natural-length Lyria 3 clip, capped at three minutes.
 *
 * The browser never receives the Google key. The function returns the MP3 as
 * base64 because a generated clip is short and this keeps the client contract
 * independent of storage bucket/public URL configuration.
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
};

const MAX_PROMPT_LENGTH = 600;
const MAX_DURATION_SECONDS = 180;
const INTERACTION_TIMEOUT_MS = 90_000;
const INTERACTION_POLL_MS = 1_500;
const DEFAULT_PROMPT =
  'A dark, cinematic instrumental cyberpunk beat for a neon alley oracle, 96 BPM, D minor, ' +
  'deep analog bass, fractured percussion, glassy synth pulses, no vocals, no lyrics.';

// Google may reject prompts that ask for a living artist's recognizable style.
// Preserve the seeker's musical intent by replacing the reference with high-level
// traits rather than forwarding an imitation request to the provider.
function neutralizeArtistReferences(prompt: string): string {
  const replacements: Array<[RegExp, string]> = [
    [/\bBrad\s+Mehldau(?:['’]s)?(?:-style|\s+style)?/gi, 'exploratory modern jazz piano'],
    [/\bQwel(?:['’]s)?(?:-style|\s+style)?/gi, 'abstract spoken-word hip-hop rhythmic energy'],
    [/\bKurt\s+Rosenwinkel(?:['’]s)?(?:-style|\s+style)?/gi, 'angular lyrical electric-guitar harmony'],
    [/\bBryan\s+Blade(?:['’]s)?(?:-style|\s+style)?/gi, 'dynamic acoustic jazz drumming'],
  ];
  return replacements.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), prompt);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function providerMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: unknown } | string; message?: unknown };
    const value = typeof parsed.error === 'object' && parsed.error
      ? parsed.error.message
      : typeof parsed.error === 'string'
        ? parsed.error
        : parsed.message;
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 240);
  } catch {
    // Keep a short non-JSON provider response useful for diagnostics.
  }
  return raw.replace(/\s+/g, ' ').trim().slice(0, 240);
}

type AudioPayload = {
  data?: unknown;
  base64?: unknown;
  audio_base64?: unknown;
  mime_type?: unknown;
  mimeType?: unknown;
  type?: unknown;
};

function findAudioPayload(value: unknown, depth = 0): AudioPayload | null {
  if (!value || typeof value !== 'object' || depth > 8) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const audio = findAudioPayload(item, depth + 1);
      if (audio) return audio;
    }
    return null;
  }

  const object = value as Record<string, unknown>;
  const type = typeof object.type === 'string' ? object.type.toLowerCase() : '';
  const mime = typeof object.mime_type === 'string'
    ? object.mime_type
    : typeof object.mimeType === 'string'
      ? object.mimeType
      : '';
  const hasData = typeof object.data === 'string' ||
    typeof object.base64 === 'string' ||
    typeof object.audio_base64 === 'string';
  if (hasData && (type === 'audio' || mime.startsWith('audio/'))) {
    return object as AudioPayload;
  }

  for (const key of ['output_audio', 'outputAudio', 'audio', 'content', 'parts', 'outputs', 'steps', 'inlineData', 'inline_data']) {
    const audio = findAudioPayload(object[key], depth + 1);
    if (audio) return audio;
  }
  return null;
}

function responseShape(result: Record<string, unknown>): Record<string, unknown> {
  const outputs = Array.isArray(result.outputs) ? result.outputs : [];
  const steps = Array.isArray(result.steps) ? result.steps : [];
  return {
    topLevelKeys: Object.keys(result).slice(0, 20),
    status: result.status,
    interactionId: typeof result.id === 'string' ? result.id : undefined,
    outputAudio: result.output_audio && typeof result.output_audio === 'object'
      ? Object.keys(result.output_audio as Record<string, unknown>).slice(0, 12)
      : undefined,
    outputs: outputs.slice(0, 8).map((value) => (
      value && typeof value === 'object'
        ? Object.keys(value as Record<string, unknown>).slice(0, 12)
        : typeof value
    )),
    steps: steps.slice(0, 8).map((value) => (
      value && typeof value === 'object'
        ? {
            keys: Object.keys(value as Record<string, unknown>).slice(0, 12),
            status: (value as Record<string, unknown>).status,
            type: (value as Record<string, unknown>).type,
          }
        : typeof value
    )),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const requestId = crypto.randomUUID();
  const apiKeys = [
    Deno.env.get('GOOGLE_GENERATIVE_AI_API_KEY'),
    Deno.env.get('GOOGLE_AI_API_KEY'),
    Deno.env.get('GEMINI_API_KEY'),
  ].filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);
  if (!apiKeys.length) {
    return json({ error: 'Lyria is unavailable: provider key is not configured.', requestId }, 503);
  }

  let payload: { prompt?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const requested = typeof payload.prompt === 'string' ? payload.prompt.trim() : '';
  const prompt = neutralizeArtistReferences(requested || DEFAULT_PROMPT).slice(0, MAX_PROMPT_LENGTH);
  // Instrumental is the default, but an explicit request for a song/lyrics is
  // allowed through. Do not silently rewrite a seeker's creative brief.
  const asksForLyrics = /\b(lyric|lyrics|vocal|vocals|sing|singer|verse|verses|chorus|hook|song)\b/i.test(prompt);
  const durationInstruction =
    `Create a complete, dynamically arranged track with a natural ending. ` +
    `Do not exceed ${MAX_DURATION_SECONDS} seconds. Let the arrangement develop beyond the opening minute.`;
  const jazzGuard = /\b(jazz|bebop|swing|straight[- ]ahead|hard[- ]bop|cool jazz|jazz trio)\b/i.test(prompt)
    ? ` This is jazz: use acoustic jazz harmony, walking or conversational bass, ride-cymbal swing, ` +
      `improvised piano/guitar interplay, and a real jazz ending. Do not use country, folk, bluegrass, ` +
      `Nashville, pedal steel, banjo, twang, or four-on-the-floor pop production.`
    : '';
  const safePrompt = asksForLyrics
    ? `${prompt}. ${durationInstruction}${jazzGuard} Write and perform original lyrics that fit the requested story.`
    : `${prompt}. ${durationInstruction}${jazzGuard} Instrumental only. No vocals. No lyrics.`;
  const model = 'lyria-3-pro-preview';

  let upstream: Response | null = null;
  let raw = '';
  let successfulApiKey = apiKeys[0];
  for (const apiKey of apiKeys) {
    try {
      upstream = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          model,
          input: safePrompt,
        }),
      });
      raw = await upstream.text();
      if (upstream.ok) {
        successfulApiKey = apiKey;
        break;
      }
      if (![401, 403, 429].includes(upstream.status)) break;
      console.warn('[Lyria] provider key rejected, trying next key', {
        requestId,
        status: upstream.status,
      });
    } catch (error) {
      console.error('[Lyria] provider request failed', { requestId, error: String(error).slice(0, 240) });
      return json({
        error: 'Lyria could not be reached. The Oracle remains available.',
        code: 'PROVIDER_UNREACHABLE',
        requestId,
      }, 502);
    }
  }

  if (!upstream || !upstream.ok) {
    const status = upstream?.status ?? 502;
    const code = status === 429
      ? 'PROVIDER_QUOTA_EXHAUSTED'
      : status === 401 || status === 403
        ? 'PROVIDER_AUTH_FAILED'
        : 'PROVIDER_REQUEST_FAILED';
    console.error('[Lyria] provider returned', {
      requestId,
      status,
      message: providerMessage(raw),
    });
    return json({
      error: 'Lyria could not generate a track right now. The Oracle remains available.',
      code,
      providerStatus: status,
      providerMessage: providerMessage(raw),
      requestId,
    }, status >= 500 ? 502 : status);
  }

  try {
    let result = JSON.parse(raw) as Record<string, unknown>;
    const interactionId = typeof result.id === 'string' ? result.id : '';
    const startedAt = Date.now();
    while (
      interactionId &&
      typeof result.status === 'string' &&
      !['completed', 'failed', 'cancelled'].includes(result.status) &&
      Date.now() - startedAt < INTERACTION_TIMEOUT_MS
    ) {
      await new Promise((resolve) => setTimeout(resolve, INTERACTION_POLL_MS));
      const poll = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/interactions/${encodeURIComponent(interactionId)}`,
        {
          headers: { 'x-goog-api-key': successfulApiKey },
        },
      );
      const pollRaw = await poll.text();
      if (!poll.ok) {
        console.error('[Lyria] interaction polling failed', {
          requestId,
          status: poll.status,
          message: providerMessage(pollRaw),
        });
        return json({
          error: 'Lyria could not retrieve the generated track. The Oracle remains available.',
          code: 'INTERACTION_POLL_FAILED',
          providerStatus: poll.status,
          providerMessage: providerMessage(pollRaw),
          requestId,
        }, poll.status >= 500 ? 502 : poll.status);
      }
      result = JSON.parse(pollRaw) as Record<string, unknown>;
    }
    if (interactionId && result.status !== 'completed') {
      const status = typeof result.status === 'string' ? result.status : 'unknown';
      return json({
        error: status === 'failed'
          ? 'Lyria rejected this music brief. The Oracle remains available.'
          : status === 'cancelled'
            ? 'Lyria cancelled this music brief. The Oracle remains available.'
            : 'Lyria took too long to return a track. The Oracle remains available.',
        code: status === 'failed'
          ? 'INTERACTION_FAILED'
          : status === 'cancelled'
            ? 'INTERACTION_CANCELLED'
            : 'INTERACTION_TIMEOUT',
        requestId,
        responseShape: responseShape(result),
      }, status === 'failed' || status === 'cancelled' ? 502 : 504);
    }
    // Google documents output_audio as the generated audio convenience field.
    // Only use the older recursive search as a compatibility path when that
    // documented field is absent; never choose an arbitrary earlier audio step
    // when the final generated output is available.
    const documentedAudio = result.output_audio ?? result.outputAudio;
    const audio = documentedAudio && typeof documentedAudio === 'object'
      ? documentedAudio as AudioPayload
      : findAudioPayload(result);
    const audioBase64 = typeof audio?.data === 'string'
      ? audio.data
      : typeof audio?.base64 === 'string'
        ? audio.base64
        : typeof audio?.audio_base64 === 'string'
          ? audio.audio_base64
          : '';
    if (!audioBase64) {
      const shape = responseShape(result);
      console.error('[Lyria] response did not include playable audio', { requestId, shape });
      return json({
        error: 'Lyria returned no playable audio. The Oracle remains available.',
        code: 'INVALID_AUDIO_RESPONSE',
        requestId,
        responseShape: shape,
      }, 502);
    }
    return json({
      audioBase64,
      mimeType: typeof audio.mime_type === 'string'
        ? audio.mime_type
        : typeof audio.mimeType === 'string'
          ? audio.mimeType
          : 'audio/mpeg',
      // Pro is the long-form model; keep this as an honest upper-bound hint
      // rather than claiming an exact duration before the browser decodes it.
      durationSeconds: MAX_DURATION_SECONDS,
      model,
      prompt: safePrompt,
      requestId,
      interactionId: interactionId || undefined,
      outputText: typeof result.output_text === 'string'
        ? result.output_text
        : typeof result.outputText === 'string'
          ? result.outputText
          : undefined,
      responseShape: responseShape(result),
    });
  } catch {
    return json({
      error: 'Lyria returned an unreadable response. The Oracle remains available.',
      code: 'INVALID_PROVIDER_RESPONSE',
      requestId,
    }, 502);
  }
});