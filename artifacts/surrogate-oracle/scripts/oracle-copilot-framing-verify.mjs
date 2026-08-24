#!/usr/bin/env node
/**
 * Co-pilot visual regression check.
 *
 * Enters the real Oracle journey, captures Deep Oracle and Co-pilot at desktop
 * and narrow-mobile sizes, and asserts the contracts that are easy to lose in
 * camera/CSS/particle refactors:
 *   - the avatar/cabinet stays centered in the stage (the close-up regression
 *     was accompanied by a shifted focal frame)
 *   - the live Co-pilot palette is electric blue
 *   - Deep Oracle retains its established green palette
 *
 * Usage:
 *   pnpm copilot-verify
 *   DEV_URL=http://localhost:5173 pnpm copilot-verify
 *
 * Release evidence is written to screenshots/copilot-framing-{desktop,mobile}-
 * {deep,copilot}.png and a JSON measurement report beside them.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '../screenshots');
const DEV_URL = process.env.DEV_URL ?? 'http://localhost:5173';
const NIX_CHROME = '/nix/store/0n9rl5l9syy808xi9bk4f6dhnfrvhkww-playwright-browsers-chromium/chromium-1080/chrome-linux/chrome';
const CHROME_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--enable-unsafe-swiftshader',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
];
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
];
const EXPECTED = {
  deep: { persona: 'deep', palette: 'deep-green' },
  copilot: { persona: 'creative-director', palette: 'electric-blue' },
};

mkdirSync(OUT_DIR, { recursive: true });
let pass = 0;
let fail = 0;
const check = (condition, message) => {
  if (condition) {
    console.log(`  ✓ ${message}`);
    pass += 1;
  } else {
    console.log(`  ✗ ${message}`);
    fail += 1;
  }
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function enterOracle(page) {
  const url = `${DEV_URL}${DEV_URL.includes('?') ? '&' : '?'}reset&devui`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(1200);
  await page.locator('.oracle-center, .oracle-stage').first().click();
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__oracle_skipLore?.());
  await page.waitForSelector('[data-oracle-state="awakened"]', { timeout: 20_000 });
  await page.locator('.oracle-knife-card').first().click();
  await page.waitForSelector('[data-oracle-state="oracle"]', { timeout: 20_000 });
  // Allow the layout transition and entrance settle to finish before measuring.
  await page.waitForTimeout(2_000);
}

async function readFrame(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      const box = element?.getBoundingClientRect();
      if (!box) return null;
      return {
        left: Number(box.left.toFixed(2)),
        top: Number(box.top.toFixed(2)),
        width: Number(box.width.toFixed(2)),
        height: Number(box.height.toFixed(2)),
        centerX: Number((box.left + box.width / 2).toFixed(2)),
        centerY: Number((box.top + box.height / 2).toFixed(2)),
      };
    };
    const stage = rect('.oracle-stage');
    const center = rect('.oracle-center');
    const cabinet = rect('.oracle-cabinet');
    const avatar = rect('.oracle-avatar-wrapper');
    const canvas = rect('.oracle-avatar-canvas');
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      persona: document.querySelector('.oracle-stage')?.getAttribute('data-oracle-persona'),
      palette: document.querySelector('.oracle-stage')?.getAttribute('data-oracle-palette'),
      state: document.querySelector('.oracle-stage')?.getAttribute('data-oracle-state'),
      stage,
      center,
      cabinet,
      avatar,
      canvas,
      centerOffset: stage && center ? Number((center.centerX - stage.centerX).toFixed(2)) : null,
      cabinetOffset: stage && cabinet ? Number((cabinet.centerX - stage.centerX).toFixed(2)) : null,
      avatarOffset: stage && avatar ? Number((avatar.centerX - stage.centerX).toFixed(2)) : null,
    };
  });
}

async function capturePersona(page, viewportName, persona) {
  if (persona === 'copilot') {
    await page.getByRole('button', { name: 'Open Oracle menu' }).click();
    await page.getByRole('button', { name: /CO-PILOT/ }).click();
    await page.waitForTimeout(700);
  }
  const frame = await readFrame(page);
  const expected = EXPECTED[persona];
  check(frame.state === 'oracle', `${viewportName}/${persona}: Oracle phase is active`);
  check(frame.persona === expected.persona, `${viewportName}/${persona}: persona=${expected.persona}`);
  check(frame.palette === expected.palette, `${viewportName}/${persona}: palette=${expected.palette}`);
  check(
    Number.isFinite(frame.centerOffset) && Math.abs(frame.centerOffset) <= 12,
    `${viewportName}/${persona}: focal center stays within 12px (${frame.centerOffset}px)`,
  );
  check(
    Number.isFinite(frame.avatarOffset) && Math.abs(frame.avatarOffset) <= 12,
    `${viewportName}/${persona}: avatar stays within 12px of stage center (${frame.avatarOffset}px)`,
  );
  check(
    frame.avatar?.width >= 200 && frame.avatar?.width <= 420,
    `${viewportName}/${persona}: avatar width remains in 200–420px framing envelope (${frame.avatar?.width}px)`,
  );
  await page.screenshot({
    path: join(OUT_DIR, `copilot-framing-${viewportName}-${persona}.png`),
    fullPage: false,
  });
  return frame;
}

async function main() {
  console.log(`\n── ORACLE CO-PILOT FRAMING VERIFY ──\n   Dev server: ${DEV_URL}\n`);
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_BIN || (existsSync(NIX_CHROME) ? NIX_CHROME : undefined),
    args: CHROME_ARGS,
  });
  const evidence = [];
  try {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();
      const browserErrors = [];
      page.on('pageerror', (error) => browserErrors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error' && !/Failed to load resource|WebSocket|getUserMedia|AudioContext/i.test(message.text())) {
          browserErrors.push(message.text());
        }
      });
      console.log(`\n  ${viewport.name} (${viewport.width}×${viewport.height})`);
      await enterOracle(page);
      evidence.push(await capturePersona(page, viewport.name, 'deep'));
      evidence.push(await capturePersona(page, viewport.name, 'copilot'));
      check(browserErrors.length === 0, `${viewport.name}: no unexpected browser errors${browserErrors.length ? ` (${browserErrors[0]})` : ''}`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
  const reportPath = join(OUT_DIR, 'copilot-framing-evidence.json');
  writeFileSync(reportPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), evidence }, null, 2)}\n`);
  console.log(`\n  Evidence report: ${reportPath}`);
  console.log(`  RESULT: ${pass} pass, ${fail} fail\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(`Co-pilot framing verify crashed: ${error.stack || error}`);
  process.exit(1);
});