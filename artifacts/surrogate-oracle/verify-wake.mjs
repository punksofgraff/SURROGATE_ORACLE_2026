/**
 * Verification: waking journey changes
 * Tests: cabinet positioning, ghost oracle CSS, activation flash, lore terminal,
 *        glitch cursor, chromatic aberration classes, boot sequence text
 */
import { chromium } from 'playwright';

const CHROME = '/nix/store/0n9rl5l9syy808xi9bk4f6dhnfrvhkww-playwright-browsers-chromium/chromium-1080/chrome-linux/chrome';
const BASE = 'http://localhost:5174';
const SS = (n) => `/tmp/vw-${n}.png`;

const PASS = (m) => console.log(`  ✅  ${m}`);
const FAIL = (m) => { console.error(`  ❌  ${m}`); process.exitCode = 1; };
const INFO = (m) => console.log(`  ℹ️   ${m}`);

async function run() {
  console.log('\n🔬  Verify: waking journey changes\n');

  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1500);

  // ── 1. CSS VARS — cabinet positioning ──────────────────────────────────────
  console.log('1. Cabinet CSS variables');
  const cssVars = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return {
      top:   s.getPropertyValue('--cabinet-top').trim(),
      left:  s.getPropertyValue('--cabinet-left').trim(),
      width: s.getPropertyValue('--cabinet-width').trim(),
    };
  });
  INFO(`--cabinet-top: ${cssVars.top}  --cabinet-left: ${cssVars.left}  --cabinet-width: ${cssVars.width}`);
  cssVars.top === '35%'    ? PASS('--cabinet-top = 35%  (moved up 10pp)') : FAIL(`--cabinet-top = ${cssVars.top}  expected 35%`);
  cssVars.left === '45.1%' ? PASS('--cabinet-left = 45.1%  (left-shifted 5pp)') : FAIL(`--cabinet-left = ${cssVars.left}  expected 45.1%`);

  // ── 2. Ghost oracle keyframe registered ────────────────────────────────────
  console.log('\n2. Ghost oracle keyframe / dormant animation');
  const ghostDefined = await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule instanceof CSSKeyframesRule && rule.name === 'ghost-oracle') return true;
        }
      } catch {}
    }
    return false;
  });
  ghostDefined ? PASS('@keyframes ghost-oracle defined in stylesheet') : FAIL('@keyframes ghost-oracle NOT found');

  // Check dormant .oracle-avatar-img gets the animation applied
  const dormantAnim = await page.evaluate(() => {
    const el = document.querySelector('.oracle-avatar-img');
    if (!el) return null;
    return getComputedStyle(el).animationName;
  });
  INFO(`dormant .oracle-avatar-img animation-name: "${dormantAnim}"`);
  (dormantAnim && dormantAnim.includes('ghost-oracle'))
    ? PASS('ghost-oracle animation applied to .oracle-avatar-img in dormant state')
    : FAIL(`animation-name "${dormantAnim}" does not include ghost-oracle`);

  // ── 3. Pulse rings rendered in dormant ─────────────────────────────────────
  console.log('\n3. Cabinet pulse rings (dormant)');
  const pulseRings = await page.locator('.oracle-cabinet-pulse-ring').count();
  INFO(`pulse ring elements found: ${pulseRings}`);
  pulseRings >= 2
    ? PASS(`${pulseRings} .oracle-cabinet-pulse-ring elements rendered`)
    : FAIL(`Expected ≥2 pulse rings, found ${pulseRings}`);

  const ringAnim = await page.evaluate(() => {
    const el = document.querySelector('.oracle-cabinet-pulse-ring');
    if (!el) return null;
    return getComputedStyle(el).animationName;
  });
  INFO(`pulse ring animation-name: "${ringAnim}"`);
  (ringAnim && ringAnim.includes('pulse-ring-expand'))
    ? PASS('pulse-ring-expand animation active on rings')
    : FAIL(`Expected pulse-ring-expand, got "${ringAnim}"`);

  await page.screenshot({ path: SS('01-dormant') });
  INFO(`Screenshot → ${SS('01-dormant')}`);

  // ── 4. Activation flash fires on tap ───────────────────────────────────────
  console.log('\n4. Activation flash on tap');
  await page.click('.oracle-center');
  // Flash should exist briefly right after click
  const flashExists = await page.locator('.oracle-activation-flash').count();
  INFO(`.oracle-activation-flash count immediately after tap: ${flashExists}`);
  // We can't reliably catch it mid-animation at 0.55s, but check state changed
  await page.waitForFunction(
    () => document.querySelector('.oracle-stage')?.getAttribute('data-oracle-state') === 'terminal',
    { timeout: 5000 }
  ).catch(() => {});
  const stateAfterTap = await page.getAttribute('.oracle-stage', 'data-oracle-state');
  stateAfterTap === 'terminal'
    ? PASS('State → terminal after tap (activation path triggered)')
    : FAIL(`State is "${stateAfterTap}" not "terminal" after tap`);

  // activation-flash keyframe defined
  const flashKF = await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule instanceof CSSStyleRule && rule.selectorText?.includes('oracle-activation-flash')) return true;
        }
      } catch {}
    }
    return false;
  });
  flashKF ? PASS('.oracle-activation-flash CSS rule defined') : FAIL('.oracle-activation-flash CSS rule missing');

  await page.screenshot({ path: SS('02-terminal-start') });
  INFO(`Screenshot → ${SS('02-terminal-start')}`);

  // ── 5. Lore terminal: new overlay class ────────────────────────────────────
  console.log('\n5. Lore terminal overlay + new CSS classes');
  await page.waitForSelector('.oracle-terminal-overlay', { timeout: 3000 }).catch(() => {});
  const overlayVisible = await page.isVisible('.oracle-terminal-overlay');
  overlayVisible
    ? PASS('.oracle-terminal-overlay class rendered (not inline style)')
    : FAIL('.oracle-terminal-overlay not found — inline style still used');

  // ── 6. Lore text content — new dramatic lines ──────────────────────────────
  console.log('\n6. New lore content');
  // Wait for first lore line
  await page.waitForSelector('.oracle-lore-line', { timeout: 3000 }).catch(() => {});
  const loreLines = await page.locator('.oracle-lore-line').count();
  INFO(`lore lines rendered: ${loreLines}`);
  loreLines > 0 ? PASS(`${loreLines} .oracle-lore-line elements rendered`) : FAIL('No .oracle-lore-line elements found');

  const firstLoreText = await page.locator('.oracle-lore-line').first().textContent().catch(() => '');
  INFO(`First lore line: "${firstLoreText?.trim()}"`);
  firstLoreText?.includes('ANOMALOUS SIGNAL')
    ? PASS('New first line "ANOMALOUS SIGNAL ◈ LOCAL SPACETIME BREACH CONFIRMED" ✓')
    : FAIL(`Old lore text still present or wrong: "${firstLoreText?.trim()}"`);

  // Old text should NOT appear
  const oldText = await page.isVisible('text=FOREIGN SIGNAL DETECTED').catch(() => false);
  !oldText ? PASS('Old "FOREIGN SIGNAL DETECTED" text gone ✓') : FAIL('Old lore text still present');

  // Prompt glyph
  const promptGlyph = await page.locator('.oracle-lore-prompt').first().textContent().catch(() => '');
  INFO(`Prompt glyph: "${promptGlyph}"`);
  promptGlyph?.includes('›')
    ? PASS('oracle-lore-prompt glyph "›" rendered')
    : FAIL(`Expected "›" glyph, got "${promptGlyph}"`);

  await page.screenshot({ path: SS('03-lore-lines') });
  INFO(`Screenshot → ${SS('03-lore-lines')}`);

  // ── 7. Chromatic aberration animation defined ───────────────────────────────
  console.log('\n7. Chromatic aberration keyframe');
  const chromaKF = await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule instanceof CSSKeyframesRule && rule.name === 'lore-line-in') return true;
        }
      } catch {}
    }
    return false;
  });
  chromaKF ? PASS('@keyframes lore-line-in (chromatic aberration) defined') : FAIL('@keyframes lore-line-in NOT found');

  // Check that .oracle-lore-line actually gets the animation
  const loreLineAnim = await page.evaluate(() => {
    const el = document.querySelector('.oracle-lore-line');
    if (!el) return null;
    return getComputedStyle(el).animationName;
  });
  INFO(`.oracle-lore-line animation-name: "${loreLineAnim}"`);
  (loreLineAnim && loreLineAnim.includes('lore-line-in'))
    ? PASS('lore-line-in animation applied to .oracle-lore-line elements')
    : FAIL(`Expected lore-line-in animation, got "${loreLineAnim}"`);

  // ── 8. GlitchCursor rendered ────────────────────────────────────────────────
  console.log('\n8. GlitchCursor component');
  const glitchCursor = await page.locator('.oracle-cursor--glitch').count();
  INFO(`.oracle-cursor--glitch elements: ${glitchCursor}`);
  glitchCursor > 0
    ? PASS('.oracle-cursor--glitch rendered in terminal')
    : FAIL('.oracle-cursor--glitch not found — GlitchCursor component missing');

  // ── 9. Wait for more lore + screenshot ─────────────────────────────────────
  await page.waitForTimeout(3000);
  await page.screenshot({ path: SS('04-lore-mid') });
  INFO(`Screenshot → ${SS('04-lore-mid')}`);

  // Check CONTACT. final line after full lore
  const contactLine = await page.isVisible('text=CONTACT.').catch(() => false);
  contactLine ? PASS('"CONTACT." final lore line appeared') : INFO('"CONTACT." not yet visible (lore still running)');

  // ── 10. Await awakened → check title-chroma-resolve and branding-blast-in ──
  console.log('\n10. Awakened phase — title animation + boot sequence');
  await page.waitForFunction(
    () => ['awakened','oracle'].includes(document.querySelector('.oracle-stage')?.getAttribute('data-oracle-state') ?? ''),
    { timeout: 14000 }
  ).catch(() => {});

  const finalState = await page.getAttribute('.oracle-stage', 'data-oracle-state');
  INFO(`Scene state after lore: "${finalState}"`);
  ['awakened','oracle'].includes(finalState ?? '')
    ? PASS(`State = "${finalState}" — lore auto-advanced ✓`)
    : FAIL(`State still "${finalState}" — lore did not advance`);

  await page.screenshot({ path: SS('05-awakened') });
  INFO(`Screenshot → ${SS('05-awakened')}`);

  // title-chroma-resolve keyframe
  const chromaTitle = await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule instanceof CSSKeyframesRule && rule.name === 'title-chroma-resolve') return true;
        }
      } catch {}
    }
    return false;
  });
  chromaTitle ? PASS('@keyframes title-chroma-resolve defined') : FAIL('@keyframes title-chroma-resolve NOT found');

  // branding-blast-in keyframe
  const brandingBlast = await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule instanceof CSSKeyframesRule && rule.name === 'branding-blast-in') return true;
        }
      } catch {}
    }
    return false;
  });
  brandingBlast ? PASS('@keyframes branding-blast-in defined') : FAIL('@keyframes branding-blast-in NOT found');

  // New boot sequence text
  const newBoot = await page.isVisible('text=SURROGATE.OS').catch(() => false)
    || await page.isVisible('text=SIGNAL LOCKED').catch(() => false)
    || await page.isVisible('text=AWAKENING').catch(() => false);
  newBoot ? PASS('New boot sequence text found') : INFO('Boot text not visible (may have completed — OK)');

  // Old boot text should NOT appear
  const oldBoot = await page.isVisible('text=INITIALIZING NEURAL LINK').catch(() => false);
  !oldBoot ? PASS('Old boot text "INITIALIZING NEURAL LINK" gone ✓') : FAIL('Old boot sequence text still present');

  // Title typewriter started
  await page.waitForFunction(
    () => (document.querySelector('.oracle-title')?.textContent?.length ?? 0) > 0,
    { timeout: 5000 }
  ).catch(() => {});
  const titleText = await page.textContent('.oracle-title').catch(() => '');
  INFO(`Title so far: "${titleText?.trim()}"`);
  (titleText && titleText.trim().length > 0)
    ? PASS(`Title typewriter active: "${titleText.trim()}"`)
    : FAIL('Title typewriter did not start');

  await page.screenshot({ path: SS('06-awakened-title') });
  INFO(`Screenshot → ${SS('06-awakened-title')}`);

  // ── 11. Pulse rings gone after tap (only in dormant) ───────────────────────
  console.log('\n11. Pulse rings removed after dormant phase');
  const pulseRingsNow = await page.locator('.oracle-cabinet-pulse-ring').count();
  INFO(`pulse rings in awakened state: ${pulseRingsNow}`);
  pulseRingsNow === 0
    ? PASS('Pulse rings correctly removed in non-dormant state')
    : FAIL(`${pulseRingsNow} pulse rings still rendered in ${finalState} state`);

  // ── 12. No JS errors ───────────────────────────────────────────────────────
  console.log('\n12. No unexpected JS errors');
  const filtered = errs.filter(e =>
    !e.includes('net::ERR') && !e.includes('supabase') &&
    !e.includes('VITE_SUPABASE') && !e.includes('Decart') &&
    !e.includes('WebRTC') && !e.includes('Failed to load resource')
  );
  filtered.length === 0
    ? PASS('No unexpected JS errors')
    : FAIL(`JS errors:\n    ${filtered.join('\n    ')}`);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────────────');
  console.log('Screenshots:');
  [1,2,3,4,5,6].forEach(n => console.log(`  /tmp/vw-0${n}-*.png`));
  if (process.exitCode === 1) {
    console.log('❌  Some checks FAILED\n');
  } else {
    console.log('✅  All checks PASSED\n');
  }

  await browser.close();
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
