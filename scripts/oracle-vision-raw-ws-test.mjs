#!/usr/bin/env node
/**
 * Raw-WebSocket vision test for Oracle Task #26.
 *
 * Bypasses the full 3D-avatar browser E2E path (flaky/heavy under headless
 * swiftshader) and instead speaks the app's real Gemini Live proxy protocol
 * directly — the exact same envelope useGeminiSession.ts / useVisionFrames.ts
 * use in production:
 *   - {type:'session.config', ...}                         (handshake)
 *   - {type:'client.realtimeInput', realtimeInput:{media_chunks:[...]}} (frame)
 *   - {type:'client.realtimeInput', realtimeInput:{text: ...}}          (question)
 *
 * This connects to the REAL Supabase edge function (gemini-live-proxy) which
 * forwards to the REAL Gemini Live API, using the SAME model/modality the
 * production app uses (native-audio, responseModalities: ['AUDIO']) — no
 * mocking of the vision pipeline, no proxy changes.
 *
 * The native-audio model only supports AUDIO output (verified: requesting
 * TEXT or outputAudioTranscription errors out — the proxy doesn't forward
 * outputAudioTranscription anyway, so it can't be enabled without touching
 * production proxy code, which this test intentionally avoids). So the
 * Oracle's spoken reply is captured as PCM, saved to a WAV, and transcribed
 * out-of-band via OpenAI Whisper (a one-off verification step, not part of
 * the app) to check whether it actually named the object in view.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

process.on('unhandledRejection', (reason) => {
  console.error('💥 UNHANDLED REJECTION:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('💥 UNCAUGHT EXCEPTION:', err && err.stack ? err.stack : err);
});

const envDir = path.join(ROOT, 'artifacts', 'surrogate-oracle');
const env = { ...loadEnv(path.join(envDir, '.env')), ...loadEnv(path.join(envDir, '.env.local')) };
const rawSupabaseUrl = env.VITE_SUPABASE_URL;
if (!rawSupabaseUrl) {
  console.error('❌ VITE_SUPABASE_URL not found in artifacts/surrogate-oracle/.env(.local)');
  process.exit(1);
}

const GEMINI_MODEL = 'models/gemini-2.5-flash-native-audio-latest';
const wsUrl = rawSupabaseUrl.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://')
  + '/functions/v1/gemini-live-proxy';

const framePath = process.argv[2] || '/tmp/vision-test/apple_frame.jpg';
if (!fs.existsSync(framePath)) {
  console.error(`❌ Frame image not found: ${framePath}`);
  process.exit(1);
}
const jpegB64 = fs.readFileSync(framePath).toString('base64');
console.log(`📸 Loaded frame: ${framePath} (${(jpegB64.length / 1024).toFixed(0)}KB base64)`);
console.log(`🔌 Connecting: ${wsUrl.replace(/\/\/[^/]+\//, '//<redacted>/')}`);

const ws = new WebSocket(wsUrl);
let sessionCreated = false;
let frameSent = false;
let questionSent = false;
let done = false;
const pcmChunks = [];

const TIMEOUT_MS = 90_000;
const timer = setTimeout(() => {
  if (done) return;
  console.error(`\n❌ TIMEOUT after ${TIMEOUT_MS / 1000}s waiting for Oracle reply.`);
  console.error(`   sessionCreated=${sessionCreated} frameSent=${frameSent} questionSent=${questionSent} audioChunks=${pcmChunks.length}`);
  ws.close();
  process.exit(1);
}, TIMEOUT_MS);

ws.onopen = () => {
  console.log('✅ WS open — sending session.config');
  ws.send(JSON.stringify({
    type: 'session.config',
    model: GEMINI_MODEL,
    systemInstruction: {
      parts: [{ text: 'You are a vision test assistant. When asked what you see, answer in ONE short plain sentence naming the object. No roleplay, no scoring tags.' }],
    },
    tools: [],
    sessionResumption: {},
    realtimeInputConfig: {
      automaticActivityDetection: { disabled: true },
    },
    generationConfig: {
      responseModalities: ['AUDIO'],
    },
  }));
};

ws.onmessage = (event) => {
  let msg;
  try {
    msg = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
  } catch {
    return;
  }
  console.log(`⬅️  ${msg.type ?? Object.keys(msg)[0]}`);

  if (msg.type === 'session.created') {
    sessionCreated = true;
    console.log('✅ session.created — sending image frame');
    ws.send(JSON.stringify({
      type: 'client.realtimeInput',
      realtimeInput: { media_chunks: [{ data: jpegB64, mimeType: 'image/jpeg' }] },
    }));
    frameSent = true;

    setTimeout(() => {
      console.log('✅ sending question — "What object do you see right now? Answer in one short sentence."');
      ws.send(JSON.stringify({
        type: 'client.realtimeInput',
        realtimeInput: { text: 'What object do you see right now? Answer in one short sentence.' },
      }));
      questionSent = true;
    }, 500);
  }

  if (msg.type === 'server.content') {
    const parts = msg.serverContent?.modelTurn?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.mimeType?.startsWith('audio/pcm')) {
        pcmChunks.push(Buffer.from(part.inlineData.data, 'base64'));
      }
    }
    if (msg.serverContent?.turnComplete) {
      done = true;
      clearTimeout(timer);
      finish();
    }
  }

  if (msg.type === 'error') {
    clearTimeout(timer);
    console.error('❌ Gemini/proxy error:', msg.message);
    ws.close();
    process.exit(1);
  }
};

ws.onerror = (err) => {
  console.error('❌ WS error:', err.message || err);
};

ws.onclose = (event) => {
  if (!done) {
    clearTimeout(timer);
    console.error(`\n⚠️  WS closed before completion: code=${event.code} reason=${event.reason}`);
    if (!process.exitCode) process.exit(1);
  }
};

function pcmToWav(pcmBuffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmBuffer.length, 40);
  return Buffer.concat([header, pcmBuffer]);
}

async function finish() {
  console.log(`\n🔊 Oracle turn complete — ${pcmChunks.length} PCM chunks received (${(pcmChunks.reduce((n, b) => n + b.length, 0) / 1024).toFixed(0)}KB total).`);
  ws.close();

  if (pcmChunks.length === 0) {
    console.log('❌ FAIL — no audio was returned at all; Oracle never responded.');
    process.exit(1);
  }

  const wavBuffer = pcmToWav(Buffer.concat(pcmChunks));
  const wavPath = '/tmp/vision-test/oracle-reply.wav';
  fs.writeFileSync(wavPath, wavBuffer);
  console.log(`💾 Saved reply audio: ${wavPath}`);

  const baseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseUrl || !apiKey) {
    console.log('⚠️  AI_INTEGRATIONS_OPENAI_BASE_URL/API_KEY not set — skipping transcription. Audio was received (proof Gemini processed the frame + question), but reply content is unverified.');
    process.exit(1);
  }

  console.log('📝 Transcribing Oracle reply via Whisper (out-of-band verification, not part of the app)...');
  const form = new FormData();
  form.append('file', new Blob([wavBuffer], { type: 'audio/wav' }), 'reply.wav');
  form.append('model', 'gpt-4o-mini-transcribe');

  const res = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    console.error(`❌ Transcription request failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const data = await res.json();
  const transcript = (data.text || '').trim();
  console.log('\n=== ORACLE SPOKEN REPLY (transcribed) ===');
  console.log(transcript);
  console.log('==========================================\n');

  if (transcript.toLowerCase().includes('apple')) {
    console.log('✅ PASS — Oracle correctly identified the apple held up to the camera.');
    process.exit(0);
  } else {
    console.log('❌ FAIL — transcribed reply did not mention "apple".');
    process.exit(1);
  }
}
