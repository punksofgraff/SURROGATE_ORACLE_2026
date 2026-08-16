/**
 * Wallet-return + portrait-intent verification (headless).
 *
 * A: top-level return URL (?seeker=...&event=signin) →
 *    sign-in processed, params stripped, flag set, first tap = direct alley entry.
 * B: same-origin postMessage wallet_signed mid-terminal → auto-transition to alley.
 *
 * Run: node scripts/oracle-wallet-return-verify.mjs
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

function collectSteps(page, steps) {
  page.on('console', (msg) => {
    const t = msg.text();
    if (t.includes('[ORACLE:STEP]')) steps.push(t);
  });
}
const has = (steps, needle) => steps.some(s => s.includes(needle));

// Poll for the scene reaching one of the given phases (rift transition is 850ms
// + a variable settle, so fixed sleeps race it).
async function waitForPhaseIn(page, phases, timeoutMs = 10000) {
  try {
    await page.waitForFunction(
      (ps) => ps.includes(document.querySelector('[data-oracle-state]')?.getAttribute('data-oracle-state')),
      phases, { timeout: timeoutMs },
    );
    return true;
  } catch { return false; }
}

const browser = await chromium.launch({ executablePath: CHROMIUM, args: FLAGS });

// ── Test A: top-level wallet return URL ────────────────────────────────────
{
  console.log('\n── A: ?seeker= top-level return ──');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const steps = [];
  collectSteps(page, steps);
  await page.goto(`${BASE}/?devui&seeker=0xDEADBEEFCAFE1234&event=signin`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);

  check(has(steps, 'WALLET RETURN DETECTED'), 'wallet return detected');
  check(has(steps, 'WALLET SIGNED — ALLEY RETURN ENABLED'), 'sign-in processed');
  check(has(steps, 'WALLET ADDRESS CAPTURED'), 'address captured as seeker key');

  const url = page.url();
  check(!url.includes('seeker=') && url.includes('devui'), `params stripped, devui kept (${url})`);

  const flags = await page.evaluate(() => ({
    signed: localStorage.getItem('oracle_wallet_signed'),
    key: localStorage.getItem('oracle_seeker_key'),
  }));
  check(flags.signed === 'true', 'oracle_wallet_signed persisted');
  check(flags.key === '0xDEADBEEFCAFE1234', 'seeker key = wallet address');

  // A first-time wallet sign-in with no stored name surfaces the SIGNAL IMPRINT
  // name prompt (fixed overlay) — dismiss it like a real seeker would, then tap.
  const skipBtn = page.locator('button', { hasText: 'SKIP' });
  if (await skipBtn.count()) {
    await skipBtn.first().click();
    await page.waitForTimeout(600);
    check(true, 'name prompt shown and skipped');
  }

  // First tap should go straight to the alley (no lore) for a signed seeker.
  await page.click('.oracle-stage', { position: { x: 640, y: 400 } }).catch(() => {});
  const reached = await waitForPhaseIn(page, ['awakened', 'oracle']);
  check(has(steps, 'WALLET SIGNED → DIRECT ALLEY ENTRY'), 'direct alley entry on tap');
  check(reached, 'scene reached awakened/oracle phase');
  await ctx.close();
}

// ── Test B: postMessage wallet_signed while on terminal ───────────────────
{
  console.log('\n── B: postMessage sign-in mid-terminal ──');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const steps = [];
  collectSteps(page, steps);
  await page.goto(`${BASE}/?devui&newuser`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  // Enter terminal
  await page.click('.oracle-stage', { position: { x: 640, y: 400 } }).catch(() => {});
  await page.waitForTimeout(1500);
  const onTerminal = await page.locator('[data-oracle-state="terminal"]').count();
  check(onTerminal > 0, 'reached terminal phase');

  await page.evaluate(() => {
    window.postMessage({ type: 'wallet_signed', address: '0xB0B0B0B0B0B0' }, window.location.origin);
  });
  await page.waitForTimeout(3000);
  check(has(steps, 'WALLET BRIDGE — accepted wallet_signed'), 'postMessage accepted (same-origin)');
  check(has(steps, 'WALLET SIGNAL RECOGNIZED — AUTO-TRANSITION TO ALLEY'), 'auto-transition fired');
  const reached = await waitForPhaseIn(page, ['awakened', 'oracle']);
  check(reached, 'scene left terminal for alley');
  await ctx.close();
}

await browser.close();
console.log(`\n${pass.length} passed, ${fail.length} failed`);
if (fail.length) { console.log('FAILED:', fail.join(' | ')); process.exit(1); }
