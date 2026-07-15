#!/usr/bin/env node
/**
 * generate-filler-audio.mjs
 *
 * One-time setup script: generates Oracle thinking/vision filler phrases via Gemini TTS,
 * uploads WAV files to Supabase Storage (oracle-assets/filler/), and seeds the
 * oracle_filler_phrases table. Safe to re-run — upsert by phrase_text is idempotent.
 *
 * Run from project root:
 *   node scripts/generate-filler-audio.mjs
 *
 * Required env (auto-loaded from artifacts/surrogate-oracle/.env.local):
 *   GEMINI_API_KEY         — Google AI Studio key
 *   VITE_SUPABASE_URL      — Supabase project URL
 *   VITE_SUPABASE_ANON_KEY — Supabase anon key (bucket has permissive upload policy)
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env from .env.local (supplements any vars already set in the shell)
try {
  const envPath = join(__dirname, '../artifacts/surrogate-oracle/.env.local');
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
} catch { /* .env.local is optional */ }

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL   = process.env.VITE_SUPABASE_URL  || process.env.SUPABASE_URL;
const SUPABASE_KEY   = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!GEMINI_API_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[Filler] ✗ Missing env vars. Need: GEMINI_API_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const TTS_MODEL = 'gemini-2.5-flash-preview-tts';
// Charon: measured, dark tone — closest Gemini voice to the Oracle's atmosphere
const TTS_VOICE = 'Charon';

const PHRASES = [
  { text: 'Hmm. The signal is speaking.',              type: 'thinking' },
  { text: 'Manifesting that now...',                  type: 'thinking' },
  { text: 'Interesting, let me think about that...',  type: 'thinking' },
  { text: 'Reading the frequencies...',               type: 'thinking' },
  { text: "I'm scanning the signal...",               type: 'vision'   },
  { text: 'Let me look at that...',                   type: 'vision'   },
  { text: "Focusing on what you're showing me...",    type: 'vision'   },
  { text: 'Give me a moment to see...',               type: 'vision'   },
];

// Wraps raw PCM16 bytes in a WAV container so browsers can decode it via fetch+decodeAudioData
function pcmToWav(pcmBuffer, sampleRate = 24000) {
  const numChannels  = 1;
  const bitsPerSample = 16;
  const byteRate     = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign   = numChannels * bitsPerSample / 8;
  const dataSize     = pcmBuffer.length;
  const header       = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize,  4);
  header.write('WAVE',  8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);          // PCM subchunk1 size
  header.writeUInt16LE(1,  20);          // PCM format
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate,  24);
  header.writeUInt32LE(byteRate,    28);
  header.writeUInt16LE(blockAlign,  32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcmBuffer]);
}

async function generateAudio(phraseText) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: phraseText }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } },
          },
        },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini TTS HTTP ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const part = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!part?.data) {
    throw new Error('No audio data in Gemini response: ' + JSON.stringify(data).slice(0, 400));
  }

  const mimeType  = part.mimeType || '';
  const rawBuf    = Buffer.from(part.data, 'base64');

  if (mimeType.includes('pcm') || mimeType.includes('L16')) {
    const rateMatch = mimeType.match(/rate=(\d+)/);
    const rate      = rateMatch ? parseInt(rateMatch[1], 10) : 24000;
    const wavBuf    = pcmToWav(rawBuf, rate);
    const durationMs = Math.round((rawBuf.length / 2 / rate) * 1000);
    return { buf: wavBuf, contentType: 'audio/wav', ext: 'wav', durationMs };
  }

  // Already WAV (header includes 44-byte RIFF header before PCM data)
  if (mimeType.includes('wav')) {
    const rate = 24000; // assume 24kHz; WAV header byte 24 encodes the real rate
    const durationMs = Math.round(((rawBuf.length - 44) / 2 / rate) * 1000);
    return { buf: rawBuf, contentType: 'audio/wav', ext: 'wav', durationMs };
  }

  // MP3 or other container — pass through as-is, estimate ~3s duration
  return { buf: rawBuf, contentType: mimeType.split(';')[0] || 'audio/mpeg', ext: 'mp3', durationMs: 3000 };
}

async function uploadToStorage(filename, buf, contentType) {
  const url = `${SUPABASE_URL}/storage/v1/object/oracle-assets/filler/${filename}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey':         SUPABASE_KEY,
      'Content-Type':   contentType,
      'x-upsert':       'true',
    },
    body: buf,
  });
  if (!res.ok) throw new Error(`Storage upload HTTP ${res.status}: ${await res.text()}`);
  return `${SUPABASE_URL}/storage/v1/object/public/oracle-assets/filler/${filename}`;
}

async function upsertRow(phraseText, audioUrl, phraseType, durationMs) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/oracle_filler_phrases`, {
    method: 'POST',
    headers: {
      'apikey':         SUPABASE_KEY,
      'Authorization':  `Bearer ${SUPABASE_KEY}`,
      'Content-Type':   'application/json',
      'Prefer':         'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ phrase_text: phraseText, audio_url: audioUrl, phrase_type: phraseType, duration_ms: durationMs }),
  });
  if (!res.ok) throw new Error(`DB upsert HTTP ${res.status}: ${await res.text()}`);
}

async function main() {
  console.log(`[Filler] Model: ${TTS_MODEL} | Voice: ${TTS_VOICE} | ${PHRASES.length} phrases\n`);

  for (const { text, type } of PHRASES) {
    const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    process.stdout.write(`  "${text}" (${type}) … `);

    try {
      const { buf, contentType, ext, durationMs } = await generateAudio(text);
      const filename = `${type}-${slug}.${ext}`;
      const publicUrl = await uploadToStorage(filename, buf, contentType);
      await upsertRow(text, publicUrl, type, durationMs);
      console.log(`✓  ${durationMs}ms  →  ${filename}`);
    } catch (err) {
      console.log(`✗  ${err.message}`);
    }
  }

  console.log('\n[Filler] Done. Re-run to regenerate — upsert by phrase_text is idempotent.');
}

process.on('unhandledRejection', (err) => { console.error('[Filler] Unhandled rejection:', err); process.exit(1); });
main().catch((err) => { console.error('[Filler] Fatal:', err); process.exit(1); });
