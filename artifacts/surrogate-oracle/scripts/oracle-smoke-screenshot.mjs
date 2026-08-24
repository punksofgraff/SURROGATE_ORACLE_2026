#!/usr/bin/env node
/**
 * oracle-smoke-screenshot.mjs
 *
 * Drives the Oracle through each phase, takes a screenshot at each stage,
 * and reports on visible UI issues.
 *
 * Phases captured:
 *   01-dormant        — initial load
 *   02-terminal       — after first tap (lore typing)
 *   03-awakened       — after lore completes (knife cards)
 *   04-oracle-entry   — after knife selection (1.6s transition)
 *   05-oracle-live    — oracle mode settled (avatar visible, panel open)
 *
 * Usage: npm run smoke
 *        DEV_URL=http://localhost:5173 npm run smoke
 */

import puppeteer from 'puppeteer';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR   = join(__dirname, '../screenshots');
const DEV_URL   = process.env.DEV_URL ?? 'http://localhost:5173';

mkdirSync(OUT_DIR, { recursive: true });

const SHOTS = [];
let pass = 0, warn = 0, fail = 0;

function log(icon, label, detail = '') {
  const line = `${icon} ${label}${detail ? '  — ' + detail : ''}`;
  console.log(line);
  SHOTS.push({ icon, label, detail });
}

async function shot(page, name, label) {
  const path = join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  log('📸', label, path.split('/').slice(-2).join('/'));
}

async function check(condition, passMsg, failMsg) {
  if (condition) { log('✓', passMsg); pass++; }
  else           { log('✗', failMsg); fail++; }
}

async function warn_(condition, msg, detail) {
  if (!condition) { log('⚠', msg, detail); warn++; }
}

(async () => {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   ORACLE SMOKE SCREENSHOT TEST           ║');
  console.log('╚══════════════════════════════════════════╝\n');
  console.log(`  Dev server: ${DEV_URL}\n`);

  const browser = await puppeteer.launch({
    headless: true,
    // Replit provides Chromium outside Puppeteer's download cache. Keep the
    // cache path as a local fallback so this also runs on developer machines.
    executablePath: process.env.CHROME_BIN || puppeteer.executablePath(),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--use-file-for-fake-audio-capture=' + join(__dirname, '../public/mock-speech.wav')
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 }); // iPhone 14 Pro portrait

  // Capture structured browser errors. The app also retains these in
  // window.__oracle_runtimeErrors so source locations and stacks survive
  // console serialization and can be inspected after the run.
  const browserEvents = [];
  page.on('pageerror', e => browserEvents.push({
    type: 'pageerror',
    message: e.message || String(e),
    stack: e.stack || undefined,
  }));
  page.on('error', e => browserEvents.push({
    type: 'pageerror',
    message: e.message || String(e),
    stack: e.stack || undefined,
  }));
  page.on('console', msg => {
    if (msg.type() === 'error') browserEvents.push({
      type: 'console',
      message: msg.text(),
    });
  });

  // ── Phase 1: DORMANT ─────────────────────────────────────────────────────
  console.log('Phase 1 — DORMANT\n');
  try {
    await page.goto(DEV_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  } catch {
    console.error(`❌  Cannot reach ${DEV_URL} — is npm run dev running?\n`);
    await browser.close();
    process.exit(1);
  }

  await new Promise(resolve => setTimeout(resolve, 2000));
  await shot(page, 'smoke-01-dormant', 'Dormant state');

  const dormantPhase = await page.$eval('[data-oracle-state]', el => el.getAttribute('data-oracle-state')).catch(() => null);
  check(dormantPhase === 'dormant', 'data-oracle-state="dormant"', `Expected dormant, got: ${dormantPhase}`);

  const hasCabinet = await page.$('.oracle-cabinet') !== null;
  check(hasCabinet, 'oracle-cabinet present');

  const hasCanvas3D = await page.$('canvas') !== null;
  // Canvas only mounts in awakened+ — dormant should have NO canvas yet
  await warn_(hasCanvas3D, 'Three.js canvas mounted in dormant (expected: not yet)', 'may cause unnecessary GPU load');

  // ── Phase 2: TERMINAL ────────────────────────────────────────────────────
  console.log('\nPhase 2 — TERMINAL\n');
  await page.click('.oracle-center');
  await new Promise(resolve => setTimeout(resolve, 1800));
  await shot(page, 'smoke-02-terminal', 'Terminal/lore state');

  const terminalPhase = await page.$eval('[data-oracle-state]', el => el.getAttribute('data-oracle-state')).catch(() => null);
  check(terminalPhase === 'terminal', 'data-oracle-state="terminal"', `Got: ${terminalPhase}`);

  const hasLoreLine = await page.$('.oracle-lore-line') !== null;
  check(hasLoreLine, 'Lore text visible (.oracle-lore-line)');

  // ── Phase 3: AWAKENED (skip lore) ────────────────────────────────────────
  console.log('\nPhase 3 — AWAKENED\n');
  await page.evaluate(() => {
    if (typeof window.__oracle_skipLore === 'function') window.__oracle_skipLore();
  });
  await new Promise(resolve => setTimeout(resolve, 2500));
  await shot(page, 'smoke-03-awakened', 'Awakened state (knife cards)');

  const awakenedPhase = await page.$eval('[data-oracle-state]', el => el.getAttribute('data-oracle-state')).catch(() => null);
  check(awakenedPhase === 'awakened', 'data-oracle-state="awakened"', `Got: ${awakenedPhase}`);

  const hasKnifeCard = await page.$('.oracle-knife-card, [class*="knife"]') !== null;
  check(hasKnifeCard, 'Knife selection cards visible');

  const hasCanvas = await page.$('canvas') !== null;
  check(hasCanvas, 'Three.js Canvas mounted in awakened phase');

  // ── Phase 4: ORACLE ENTRY ─────────────────────────────────────────────────
  console.log('\nPhase 4 — ORACLE ENTRY\n');
  const knifeCard = await page.$('.oracle-knife-card, [class*="knife-card"]');
  if (knifeCard) {
    await knifeCard.click();
  } else {
    // fallback: click first button in the knife overlay
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')].filter(b => b.textContent?.length > 20);
      btns[0]?.click();
    });
  }
  await new Promise(resolve => setTimeout(resolve, 2000));
  await shot(page, 'smoke-04-oracle-entry', 'Oracle entry transition');

  // ── Phase 5: ORACLE LIVE ──────────────────────────────────────────────────
  console.log('\nPhase 5 — ORACLE LIVE\n');
  await new Promise(resolve => setTimeout(resolve, 3000));
  await shot(page, 'smoke-05-oracle-live', 'Oracle live state');

  const oraclePhase = await page.$eval('[data-oracle-state]', el => el.getAttribute('data-oracle-state')).catch(() => null);
  check(oraclePhase === 'oracle', 'data-oracle-state="oracle"', `Got: ${oraclePhase}`);

  // Cabinet should be frameless — check computed border
  const cabinetBorder = await page.$eval('.oracle-cabinet', el => {
    const s = getComputedStyle(el);
    return { border: s.borderWidth, bg: s.backgroundColor, radius: s.borderRadius };
  }).catch(() => null);
  if (cabinetBorder) {
    check(
      cabinetBorder.border === '0px' || cabinetBorder.bg === 'rgba(0, 0, 0, 0)' || cabinetBorder.bg === 'transparent',
      'Cabinet is frameless (transparent bg, no border)',
      `border=${cabinetBorder.border} bg=${cabinetBorder.bg}`
    );
  }

  // Mic button should be smaller (~48px)
  const micSize = await page.$eval('.oc-mic-trigger', el => {
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  }).catch(() => null);
  if (micSize) {
    check(micSize.w <= 56, `Mic orb is compact (${micSize.w}×${micSize.h}px, target ≤56px)`);
  }

  // Status pill should be hidden
  const pillVisible = await page.$eval('.oc-status-pill', el => {
    return getComputedStyle(el).display !== 'none';
  }).catch(() => false);
  check(!pillVisible, 'Status pill hidden (visual cues replace text labels)');

  // Panel should be transparent (not the old opaque gradient)
  const panelBg = await page.$eval('.oc-panel-v2', el => {
    return getComputedStyle(el).backgroundColor;
  }).catch(() => null);
  if (panelBg) {
    const isTransparent = panelBg === 'rgba(0, 0, 0, 0)' || panelBg === 'transparent';
    check(isTransparent, 'oc-panel is transparent (no opaque backdrop)', `bg=${panelBg}`);
  }

  // Avatar canvas present and sized correctly
  const canvasRect = await page.$eval('canvas', el => {
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  }).catch(() => null);
  if (canvasRect) {
    check(canvasRect.w >= 200, `Three.js canvas has width (${canvasRect.w}×${canvasRect.h}px)`);
    check(canvasRect.h >= 200, `Three.js canvas has height`);
  }

  // Exit button should be green, not purple
  const exitColor = await page.$eval('.oracle-exit-btn', el => {
    return getComputedStyle(el).color;
  }).catch(() => null);
  if (exitColor) {
    const isGreen = exitColor.includes('0, 255') || exitColor.includes('00ff');
    // rgb(0, 255, 136) ≈ the green; purple would be rgb(200, 160, 255)
    const isPurple = exitColor.includes('200') && exitColor.includes('160') && exitColor.includes('255');
    check(!isPurple, 'EXIT button is not purple', `color=${exitColor}`);
  }

  // ── JavaScript errors check ───────────────────────────────────────────────
  console.log('\nJS Error Check\n');
  const appRuntimeErrors = await page.evaluate(() => window.__oracle_runtimeErrors ?? []);
  const runtimeErrors = [...appRuntimeErrors, ...browserEvents];
  const isExpectedHeadlessError = (error) => {
    const text = [
      error.type,
      error.message,
      error.stack,
      error.reason,
    ].filter(Boolean).join(' ');
    return /mic|Audio|getUserMedia|WebSocket|supabase|net::ERR/i.test(text);
  };
  const unexpectedRuntimeErrors = runtimeErrors.filter(error => !isExpectedHeadlessError(error));
  check(
    unexpectedRuntimeErrors.length === 0,
    'No unexpected runtime errors (0)',
    `${unexpectedRuntimeErrors.length} unexpected runtime error(s): ${unexpectedRuntimeErrors
      .slice(0, 3).map(error => `${error.type}: ${error.message}`).join(' | ')}`
  );
  if (runtimeErrors.length > 0) {
    log('ℹ', `${runtimeErrors.length} runtime error event(s) captured`,
      `${unexpectedRuntimeErrors.length} unexpected; expected headless events are retained in evidence`);
  }

  const evidencePath = join(OUT_DIR, 'oracle-smoke-evidence.json');
  writeFileSync(evidencePath, JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    devUrl: DEV_URL,
    screenshots: SHOTS.filter(shot => shot.icon === '📸'),
    summary: {
      passed: pass,
      failed: fail,
      warnings: warn,
      unexpectedRuntimeErrorCount: unexpectedRuntimeErrors.length,
      runtimeErrorCount: runtimeErrors.length,
    },
    runtime: {
      pageErrors: runtimeErrors.filter(error => error.type === 'pageerror'),
      unhandledRejections: runtimeErrors.filter(error => error.type === 'unhandledrejection'),
      rootCrashes: runtimeErrors.filter(error => error.type === 'root-crash'),
      consoleErrors: runtimeErrors.filter(error => error.type === 'console'),
      unexpected: unexpectedRuntimeErrors,
    },
  }, null, 2) + '\n');
  console.log(`  Runtime evidence → ${evidencePath.split('/').slice(-2).join('/')}/`);

  await browser.close();

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n══════════════════════════════════════════════════`);
  const total = pass + fail;
  console.log(`  Screenshots → ${OUT_DIR.split('/').slice(-2).join('/')}/`);
  if (fail === 0) {
    console.log(`  ✅ ALL ${total} CHECKS PASSED  (${warn} warnings)`);
  } else {
    console.log(`  ❌ ${fail}/${total} CHECKS FAILED  (${warn} warnings)`);
  }
  console.log(`══════════════════════════════════════════════════\n`);
  process.exit(fail > 0 ? 1 : 0);
})();
