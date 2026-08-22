#!/usr/bin/env node

/**
 * Paired visual harness for the Oracle alley curtain.
 *
 * Starts a disposable Vite server on an isolated port and runs the same
 * browser-emulated journey for:
 *   ?oracleCurtain=on   normal behavior
 *   ?oracleCurtain=off  only .oracle-alley::after is disabled
 *
 * This is browser emulation, not physical iPhone evidence. Use --headed when
 * inspecting the two tabs manually during the journey.
 *
 * Usage:
 *   pnpm --filter @workspace/surrogate-oracle run curtain-harness
 *   pnpm --filter @workspace/surrogate-oracle run curtain-harness -- --headed
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const artifactRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.CURTAIN_HARNESS_PORT || 5180);
const host = process.env.CURTAIN_HARNESS_HOST || '127.0.0.1';
const headed = process.argv.includes('--headed');
const baseUrl = `http://${host}:${port}`;
const outputDir = path.join(artifactRoot, 'test-artifacts', 'curtain-harness');
const systemChromium = '/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium';
const executablePath = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE
  || (existsSync(systemChromium) ? systemChromium : undefined);

await mkdir(outputDir, { recursive: true });

const server = spawn(
  'pnpm',
  ['--filter', '@workspace/surrogate-oracle', 'run', 'dev'],
  {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      BASE_PATH: '/',
      REPL_ID: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

let serverOutput = '';
server.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });

let cleanedUp = false;
const cleanup = () => {
  if (cleanedUp) return;
  cleanedUp = true;
  if (!server.killed) server.kill('SIGTERM');
};
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Curtain harness server did not start.\n${serverOutput}`);
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function readEvidence(page) {
  return page.evaluate(() => {
    const stage = document.querySelector('.oracle-stage');
    const alley = document.querySelector('.oracle-alley');
    const canvas = document.querySelector('.oracle-avatar-canvas canvas');
    const canvasRect = canvas?.getBoundingClientRect();
    const curtainStyle = alley ? getComputedStyle(alley, '::after') : null;
    return {
      stage: stage?.getAttribute('data-oracle-state') ?? 'missing',
      canvasMounted: Boolean(canvas),
      canvasRect: canvasRect
        ? { x: canvasRect.x, y: canvasRect.y, width: canvasRect.width, height: canvasRect.height }
        : null,
      curtain: curtainStyle
        ? {
            display: curtainStyle.display,
            opacity: curtainStyle.opacity,
            backgroundImage: curtainStyle.backgroundImage,
          }
        : null,
      renderTier: window.__oracle_renderTier ?? null,
    };
  });
}

async function enterOracle(page) {
  await page.locator('.oracle-center').click({ timeout: 8_000 }).catch(() => {});
  await sleep(1_000);
  await page.evaluate(() => window.__oracle_skipLore?.());
  await page.locator('.oracle-knife-card').first().waitFor({ state: 'visible', timeout: 25_000 });
  await page.locator('.oracle-knife-card').first().click();

  for (let i = 0; i < 90; i += 1) {
    const state = await page.locator('.oracle-stage').getAttribute('data-oracle-state').catch(() => null);
    if (state === 'oracle') return true;
    await sleep(500);
  }
  return false;
}

await waitForServer();

const browser = await chromium.launch({
  headless: !headed,
  executablePath,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'],
});
const pages = [];
const results = [];

try {
  for (const mode of ['on', 'off']) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      colorScheme: 'dark',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
    });
    const page = await context.newPage();
    pages.push({ context, page, mode });

    const browserErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        browserErrors.push({ type: message.type(), text: message.text() });
      }
    });
    page.on('pageerror', (error) => {
      browserErrors.push({ type: 'pageerror', text: error.message });
    });

    await page.addInitScript(() => {
      sessionStorage.setItem('oracle_gpu_profile_v1', JSON.stringify({ tier: 3, isMobile: true }));
    });

    const url = `${baseUrl}/?devui&standard&newuser&oracleCurtain=${mode}`;
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
    await page.locator('.oracle-stage').waitFor({ state: 'visible', timeout: 15_000 });
    await page.screenshot({
      path: path.join(outputDir, `curtain-${mode}-entry.png`),
      fullPage: true,
    });

    const reachedOracle = await enterOracle(page);
    const evidence = await readEvidence(page);
    const screenshotName = `curtain-${mode}-${reachedOracle ? 'oracle' : 'not-oracle'}.png`;
    await page.screenshot({ path: path.join(outputDir, screenshotName), fullPage: true });

    const result = {
      captureMode: 'browser-emulation',
      mode,
      url,
      reachedOracle,
      evidence,
      screenshots: [
        `curtain-${mode}-entry.png`,
        screenshotName,
      ],
      browserErrors,
    };
    results.push(result);
    await writeFile(
      path.join(outputDir, `curtain-${mode}.json`),
      `${JSON.stringify(result, null, 2)}\n`,
    );
    console.log(JSON.stringify(result, null, 2));
  }

  await writeFile(
    path.join(outputDir, 'comparison.json'),
    `${JSON.stringify({ captureMode: 'browser-emulation', results }, null, 2)}\n`,
  );

  if (headed) {
    console.log(`\nBoth variants remain open for inspection.`);
    console.log(`Artifacts: ${outputDir}`);
    await new Promise(() => {});
  }
} finally {
  if (!headed) {
    await browser.close();
    cleanup();
  }
}
