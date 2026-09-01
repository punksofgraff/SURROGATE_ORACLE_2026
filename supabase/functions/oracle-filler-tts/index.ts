/**
 * oracle-filler-tts — Supabase Edge Function
 *
 * Generates a fresh Oracle thinking vocalization via Gemini TTS on demand.
 * Client fires this at Seeker turn-end; audio plays only if Gemini is slow
 * (≥2000 ms gap) AND real Oracle PCM hasn't arrived yet.
 *
 * POST { prompt?: string } → WAV audio bytes
 *
 * Deploy:
 *   npx supabase functions deploy oracle-filler-tts \
 *     --project-ref $SUPABASE_PROJECT_REF --use-api --no-verify-jwt
 */

const GOOGLE_AI_KEY  = Deno.env.get('GOOGLE_AI_KEY_FREE')
  ?? Deno.env.get('GOOGLE_AI_API_KEY')
  ?? Deno.env.get('GOOGLE_GENERATIVE_AI_API_KEY')
  ?? Deno.env.get('GEMINI_API_KEY')
  ?? '';
const TTS_MODEL      = 'gemini-2.5-flash-preview-tts';
const DEFAULT_VOICE  = Deno.env.get('ORACLE_TTS_VOICE') ?? 'Sadaltager';
const GEMINI_TTS_URL = `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-oracle-request-id, x-oracle-session-id',
};

function pcmToWav(pcm: Uint8Array, sampleRate: number, channels = 1, bitsPerSample = 16): Uint8Array {
  const dataSize = pcm.length;
  const buf = new ArrayBuffer(44 + dataSize);
  const v   = new DataView(buf);
  const w   = (off: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true);
  w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1,  true);
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * channels * (bitsPerSample / 8), true);
  v.setUint16(32, channels * (bitsPerSample / 8), true);
  v.setUint16(34, bitsPerSample, true);
  w(36, 'data'); v.setUint32(40, dataSize, true);
  new Uint8Array(buf, 44).set(pcm);
  return new Uint8Array(buf);
}

Deno.serve(async (req: Request) => {
  // Dev-trace correlation: echo client-supplied ids into function logs (no-op for real seekers).
  { const _rid = req.headers.get('x-oracle-request-id'); if (_rid) console.log('[trace] rid=' + _rid + ' sid=' + (req.headers.get('x-oracle-session-id') ?? '')); }
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response('POST required', { status: 405, headers: CORS_HEADERS });
  }

  if (!GOOGLE_AI_KEY) {
    console.error('[oracle-filler-tts] GOOGLE_AI_KEY_FREE not set');
    return new Response('TTS key not configured', { status: 503, headers: CORS_HEADERS });
  }

  let prompt = 'low, slow contemplative murmur — Hmmm... mmm';
  try {
    const body = await req.json();
    if (typeof body?.prompt === 'string' && body.prompt.length > 0) prompt = body.prompt;
  } catch { /* use default prompt */ }

  let geminiRes: Response;
  try {
    geminiRes = await fetch(`${GEMINI_TTS_URL}?key=${GOOGLE_AI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: DEFAULT_VOICE } },
          },
        },
      }),
    });
  } catch (e) {
    console.error('[oracle-filler-tts] Gemini TTS network error:', e);
    return new Response('TTS request failed', { status: 502, headers: CORS_HEADERS });
  }

  if (!geminiRes.ok) {
    const errBody = await geminiRes.text().catch(() => '');
    console.error(`[oracle-filler-tts] Gemini TTS ${geminiRes.status}:`, errBody);
    return new Response('TTS upstream error', { status: 502, headers: CORS_HEADERS });
  }

  let data: unknown;
  try {
    data = await geminiRes.json();
  } catch (e) {
    console.error('[oracle-filler-tts] Failed to parse Gemini TTS response:', e);
    return new Response('TTS parse error', { status: 502, headers: CORS_HEADERS });
  }

  // deno-lint-ignore no-explicit-any
  const inlineData = (data as any)?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!inlineData?.data) {
    console.error('[oracle-filler-tts] No audio in TTS response:', JSON.stringify(data).slice(0, 300));
    return new Response('No audio in TTS response', { status: 502, headers: CORS_HEADERS });
  }

  const rawBytes: Uint8Array = Uint8Array.from(atob(inlineData.data as string), c => c.charCodeAt(0));
  const mimeType: string     = (inlineData.mimeType as string) ?? '';

  let audioBytes: Uint8Array;
  let contentType: string;

  if (mimeType.includes('pcm') || mimeType.includes('L16') || mimeType.startsWith('audio/pcm')) {
    const rateMatch = mimeType.match(/rate=(\d+)/);
    const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;
    audioBytes  = pcmToWav(rawBytes, sampleRate);
    contentType = 'audio/wav';
  } else {
    audioBytes  = rawBytes;
    contentType = mimeType.split(';')[0] || 'audio/mpeg';
  }

  return new Response(audioBytes, {
    headers: {
      ...CORS_HEADERS,
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
    },
  });
});
