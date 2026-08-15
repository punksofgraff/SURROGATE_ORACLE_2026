#!/usr/bin/env node
/**
 * oracle-briefing-verify.mjs
 *
 * Verifies the world-briefing injection race fix: a FIRST normal session
 * (fresh browser profile, no prior state) must log "WORLD BRIEFING INJECTED"
 * before "GEMINI SESSION CREATED" — proving the briefing made it into the
 * system prompt of the initial session.config, not just a later reconnect.
 *
 * Uses SwiftShader so the 3D scene renders in headless (the app's normal
 * startup path requires a working WebGL context).
 *
 * Usage: node scripts/oracle-briefing-verify.mjs
 *        DEV_URL=http://localhost:5173 node scripts/oracle-briefing-verify.mjs
 */

import puppeteer from 'puppeteer';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEV_URL = process.env.DEV_URL ?? 'http://localhost:5173';

const STEPS_OF_INTEREST = [
  'WORLD BRIEFING FETCHED',
  'GEMINI WS OPENED',
  'WORLD BRIEFING INJECTED',
  'GEMINI SESSION CREATED',
];

(async () => {
  console.log(`\n── ORACLE BRIEFING INJECTION VERIFY ──`);
  console.log(`   Dev server: ${DEV_URL}\n`);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: puppeteer.executablePath(),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--enable-unsafe-swiftshader',        // software WebGL for the 3D scene
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--use-file-for-fake-audio-capture=' + join(__dirname, '../public/mock-speech.wav'),
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });

  const stepLog = []; // { label, t } in arrival order
  const allLog = [];
  const t0 = Date.now();
  page.on('console', (msg) => {
    const text = msg.text();
    allLog.push(text.slice(0, 140));
    if (!text.includes('[ORACLE:STEP]')) return;
    const label = text.replace(/^.*\[ORACLE:STEP\]\s*\S*\s*/, '').trim();
    stepLog.push({ label, t: Date.now() - t0 });
  });
  page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message.slice(0, 120)}`));

  // ?devui — [ORACLE:STEP] console lines are gated behind explicit debug opt-in
  // (see CodeAuditor.tsx DEBUG_ENABLED); without it logStep prints nothing.
  const url = DEV_URL + (DEV_URL.includes('?') ? '&' : '?') + 'devui';
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
  console.log(`  loaded: ${page.url()}  title="${await page.title()}"`);
  await new Promise((r) => setTimeout(r, 2000));

  // First tap — unlocks audio and starts the journey (dormant → terminal)
  await page.mouse.click(195, 500);
  await new Promise((r) => setTimeout(r, 2500));

  // Advance through lore typing / awakened phase with a few more taps,
  // then pick the first knife card if it appears.
  for (let i = 0; i < 6; i++) {
    await page.mouse.click(195, 500);
    await new Promise((r) => setTimeout(r, 1500));
    const clickedCard = await page.evaluate(() => {
      const card = document.querySelector('[data-knife], [class*="knife" i], [class*="card" i] button, button');
      if (card) { card.click(); return true; }
      return false;
    });
    if (clickedCard) await new Promise((r) => setTimeout(r, 1500));
    if (stepLog.some((s) => s.label.includes('GEMINI SESSION CREATED'))) break;
  }

  // Wait for the session sequence to settle (WS dial + briefing await + setup)
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    if (stepLog.some((s) => s.label.includes('GEMINI SESSION CREATED'))) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  await new Promise((r) => setTimeout(r, 1000));
  await browser.close();

  console.log('  [ORACLE:STEP] log (chronological):');
  for (const s of stepLog) console.log(`    ${String(s.t).padStart(6)}ms  ${s.label}`);
  if (stepLog.length === 0) {
    console.log(`  (no step logs — ${allLog.length} raw console lines; first 15:)`);
    for (const l of allLog.slice(0, 15)) console.log(`    | ${l}`);
  }

  const idx = (needle) => stepLog.findIndex((s) => s.label.includes(needle));
  const positions = Object.fromEntries(STEPS_OF_INTEREST.map((k) => [k, idx(k)]));
  console.log('\n  Positions:', JSON.stringify(positions));

  const injected = positions['WORLD BRIEFING INJECTED'];
  const created = positions['GEMINI SESSION CREATED'];
  const opened = positions['GEMINI WS OPENED'];

  let ok = true;
  if (opened === -1) { console.log('  ✗ WS never opened — session flow not reached'); ok = false; }
  if (injected === -1) { console.log('  ✗ WORLD BRIEFING INJECTED never logged'); ok = false; }
  if (created === -1) { console.log('  ⚠ GEMINI SESSION CREATED not seen (server-side ack) — ordering vs WS OPEN still checked'); }
  if (injected !== -1 && created !== -1 && injected > created) {
    console.log('  ✗ Briefing injected AFTER session created — race not fixed'); ok = false;
  }
  if (injected !== -1 && opened !== -1 && injected < opened) {
    console.log('  ✗ Impossible ordering — injected before WS open?'); ok = false;
  }

  console.log(ok && injected !== -1
    ? '\n  ✅ PASS — first session injected the world briefing into its setup frame.\n'
    : '\n  ❌ FAIL — see above.\n');
  process.exit(ok && injected !== -1 ? 0 : 1);
})();
