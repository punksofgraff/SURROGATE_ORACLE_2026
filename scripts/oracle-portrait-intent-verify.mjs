/**
 * Portrait intent verification (headless).
 *
 * As a wallet-signed seeker, reach the oracle phase and type an explicit
 * portrait request on the FIRST entry (entry count 1 << old gate of 5).
 * Verifies:
 *  - typed intent detection fires without the five-entry minimum
 *  - the portrait pipeline is invoked
 *  - on failure the trigger re-arms (retry allowed); on success the card shows
 *  - wallet-signed seeker is NOT hit by the journey-limit gate
 *
 * Run: node scripts/oracle-portrait-intent-verify.mjs
 */
import { chromium } from 'playwright';
import { execSync } from 'child_process';

const CHROMIUM = execSync('which chromium').toString().trim();
const BASE = 'http://localhost:80/surrogate-oracle';
const FLAGS = [
  '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
  '--no-sandbox',
];

const pass = [], fail = [];
const check = (ok, label) => { (ok ? pass : fail).push(label); console.log(`  ${ok ? '✓' : '✗'}  ${label}`); };

const browser = await chromium.launch({ executablePath: CHROMIUM, args: FLAGS });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const steps = [];
page.on('console', m => {
  const t = m.text();
  if (t.includes('[ORACLE:STEP]')) steps.push(t.replace(/%c|color:.*$/g, '').trim());
});
const has = (needle) => steps.some(s => s.includes(needle));
const waitForStep = async (needle, timeoutMs = 30000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (has(needle)) return true;
    await page.waitForTimeout(400);
  }
  return false;
};

// Wallet-signed seeker → direct alley entry, no lore, no journey gate.
await page.goto(`${BASE}/?devui`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  localStorage.setItem('oracle_wallet_signed', 'true');
  localStorage.setItem('oracle_seeker_key', '0xTESTPORTRAIT01');
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.click('.oracle-stage', { position: { x: 640, y: 400 } }).catch(() => {});
const reachedAlley = await page.waitForFunction(
  () => ['awakened', 'oracle'].includes(document.querySelector('[data-oracle-state]')?.getAttribute('data-oracle-state')),
  { timeout: 15000 },
).then(() => true).catch(() => false);
check(reachedAlley, 'wallet-signed seeker reached alley');

// Select a knife card to enter the oracle phase.
await page.waitForSelector('.oracle-knife-card', { timeout: 15000 }).catch(() => {});
const knives = await page.locator('.oracle-knife-card').count();
check(knives > 0, `knife cards present (${knives})`);
if (knives > 0) {
  await page.locator('.oracle-knife-card').first().click();
  const inOracle = await page.waitForFunction(
    () => document.querySelector('[data-oracle-state="oracle"]') !== null,
    { timeout: 20000 },
  ).then(() => true).catch(() => false);
  check(inOracle, 'entered oracle phase');
}

// Type an explicit portrait request as the FIRST entry.
// The type pad is closed by default — open it via the dev-exposed conversation
// ref (same path the hamburger menu's TYPE SIGNAL button uses).
await page.evaluate(() => window.oracleConversationRef?.current?.toggleTypeMode());
await page.waitForTimeout(800);
const input = page.locator('.oc-input').first();
const inputVisible = await input.isVisible().catch(() => false);
check(inputVisible, 'type pad visible');
if (inputVisible) {
  await input.fill('generate me a procedural portrait, please');
  await input.press('Enter');

  const intent = await waitForStep('PORTRAIT INTENT DETECTED (typed)', 10000);
  check(intent, 'explicit intent detected on FIRST entry (5-entry gate bypassed)');

  const invoked = await waitForStep('GENERATING PORTRAIT...', 10000);
  check(invoked, 'portrait pipeline invoked');

  // Either the portrait succeeds (card) or fails (re-arm) — both are informative.
  // The generator edge function alone takes ~75s, so poll both outcomes in one
  // loop with a generous ceiling.
  const waitForEither = async (timeoutMs) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (has('NEURAL PORTRAIT SYNTHESIZED')) return 'ok';
      if (has('PORTRAIT GENERATION FAILED')) return 'fail';
      await page.waitForTimeout(1000);
    }
    return null;
  };
  const done = await waitForEither(150000);
  console.log(`  ℹ  generation outcome: ${done}`);
  if (done === 'ok') {
    await page.waitForTimeout(1500);
    const card = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll('img')];
      return imgs.some(i => i.src.startsWith('http') && i.width > 100);
    });
    check(card, 'portrait card visible with image');
    check(!has('PORTRAIT GATE — non-wallet seeker'), 'journey-limit gate NOT triggered for wallet seeker');
  } else if (done === 'fail') {
    const rearmed = await waitForStep('PORTRAIT TRIGGER RE-ARMED AFTER FAILURE', 10000);
    check(rearmed, 'trigger re-armed after failure (retry possible)');
    // Ask again — must NOT be "ALREADY TRIGGERED"-skipped.
    const before = steps.length;
    await input.fill('please make my portrait now');
    await input.press('Enter');
    const secondTry = await waitForStep('GENERATING PORTRAIT...', 10000) &&
      steps.slice(before).some(s => s.includes('GENERATING PORTRAIT...'));
    check(secondTry, 'second explicit request retries generation');
  } else {
    check(false, 'portrait generation neither succeeded nor failed within 90s');
  }
}

await page.screenshot({ path: '/home/runner/workspace/screenshots/portrait-intent-verify.png' });
await browser.close();
console.log(`\n${pass.length} passed, ${fail.length} failed`);
if (fail.length) { console.log('FAILED:', fail.join(' | ')); process.exit(1); }
