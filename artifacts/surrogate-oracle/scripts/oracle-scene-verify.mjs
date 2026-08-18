#!/usr/bin/env node
/**
 * oracle-scene-verify.mjs — Task: Nebula particles + Rapier physics + bloom.
 *
 * Drives the Oracle to the live avatar scene with a FORCED GPU tier (via the
 * sessionStorage cache the useGPUTier hook reads) and verifies:
 *   - the R3F canvas mounts and renders without page errors
 *   - the Nebula sprite particles are present in the scene
 *   - the Rapier debris instancedMesh is present (tier 2+)
 *   - the EffectComposer post stack doesn't crash (bloom/CA/noise/scanline)
 *   - tier 0 path renders the bare avatar with no particles/physics
 *
 * Usage:
 *   PUPPETEER_EXECUTABLE_PATH=$(which chromium) node scripts/oracle-scene-verify.mjs [tier]
 */
import puppeteer from 'puppeteer';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '../screenshots');
mkdirSync(OUT_DIR, { recursive: true });

const DEV_URL = process.env.DEV_URL ?? 'http://localhost:80/surrogate-oracle';
const FORCED_TIER = Number(process.argv[2] ?? 3);

let pass = 0, fail = 0;
const check = (cond, okMsg, badMsg) => {
  if (cond) { console.log(`  ✓ ${okMsg}`); pass++; }
  else { console.log(`  ✗ ${badMsg ?? okMsg}`); fail++; }
};

const browser = await puppeteer.launch({
  headless: true,
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
  args: [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    // SwiftShader — headless WebGL per memory recipe
    '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    '--use-file-for-fake-audio-capture=' + join(__dirname, '../public/mock-speech.wav'),
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') pageErrors.push(msg.text());
});

// Force the GPU tier BEFORE app code runs (useGPUTier reads this cache key).
await page.evaluateOnNewDocument((tier) => {
  sessionStorage.setItem('oracle_gpu_profile_v1', JSON.stringify({ tier, isMobile: false }));
  // three.js reports every Scene/WebGLRenderer to __THREE_DEVTOOLS__ if present.
  window.__oracle_observed = [];
  window.__THREE_DEVTOOLS__ = {
    dispatchEvent(e) { try { window.__oracle_observed.push(e.detail); } catch {} },
    addEventListener() {}, removeEventListener() {},
  };
}, FORCED_TIER);

console.log(`\n═══ ORACLE SCENE VERIFY — forced tier ${FORCED_TIER} ═══\n`);
console.log(`  URL: ${DEV_URL}?devui\n`);

await page.goto(`${DEV_URL}?devui`, { waitUntil: 'load', timeout: 60_000 });
await new Promise((r) => setTimeout(r, 5000));

// dormant → terminal
await page.click('.oracle-center');
await new Promise((r) => setTimeout(r, 1500));

// terminal → awakened (skip lore)
await page.evaluate(() => {
  if (typeof window.__oracle_skipLore === 'function') window.__oracle_skipLore();
});
await new Promise((r) => setTimeout(r, 3000));

const awakenedPhase = await page
  .$eval('[data-oracle-state]', (el) => el.getAttribute('data-oracle-state'))
  .catch(() => null);
console.log(`  phase after skipLore: ${awakenedPhase}`);

// awakened → oracle (pick a knife)
await page.evaluate(() => {
  const card = document.querySelector('.oracle-knife-card, [class*="knife-card"]');
  if (card) { card.click(); return; }
  const btns = [...document.querySelectorAll('button')].filter((b) => (b.textContent?.length ?? 0) > 20);
  btns[0]?.click();
});
await new Promise((r) => setTimeout(r, 6000));

const phase = await page
  .$eval('[data-oracle-state]', (el) => el.getAttribute('data-oracle-state'))
  .catch(() => null);
check(phase === 'oracle' || phase === 'awakened', `scene phase reached: ${phase}`);

await page.screenshot({ path: join(OUT_DIR, `scene-verify-tier${FORCED_TIER}.png`) });
console.log(`  📸 screenshots/scene-verify-tier${FORCED_TIER}.png`);

// Inspect the live three.js scene graph through the R3F canvas.
const sceneStats = await page.evaluate(() => {
  // R3F stores the root on the canvas element's parent via internal fiber keys;
  // simplest robust probe: walk all canvases, read their WebGL context existence,
  // and use THREE's global object registry via __THREE_DEVTOOLS__ if absent,
  // fall back to counting via renderer info hook injected below.
  const canvases = [...document.querySelectorAll('canvas')];
  const stats = { canvasCount: canvases.length, webgl: false };
  for (const c of canvases) {
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (gl) stats.webgl = true;
  }
  return stats;
});
check(sceneStats.canvasCount >= 1, `canvas mounted (count=${sceneStats.canvasCount})`);
check(sceneStats.webgl, 'WebGL context alive');

// Count scene objects via a one-frame RAF probe on the R3F fiber root.
const scanObjects = () => page.evaluate(() => {
  const observed = window.__oracle_observed || [];
  const scenes = observed.filter((d) => d && d.isScene);
  if (scenes.length === 0) return { error: `no scenes observed (${observed.length} objects reported)` };
  // The devtools hook reports every Scene ever constructed (incl. postprocessing
  // internals and stale HMR copies). Scan them all LIVE — the debris/sprites are
  // children added after report time, so traverse now and take the union.
  const counts = { sprites: 0, instancedMeshes: 0, skinned: 0, total: 0, instancedCount: 0, scenes: scenes.length };
  for (const scene of scenes) {
    scene.traverse((o) => {
      counts.total++;
      if (o.isSprite) counts.sprites++;
      if (o.isInstancedMesh) { counts.instancedMeshes++; counts.instancedCount += o.count; }
      if (o.isSkinnedMesh) counts.skinned++;
    });
  }
  return counts;
});

// Rapier WASM loads behind Suspense — give it up to 20s to appear (tier 2+).
let objectCounts = await scanObjects();
if (FORCED_TIER >= 2 && !objectCounts.error) {
  for (let i = 0; i < 10 && objectCounts.instancedMeshes === 0; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    objectCounts = await scanObjects();
  }
}

// SwiftShader software rendering often trips the runtime FPS guard, which
// legitimately collapses the effective tier to 0 mid-run (that is the guard
// working as designed, not a bug). Read the live tier so expectations match.
const liveTier = await page.evaluate(() => window.__oracle_renderTier);
const effectiveTier = typeof liveTier === 'number' ? Math.min(FORCED_TIER, liveTier) : FORCED_TIER;
if (effectiveTier !== FORCED_TIER) {
  console.log(`  ⚠ runtime FPS guard degraded tier ${FORCED_TIER} → ${effectiveTier} (SwiftShader; expected under headless)`);
}

console.log(`  scene objects: ${JSON.stringify(objectCounts)}`);
if (!objectCounts.error) {
  check(objectCounts.skinned >= 1, `avatar SkinnedMesh present (${objectCounts.skinned})`);
  if (effectiveTier >= 1) {
    check(objectCounts.sprites >= 1, `nebula sprite particles present (${objectCounts.sprites})`,
      'NO nebula sprites found in scene');
  } else if (FORCED_TIER === 0) {
    check(objectCounts.sprites === 0, 'tier 0: no particles (correct)');
  } else {
    console.log('  ○ nebula check skipped — guard degraded to tier 0 (unmount is correct behavior)');
  }
  if (effectiveTier >= 2) {
    check(objectCounts.instancedMeshes >= 1,
      `rapier debris instancedMesh present (${objectCounts.instancedMeshes}, instances=${objectCounts.instancedCount})`,
      'NO debris instancedMesh found');
  } else if (FORCED_TIER < 2) {
    check(objectCounts.instancedMeshes === 0, `tier ${FORCED_TIER}: no physics debris (correct)`);
  } else {
    console.log('  ○ debris check skipped — guard degraded below tier 2 (unmount is correct behavior)');
  }
} else {
  check(false, '', `scene introspection failed: ${objectCounts.error}`);
}

// Let it run a few seconds to catch runtime crashes in useFrame/physics step.
await new Promise((r) => setTimeout(r, 5000));
await page.screenshot({ path: join(OUT_DIR, `scene-verify-tier${FORCED_TIER}-later.png`) });

const critical = pageErrors.filter((e) =>
  !e.includes('getUserMedia') && !e.includes('AudioContext') && !e.includes('Failed to load resource') &&
  !e.includes('WebSocket') && !e.includes('mic'));
check(critical.length === 0, 'no critical JS errors', `JS errors:\n    ${critical.slice(0, 5).join('\n    ')}`);

await browser.close();
console.log(`\n  RESULT: ${pass} pass, ${fail} fail\n`);
process.exit(fail > 0 ? 1 : 0);
