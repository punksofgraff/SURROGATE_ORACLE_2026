/**
 * SURROGATE Oracle — Full Journey Visual Audit
 * Walks every phase of the experience and saves screenshots for review.
 *
 * Run: node scripts/oracle-journey-test.mjs
 */

import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'http://localhost:80';
const OUT_DIR  = join(process.cwd(), 'screenshots');

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile',  width: 390,  height: 844 },
];

async function snap(page, label) {
  const file = join(OUT_DIR, `${label}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  📸  ${label}.png`);
}

async function waitForPhase(page, phase, timeout = 12000) {
  await page.waitForFunction(
    (p) => document.querySelector(`[data-oracle-state="${p}"]`) !== null,
    phase,
    { timeout }
  );
}

async function runJourney(browser, viewport) {
  const ctx  = await browser.newContext({ viewport });
  const page = await ctx.newPage();

  // Silence console noise
  page.on('console', () => {});
  page.on('pageerror', (e) => console.warn(`  ⚠ page error: ${e.message}`));

  const pfx = viewport.name;
  console.log(`\n── ${pfx.toUpperCase()} (${viewport.width}×${viewport.height}) ──────────────────`);

  // ── 1. DORMANT ─────────────────────────────────────────────────────────────
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800); // let signal fragments fade in
  await snap(page, `${pfx}-01-dormant`);

  // ── 2. FIRST TAP → TERMINAL (lore starts) ─────────────────────────────────
  // Click the cabinet / tap-hint area
  await page.click('.oracle-stage', { position: { x: viewport.width / 2, y: viewport.height / 2 } });
  await page.waitForTimeout(600);
  await snap(page, `${pfx}-02-terminal-lore-start`);

  // ── 3. SKIP LORE ──────────────────────────────────────────────────────────
  // Wait for skip hint to appear, then click anywhere to skip
  try {
    await page.waitForSelector('.oracle-lore-skip', { timeout: 5000 });
    await page.click('.oracle-stage', { position: { x: viewport.width / 2, y: viewport.height / 2 } });
    console.log('  ↩  lore skipped');
  } catch {
    console.log('  ↩  lore skip not available yet — waiting for auto-complete');
  }

  // ── 4. AWAKENED — oracle face resolves ────────────────────────────────────
  await waitForPhase(page, 'awakened', 15000);
  await page.waitForTimeout(900); // let the face transition settle
  await snap(page, `${pfx}-03-awakened-face`);

  // ── 5. KNIFE SELECTION rises in awakened ──────────────────────────────────
  await page.waitForSelector('.oracle-knife-section', { timeout: 8000 });
  await page.waitForTimeout(700); // stagger animation
  await snap(page, `${pfx}-04-knife-selection`);

  // Check all 5 knife cards are visible
  const cardCount = await page.locator('.oracle-knife-card').count();
  console.log(`  🗡  knife cards visible: ${cardCount}/5`);

  // ── 6. PICK A KNIFE → ORACLE ───────────────────────────────────────────────
  await page.locator('.oracle-knife-card').nth(1).click(); // card 2: IDENTITY
  await page.waitForTimeout(600);
  await snap(page, `${pfx}-05-knife-selected`);

  await waitForPhase(page, 'oracle', 8000);
  await page.waitForTimeout(1200); // panel slides in
  await snap(page, `${pfx}-06-oracle-conversation-panel`);

  // Check conversation panel is present and input is reachable
  const panelVisible = await page.locator('.oc-panel').isVisible();
  const inputVisible = await page.locator('input[aria-label="Message to the Oracle"]').isVisible();
  console.log(`  💬  panel visible: ${panelVisible}  |  input visible: ${inputVisible}`);

  // ── 7. MOBILE: check panel doesn't occlude the oracle face ────────────────
  if (viewport.name === 'mobile') {
    const panelBox  = await page.locator('.oc-panel').boundingBox();
    const faceBox   = await page.locator('.oracle-avatar-canvas').boundingBox();
    if (panelBox && faceBox) {
      const overlap = faceBox.y + faceBox.height > panelBox.y;
      console.log(`  📱  face/panel overlap: ${overlap ? '⚠ YES — needs fix' : '✓ clear'}`);
    }
  }

  // ── 8. TYPE A MESSAGE ─────────────────────────────────────────────────────
  const input = page.locator('input[aria-label="Message to the Oracle"]');
  await input.click();
  await input.type('who are you?', { delay: 40 });
  await snap(page, `${pfx}-07-message-typed`);

  await ctx.close();
}

async function main() {
  console.log('SURROGATE Oracle — Journey Visual Audit');
  console.log(`Output: ${OUT_DIR}\n`);

  const browser = await chromium.launch({
    headless: true,
    executablePath: '/nix/store/ia69plrrvn7czdhn3flq1ll39i92ixab-chromium-92.0.4515.159/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  for (const vp of VIEWPORTS) {
    try {
      await runJourney(browser, vp);
    } catch (err) {
      console.error(`  ✗ ${vp.name} run failed: ${err.message}`);
    }
  }

  await browser.close();
  console.log('\n✓ Audit complete — check screenshots/ directory');
}

main().catch((e) => { console.error(e); process.exit(1); });
