import { chromium } from 'playwright';
import { existsSync } from 'fs';

const BASE = process.env.ORACLE_SMOKE_URL || 'http://localhost:80';
const OUT = process.env.POSE_OUT || '/tmp/oracle-pose.png';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const NIX_CHROME = '/nix/store/0n9rl5l9syy808xi9bk4f6dhnfrvhkww-playwright-browsers-chromium/chromium-1080/chrome-linux/chrome';
const launchOpts = {
  headless: true,
  args: [
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
    '--disable-web-security', '--no-sandbox', '--disable-setuid-sandbox',
    '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-webgl',
    '--ignore-gpu-blocklist',
  ],
};
if (existsSync(NIX_CHROME)) launchOpts.executablePath = NIX_CHROME;

const browser = await chromium.launch(launchOpts);
const context = await browser.newContext({
  permissions: ['camera', 'microphone'],
  viewport: { width: 800, height: 900 },
});
const page = await context.newPage();
page.on('console', m => {
  const t = m.text();
  if (t.includes('SIGNAL') || t.includes('3D ERROR') || t.includes('not defined')) console.log('  [B]', t.slice(0, 120));
});

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.setItem('dev_user_session', '1'));
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(1500);

// Tap dormant → terminal
await page.click('.oracle-stage', { position: { x: 400, y: 450 } }).catch(() => {});
await sleep(800);
// Skip lore
await page.evaluate(() => { if (window.__oracle_skipLore) window.__oracle_skipLore(); });
await sleep(1200);
// Pick a knife/territory card
await page.locator('.oracle-knife-card:has(.oracle-knife-cta)').first().click({ timeout: 4000 }).catch(() => {});
await sleep(800);
// Dismiss terminal lore overlay if present, then wait for awakened/oracle
for (let i = 0; i < 25; i++) {
  const st = await page.getAttribute('.oracle-stage', 'data-oracle-state').catch(() => null);
  if (st === 'oracle' || st === 'awakened') break;
  await page.click('.oracle-terminal-overlay').catch(() => {});
  await sleep(700);
}
const state = await page.getAttribute('.oracle-stage', 'data-oracle-state').catch(() => null);
console.log('  STATE =', state);

// Let it settle at REST (no speech) for a clean idle arm pose
await sleep(4000);
await page.screenshot({ path: OUT });
console.log('  Saved', OUT);
await browser.close();
