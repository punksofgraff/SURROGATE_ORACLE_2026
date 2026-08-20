/**
 * Generate a short, instrumental Lyria 3 clip.
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
const DEFAULT_PROMPT =
  'A dark, cinematic instrumental cyberpunk beat for a neon alley oracle, 96 BPM, D minor, ' +
  'deep analog bass, fractured percussion, glassy synth pulses, no vocals, no lyrics.';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const apiKey = Deno.env.get('GOOGLE_AI_API_KEY')
    ?? Deno.env.get('GOOGLE_GENERATIVE_AI_API_KEY')
    ?? Deno.env.get('GEMINI_API_KEY')
    ?? '';
  if (!apiKey) return json({ error: 'Lyria is unavailable: provider key is not configured.' }, 503);

  let payload: { prompt?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const requested = typeof payload.prompt === 'string' ? payload.prompt.trim() : '';
  const prompt = (requested || DEFAULT_PROMPT).slice(0, MAX_PROMPT_LENGTH);
  // Keep the feature an instrumental interlude even when the seeker asks for
  // lyrics or a song; the Oracle conversation remains the vocal channel.
  const safePrompt = `${prompt}. Instrumental only. No vocals. No lyrics.`;

  let upstream: Response;
  try {
    upstream = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        model: 'lyria-3-clip-preview',
        input: safePrompt,
      }),
    });
  } catch (error) {
    console.error('[Lyria] provider request failed', error);
    return json({ error: 'Lyria could not be reached. The Oracle remains available.' }, 502);
  }

  const raw = await upstream.text();
  if (!upstream.ok) {
    console.error('[Lyria] provider returned', upstream.status, raw.slice(0, 500));
    return json({ error: 'Lyria could not generate a track right now. The Oracle remains available.' }, upstream.status >= 500 ? 502 : upstream.status);
  }

  try {
    const result = JSON.parse(raw) as {
      output_audio?: { data?: string; mime_type?: string; mimeType?: string };
    };
    const audio = result.output_audio;
    if (!audio?.data) {
      console.error('[Lyria] response did not include output_audio');
      return json({ error: 'Lyria returned no playable audio. The Oracle remains available.' }, 502);
    }
    return json({
      audioBase64: audio.data,
      mimeType: audio.mime_type || audio.mimeType || 'audio/mpeg',
      durationSeconds: 30,
      model: 'lyria-3-clip-preview',
    });
  } catch {
    return json({ error: 'Lyria returned an unreadable response. The Oracle remains available.' }, 502);
  }
});