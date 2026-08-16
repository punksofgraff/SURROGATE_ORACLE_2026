/**
 * Task #80 verification — mic tap must not shift Oracle volume or switch to
 * spatial audio on mobile.
 *
 * Runs two profiles:
 *   desktop — fine pointer, no touch:   HRTF panner EXPECTED (unchanged behavior)
 *   mobile  — coarse pointer + touch:   HRTF panner MUST be absent
 *
 * In each profile it walks the journey to the oracle phase, then toggles the
 * mic several times and samples the PCMPlayer's effective master gain +
 * context state via the ?devui-gated window.__oracleAudioDebug handle.
 * Pass criteria:
 *   1. Playback gain after EVERY unmute and EVERY mute matches the pre-tap
 *      baseline (±0.001) — including the very first unmute. No exceptions.
 *   2. Playback context never left suspended after a toggle settles.
 *   3. hasSpatialPanner() === false on mobile, true on desktop.
 *
 * SCOPE: this is Web Audio graph regression coverage. It proves the app-side
 * code never mutates playback gain/context/panner on mic toggles. It CANNOT
 * exercise real iOS voice-processing or Android comms-routing behavior —
 * that requires physical hardware (tracked as a follow-up task).
 *
 * Run: node scripts/oracle-mic-toggle-verify.mjs
 */
import { chromium, devices } from 'playwright';
import { execSync } from 'child_process';

const CHROMIUM = execSync('which chromium').toString().trim();
const BASE_URL = 'http://localhost:80/surrogate-oracle?devui';
const TOGGLES = 4;

const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: [
    '--no-sandbox',
    '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

let failures = 0;
const check = (ok, label) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}`);
  if (!ok) failures++;
};

// Click the mic trigger through the DOM — the button's React onClick handler
// (the exact production toggle path) fires regardless of the framer-motion
// fade-in state, which varies under SwiftShader rendering.
async function tapMic(page) {
  await page.evaluate(() => {
    const btn = document.querySelector('.oc-mic-trigger');
    if (!btn) throw new Error('mic trigger not in DOM');
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

async function sampleAudio(page) {
  return page.evaluate(() => {
    const d = window.__oracleAudioDebug;
    if (!d) return null;
    return { gain: d.getGain(), ctx: d.getContextState(), panner: d.hasSpatialPanner() };
  });
}

async function run(label, contextOpts, expectPanner) {
  console.log(`\n── ${label} ──`);
  const ctx = await browser.newContext(contextOpts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.warn(`  ⚠ page error: ${e.message}`));

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  // Walk to oracle phase: tap stage → skip lore (dev hook) → pick knife
  const vp = page.viewportSize();
  await page.click('.oracle-stage', { position: { x: vp.width / 2, y: vp.height / 2 } });
  await page.waitForTimeout(2000); // let terminal/lore phase engage
  await page.evaluate(() => window.__oracle_skipLore?.());
  try {
    await page.waitForSelector('.oracle-knife-card', { timeout: 20000 });
    await page.waitForTimeout(1200); // let the stagger animation settle
    // force: sibling cards' motion wrappers can intercept pointer events
    // mid-animation and playwright then retries forever.
    await page.locator('.oracle-knife-card').nth(1).click({ force: true });
  } catch (e) {
    console.log(`  ✗ could not reach knife selection: ${e.message}`);
    failures++;
    await ctx.close();
    return;
  }
  // The mic trigger mounts hidden and fades in with the panel — wait for
  // attachment, then give the reveal animation time. Under SwiftShader the
  // manifest reveal timing varies, so clicks below go through DOM dispatch
  // (tapMic) rather than playwright's visibility-gated click.
  await page.waitForSelector('.oc-mic-trigger', { state: 'attached', timeout: 20000 });
  await page.waitForTimeout(4000); // let PCMPlayer init + reveal + greeting settle

  const initial = await sampleAudio(page);
  if (!initial) {
    // PCMPlayer may not exist until first audio — poke it by waiting more
    await page.waitForTimeout(4000);
  }
  const base = await sampleAudio(page);
  if (!base) {
    console.log('  ✗ __oracleAudioDebug never appeared (PCMPlayer not initialized)');
    failures++;
    await ctx.close();
    return;
  }
  console.log(`  baseline: gain=${base.gain.toFixed(4)} ctx=${base.ctx} panner=${base.panner}`);
  check(base.panner === expectPanner, `spatial panner ${expectPanner ? 'present (desktop)' : 'ABSENT (mobile)'}`);

  // EVERY sample — first unmute included — must match the pre-tap baseline.
  // The mic tap is not allowed to change Oracle loudness at all.
  const TOL = 0.001;
  for (let i = 0; i < TOGGLES; i++) {
    // Unmute
    await tapMic(page);
    await page.waitForTimeout(1600); // let session settle + 1s reassert fire
    const on = await sampleAudio(page);
    // Mute
    await tapMic(page);
    await page.waitForTimeout(1600);
    const off = await sampleAudio(page);
    console.log(`  toggle ${i + 1}: on(gain=${on.gain.toFixed(4)} ctx=${on.ctx}) off(gain=${off.gain.toFixed(4)} ctx=${off.ctx})`);
    check(Math.abs(on.gain - base.gain) < TOL, `toggle ${i + 1}: unmute gain == pre-tap baseline (Δ=${Math.abs(on.gain - base.gain).toFixed(5)})`);
    check(Math.abs(off.gain - base.gain) < TOL, `toggle ${i + 1}: mute gain == pre-tap baseline (Δ=${Math.abs(off.gain - base.gain).toFixed(5)})`);
    check(off.ctx === 'running', `toggle ${i + 1}: playback ctx running after mute`);
  }

  await ctx.close();
}

await run('DESKTOP (fine pointer, no touch)', {
  viewport: { width: 1280, height: 800 },
}, true);

await run('MOBILE (coarse pointer + touch)', {
  ...devices['Pixel 7'],
  // fake-device flags still supply mic; Pixel 7 profile gives maxTouchPoints>0
  // and (pointer: coarse), which drives isTouchPrimaryDevice() → panner off.
}, false);

await browser.close();
console.log(failures === 0 ? '\n✓ ALL CHECKS PASSED' : `\n✗ ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
