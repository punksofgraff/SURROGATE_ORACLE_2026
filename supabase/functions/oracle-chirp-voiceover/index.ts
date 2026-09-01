/**
 * Oracle lore voiceover — Google Cloud Chirp 3 HD, speaker by speaker.
 *
 * POST { lines: [{ speaker, text, pauseAfterMs? }] } -> WAV audio bytes
 *
 * Each line is synthesized independently so the episode can use a distinct
 * ranged voice for the Oracle, each child, and each character. The returned
 * file is a single PCM WAV assembled from the validated LINEAR16 payloads.
 */

const GOOGLE_TTS_KEY = Deno.env.get('GOOGLE_CLOUD_TTS_API_KEY')
  ?? Deno.env.get('VERTEX_AI_API_KEY')
  ?? Deno.env.get('GOOGLE_AI_API_KEY')
  ?? Deno.env.get('GOOGLE_GENERATIVE_AI_API_KEY')
  ?? Deno.env.get('GEMINI_API_KEY')
  ?? '';
const TTS_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const SAMPLE_RATE = 24_000;
const CHANNELS = 1;
const BYTES_PER_SAMPLE = 2;
const MAX_LINES = 80;
const MAX_CHARS = 4_000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Speaker = 'oracle' | 'levi' | 'lennon' | 'pickles' | 'ghost-spider' | 'mario-spider-man' | 'donkey';
type Line = { speaker: Speaker; text: string; pauseAfterMs?: number };

const VOICES: Record<Speaker, string> = {
  oracle: 'en-US-Chirp3-HD-Charon',
  levi: 'en-US-Chirp3-HD-Puck',
  lennon: 'en-US-Chirp3-HD-Aoede',
  pickles: 'en-US-Chirp3-HD-Fenrir',
  'ghost-spider': 'en-US-Chirp3-HD-Kore',
  'mario-spider-man': 'en-US-Chirp3-HD-Orus',
  donkey: 'en-US-Chirp3-HD-Algenib',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}

function clampPause(value: unknown): number {
  return Math.max(80, Math.min(1_200, Number(value) || 260));
}

function readLines(value: unknown): Line[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_LINES) {
    throw new Error(`Expected 1-${MAX_LINES} voice lines.`);
  }
  return value.map((entry, index) => {
    const record = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
    const speaker = record.speaker;
    const text = typeof record.text === 'string' ? record.text.trim() : '';
    if (!Object.hasOwn(VOICES, speaker) || !text || text.length > MAX_CHARS) {
      throw new Error(`Voice line ${index + 1} is invalid.`);
    }
    return { speaker: speaker as Speaker, text, pauseAfterMs: clampPause(record.pauseAfterMs) };
  });
}

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), character => character.charCodeAt(0));
}

function readPcmChunk(wav: Uint8Array): Uint8Array {
  // Google LINEAR16 normally returns a 44-byte WAV, but locate the data chunk
  // defensively so the stitch remains correct if the header gains metadata.
  for (let index = 12; index + 8 <= wav.length; ) {
    const tag = String.fromCharCode(wav[index], wav[index + 1], wav[index + 2], wav[index + 3]);
    const size = new DataView(wav.buffer, wav.byteOffset, wav.byteLength).getUint32(index + 4, true);
    if (tag === 'data') return wav.slice(index + 8, Math.min(wav.length, index + 8 + size));
    index += 8 + size;
  }
  throw new Error('Chirp returned an audio payload without a PCM data chunk.');
}

function silence(ms: number): Uint8Array {
  return new Uint8Array(Math.round(SAMPLE_RATE * ms / 1_000) * CHANNELS * BYTES_PER_SAMPLE);
}

function wavFromPcm(pcm: Uint8Array): Uint8Array {
  const output = new ArrayBuffer(44 + pcm.length);
  const view = new DataView(output);
  const bytes = new Uint8Array(output);
  const write = (offset: number, value: string) => value.split('').forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  write(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, CHANNELS, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE, true);
  view.setUint16(32, CHANNELS * BYTES_PER_SAMPLE, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, pcm.length, true);
  bytes.set(pcm, 44);
  return bytes;
}

async function synthesize(line: Line): Promise<Uint8Array> {
  const response = await fetch(`${TTS_URL}?key=${encodeURIComponent(GOOGLE_TTS_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text: line.text },
      voice: { languageCode: 'en-US', name: VOICES[line.speaker] },
      audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: SAMPLE_RATE },
    }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Chirp TTS ${response.status}: ${body.slice(0, 220)}`);
  let data: { audioContent?: string };
  try { data = JSON.parse(body) as { audioContent?: string }; } catch { throw new Error('Chirp TTS returned invalid JSON.'); }
  if (!data.audioContent) throw new Error('Chirp TTS returned no audio.');
  return readPcmChunk(decodeBase64(data.audioContent));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'POST required.' }, 405);
  if (!GOOGLE_TTS_KEY) return json({ error: 'Google Cloud TTS is not configured.' }, 503);
  try {
    const body = await req.json();
    const lines = readLines(body?.lines);
    const chunks: Uint8Array[] = [];
    for (let start = 0; start < lines.length; start += 4) {
      const batch = await Promise.all(lines.slice(start, start + 4).map(synthesize));
      batch.forEach((chunk, index) => {
        chunks.push(chunk);
        if (start + index < lines.length - 1) chunks.push(silence(lines[start + index].pauseAfterMs ?? 260));
      });
    }
    const pcm = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
    let offset = 0;
    chunks.forEach(chunk => { pcm.set(chunk, offset); offset += chunk.length; });
    return new Response(wavFromPcm(pcm), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store', 'X-Voice-Provider': 'chirp-3-hd' },
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Chirp voiceover failed.' }, 400);
  }
});