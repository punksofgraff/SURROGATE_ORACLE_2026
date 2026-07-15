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
 *   VITE_SUPABASE_ANON_KEY — Supabase anon key (used only for DB upsert reads)
 *
 * Required for storage uploads (admin-only operation):
 *   SUPABASE_ACCESS_TOKEN  — Supabase Management API token (fetches service-role key)
 *
 * Storage uploads use the service-role key (fetched via Management API at runtime).
 * The oracle-assets bucket has no public write policy — anon cannot upload.
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
  // Note: "Hmmm..." (2 tokens) is rejected by Gemini TTS with finishReason:OTHER.
  // Keep it in the list so intent is documented; the ✗ path handles the failure gracefully.
  // "Hmm. The signal is speaking." is the seeded replacement already in the DB.
  { text: 'Hmmm...',                                  type: 'thinking' },
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

// Resolved during bootstrapBucket(); used by uploadToStorage.
// Never logged — treated as a credential.
let serviceRoleKey = null;

async function uploadToStorage(filename, buf, contentType) {
  if (!serviceRoleKey) throw new Error('Service-role key not available — run bootstrapBucket() first or set SUPABASE_ACCESS_TOKEN');
  const url = `${SUPABASE_URL}/storage/v1/object/oracle-assets/filler/${filename}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceRoleKey}`,
      'apikey':         serviceRoleKey,
      'Content-Type':   contentType,
      'x-upsert':       'true',
    },
    body: buf,
  });
  if (!res.ok) throw new Error(`Storage upload HTTP ${res.status}: ${await res.text()}`);
  return `${SUPABASE_URL}/storage/v1/object/public/oracle-assets/filler/${filename}`;
}

async function upsertRow(phraseText, audioUrl, phraseType, durationMs) {
  // Uses service-role key (the migration only grants anon SELECT, not INSERT).
  // on_conflict=phrase_text tells PostgREST which unique column to use for
  // resolution=merge-duplicates so re-runs update existing rows cleanly.
  const res = await fetch(`${SUPABASE_URL}/rest/v1/oracle_filler_phrases?on_conflict=phrase_text`, {
    method: 'POST',
    headers: {
      'apikey':         serviceRoleKey,
      'Authorization':  `Bearer ${serviceRoleKey}`,
      'Content-Type':   'application/json',
      'Prefer':         'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ phrase_text: phraseText, audio_url: audioUrl, phrase_type: phraseType, duration_ms: durationMs }),
  });
  if (!res.ok) throw new Error(`DB upsert HTTP ${res.status}: ${await res.text()}`);
}

async function bootstrapBucket() {
  // Fetch service-role key and ensure oracle-assets bucket + read-only policy exist.
  // Requires SUPABASE_ACCESS_TOKEN (Supabase Management API personal access token).
  // Storage uploads use the service-role key — the bucket has NO public write policy.
  const mgmtToken = process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef = SUPABASE_URL?.match(/\/\/([^.]+)\.supabase\.co/)?.[1];
  if (!mgmtToken || !projectRef) {
    console.error('[Filler] ✗ SUPABASE_ACCESS_TOKEN not set. Storage uploads require the service-role key which is fetched via the Management API. Set SUPABASE_ACCESS_TOKEN and re-run.');
    process.exit(1);
  }

  // Fetch service-role key from Management API
  const keysRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/api-keys`, {
    headers: {
      'Authorization': `Bearer ${mgmtToken}`,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  });
  if (!keysRes.ok) throw new Error(`Management API /api-keys HTTP ${keysRes.status}: ${await keysRes.text()}`);
  const keys = await keysRes.json();
  const srKey = Array.isArray(keys) ? keys.find(k => k.name === 'service_role')?.api_key : null;
  if (!srKey) throw new Error('Could not find service_role key in Management API response');
  serviceRoleKey = srKey; // stored in module-level var; never logged

  // Bootstrap bucket + read-only public policy via SQL
  const sql = `
    INSERT INTO storage.buckets (id, name, public, created_at, updated_at)
    VALUES ('oracle-assets', 'oracle-assets', true, now(), now())
    ON CONFLICT (id) DO UPDATE SET public = true;

    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='oracle-assets public read') THEN
        EXECUTE 'CREATE POLICY "oracle-assets public read" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = ''oracle-assets'')';
      END IF;
    END $$;
  `;
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${mgmtToken}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    console.warn(`[Filler] Bucket bootstrap warning (${res.status}): ${await res.text()}`);
  } else {
    console.log('[Filler] oracle-assets bucket ready (public-read, no public write) ✓\n');
  }
}

async function main() {
  await bootstrapBucket();
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
