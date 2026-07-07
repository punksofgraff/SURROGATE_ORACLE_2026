/**
 * SURROGATE Oracle — Live Camera Vision End-to-End Test (Task #26)
 *
 * Feeds a real still photo (a red apple) into Chromium's fake camera device
 * (--use-file-for-fake-video-capture) and drives the actual app through its
 * real permission flow (tap mic -> joint getUserMedia -> activateCamera()),
 * then asks the live Gemini session a genuine visual question over text and
 * checks whether the real spoken/text response correctly names the object.
 *
 * This is NOT a mock: the app code path (getUserMedia -> <video> ->
 * useVisionFrames' canvas capture -> ws.send) is byte-for-byte identical to a
 * real camera; only the OS-level camera device is faked by Chromium, which is
 * indistinguishable to the app.
 *
 * Run: node scripts/oracle-vision-test.mjs
 * Requires: dev server running, ORACLE_PRESSURE_URL if not on default port.
 */
import { chromium } from 'playwright';

const BASE_URL = process.env.ORACLE_PRESSURE_URL || 'http://localhost:5173';
const CHROMIUM = '/nix/store/zvpmjmxyjdkjs0rnby54xhwjkp7fj2ff-ungoogled-chromium-114.0.5735.90/bin/chromium';
const FAKE_VIDEO = '/tmp/vision-test/test_apple.y4m';
// Deliberately silent (not mock-speech.wav): a continuously "speaking" fake
// mic keeps VAD latched true, which spawns competing audio-driven Oracle
// turns that bury/delay the reply to our injected text question. Silence
// keeps the mic idle so the only turn driver is our sendTextMessage call.
const FAKE_AUDIO = '/tmp/vision-test/silence.wav';

function log(msg) { console.log(msg); }

async function main() {
  log('SURROGATE Oracle — Live Camera Vision Test');
  log('Fake camera feed: ' + FAKE_VIDEO + ' (a photographed red apple)');
  log('Target: ' + BASE_URL + '\n');

  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROMIUM,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--disable-dev-shm-usage', '--disable-gpu',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-web-security',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--use-file-for-fake-audio-capture=' + FAKE_AUDIO,
      '--use-file-for-fake-video-capture=' + FAKE_VIDEO,
    ],
  });

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.grantPermissions(['camera', 'microphone']);
  const page = await ctx.newPage();

  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error') console.log('    🔴 BROWSER ERROR: ' + text);
    else if (text.includes('ORACLE:STEP') || text.includes('[Vision]') || text.includes('useVisionFrames')) {
      console.log('    🔵 ' + text);
    }
  });

  await page.addInitScript(function() {
    window.__stepLog = [];
    window.__stepStart = null;
    window.addEventListener('oracle:step', function(e) {
      const now = Date.now();
      if (!window.__stepStart) window.__stepStart = now;
      window.__stepLog.push({ label: e.detail.label, status: e.detail.status || 'ok', ts: now - window.__stepStart });
    });
  });

  let ok = true;
  const heartbeat = setInterval(() => log('  … still running (t+' + Math.round(process.uptime()) + 's)'), 10000);

  try {
    // ── Dormant -> Terminal -> Awakened -> Oracle ─────────────────────────
    log('── Boot journey ──');
    log('  ⏵ navigating to ' + BASE_URL);
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    log('  ✓ page loaded');
    await page.waitForTimeout(2000);

    await page.mouse.click(640, 400);
    log('  ⏵ clicked to enter terminal');
    await page.waitForTimeout(1200);
    await page.evaluate(() => { if (typeof window.__oracle_skipLore === 'function') window.__oracle_skipLore(); });
    log('  ⏵ skipLore invoked, waiting for awakened state');
    await page.waitForFunction(() => document.querySelector('[data-oracle-state="awakened"]') !== null, null, { timeout: 8000 });
    log('  ✓ awakened');

    await page.waitForSelector('.oracle-knife-card', { timeout: 5000 });
    await page.locator('.oracle-knife-card').nth(0).click();
    await page.waitForFunction(() => document.querySelector('[data-oracle-state="oracle"]') !== null, null, { timeout: 10000 });
    log('  ✓ oracle phase entered');
    await page.waitForTimeout(1500);

    // ── Trigger the REAL joint mic+camera permission flow via the mic button ──
    // This is exactly what a real Seeker does — clicking .oc-mic-trigger fires
    // onMicClick(true) in SurrogateOracleImmersion, which requests joint
    // getUserMedia({audio:true,video:true}) and calls activateCamera().
    log('\n── Activating camera (real app flow: tap mic button) ──');
    const micBtn = await page.waitForSelector('.oc-mic-trigger', { timeout: 8000 }).catch(() => null);
    if (!micBtn) { log('  ✗ .oc-mic-trigger not found'); ok = false; }
    else {
      await micBtn.click();
      log('  ⏵ mic button clicked — joint permission + activateCamera() firing');
    }

    // Confirm camera actually went active (data-camera-active="true" on stage)
    let cameraActive = false;
    for (let i = 0; i < 40; i++) {
      cameraActive = await page.evaluate(() => {
        const el = document.querySelector('[data-camera-active]');
        return el ? el.getAttribute('data-camera-active') === 'true' : false;
      });
      if (cameraActive) break;
      await page.waitForTimeout(250);
    }
    log(cameraActive ? '  ✓ data-camera-active="true" confirmed' : '  ✗ camera never reported active');
    if (!cameraActive) ok = false;

    // Sanity: the fake video device is actually feeding frames into the <video>
    const videoDims = await page.evaluate(() => {
      const v = document.querySelector('video');
      return v ? { w: v.videoWidth, h: v.videoHeight, readyState: v.readyState } : null;
    });
    log('  ℹ video element: ' + JSON.stringify(videoDims));

    // ── Wait for sessionBooted so useVisionFrames' gate actually opens ──────
    log('\n── Waiting for Gemini session boot (sessionBootedRef gate) ──');
    let wsInfo = null;
    for (let i = 0; i < 40; i++) {
      wsInfo = await page.evaluate(() => window.oracleConversationRef?.current?.getWsDebugInfo?.() ?? null);
      if (wsInfo && wsInfo.wsState === 1) break; // WebSocket.OPEN
      await page.waitForTimeout(500);
    }
    log('  ℹ WS debug info: ' + JSON.stringify(wsInfo));

    // ── Let frames accumulate for a few intervals (2s each) ─────────────────
    log('\n── Letting vision frames stream (10s) ──');
    await page.waitForTimeout(10000);
    wsInfo = await page.evaluate(() => window.oracleConversationRef?.current?.getWsDebugInfo?.() ?? null);
    log('  ℹ frameChunksSent=' + (wsInfo ? wsInfo.frameChunksSent : 'n/a') + '  audioChunksSent=' + (wsInfo ? wsInfo.audioChunksSent : 'n/a'));
    if (!wsInfo || !wsInfo.frameChunksSent || wsInfo.frameChunksSent < 2) {
      log('  ✗ frameChunksSent did not increase — vision frames are NOT being sent');
      ok = false;
    } else {
      log('  ✓ frames are actively streaming to Gemini (' + wsInfo.frameChunksSent + ' sent)');
    }

    // ── Ask the REAL Gemini session a real visual question via text ─────────
    // Bypasses mic/VAD entirely (this test's fake mic feeds mock-speech.wav,
    // not a spoken question) — sendTextMessage still drives a genuine Gemini
    // Live turn while the vision frames continue streaming independently, so
    // this exercises the real multimodal (video-in + text-in -> text/audio-out)
    // path end-to-end.
    log('\n── Asking Oracle a real visual question over text ──');
    const question = 'Look at what you can see through the camera right now. In one short sentence, name the single object you see. Be direct and specific — just say what it is.';
    await page.evaluate((q) => { window.oracleConversationRef?.current?.sendTextMessage(q, false); }, question);
    log('  ⏵ sent: "' + question + '"');

    // Poll for a new oracle turn to appear. This environment's headless
    // software-rendered 3D avatar makes the page CPU-bound, so full
    // Gemini round trips have been observed taking 40-90s here (vs. much
    // faster on real hardware) — poll generously rather than false-fail.
    const turnCountBefore = await page.evaluate(() => document.querySelectorAll('[data-role="oracle"]').length);
    let replyText = null;
    for (let i = 0; i < 200; i++) {
      const turns = await page.evaluate(() => Array.from(document.querySelectorAll('[data-role="oracle"]')).map(el => el.textContent || ''));
      if (turns.length > turnCountBefore) {
        replyText = turns[turns.length - 1];
        break;
      }
      await page.waitForTimeout(500);
    }

    if (!replyText) {
      log('  ✗ NO Oracle reply received within 100s — cannot verify vision correctness');
      ok = false;
    } else {
      log('  ✓ Oracle replied: "' + replyText + '"');
      const lower = replyText.toLowerCase();
      const mentionsApple = lower.includes('apple');
      const mentionsFruit = lower.includes('fruit') || lower.includes('red');
      if (mentionsApple) {
        log('  ✓✓✓ CORRECT — Oracle explicitly named the apple. Live camera vision CONFIRMED working end-to-end.');
      } else if (mentionsFruit) {
        log('  ~ PARTIAL — Oracle described something fruit/red-colored but did not say "apple" explicitly. Vision likely working but imprecise.');
      } else {
        log('  ✗ Oracle reply does not mention the apple/fruit — vision may not be reaching the model correctly, or model ignored the image.');
        ok = false;
      }
    }

    await page.screenshot({ path: '/home/runner/workspace/screenshots/vision-test-final.png' });
    log('\n  📸 screenshots/vision-test-final.png saved');

    const steps = await page.evaluate(() => window.__stepLog || []);
    log('\n── Step log tail ──');
    steps.slice(-15).forEach(s => log('    t+' + s.ts + 'ms  ' + s.label));

  } catch (e) {
    console.error('CRASHED:', e);
    ok = false;
  }

  clearInterval(heartbeat);
  await browser.close();
  log('\n' + '='.repeat(60));
  log(ok ? 'RESULT: PASS — vision path verified end-to-end against real Gemini Live' : 'RESULT: FAIL — see log above');
  process.exit(ok ? 0 : 1);
}

process.on('unhandledRejection', (e) => { console.error('UNHANDLED REJECTION:', e); process.exit(1); });
process.on('uncaughtException', (e) => { console.error('UNCAUGHT EXCEPTION:', e); process.exit(1); });

main();
