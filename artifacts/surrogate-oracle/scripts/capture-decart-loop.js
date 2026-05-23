/**
 * capture-decart-loop.js
 *
 * Playwright script that:
 *   1. Launches Chromium with WebRTC + media permissions
 *   2. Loads the Oracle app in dev mode (forces Decart path)
 *   3. Walks through consent → knife → terminal → awakened → oracle
 *   4. Waits for Decart live stream to appear on the video element
 *   5. Captures the WebRTC video via MediaRecorder (WebM/VP9)
 *   6. Sends 3 scripted phrases through the Oracle conversation
 *   7. Saves: oracle-loop-idle.webm (before speaking) +
 *             oracle-loop-speaking.webm (while speaking)
 *
 * The captured loops feed the freemium avatar path — idle loop plays
 * continuously, speaking loop plays during Gemini audio output.
 *
 * Usage:
 *   node scripts/capture-decart-loop.js
 *
 * Requirements:
 *   - Dev server running: npm run dev (http://localhost:5173)
 *   - VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in .env.local
 *   - Decart credentials set in Supabase secrets
 *   - Playwright: already in devDependencies
 *
 * Output: public/oracle-loop-idle.webm + public/oracle-loop-speaking.webm
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DEV_SERVER = 'http://localhost:5173';
const OUT_DIR = path.join(__dirname, '../public');
const IDLE_OUT = path.join(OUT_DIR, 'oracle-loop-idle.webm');
const SPEAKING_OUT = path.join(OUT_DIR, 'oracle-loop-speaking.webm');

// Scripted phrases sent to the Oracle to elicit speaking footage.
// These are chosen to produce a range of mouth shapes:
// - Open vowels (AH, AW) → A, G visemes
// - Fricatives (S, F) → F viseme
// - Bilabials (M, B, P) → B viseme
// - Rounded (OO, W) → H viseme
const SCRIPTED_TURNS = [
  'Marcus.',
  'I owe my father a conversation we have never had.',
  'It started to feel like something I was supposed to carry alone.',
];

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function captureDecartLoop() {
  console.log('🎬 Starting Decart loop capture...');

  const browser = await chromium.launch({
    headless: false,  // WebRTC requires visible browser OR --use-fake-ui-for-media-stream
    args: [
      '--use-fake-ui-for-media-stream',     // auto-accept mic/camera without dialog
      '--autoplay-policy=no-user-gesture-required',  // allow audio autoplay
      '--disable-web-security',             // avoid CORS issues during capture
    ],
  });

  const context = await browser.newContext({
    permissions: ['camera', 'microphone'],
    viewport: { width: 390, height: 844 },  // iPhone 14 Pro — primary target form factor
  });

  const page = await context.newPage();

  // Catch console logs from the page for debugging
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('Decart') || text.includes('Oracle') || text.includes('Stream')) {
      console.log(`  [page] ${text}`);
    }
  });

  console.log('📱 Loading Oracle app...');
  await page.goto(DEV_SERVER);

  // Force dev mode so Decart path is always attempted
  await page.evaluate(() => {
    localStorage.setItem('dev_user_session', '1');
  });
  await page.reload();
  await sleep(1500);

  // ── Step 1: Click to enter (consent gate) ────────────────────────────────
  console.log('👆 Entering consent...');
  await page.click('.oracle-tap-prompt, .oracle-center, .oracle-cabinet', { timeout: 10000 }).catch(() => {
    // Try clicking anywhere on the stage
    return page.click('.oracle-stage');
  });
  await sleep(800);

  // ── Step 2: Accept consent ────────────────────────────────────────────────
  const witnessBtn = await page.$('button:has-text("WITNESS ME"), button:has-text("witness"), [class*="consent"]');
  if (witnessBtn) {
    await witnessBtn.click();
    console.log('  ✅ Consent accepted');
  } else {
    console.log('  ⚠️  Consent button not found — trying text match');
    await page.getByText('WITNESS ME', { exact: false }).click().catch(() => {});
  }
  await sleep(500);

  // ── Step 3: Pick knife question (first card) ──────────────────────────────
  console.log('🔪 Selecting knife question...');
  const knifeCard = await page.$('.oracle-knife-card').catch(() => null);
  if (knifeCard) {
    await knifeCard.click();
    console.log('  ✅ Knife selected');
  } else {
    console.log('  ⚠️  Knife card not found — waiting for it to appear');
    await page.waitForSelector('.oracle-knife-card', { timeout: 10000 });
    await page.click('.oracle-knife-card');
  }
  await sleep(500);

  // ── Step 4: Wait for Decart to connect (up to 30s) ───────────────────────
  console.log('⏳ Waiting for Decart stream (this takes 15-22s)...');
  try {
    await page.waitForFunction(() => {
      const video = document.querySelector('.oracle-avatar-video');
      return video && video.srcObject && video.readyState >= 2;
    }, { timeout: 35000 });
    console.log('  ✅ Decart stream live');
  } catch {
    console.error('  ❌ Decart stream timed out — check credentials and dev server');
    await browser.close();
    process.exit(1);
  }

  // ── Step 5: Capture IDLE loop (5s of neutral face) ───────────────────────
  console.log('📹 Capturing idle loop (5s)...');
  const idleChunks = await page.evaluate(async () => {
    const video = document.querySelector('.oracle-avatar-video');
    const stream = video.srcObject;
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus' });
    const chunks = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.start(100);
    await new Promise(r => setTimeout(r, 5000));
    recorder.stop();
    await new Promise(r => recorder.onstop = r);
    // Return as array of ArrayBuffers
    return Promise.all(chunks.map(b => b.arrayBuffer().then(ab => Array.from(new Uint8Array(ab)))));
  });

  const idleBuffer = Buffer.concat(idleChunks.map(a => Buffer.from(a)));
  fs.writeFileSync(IDLE_OUT, idleBuffer);
  console.log(`  ✅ Idle loop saved: ${IDLE_OUT} (${(idleBuffer.length / 1024).toFixed(0)}KB)`);

  // ── Step 6: Send scripted phrases + capture speaking loop ─────────────────
  console.log('🗣️  Sending scripted phrases + capturing speaking loop...');

  // Wait for conversation panel to be visible
  await page.waitForSelector('.oracle-conversation, [class*="conversation"]', { timeout: 15000 }).catch(() => {
    console.log('  ⚠️  Conversation panel not found — trying anyway');
  });

  // Start speaking capture
  const speakingCapture = page.evaluate(async (turns) => {
    const video = document.querySelector('.oracle-avatar-video');
    const stream = video.srcObject;
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus' });
    const chunks = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.start(100);

    // Expose stop function
    window._stopSpeakingCapture = () => {
      recorder.stop();
      return new Promise(r => recorder.onstop = r).then(() =>
        Promise.all(chunks.map(b => b.arrayBuffer().then(ab => Array.from(new Uint8Array(ab)))))
      );
    };
  }, SCRIPTED_TURNS);

  // Send each turn through the text input
  for (let i = 0; i < SCRIPTED_TURNS.length; i++) {
    const turn = SCRIPTED_TURNS[i];
    console.log(`  → Turn ${i + 1}: "${turn}"`);

    // Find text input and send message
    const input = await page.$('input[type="text"], textarea, [contenteditable="true"]').catch(() => null);
    if (input) {
      await input.click();
      await input.fill(turn);
      await page.keyboard.press('Enter');
    } else {
      console.log('  ⚠️  Text input not found — Oracle is likely in voice mode');
    }

    // Wait for Oracle to respond (up to 12s)
    await sleep(12000);
  }

  // Stop speaking capture
  const speakingChunks = await page.evaluate(() => window._stopSpeakingCapture());
  const speakingBuffer = Buffer.concat(speakingChunks.map(a => Buffer.from(a)));
  fs.writeFileSync(SPEAKING_OUT, speakingBuffer);
  console.log(`  ✅ Speaking loop saved: ${SPEAKING_OUT} (${(speakingBuffer.length / 1024).toFixed(0)}KB)`);

  await browser.close();

  console.log('');
  console.log('🎉 Capture complete!');
  console.log(`   Idle:     ${IDLE_OUT}`);
  console.log(`   Speaking: ${SPEAKING_OUT}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Review the WebM files (open in browser or VLC)');
  console.log('  2. Trim to cleanest 3-5s loops using ffmpeg:');
  console.log('     ffmpeg -i oracle-loop-idle.webm -ss 0 -t 4 -c copy oracle-loop-idle-trim.webm');
  console.log('  3. Use as src on .oracle-avatar-loop video element for freemium path');
}

captureDecartLoop().catch(err => {
  console.error('❌ Capture failed:', err);
  process.exit(1);
});
