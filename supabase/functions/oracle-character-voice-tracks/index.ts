/**
 * Persisted character voice tracks for SURROGATE:ORACLE story work.
 *
 * POST {
 *   sessionId: string,
 *   storyKey?: string,
 *   lines: [{ speaker, text, pauseAfterMs? }]
 * } -> { trackKey, tracks, referenceAudioUrls }
 *
 * The tracks use the same Gemini TTS model family as the Oracle, but never
 * use the Oracle's configured voice. Each character is rendered with a
 * catalog voice, then pitch-shifted in a bounded, duration-preserving
 * post-process before it is stored in the oracle-films bucket.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const GOOGLE_KEYS = [
  Deno.env.get('GOOGLE_AI_KEY_PAID'),
  Deno.env.get('GOOGLE_AI_API_KEY'),
  Deno.env.get('GOOGLE_GENERATIVE_AI_API_KEY'),
  Deno.env.get('GEMINI_API_KEY'),
  Deno.env.get('GOOGLE_AI_KEY_FREE'),
].filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);

const MODEL = 'gemini-2.5-flash-preview-tts';
const SAMPLE_RATE = 24_000;
const CHANNELS = 1;
const BYTES_PER_SAMPLE = 2;
const POST_PROCESS_VERSION = 'pitch-ola-v1';
const MAX_LINES = 96;
const MAX_LINE_CHARS = 1_200;
const MAX_TOTAL_CHARS = 24_000;
const MAX_SPEAKER_COUNT = 6;
const TTS_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Speaker = 'levi' | 'lennon' | 'pickles' | 'ghost-spider' | 'mario-spider-man' | 'donkey';
type VoiceLine = { speaker: Speaker; text: string; pauseAfterMs: number };
type VoiceConfig = {
  voiceName: string;
  presentation: 'young-masculine' | 'young-feminine' | 'young-neutral';
  octaveShift: number;
  tuningCents: number;
};
type TrackRow = {
  track_key: string;
  session_id: string;
  story_key: string;
  speaker: Speaker;
  source_voice: string;
  voice_presentation: VoiceConfig['presentation'];
  post_process_version: string;
  octave_shift: number;
  tuning_cents: number;
  transcript: string;
  duration_seconds: number;
  sample_rate_hz: number;
  content_sha256: string;
  storage_path: string;
  public_url: string;
  provider: string;
  model: string;
  status: 'generating' | 'ready' | 'failed';
  error_message: string | null;
};

// Gemini's prebuilt catalog is intentionally kept explicit. This prevents an
// arbitrary request from selecting the live Oracle voice or another voice
// outside the model's supported set.
const VOICE_CATALOG = new Set([
  'Achird', 'Aoede', 'Autonoe', 'Callirrhoe', 'Charon',
  'Despina', 'Enceladus', 'Fenrir', 'Gacrux', 'Iapetus',
  'Kore', 'Leda', 'Orus', 'Puck', 'Pulcherrima',
  'Rasalgethi', 'Sadachbia', 'Sadaltager', 'Sulafat', 'Zephyr',
]);

const CHARACTER_VOICES: Record<Speaker, VoiceConfig> = {
  levi: { voiceName: 'Puck', presentation: 'young-masculine', octaveShift: -0.03, tuningCents: 6 },
  lennon: { voiceName: 'Leda', presentation: 'young-feminine', octaveShift: 0.02, tuningCents: -8 },
  pickles: { voiceName: 'Fenrir', presentation: 'young-masculine', octaveShift: -0.02, tuningCents: 4 },
  'ghost-spider': { voiceName: 'Aoede', presentation: 'young-feminine', octaveShift: 0.02, tuningCents: -5 },
  'mario-spider-man': { voiceName: 'Orus', presentation: 'young-masculine', octaveShift: -0.03, tuningCents: 7 },
  donkey: { voiceName: 'Zephyr', presentation: 'young-neutral', octaveShift: 0.04, tuningCents: -12 },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function clampPause(value: unknown): number {
  return Math.max(100, Math.min(1_500, Number(value) || 300));
}

function readLines(value: unknown): VoiceLine[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_LINES) {
    throw new Error(`Expected 1-${MAX_LINES} character voice lines.`);
  }
  let totalChars = 0;
  const lines = value.map((entry, index) => {
    const record = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
    const speaker = record.speaker;
    const text = typeof record.text === 'string' ? record.text.trim() : '';
    if (!Object.hasOwn(CHARACTER_VOICES, speaker) || !text || text.length > MAX_LINE_CHARS) {
      throw new Error(`Character voice line ${index + 1} is invalid.`);
    }
    totalChars += text.length;
    return {
      speaker: speaker as Speaker,
      text,
      pauseAfterMs: clampPause(record.pauseAfterMs),
    };
  });
  if (totalChars > MAX_TOTAL_CHARS) throw new Error('Character voice script is too long.');
  if (new Set(lines.map(line => line.speaker)).size > MAX_SPEAKER_COUNT) {
    throw new Error('Too many character speakers in one track request.');
  }
  return lines;
}

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), character => character.charCodeAt(0));
}

function readPcmChunk(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 12) return bytes;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (riff !== 'RIFF' || String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) !== 'WAVE') {
    return bytes;
  }
  for (let offset = 12; offset + 8 <= bytes.length; ) {
    const tag = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    const size = view.getUint32(offset + 4, true);
    if (tag === 'data') return bytes.slice(offset + 8, Math.min(bytes.length, offset + 8 + size));
    offset += 8 + size;
  }
  throw new Error('Gemini TTS returned a WAV without a data chunk.');
}

function silence(ms: number): Int16Array {
  return new Int16Array(Math.round(SAMPLE_RATE * ms / 1_000));
}

function pcmFromBytes(bytes: Uint8Array): Int16Array {
  if (bytes.byteLength % BYTES_PER_SAMPLE !== 0) throw new Error('TTS PCM payload is not 16-bit aligned.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pcm = new Int16Array(bytes.byteLength / BYTES_PER_SAMPLE);
  for (let index = 0; index < pcm.length; index += 1) pcm[index] = view.getInt16(index * 2, true);
  return pcm;
}

function pcmToBytes(pcm: Int16Array): Uint8Array {
  const bytes = new Uint8Array(pcm.length * BYTES_PER_SAMPLE);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < pcm.length; index += 1) view.setInt16(index * 2, pcm[index], true);
  return bytes;
}

/**
 * Small, bounded PSOLA-style overlap/add. The initial resample sets pitch;
 * granular overlap/add returns the track to its original duration, so the
 * character treatment does not move the dialogue against the scene timeline.
 */
function pitchShiftPreservingDuration(input: Int16Array, octaveShift: number, tuningCents: number): Int16Array {
  const ratio = 2 ** (octaveShift + tuningCents / 1_200);
  if (!Number.isFinite(ratio) || ratio <= 0 || Math.abs(ratio - 1) < 0.0005) return input;

  const resampledLength = Math.max(1, Math.round(input.length / ratio));
  const resampled = new Float32Array(resampledLength);
  for (let index = 0; index < resampledLength; index += 1) {
    const sourcePosition = Math.min(input.length - 1, index * ratio);
    const left = Math.floor(sourcePosition);
    const right = Math.min(input.length - 1, left + 1);
    const fraction = sourcePosition - left;
    resampled[index] = input[left] * (1 - fraction) + input[right] * fraction;
  }

  const grainSize = 1_024;
  const hop = 256;
  const output = new Float32Array(input.length);
  const weights = new Float32Array(input.length);
  for (let outStart = 0; outStart < input.length; outStart += hop) {
    const sourceStart = Math.round(outStart / ratio);
    const remaining = input.length - outStart;
    const length = Math.min(grainSize, remaining);
    for (let index = 0; index < length; index += 1) {
      const sourceIndex = Math.min(resampled.length - 1, sourceStart + index);
      const phase = index / Math.max(1, grainSize - 1);
      const window = 0.5 - 0.5 * Math.cos(2 * Math.PI * phase);
      output[outStart + index] += resampled[sourceIndex] * window;
      weights[outStart + index] += window;
    }
  }

  const result = new Int16Array(input.length);
  for (let index = 0; index < result.length; index += 1) {
    const value = weights[index] > 0.001 ? output[index] / weights[index] : 0;
    result[index] = Math.max(-32_768, Math.min(32_767, Math.round(value)));
  }
  return result;
}

function wavFromPcm(pcm: Int16Array): Uint8Array {
  const dataSize = pcm.length * BYTES_PER_SAMPLE;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const write = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
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
  view.setUint32(40, dataSize, true);
  bytes.set(pcmToBytes(pcm), 44);
  return bytes;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function concatPcm(chunks: Int16Array[]): Int16Array {
  const output = new Int16Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

async function synthesize(line: VoiceLine, key: string): Promise<Int16Array> {
  const voice = CHARACTER_VOICES[line.speaker];
  if (!VOICE_CATALOG.has(voice.voiceName)) throw new Error(`Unsupported character voice: ${voice.voiceName}`);
  const response = await fetch(`${TTS_URL}?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: line.text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice.voiceName } } },
      },
    }),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Gemini character TTS ${response.status}: ${raw.slice(0, 240)}`);
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('Gemini character TTS returned invalid JSON.');
  }
  const inline = (data as { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }> })
    ?.candidates?.[0]?.content?.parts?.find(part => Boolean(part.inlineData?.data))?.inlineData;
  if (!inline?.data) {
    throw new Error(`Gemini character TTS returned no audio for ${line.speaker}: ${line.text.slice(0, 80)}`);
  }
  return pcmFromBytes(readPcmChunk(decodeBase64(inline.data)));
}

async function synthesizeSpeaker(lines: VoiceLine[], key: string): Promise<{ pcm: Int16Array; transcript: string }> {
  const chunks: Int16Array[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    chunks.push(await synthesize(lines[index], key));
    if (index < lines.length - 1) chunks.push(silence(lines[index].pauseAfterMs));
  }
  return { pcm: concatPcm(chunks), transcript: lines.map(line => line.text).join(' ') };
}

function groupBySpeaker(lines: VoiceLine[]): Map<Speaker, VoiceLine[]> {
  const grouped = new Map<Speaker, VoiceLine[]>();
  for (const line of lines) grouped.set(line.speaker, [...(grouped.get(line.speaker) ?? []), line]);
  return grouped;
}

async function trackKeyFor(sessionId: string, storyKey: string, lines: VoiceLine[]): Promise<string> {
  const canonical = JSON.stringify({
    sessionId,
    storyKey,
    model: MODEL,
    postProcessVersion: POST_PROCESS_VERSION,
    lines,
    voices: CHARACTER_VOICES,
  });
  return `${sessionId}:${await sha256(new TextEncoder().encode(canonical))}`;
}

async function findExisting(
  supabase: ReturnType<typeof createClient>,
  trackKey: string,
  speakers: Speaker[],
): Promise<TrackRow[]> {
  const { data, error } = await supabase
    .from('oracle_character_voice_tracks')
    .select('*')
    .eq('track_key', trackKey)
    .in('speaker', speakers)
    .eq('status', 'ready');
  if (error) throw new Error(`Character voice manifest lookup failed: ${error.message}`);
  return (data ?? []) as TrackRow[];
}

async function persistTrack(
  supabase: ReturnType<typeof createClient>,
  trackKey: string,
  sessionId: string,
  storyKey: string,
  speaker: Speaker,
  source: { pcm: Int16Array; transcript: string },
): Promise<TrackRow> {
  const config = CHARACTER_VOICES[speaker];
  const processed = pitchShiftPreservingDuration(source.pcm, config.octaveShift, config.tuningCents);
  const wav = wavFromPcm(processed);
  const contentSha = await sha256(wav);
  const safeTrackKey = trackKey.replace(/[^a-zA-Z0-9:_-]/g, '_');
  const path = `voice-tracks/${safeTrackKey}/${speaker}.wav`;
  const upload = await supabase.storage.from('oracle-films').upload(path, wav, {
    contentType: 'audio/wav',
    upsert: true,
  });
  if (upload.error) throw new Error(`Character voice upload failed: ${upload.error.message}`);
  const { data: publicData } = supabase.storage.from('oracle-films').getPublicUrl(path);
  const row: TrackRow = {
    track_key: trackKey,
    session_id: sessionId,
    story_key: storyKey,
    speaker,
    source_voice: config.voiceName,
    voice_presentation: config.presentation,
    post_process_version: POST_PROCESS_VERSION,
    octave_shift: config.octaveShift,
    tuning_cents: config.tuningCents,
    transcript: source.transcript,
    duration_seconds: processed.length / SAMPLE_RATE,
    sample_rate_hz: SAMPLE_RATE,
    content_sha256: contentSha,
    storage_path: path,
    public_url: publicData.publicUrl,
    provider: 'gemini-tts',
    model: MODEL,
    status: 'ready',
    error_message: null,
  };
  const { error } = await supabase.from('oracle_character_voice_tracks').upsert(row, { onConflict: 'track_key,speaker' });
  if (error) throw new Error(`Character voice manifest write failed: ${error.message}`);
  return row;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'POST required.' }, 405);
  if (!GOOGLE_KEYS.length) return json({ error: 'Gemini character voice synthesis is not configured.' }, 503);

  let body: { sessionId?: unknown; storyKey?: unknown; lines?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim().slice(0, 160) : '';
  const storyKey = typeof body.storyKey === 'string' && body.storyKey.trim()
    ? body.storyKey.trim().slice(0, 160)
    : 'illustration-story';
  if (!sessionId) return json({ error: 'sessionId is required.' }, 400);

  try {
    const lines = readLines(body.lines);
    const grouped = groupBySpeaker(lines);
    const speakers = [...grouped.keys()];
    const trackKey = await trackKeyFor(sessionId, storyKey, lines);
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    const existing = await findExisting(supabase, trackKey, speakers);
    const existingBySpeaker = new Map(existing.map(row => [row.speaker, row]));
    const ready: TrackRow[] = [...existing];

    for (const speaker of speakers) {
      if (existingBySpeaker.has(speaker)) continue;
      const config = CHARACTER_VOICES[speaker];
      const canonical = JSON.stringify({ trackKey, speaker, config });
      await supabase.from('oracle_character_voice_tracks').upsert({
        track_key: trackKey,
        session_id: sessionId,
        story_key: storyKey,
        speaker,
        source_voice: config.voiceName,
        voice_presentation: config.presentation,
        post_process_version: POST_PROCESS_VERSION,
        octave_shift: config.octaveShift,
        tuning_cents: config.tuningCents,
        transcript: grouped.get(speaker)?.map(line => line.text).join(' ') ?? '',
        duration_seconds: 0,
        sample_rate_hz: SAMPLE_RATE,
        content_sha256: await sha256(new TextEncoder().encode(canonical)),
        storage_path: '',
        public_url: '',
        provider: 'gemini-tts',
        model: MODEL,
        status: 'generating',
        error_message: null,
      }, { onConflict: 'track_key,speaker' });
    }

    let lastError: unknown = null;
    for (const key of GOOGLE_KEYS) {
      try {
        const generated = await Promise.all(speakers.map(async speaker => {
          if (existingBySpeaker.has(speaker)) return existingBySpeaker.get(speaker)!;
          return persistTrack(
            supabase,
            trackKey,
            sessionId,
            storyKey,
            speaker,
            await synthesizeSpeaker(grouped.get(speaker)!, key),
          );
        }));
        ready.splice(0, ready.length, ...generated);
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        console.warn('[oracle-character-voice-tracks] provider key failed; trying next configured key', {
          message: error instanceof Error ? error.message.slice(0, 240) : 'unknown error',
        });
      }
    }
    if (lastError) {
      await supabase.from('oracle_character_voice_tracks')
        .update({ status: 'failed', error_message: lastError instanceof Error ? lastError.message.slice(0, 500) : 'synthesis failed' })
        .eq('track_key', trackKey)
        .in('speaker', speakers);
      throw lastError;
    }

    const tracks = ready.sort((a, b) => speakers.indexOf(a.speaker) - speakers.indexOf(b.speaker));
    return json({
      trackKey,
      provider: 'gemini-tts',
      model: MODEL,
      tracks,
      referenceAudioUrls: Object.fromEntries(tracks.map(track => [track.speaker, track.public_url])),
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Character voice track generation failed.' }, 502);
  }
});