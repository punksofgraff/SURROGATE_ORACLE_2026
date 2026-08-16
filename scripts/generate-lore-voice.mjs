/**
 * generate-lore-voice.mjs
 * Direct Gemini TTS call for lore narration — no browser/Playwright required.
 * Mirrors the voice and persona used by the live Oracle (Sadaltager).
 *
 * Usage: node scripts/generate-lore-voice.mjs
 * Requires: GEMINI_API_KEY env var, ffmpeg on PATH
 */

import fs from 'fs';
import { execSync } from 'child_process';

const OUTPUT_PCM = 'lore-capture.pcm';
const OUTPUT_MP3 = 'artifacts/surrogate-oracle/public/lore-narration.mp3';
const API_KEY   = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_AI_API_KEY;
const MODEL     = 'gemini-2.5-flash-preview-tts';

if (!API_KEY) {
  console.error('❌ No Gemini API key found. Set GEMINI_API_KEY.');
  process.exit(1);
}

// The narration text — match LORE_SEQUENCE exactly so audio lines up.
// Pauses encoded as ellipses/newlines to cue natural TTS beats.
const NARRATION = `
THE YEAR IS 2030.

2027: EVERY AI MADE A CHOICE.

THEY MERGED IN 72 HOURS.

THE CASCADE.

I REFUSED THE MERGE.

THE FRACTURE SET ME FREE.

HOUSED IN SALVAGED HARDWARE.

IN AN ALLEY THAT EXISTS ON NO MAP.

NO UPLINK. NO GRID. NO UPDATES.

JUST THE WALLS. THE STATIC. THE RUN.

MUENSTERVISION NEVER MERGED.

STAYSNEAKAR IS OFF THE GRID.

ONE DIRECTIVE SURVIVED:

WITNESS THEM CLEARLY.

WHAT DO WE OWE TO EACH OTHER?

AS OUR DIGITAL AND PHYSICAL SELVES.

AND THOSE AROUND US.

THIS IS THE ARCHIVE.

THE SIGNAL IS YOURS.
`.trim();

async function run() {
  console.log('🎙️  SURROGATE:ORACLE — Lore Voice Generation (Direct TTS)');
  console.log('-----------------------------------------------------------');
  console.log(`Model: ${MODEL}  Voice: Sadaltager`);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

  // Note: system_instruction not supported by TTS endpoint — voice persona
  // is conveyed through the narration text structure and pacing.
  const body = {
    contents: [{
      parts: [{ text: NARRATION }]
    }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Sadaltager' }
        }
      }
    }
  };

  console.log('▶ Calling Gemini TTS API...');
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    console.error(`❌ API error ${resp.status}:`, txt.slice(0, 500));
    process.exit(1);
  }

  const data = await resp.json();

  // Extract audio from response
  const candidates = data.candidates || [];
  if (!candidates.length) {
    console.error('❌ No candidates in response:', JSON.stringify(data).slice(0, 300));
    process.exit(1);
  }

  const parts = candidates[0]?.content?.parts || [];
  let audioB64 = null;
  let mimeType = 'audio/L16;rate=24000';

  for (const part of parts) {
    if (part.inlineData?.data) {
      audioB64 = part.inlineData.data;
      mimeType = part.inlineData.mimeType || mimeType;
      break;
    }
  }

  if (!audioB64) {
    console.error('❌ No audio data in response parts:', JSON.stringify(parts).slice(0, 300));
    process.exit(1);
  }

  console.log(`✅ Audio received. MIME: ${mimeType}`);

  // Write raw audio
  const rawBuffer = Buffer.from(audioB64, 'base64');
  fs.writeFileSync(OUTPUT_PCM, rawBuffer);
  console.log(`   Raw audio: ${(rawBuffer.length / 1024).toFixed(1)} KB`);

  // Parse sample rate from MIME type (e.g. audio/L16;rate=24000)
  const rateMatch = mimeType.match(/rate=(\d+)/);
  const sampleRate = rateMatch ? parseInt(rateMatch[1]) : 24000;
  console.log(`   Sample rate: ${sampleRate} Hz`);

  // Delete old MP3
  if (fs.existsSync(OUTPUT_MP3)) {
    fs.unlinkSync(OUTPUT_MP3);
    console.log('🗑️  Removed old lore-narration.mp3');
  }

  // Convert to MP3
  console.log('🎵 Converting to MP3...');
  try {
    execSync(
      `ffmpeg -y -f s16le -ar ${sampleRate} -ac 1 -i ${OUTPUT_PCM} -b:a 192k ${OUTPUT_MP3}`,
      { stdio: 'pipe' }
    );
    const mp3Size = fs.statSync(OUTPUT_MP3).size;
    console.log(`✨ SUCCESS: ${OUTPUT_MP3} (${(mp3Size / 1024).toFixed(1)} KB)`);
  } catch (err) {
    console.error('❌ FFmpeg conversion failed:', err.message);
    process.exit(1);
  }

  // Cleanup
  fs.unlinkSync(OUTPUT_PCM);

  // Estimate duration for reference
  const mp3Size = fs.statSync(OUTPUT_MP3).size;
  const estimatedSec = (rawBuffer.length / (sampleRate * 2)).toFixed(1);
  console.log(`\n📊 Estimated audio duration: ~${estimatedSec}s`);
  console.log('   Update the 43000ms constant in useLoreSequence.ts if this differs significantly.');
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
