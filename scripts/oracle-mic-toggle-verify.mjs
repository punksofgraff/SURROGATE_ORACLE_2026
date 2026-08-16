/**
 * Task #80 + #99 verification — mic taps must not shift Oracle volume, switch
 * to spatial audio on mobile, or flip the OS audio session.
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
 *   4. (task #99) getUserMedia is called for MIC CAPTURE exactly once per
 *      session, no matter how many times the mic is toggled — mute retains
 *      the track (enabled=false) instead of stopping it, so the iOS audio
 *      session never flips between play-and-record and playback modes.
 *   5. (task #99) While muted, ZERO audio chunks are sent to Gemini and the
 *      retained audio track is disabled; unmuted, the track is enabled.
 *
 * SCOPE: this is Web Audio graph regression coverage. It proves the app-side
 * code never mutates playback gain/context/panner on mic toggles and never
 * reacquires the mic mid-session. It CANNOT exercise real iOS voice-processing
 * or Android comms-routing behavior — that requires physical hardware
 * (tracked as a follow-up task).
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
    return {
      gain: d.getGain(),
      makeup: d.getMakeupGain ? d.getMakeupGain() : -1,
      ctx: d.getContextState(),
      panner: d.hasSpatialPanner(),
    };
  });
}

// Task #99 samples — mic lifecycle + Gemini transmission counters.
// __gumAudioCalls is installed by an init script and counts every
// getUserMedia call that requests audio (mic capture AND the one-time joint
// mic+camera permission warm-up).
async function sampleMic(page) {
  return page.evaluate(() => {
    const info = window.oracleConversationRef?.current?.getWsDebugInfo?.();
    return {
      gumAudioCalls: window.__gumAudioCalls ?? -1,
      gumJointCalls: window.__gumJointCalls ?? -1,
      gumMicOnlyCalls: window.__gumMicOnlyCalls ?? -1,
      micAcquisitions: info?.getUserMediaCalls ?? -1,
      chunksSent: info?.audioChunksSent ?? -1,
      trackStates: (window.__micStreams ?? []).map(s =>
        s.getAudioTracks().map(t => `${t.readyState}/${t.enabled ? 'on' : 'off'}`).join(',')
      ),
    };
  });
}

const GUM_COUNTER_INIT = `
  window.__gumAudioCalls = 0;       // any getUserMedia requesting audio
  window.__gumJointCalls = 0;       // joint audio+video (one-time perms warm-up)
  window.__gumMicOnlyCalls = 0;     // audio-only (mic capture path)
  window.__micStreams = [];
  window.__gumDelayMs = 0;          // race harness: artificial resolve delay
  const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    const wantsAudio = constraints && constraints.audio;
    const wantsVideo = constraints && constraints.video;
    if (wantsAudio) window.__gumAudioCalls++;
    if (wantsAudio && wantsVideo) window.__gumJointCalls++;
    if (wantsAudio && !wantsVideo) window.__gumMicOnlyCalls++;
    if (window.__gumDelayMs > 0) {
      await new Promise(r => setTimeout(r, window.__gumDelayMs));
    }
    const stream = await orig(constraints);
    // Track audio-only streams (mic capture) so track state can be asserted.
    if (wantsAudio && !wantsVideo) window.__micStreams.push(stream);
    return stream;
  };
`;

// Walk to oracle phase: tap stage → skip lore (dev hook) → pick knife.
// Returns true when the mic trigger is reachable.
async function walkToOracle(page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
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
    return false;
  }
  // The mic trigger mounts hidden and fades in with the panel — wait for
  // attachment, then give the reveal animation time. Under SwiftShader the
  // manifest reveal timing varies, so clicks below go through DOM dispatch
  // (tapMic) rather than playwright's visibility-gated click.
  await page.waitForSelector('.oc-mic-trigger', { state: 'attached', timeout: 20000 });
  await page.waitForTimeout(4000); // let PCMPlayer init + reveal + greeting settle
  return true;
}

async function run(label, contextOpts, expectPanner) {
  console.log(`\n── ${label} ──`);
  const ctx = await browser.newContext(contextOpts);
  const page = await ctx.newPage();
  await page.addInitScript(GUM_COUNTER_INIT);
  page.on('pageerror', (e) => console.warn(`  ⚠ page error: ${e.message}`));

  if (!(await walkToOracle(page))) { await ctx.close(); return; }

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
  console.log(`  baseline: gain=${base.gain.toFixed(4)} makeup=${base.makeup.toFixed(2)} ctx=${base.ctx} panner=${base.panner}`);
  check(base.panner === expectPanner, `spatial panner ${expectPanner ? 'present (desktop)' : 'ABSENT (mobile)'}`);
  // Unity-master-gain architecture: master gain must sit at 1.0 for the whole
  // session (loudness lives in the fixed 2.5x mid-graph makeup gain instead).
  check(Math.abs(base.gain - 1.0) < 0.01, `baseline master gain is UNITY (${base.gain.toFixed(4)})`);
  check(Math.abs(base.makeup - 2.5) < 0.01, `makeup gain fixed at 2.5 (${base.makeup.toFixed(3)})`);

  // EVERY sample — first unmute included — must match the pre-tap baseline.
  // The mic tap is not allowed to change Oracle loudness at all.
  const TOL = 0.001;
  let micAcquisitionsAfterFirstUnmute = null;
  for (let i = 0; i < TOGGLES; i++) {
    // Unmute
    await tapMic(page);
    await page.waitForTimeout(1600); // let session settle + 1s reassert fire
    const on = await sampleAudio(page);
    const onMic = await sampleMic(page);
    if (i === 0) micAcquisitionsAfterFirstUnmute = onMic.micAcquisitions;
    // Mute
    await tapMic(page);
    await page.waitForTimeout(1600);
    const off = await sampleAudio(page);
    const offMic = await sampleMic(page);
    // Sample sent-chunk counter across a muted dwell — must not move.
    await page.waitForTimeout(1200);
    const offMicLater = await sampleMic(page);
    console.log(`  toggle ${i + 1}: on(gain=${on.gain.toFixed(4)} mk=${on.makeup.toFixed(2)} ctx=${on.ctx} gum=${onMic.micAcquisitions} tracks=${onMic.trackStates.join('|')}) off(gain=${off.gain.toFixed(4)} mk=${off.makeup.toFixed(2)} ctx=${off.ctx} tracks=${offMic.trackStates.join('|')} sent=${offMic.chunksSent}→${offMicLater.chunksSent})`);
    check(Math.abs(on.gain - base.gain) < TOL, `toggle ${i + 1}: unmute gain == pre-tap baseline (Δ=${Math.abs(on.gain - base.gain).toFixed(5)})`);
    check(Math.abs(off.gain - base.gain) < TOL, `toggle ${i + 1}: mute gain == pre-tap baseline (Δ=${Math.abs(off.gain - base.gain).toFixed(5)})`);
    check(Math.abs(on.makeup - base.makeup) < TOL && Math.abs(off.makeup - base.makeup) < TOL, `toggle ${i + 1}: makeup gain untouched by toggle`);
    check(off.ctx === 'running', `toggle ${i + 1}: playback ctx running after mute`);
    // ── Task #99: retained-track assertions ─────────────────────────────
    check(onMic.micAcquisitions === micAcquisitionsAfterFirstUnmute, `toggle ${i + 1}: no mic reacquisition (getUserMedia count stable at ${onMic.micAcquisitions})`);
    check(onMic.trackStates.every(s => s.includes('live/on')), `toggle ${i + 1}: unmuted — retained track live+enabled`);
    check(offMic.trackStates.every(s => s.includes('live/off')), `toggle ${i + 1}: muted — track still LIVE (not stopped) but disabled`);
    check(offMicLater.chunksSent === offMic.chunksSent, `toggle ${i + 1}: zero chunks sent to Gemini while muted (${offMic.chunksSent} stable)`);
  }

  // Exactly ONE mic-capture getUserMedia for the whole session of toggles,
  // and AT MOST one joint audio+video warm-up (one-time perms consolidation).
  const finalMic = await sampleMic(page);
  check(finalMic.micAcquisitions === 1, `exactly ONE mic acquisition across ${TOGGLES} toggle cycles (got ${finalMic.micAcquisitions})`);
  check(finalMic.gumMicOnlyCalls === 1, `exactly ONE audio-only getUserMedia at browser level (got ${finalMic.gumMicOnlyCalls})`);
  check(finalMic.gumJointCalls <= 1, `joint mic+camera perms warm-up at most ONCE per page load (got ${finalMic.gumJointCalls})`);

  await ctx.close();
}

// ── Task #99 race harness — slow-permission scenario ─────────────────────
// getUserMedia is artificially delayed so multiple taps land while acquisition
// is in flight. Latest-intent semantics must hold:
//   Case A (3 taps: on→off→on, odd count ⇒ ON):  lands unmuted, one acquisition.
//   Case B (2 taps: on→off, even count ⇒ OFF):   lands muted (track live/off),
//                                                one acquisition, no chunks sent.
async function runRaceTest() {
  console.log('\n── RACE: rapid taps during slow getUserMedia ──');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.addInitScript(GUM_COUNTER_INIT);
  page.on('pageerror', (e) => console.warn(`  ⚠ page error: ${e.message}`));

  if (!(await walkToOracle(page))) { await ctx.close(); return; }

  // Case A — 3 taps while the mic-capture getUserMedia resolves slowly.
  await page.evaluate(() => { window.__gumDelayMs = 1500; });
  await tapMic(page);              // tap 1: begin acquisition (intent ON)
  await page.waitForTimeout(150);
  await tapMic(page);              // tap 2: queue mute (intent OFF)
  await page.waitForTimeout(150);
  await tapMic(page);              // tap 3: back to ON — final intent
  // Poll until the delayed audio-only stream lands (joint perms warm-up and
  // mic capture both carry the artificial delay and may serialize) + settle.
  await page.waitForFunction(() => (window.__micStreams ?? []).length > 0, null, { timeout: 12000 })
    .catch(() => {}); // fall through — assertions below surface the failure
  await page.waitForTimeout(600);
  const a = await sampleMic(page);
  console.log(`  case A: acq=${a.micAcquisitions} tracks=${a.trackStates.join('|')}`);
  check(a.micAcquisitions === 1, `case A: ONE acquisition despite 3 taps mid-flight (got ${a.micAcquisitions})`);
  check(a.trackStates.length === 1 && a.trackStates[0].includes('live/on'), `case A: odd tap count → lands UNMUTED (track live+enabled)`);

  await ctx.close();

  // Case B — fresh context (clean localStorage/journey state): 2 taps while
  // acquisition is in flight — final intent OFF.
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pageB = await ctxB.newPage();
  await pageB.addInitScript(GUM_COUNTER_INIT);
  pageB.on('pageerror', (e) => console.warn(`  ⚠ page error: ${e.message}`));
  if (!(await walkToOracle(pageB))) { await ctxB.close(); return; }
  await pageB.evaluate(() => { window.__gumDelayMs = 1500; });
  await tapMic(pageB);              // tap 1: begin acquisition (intent ON)
  await pageB.waitForTimeout(150);
  await tapMic(pageB);              // tap 2: queue mute — final intent OFF
  await pageB.waitForFunction(() => (window.__micStreams ?? []).length > 0, null, { timeout: 12000 })
    .catch(() => {});
  await pageB.waitForTimeout(600);
  const b1 = await sampleMic(pageB);
  await pageB.waitForTimeout(1200);
  const b2 = await sampleMic(pageB);
  console.log(`  case B: acq=${b1.micAcquisitions} tracks=${b1.trackStates.join('|')} sent=${b1.chunksSent}→${b2.chunksSent}`);
  check(b1.micAcquisitions === 1, `case B: ONE acquisition despite mute tap mid-flight (got ${b1.micAcquisitions})`);
  check(b1.trackStates.length === 1 && b1.trackStates[0].includes('live/off'), `case B: even tap count → lands MUTED (track live but disabled)`);
  check(b2.chunksSent === b1.chunksSent, `case B: zero chunks sent to Gemini after landing muted (${b1.chunksSent} stable)`);

  await ctxB.close();
}

// Phase selection — `node scripts/oracle-mic-toggle-verify.mjs [desktop|mobile|race|all]`
// Running one phase at a time keeps each invocation inside CI/shell timeouts.
const phase = process.argv[2] ?? 'all';

if (phase === 'all' || phase === 'desktop') {
  await run('DESKTOP (fine pointer, no touch)', {
    viewport: { width: 1280, height: 800 },
  }, true);
}

if (phase === 'all' || phase === 'mobile') {
  await run('MOBILE (coarse pointer + touch)', {
    ...devices['Pixel 7'],
    // fake-device flags still supply mic; Pixel 7 profile gives maxTouchPoints>0
    // and (pointer: coarse), which drives isTouchPrimaryDevice() → panner off.
  }, false);
}

if (phase === 'all' || phase === 'race') {
  await runRaceTest();
}

await browser.close();
console.log(failures === 0 ? '\n✓ ALL CHECKS PASSED' : `\n✗ ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
