/**
 * drive.mjs — Full visual click-through for Surrogate Oracle
 *
 * Simulates a real mobile user tapping through all 4 phases,
 * entering oracle conversation, and exchanging messages.
 *
 * Viewport: iPhone 14 Pro (390×844)
 * Run: node drive.mjs   (dev server must be running on :5173)
 * Output: smoke-0*.png in the current directory
 */
import { chromium } from 'playwright';

const CHROME = '/nix/store/0n9rl5l9syy808xi9bk4f6dhnfrvhkww-playwright-browsers-chromium/chromium-1080/chrome-linux/chrome';
const BASE = 'http://localhost:5173';

const PASS = msg => console.log(`  ✅ ${msg}`);
const FAIL = msg => { console.error(`  ❌ ${msg}`); process.exitCode = 1; };
const INFO = msg => console.log(`  ℹ️  ${msg}`);

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-web-security'],
});

const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, // iPhone 14 Pro
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  // Don't inject dev_user_session — let freemium fallback flow naturally
});

const page = await ctx.newPage();

// Capture all console output for analysis
const consoleLogs = [];
const consoleErrors = [];
page.on('console', m => {
  consoleLogs.push(`[${m.type()}] ${m.text()}`);
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', e => consoleErrors.push(`PAGE ERROR: ${e.message}`));
page.on('requestfailed', r => consoleLogs.push(`[net:fail] ${r.url().slice(0, 80)}`));

const shot = async (name, label) => {
  const p = `smoke-${name}.png`;
  await page.screenshot({ path: p, fullPage: false });
  INFO(`📸 ${label} → ${p}`);
};

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n🔬 SURROGATE:ORACLE — Mobile Click-Through Drive\n');

// ── PHASE 1: DORMANT ─────────────────────────────────────────────────────────
console.log('── PHASE 1: DORMANT ──────────────────────────────');
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(2000);

const dormantState = await page.getAttribute('.oracle-stage', 'data-oracle-state');
if (dormantState === 'dormant') PASS('data-oracle-state = "dormant"');
else FAIL(`Expected dormant, got "${dormantState}"`);

const ctaVisible = await page.isVisible('.cta-primary');
if (ctaVisible) PASS('CTA primary text visible');
else FAIL('CTA primary not visible');

await shot('01-dormant', 'DORMANT — alley dark, oracle glows in cabinet');

// ── PHASE 2: TERMINAL ────────────────────────────────────────────────────────
console.log('\n── PHASE 2: TERMINAL (user taps) ─────────────────');
await page.click('.oracle-center');

await page.waitForFunction(
  () => document.querySelector('.oracle-stage')?.getAttribute('data-oracle-state') === 'terminal',
  { timeout: 5000 }
).catch(() => {});

const termState = await page.getAttribute('.oracle-stage', 'data-oracle-state');
if (termState === 'terminal') PASS('Transitioned to terminal phase');
else FAIL(`Expected terminal, got "${termState}"`);

await page.waitForTimeout(1200);
await shot('02-terminal', 'TERMINAL — lore lines typing into cabinet');

const loreVisible = await page.isVisible('text=FOREIGN SIGNAL DETECTED').catch(() => false);
if (loreVisible) PASS('Lore narrative typing in cabinet');
else INFO('Lore line not visible yet (timing — check screenshot)');

// ── PHASE 3: AWAKENED ────────────────────────────────────────────────────────
console.log('\n── PHASE 3: AWAKENED ─────────────────────────────');
await page.waitForFunction(
  () => {
    const s = document.querySelector('.oracle-stage')?.getAttribute('data-oracle-state');
    return s === 'awakened' || s === 'oracle';
  },
  { timeout: 15000 }
).catch(() => {});

const awakeState = await page.getAttribute('.oracle-stage', 'data-oracle-state');
if (awakeState === 'awakened' || awakeState === 'oracle') PASS(`Phase = "${awakeState}" ✓`);
else FAIL(`Did not advance past terminal — stuck at "${awakeState}"`);

// Wait for typewriter to show something
await page.waitForFunction(
  () => (document.querySelector('.oracle-title')?.textContent?.length ?? 0) > 3,
  { timeout: 5000 }
).catch(() => {});

const titleText = await page.textContent('.oracle-title').catch(() => '');
INFO(`Title typewriter: "${titleText?.trim()}"`);

await shot('03-awakened', 'AWAKENED — branding types in, cabinet boot seq, alley lit');

// ── PHASE 4: ORACLE ──────────────────────────────────────────────────────────
console.log('\n── PHASE 4: ORACLE (Decart fails → freemium fallback) ─');

// Wait for oracle phase — Decart will fail (no token in CI) → freemium fallback auto-triggers
await page.waitForFunction(
  () => document.querySelector('.oracle-stage')?.getAttribute('data-oracle-state') === 'oracle',
  { timeout: 20000 }
).catch(() => {});

const oraclePhase = await page.getAttribute('.oracle-stage', 'data-oracle-state');
if (oraclePhase === 'oracle') PASS('Reached ORACLE phase ✓');
else FAIL(`Did not reach oracle phase — still "${oraclePhase}"`);

await shot('04-oracle-entry', 'ORACLE — face still visible (freemium), panel rising');

// Wait for OracleConversation panel to mount
await page.waitForTimeout(600);

// The oracle panel is the bottom-anchored div; check for the terminal prompt glyph
const panelVisible = await page.isVisible('text=›').catch(() => false)
  || await page.isVisible('[style*="58vh"]').catch(() => false);
if (panelVisible) PASS('Oracle conversation panel visible');
else FAIL('Oracle panel not found');

// Wait for oracle greeting to arrive (HTTP boot call — allow up to 30s for Supabase cold start)
INFO('Waiting for oracle greeting via HTTP fallback…');
await page.waitForSelector('[data-role="oracle"]', { timeout: 30000 }).catch(() => {});

const oracleGreeting = await page.evaluate(() => {
  const el = document.querySelector('[data-role="oracle"]');
  return el?.textContent?.trim() ?? null;
});

if (oracleGreeting) {
  PASS(`Oracle greeting received: "${oracleGreeting.slice(0, 60)}"`);
  const wordCount = oracleGreeting.split(/\s+/).length;
  INFO(`Word count: ${wordCount}`);
  if (wordCount <= 25) PASS('Greeting is concise (≤ 25 words) ✓');
  else FAIL(`Greeting is too verbose: ${wordCount} words — system prompt brevity not enforced`);
} else {
  FAIL('No oracle greeting received');
}

await shot('05-oracle-greeting', 'ORACLE — avatar visible, greeting in terminal panel');

// ── SEND A MESSAGE ────────────────────────────────────────────────────────────
console.log('\n── CONVERSATION — send a message ─────────────────');

// Wait for input to become ready (isConnected switches to true after ws.onclose fix)
await page.waitForFunction(
  () => {
    const inp = document.querySelector('input');
    return inp && !inp.disabled;
  },
  { timeout: 10000 }
).catch(() => {});

const inputEl = await page.$('input').catch(() => null);

if (inputEl) {
  const isDisabled = await inputEl.getAttribute('disabled');
  if (isDisabled !== null) {
    INFO('Input still disabled — isConnected may still be false (check ws.onclose fix)');
    FAIL('Input is disabled after greeting arrived');
  } else {
    await inputEl.click();
    await inputEl.type('What is SNEAKAR?', { delay: 60 });
    await page.keyboard.press('Enter');
    PASS('Typed and sent "What is SNEAKAR?"');
  }
} else {
  FAIL('Could not find text input in oracle panel');
}

// Wait for oracle response (a second oracle turn after the user's message)
await page.waitForFunction(
  () => document.querySelectorAll('[data-role="oracle"]').length >= 2,
  { timeout: 25000 }
).catch(() => {});

const responseCount = await page.evaluate(
  () => document.querySelectorAll('[data-role="oracle"]').length
);
const userCount = await page.evaluate(
  () => document.querySelectorAll('[data-role="user"]').length
);
if (responseCount >= 2) PASS(`Oracle replied — ${responseCount} oracle + ${userCount} user turn(s) ✓`);
else INFO(`Only ${responseCount} oracle turn(s) visible (may still loading)`);

await shot('06-oracle-conversation', 'ORACLE — exchange: user msg + oracle response');

// ── STATUS / ALIGNMENT BADGE ──────────────────────────────────────────────────
console.log('\n── Status checks ──────────────────────────────────');
const statusBar = await page.isVisible('text=TEXT CHANNEL').catch(() => false)
  || await page.isVisible('text=GEMINI LIVE').catch(() => false);
if (statusBar) PASS('Connection mode badge visible in status bar');
else INFO('Status badge not found by text (may be styled differently — check screenshot)');

// ── CSS FILTER CHECK ─────────────────────────────────────────────────────────
const filterErrors = consoleErrors.filter(e => e.includes('Invalid keyframe value'));
if (filterErrors.length === 0) PASS('No Invalid keyframe CSS errors ✓');
else FAIL(`CSS filter errors: ${filterErrors.join(' | ')}`);

// ── JS ERROR SUMMARY ─────────────────────────────────────────────────────────
console.log('\n── Error summary ──────────────────────────────────');
const appErrors = consoleErrors.filter(e =>
  !e.includes('net::ERR') &&
  !e.includes('Failed to load resource') &&
  !e.includes('gravatar') &&
  !e.includes('WebSocket') &&
  !e.includes('Decart') &&
  !e.includes('postMessage') &&
  !e.includes('sandbox') &&
  !e.includes('Intervention') &&
  !e.includes('aria-hidden')
);
if (appErrors.length === 0) PASS('No app-level JS errors ✓');
else appErrors.forEach(e => FAIL(`JS Error: ${e.slice(0, 120)}`));

// ── Network calls to Supabase (confirm edge function routing) ────────────────
const supabaseCalls = consoleLogs.filter(l =>
  l.includes('supabase.co/functions') || l.includes('supabase.co/rest')
);
INFO(`Supabase EFA calls logged: ${supabaseCalls.length}`);

// ── Final shot ───────────────────────────────────────────────────────────────
await shot('07-final', 'Final state');

console.log('\n─────────────────────────────────────────────────────');
if (process.exitCode === 1) console.log('❌ Some checks FAILED — see above\n');
else console.log('✅ Click-through drive complete — all phases reached\n');

await browser.close();
