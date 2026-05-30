/**
 * journey-steplog.mjs — capture the canonical step log via the oracle:step event
 * (overlay-proof; the WebGL error overlay in headless can't block JS-dispatched clicks).
 * Throwaway diagnostic. Requires dev server on :5173.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  args: ['--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required',
         '--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--ignore-gpu-blocklist'],
});

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
const page = await ctx.newPage();
// Capture every step the app emits, regardless of the console debug gate.
await page.addInitScript(() => {
  window.__steps = [];
  window.addEventListener('oracle:step', e => window.__steps.push(e.detail));
});
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await sleep(1500);

// JS-dispatched clicks bypass the headless WebGL error overlay.
await page.evaluate(() => document.querySelector('.oracle-center')?.click());
await sleep(900);
await page.evaluate(() => window.__oracle_skipLore && window.__oracle_skipLore());
await sleep(2000);

const steps = await page.evaluate(() => window.__steps || []);
const state = await page.getAttribute('.oracle-stage', 'data-oracle-state');

await browser.close();

console.log('\n──── CANONICAL STEP LOG (dormant → awakened) ────');
const icon = s => ({ ok: '✅', warn: '⚠️ ', err: '❌', pending: '⏳' }[s] || '·');
steps.forEach((s, i) => console.log(`  ${String(i + 1).padStart(2)}. ${icon(s.status)} ${s.label}`));
console.log(`\n  final state: ${state}   |   ${steps.length} steps emitted`);
