#!/usr/bin/env node
/**
 * Verifies the live Oracle canvas is actively changing from frame to frame.
 *
 * Uses Chromium + SwiftShader because the agent screenshot tool cannot create
 * the WebGL context R3F needs. It compares coarse brightness grids copied
 * from the live canvas at multiple post-burst intervals: this tolerates tiny
 * shader noise but fails when the field is frozen or the frame loop stops.
 *
 * Usage: PUPPETEER_EXECUTABLE_PATH=$(which chromium) node scripts/oracle-particle-motion-verify.mjs
 */
import puppeteer from 'puppeteer';
import { inflateSync } from 'node:zlib';

const DEV_URL = process.env.DEV_URL ?? 'http://localhost:80/surrogate-oracle';
const browser = await puppeteer.launch({
  headless: true,
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
  args: [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
await page.evaluateOnNewDocument(() => {
  // Keep the tier-1 field enabled long enough to observe it under SwiftShader.
  sessionStorage.setItem('oracle_gpu_profile_v1', JSON.stringify({ tier: 1, isMobile: false }));
  // SwiftShader runs far below a phone GPU's frame rate. The production guard
  // correctly removes effects after 60 low-FPS frames; normalize its
  // measurement in this headless-only page so it cannot hide the thing this
  // verifier is meant to inspect. R3F sees the same slower clock, so the
  // sample below waits longer than a physical device would need.
  const nativeNow = performance.now.bind(performance);
  try {
    Object.defineProperty(performance, 'now', {
      configurable: true,
     // The sustained probe runs for several intervals. SwiftShader can dip
     // below the guard threshold after the first few seconds, so keep its
     // synthetic measurement comfortably above 28 FPS for the whole sample.
     value: () => nativeNow() * 0.08,
    });
  } catch {
    // A browser that locks performance.now will simply use the normal guard.
  }
});

const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function brightnessGridFromPng(png) {
  let offset = 8; // PNG signature
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString('ascii');
    const data = png.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  const bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!width || !height || !bytesPerPixel) throw new Error(`unsupported PNG format (color type ${colorType})`);
  const packed = inflateSync(Buffer.concat(idat));
  const stride = width * bytesPerPixel;
  const pixels = Buffer.alloc(height * stride);
  let source = 0;
  for (let y = 0; y < height; y++) {
    const filter = packed[source++];
    const row = pixels.subarray(y * stride, (y + 1) * stride);
    const above = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const raw = packed[source++];
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
      const up = above ? above[x] : 0;
      const upLeft = above && x >= bytesPerPixel ? above[x - bytesPerPixel] : 0;
      if (filter === 0) row[x] = raw;
      else if (filter === 1) row[x] = (raw + left) & 255;
      else if (filter === 2) row[x] = (raw + up) & 255;
      else if (filter === 3) row[x] = (raw + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
        row[x] = (raw + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)) & 255;
      } else throw new Error(`unsupported PNG filter ${filter}`);
    }
  }

  const gridW = 24;
  const gridH = 36;
  const cells = [];
  for (let gy = 0; gy < gridH; gy++) {
    const y = Math.min(height - 1, Math.floor((gy + 0.5) * height / gridH));
    for (let gx = 0; gx < gridW; gx++) {
      const x = Math.min(width - 1, Math.floor((gx + 0.5) * width / gridW));
      const at = y * stride + x * bytesPerPixel;
      // Brightness, weighted toward the Oracle field's green/cyan/purple light.
      cells.push((pixels[at] * 0.30 + pixels[at + 1] * 0.48 + pixels[at + 2] * 0.22) / 255);
    }
  }
  return cells;
}

async function sampleRenderedCanvas() {
  const clip = await page.$eval('.oracle-avatar-canvas', (element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  if (clip.width < 2 || clip.height < 2) return null;
  const png = await page.screenshot({ type: 'png', clip });
  return brightnessGridFromPng(Buffer.from(png));
}

try {
  await page.goto(`${DEV_URL}?devui`, { waitUntil: 'load', timeout: 60_000 });
  await sleep(2500);
  await page.click('.oracle-center');
  await sleep(900);
  await page.evaluate(() => window.__oracle_skipLore?.());
  await page.waitForSelector('.oracle-knife-card', { timeout: 20_000 });
  const knifeSelected = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.oracle-knife-card')];
    const activeCard = cards.find((card) => card.querySelector('.oracle-knife-cta')) ?? cards[0];
    activeCard?.click();
    return !!activeCard;
  });
  if (!knifeSelected) throw new Error('no knife card was available to enter Oracle mode');

  let phase = null;
  for (let attempt = 0; attempt < 90; attempt++) {
    await sleep(500);
    phase = await page.$eval('[data-oracle-state]', (element) => element.getAttribute('data-oracle-state')).catch(() => null);
    if (phase === 'oracle') break;
  }
  if (phase !== 'oracle') throw new Error(`Oracle state did not arrive after knife selection (state=${phase})`);
  await sleep(1500);

  const liveScene = await page.evaluate(() => ({
    tier: window.__oracle_renderTier,
    canvases: [...document.querySelectorAll('canvas')].map((canvas) => ({
      width: canvas.width,
      height: canvas.height,
      inAvatarCanvas: !!canvas.closest('.oracle-avatar-canvas'),
    })),
  }));
  console.log(`live tier: ${liveScene.tier}; canvases: ${JSON.stringify(liveScene.canvases)}`);

  const samples = [];
  for (const waitMs of [0, 3200, 6400, 9600]) {
    if (waitMs > 0) await sleep(waitMs);
    const sample = await sampleRenderedCanvas();
    if (!sample) throw new Error(`Oracle WebGL canvas was not readable at +${waitMs}ms`);
    samples.push(sample);
  }
  const deltas = samples.slice(1).map((sample, interval) => {
    const previous = samples[interval];
    const mean = sample.reduce((sum, value, index) => sum + Math.abs(value - previous[index]), 0) / sample.length;
    const moved = sample.filter((value, index) => Math.abs(value - previous[index]) > 0.025).length;
    return { mean, moved };
  });
  const hasActiveTier = await page.evaluate(() => window.__oracle_renderTier >= 1);
  console.log(`canvas grid post-burst intervals: ${JSON.stringify(deltas.map(({ mean, moved }) => ({ mean: Number(mean.toFixed(4)), moved })))}`);
  if (!hasActiveTier) throw new Error('runtime guard disabled the particle tier before verification');
  if (deltas.some(({ mean, moved }) => mean < 0.006 || moved < 16)) {
    throw new Error('particle field stopped showing substantial post-burst movement');
  }
  console.log('✓ Oracle particle field visibly changes across every post-burst interval');
} finally {
  await browser.close();
}

const criticalErrors = errors.filter((message) =>
  !message.includes('getUserMedia') && !message.includes('AudioContext') &&
  !message.includes('Failed to load resource') && !message.includes('WebSocket') &&
  !message.includes('mic'),
);
if (criticalErrors.length > 0) {
  console.error(criticalErrors.join('\n'));
  process.exit(1);
}