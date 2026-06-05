import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const BASE = 'http://localhost:5173';
const CHROME = '/nix/store/0n9rl5l9syy808xi9bk4f6dhnfrvhkww-playwright-browsers-chromium/chromium-1080/chrome-linux/chrome';
const OUTPUT_PCM = 'lore-capture.pcm';
const OUTPUT_MP3 = 'artifacts/surrogate-oracle/public/lore-narration.mp3';

async function run() {
  console.log('🎙️  SURROGATE:ORACLE — Lore Voice Capture');
  console.log('-----------------------------------------');

  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const ctx = await browser.newContext({ permissions: ['microphone', 'camera'] });
  const page = await ctx.newPage();

  const pcmStream = fs.createWriteStream(OUTPUT_PCM);
  let audioCaptured = 0;
  let isDone = false;

  page.on('websocket', ws => {
    if (!ws.url().includes('supabase.co')) return;
    console.log(`🔌 Oracle WebSocket detected: ${ws.url().slice(0, 60)}...`);
    
    ws.on('framereceived', f => {
      const payload = f.payload.toString();
      fs.appendFileSync('debug-ws.log', payload + '\n---\n');
      try {
        const msg = JSON.parse(payload);
        
        if (msg.type === 'session.created') console.log('\n✨ Gemini Session Created');
        
        if (msg.serverContent) {
          const parts = msg.serverContent.modelTurn?.parts || [];
          parts.forEach(part => {
            const audioData = part.inlineAudio?.data || part.inlineData?.data;
            if (audioData) {
              const buffer = Buffer.from(audioData, 'base64');
              pcmStream.write(buffer);
              audioCaptured += buffer.length;
              process.stdout.write(`\rCaptured: ${(audioCaptured / 1024).toFixed(1)} KB...`);
            }
          });
        }
        
        if (msg.serverContent?.turnComplete) {
          console.log('\n✅ Turn complete signal received.');
          isDone = true;
        }
      } catch (e) {}
    });
  });

  console.log('▶ Loading app...');
  await page.goto(`${BASE}/?newuser`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  
  // Clear state to force fresh lore
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 5000));
  
  console.log('▶ Triggering Lore Narration...');
  const center = await page.waitForSelector('.oracle-center', { timeout: 15000 });
  await center.click();
  
  // Wait for audio to start and finish
  let timeout = 0;
  while (!isDone && timeout < 120) { 
    await new Promise(r => setTimeout(r, 1000));
    timeout++;
    if (audioCaptured > 0 && timeout % 10 === 0) {
      console.log(`\nStill capturing... (${timeout}s)`);
    }
  }

  pcmStream.end();
  await browser.close();

  if (audioCaptured === 0) {
    console.error('\n❌ No audio was captured. Is the dev server running? Is Gemini responding?');
    process.exit(1);
  }

  console.log(`\n✅ Capture finished. Total raw PCM: ${audioCaptured} bytes`);

  console.log('🎵 Converting PCM to MP3 using ffmpeg...');
  try {
    // Gemini Live is 24kHz Mono PCM16 Little-Endian
    execSync(`ffmpeg -y -f s16le -ar 24000 -ac 1 -i ${OUTPUT_PCM} -b:a 192k ${OUTPUT_MP3}`);
    console.log(`✨ SUCCESS: Saved lore narration to ${OUTPUT_MP3}`);
    
    // Cleanup temporary PCM
    fs.unlinkSync(OUTPUT_PCM);
  } catch (err) {
    console.error('❌ FFmpeg conversion failed:', err.message);
    process.exit(1);
  }
}

run();
