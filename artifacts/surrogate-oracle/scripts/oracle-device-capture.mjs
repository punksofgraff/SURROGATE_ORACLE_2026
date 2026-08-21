#!/usr/bin/env node
/**
 * Capture the Oracle's mobile WebGL evidence matrix.
 *
 * This runner emulates the browser/device profile so the capture procedure is
 * repeatable in CI. It must not be described as physical handset evidence:
 * the output records `captureMode: "browser-emulation"` and the device-lab
 * checklist in docs/device-lab-evidence.md is the source of truth for real
 * Safari/Chrome/XR captures.
 *
 * Usage:
 *   PUPPETEER_EXECUTABLE_PATH=$(which chromium) node scripts/oracle-device-capture.mjs
 *   ... node scripts/oracle-device-capture.mjs --profile iphone-safari
 *   ... node scripts/oracle-device-capture.mjs --profile android-chrome
 *   ... node scripts/oracle-device-capture.mjs --profile xr
 */
import puppeteer, { KnownDevices } from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, 'device-captures');
mkdirSync(outDir, { recursive: true });
const devUrl = process.env.DEV_URL ?? 'http://localhost:80/surrogate-oracle';
const requested = process.argv.find((arg) => arg.startsWith('--profile='))?.split('=')[1]
  ?? process.argv[process.argv.indexOf('--profile') + 1]
  ?? 'all';

const profiles = {
  'iphone-safari': {
    label: 'iPhone Safari (emulated)',
    device: KnownDevices['iPhone 13'],
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
    xr: false,
  },
  'android-chrome': {
    label: 'Android Chrome (emulated)',
    device: KnownDevices['Pixel 5'],
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    xr: false,
  },
  xr: {
    label: 'XR bridge mode (emulated host)',
    device: KnownDevices['Pixel 5'],
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    xr: true,
  },
};

const selected = requested === 'all' ? Object.keys(profiles) : [requested];
for (const name of selected) {
  if (!profiles[name]) throw new Error(`Unknown profile "${name}"`);
}

const browser = await puppeteer.launch({
  headless: true,
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
  args: [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
  ],
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const capture = async (name, profile) => {
  const page = await browser.newPage();
  await page.emulate(profile.device);
  await page.setUserAgent(profile.userAgent);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    sessionStorage.setItem('oracle_gpu_profile_v1', JSON.stringify({ tier: 3, isMobile: true }));
    const nativeNow = performance.now.bind(performance);
    try {
      Object.defineProperty(performance, 'now', { configurable: true, value: () => nativeNow() * 0.08 });
    } catch {}
  });

  const url = `${devUrl}?devui${profile.xr ? '&xr&autostart' : '&standard'}`;
  await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
  await sleep(3000);
  if (profile.xr) {
    await page.evaluate(() => window.SurrogateXR?.launch?.());
    await sleep(1200);
  }
  await page.screenshot({ path: join(outDir, `${name}-entry.png`), fullPage: true });

  // Enter the same path a seeker uses, without replacing the app's live scene.
  await page.click('.oracle-center');
  await sleep(1000);
  await page.evaluate(() => window.__oracle_skipLore?.());
  await page.waitForSelector('.oracle-knife-card', { timeout: 20_000 });
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('.oracle-knife-card')]
      .find((element) => element.querySelector('.oracle-knife-cta')) ?? document.querySelector('.oracle-knife-card');
    card?.click();
  });
  for (let i = 0; i < 90; i += 1) {
    await sleep(500);
    const phase = await page.$eval('[data-oracle-state]', (el) => el.getAttribute('data-oracle-state')).catch(() => null);
    if (phase === 'oracle') break;
  }
  await sleep(1200);

  const sustained = await page.evaluate(() => {
    const stage = document.querySelector('.oracle-stage');
    const canvas = document.querySelector('.oracle-avatar-canvas canvas');
    const portrait = document.querySelector('.oracle-portrait-fullscreen, .oracle-portrait-viewer');
    const xrStatus = window.SurrogateXR?.getStatus?.() ?? null;
    const rect = canvas?.getBoundingClientRect();
    return {
      scenePhase: stage?.getAttribute('data-oracle-state') ?? 'unknown',
      oracleSpeaking: stage?.getAttribute('data-oracle-speaking') === 'true',
      userSpeaking: stage?.getAttribute('data-user-speaking') === 'true',
      portraitReveal: portrait ? {
        visible: getComputedStyle(portrait).display !== 'none',
        className: portrait.className,
      } : { visible: false, className: null },
      xr: {
        requested: new URLSearchParams(location.search).has('xr'),
        bridge: xrStatus,
        cameraVideo: Boolean(document.querySelector('video')),
      },
      webgl: {
        canvasMounted: Boolean(canvas),
        contextAlive: Boolean(canvas?.getContext('webgl2') || canvas?.getContext('webgl')),
        cssRect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
        renderTier: window.__oracle_renderTier ?? null,
        sceneProbe: window.__oracle_scene_probe ? {
          frameCount: window.__oracle_scene_probe.frameCount ?? null,
          quarkTime: window.__oracle_scene_probe.quarkTime ?? null,
          nebulaUpdates: window.__oracle_scene_probe.nebulaUpdates ?? null,
          debrisUpdates: window.__oracle_scene_probe.debrisUpdates ?? null,
          particleCount: window.__oracle_scene_probe.particleCount ?? null,
          glbTransportProgress: window.__oracle_scene_probe.glbTransportProgress ?? null,
        } : null,
      },
      // A screenshot is still required for this visual assertion. Keep this
      // machine signal conservative: only flag an exact near-white stage.
      whiteRectCandidate: (() => {
        const style = stage ? getComputedStyle(stage) : null;
        return Boolean(style && style.backgroundColor === 'rgb(255, 255, 255)');
      })(),
    };
  });

  await page.screenshot({ path: join(outDir, `${name}-sustained-conversation.png`), fullPage: true });
  const result = {
    captureMode: 'browser-emulation',
    capturedAt: new Date().toISOString(),
    profile: name,
    deviceBrowser: profile.label,
    viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio })),
    url,
    entryScreenshot: `${name}-entry.png`,
    sustainedScreenshot: `${name}-sustained-conversation.png`,
    evidence: sustained,
    pageErrors: pageErrors.filter((message) =>
      !/getUserMedia|AudioContext|Failed to load resource|WebSocket|mic/i.test(message)),
    physicalDeviceEvidence: false,
  };
  writeFileSync(join(outDir, `${name}.json`), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  await page.close();
};

try {
  for (const name of selected) await capture(name, profiles[name]);
} finally {
  await browser.close();
}