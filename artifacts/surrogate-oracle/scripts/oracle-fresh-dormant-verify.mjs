#!/usr/bin/env node
/**
 * Proves that developer fresh/reset entry always restores the visible dormant
 * presentation instead of inheriting a stale tab-scoped journey phase.
 */
import puppeteer from 'puppeteer';

const DEV_URL = process.env.DEV_URL ?? 'http://localhost:5173';
const CHROME_BIN = process.env.CHROME_BIN;
const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];

const JOURNEY_SESSION_KEYS = [
  'oracle_scene_phase',
  'oracle_selected_knife_question',
  'oracle_selected_knife_index',
  'oracle_canvas_warmed',
];

function check(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`  ✓ ${message}`);
}

async function waitForDormantPresentation(page, label) {
  await new Promise(resolve => setTimeout(resolve, 2200));
  const evidence = await page.evaluate(() => ({
    phase: document.querySelector('[data-oracle-state]')?.getAttribute('data-oracle-state'),
    ghostCount: document.querySelectorAll('.ghost-tx').length,
    landedChars: document.querySelectorAll('.ghost-tx [data-char-idx]').length,
    visibleGhostText: [...document.querySelectorAll('.ghost-tx [data-char-idx]')]
      .some(el => Number.parseFloat(getComputedStyle(el).opacity) > 0.2),
    storedPhase: sessionStorage.getItem('oracle_scene_phase'),
  }));
  check(evidence.phase === 'dormant', `${label}: dormant phase`);
  check(evidence.ghostCount >= 1, `${label}: ghost transmission mounted`);
  check(evidence.landedChars >= 1 && evidence.visibleGhostText, `${label}: particle typography landed`);
  check(evidence.storedPhase === 'dormant', `${label}: journey phase persisted as dormant`);
}

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROME_BIN || puppeteer.executablePath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    for (const viewport of VIEWPORTS) {
      const page = await browser.newPage();
      await page.setViewport({ width: viewport.width, height: viewport.height });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text());
      });

      await page.goto(DEV_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.evaluate((keys) => {
        sessionStorage.setItem('oracle_scene_phase', 'oracle');
        sessionStorage.setItem('oracle_selected_knife_question', 'stale question');
        sessionStorage.setItem('oracle_selected_knife_index', '3');
        sessionStorage.setItem('oracle_canvas_warmed', '1');
        localStorage.setItem('oracle_lore_completed', 'true');
        for (const key of keys) localStorage.setItem(key, 'stale');
      }, JOURNEY_SESSION_KEYS);
      await page.goto(`${DEV_URL}?fresh`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await waitForDormantPresentation(page, `${viewport.name} ?fresh`);

      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
      await waitForDormantPresentation(page, `${viewport.name} reload`);

      await page.evaluate(() => {
        sessionStorage.setItem('oracle_scene_phase', 'terminal');
        localStorage.setItem('oracle_lore_completed', 'true');
      });
      await page.goto(`${DEV_URL}?reset`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await waitForDormantPresentation(page, `${viewport.name} ?reset`);
      check(errors.length === 0, `${viewport.name}: no browser errors`);
      await page.close();
    }
  } finally {
    await browser.close();
  }

  console.log('\n✅ PASS — fresh/reset dormant presentation contract is intact.');
})().catch(error => {
  console.error(`\n❌ FAIL — ${error.message}`);
  process.exitCode = 1;
});