#!/usr/bin/env node
/**
 * Release regression check for the radio/lore handoff.
 *
 * The radio stream is replaced only at the browser boundary with the bundled
 * recording. This keeps the production station URL and the real HTMLAudioElement
 * path intact while making currentTime deterministic in CI and offline previews.
 *
 * Usage:
 *   PUPPETEER_EXECUTABLE_PATH=$(which chromium) pnpm run radio-handoff-test
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEV_URL = process.env.DEV_URL ?? 'http://localhost:80/surrogate-oracle';
const bundledAudio = readFileSync(join(__dirname, '../public/lore-narration.mp3'));
const RADIO_URL_PREFIX = 'https://stream.radiojar.com/';
const errors = [];
const consoleErrors = [];

const browser = await puppeteer.launch({
  headless: true,
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
await page.setRequestInterception(true);
page.on('request', (request) => {
  if (request.url().startsWith(RADIO_URL_PREFIX)) {
    void request.respond({
      status: 200,
      contentType: 'audio/mpeg',
      headers: {
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
      body: bundledAudio,
    }).catch(() => {});
  } else {
    void request.continue().catch(() => {});
  }
});
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  const text = message.text();
  if (/AUDIO|Radio|audio|AudioContext|Spine|volume|gain/i.test(text)) {
    console.log(`[browser ${message.type()}] ${text}`);
  }
  if (message.type() === 'error') consoleErrors.push(text);
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const state = () => page.$eval('[data-oracle-state]', (el) => ({
  phase: el.getAttribute('data-oracle-state'),
  target: Number(el.getAttribute('data-audio-target-vol')),
}));
const audioSnapshot = () => page.$eval('audio:not([src*="lyria"])', (audio) => ({
  src: audio.currentSrc || audio.src,
  currentTime: audio.currentTime,
  paused: audio.paused,
  readyState: audio.readyState,
}));
async function waitFor(predicate, label, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${label}`);
}
async function waitForTarget(expected, label, tolerance = 0.001) {
  await waitFor(async () => {
    const current = await state();
    return Math.abs(current.target - expected) <= tolerance;
  }, `${label} target=${expected}`);
}
function assertAdvanced(before, after, label) {
  assert.equal(after.src, before.src, `${label}: radio track changed`);
  assert.ok(after.currentTime > before.currentTime + 0.15,
    `${label}: radio currentTime did not advance (${before.currentTime} → ${after.currentTime})`);
}

try {
  await page.goto(`${DEV_URL}?newuser&devui=1`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.oracle-center', { timeout: 20_000 });
  // Chromium cannot reliably decode the intercepted long-running station
  // response in every headless build. Preserve the real element's src and
  // play/pause calls, but provide a clock so the handoff assertions remain
  // about lifecycle continuity rather than decoder availability.
  await page.evaluate(() => {
    const audio = document.querySelector('audio:not([src*="lyria"])');
    if (!audio) throw new Error('radio audio element was not rendered');
    let playing = false;
    let startedAt = performance.now();
    let heldTime = 0;
    Object.defineProperty(audio, 'paused', { configurable: true, get: () => !playing });
    Object.defineProperty(audio, 'currentTime', {
      configurable: true,
      get: () => heldTime + (playing ? (performance.now() - startedAt) / 1000 : 0),
      set: (value) => { heldTime = Number(value) || 0; startedAt = performance.now(); },
    });
    audio.play = () => {
      if (!playing) startedAt = performance.now();
      playing = true;
      return Promise.resolve();
    };
    audio.pause = () => {
      if (playing) heldTime += (performance.now() - startedAt) / 1000;
      playing = false;
    };
  });
  await waitFor(async () => (await state()).phase === 'dormant', 'fresh dormant state');

  // Fresh lore start: this is the same first gesture a seeker makes.
  await page.click('.oracle-center');
  await sleep(250);
  console.log(`radio gain after first gesture: ${JSON.stringify(await page.evaluate(() => window.__oracle_radio_debug ?? null))}`);
  await waitFor(async () => (await state()).phase === 'terminal', 'terminal lore state');
  console.log(`radio gain at terminal: ${JSON.stringify(await page.evaluate(() => window.__oracle_radio_debug ?? null))}`);
  await waitFor(async () => (await page.evaluate(() => Boolean(window.__oracle_completeLore))), 'lore completion hook');
  const started = await audioSnapshot();
  assert.ok(started.src.startsWith(RADIO_URL_PREFIX), `unexpected radio source: ${started.src}`);
  await waitFor(async () => !(await audioSnapshot()).paused, 'radio playback after lore start');
  await sleep(500);
  const afterStart = await audioSnapshot();
  assertAdvanced(started, afterStart, 'fresh lore start');

  // Lore's active mix must be exactly 15% of the pre-lore audible target.
  // setupAudioSpine seeds the gain from the hook's initial target (0.021);
  // the lore mix is 15% of that active level.
  const loreBaseVolume = 0.021;
  await waitForTarget(loreBaseVolume * 0.15, 'lore duck', 0.0002);
  const gainAtTarget = await page.evaluate(() => window.__oracle_radio_debug ?? null);
  console.log(`radio gain at DOM target: ${JSON.stringify(gainAtTarget)}`);
  // The DOM target updates synchronously, while the production GainNode
  // reaches it on the short narrative-boundary ramp.
  await sleep(220);
  const gainAfterRamp = await page.evaluate(() => window.__oracle_radio_debug ?? null);
  console.log(`radio gain after ramp: ${JSON.stringify(gainAfterRamp)}`);
  const ducked = await audioSnapshot();
  assert.equal(ducked.src, started.src, 'lore duck changed the radio track');
  assert.equal(ducked.paused, false, 'lore duck paused the radio element');
  const radioGain = gainAfterRamp;
  assert.ok(radioGain, 'radio gain debug probe missing');
  assert.ok(Math.abs(radioGain.targetGain - loreBaseVolume * 0.15) <= 0.0002,
    `radio gain target mismatch (${radioGain.targetGain})`);
  assert.ok(Math.abs(radioGain.actualGain - loreBaseVolume * 0.15) <= 0.0002,
    `radio GainNode stayed loud (${radioGain.actualGain} vs ${loreBaseVolume * 0.15})`);

  // Model the Safari/iOS lifecycle boundary. Safari can pause the media
  // element while the page is hidden, even though React still believes the
  // radio is playing. The foreground handler must resume the same element,
  // rather than replacing the station or waiting for another React render.
  await page.evaluate(() => {
    const audio = document.querySelector('audio:not([src*="lyria"])');
    if (!audio) throw new Error('radio audio element was not rendered');
    audio.pause();
  });
  const backgroundStart = await audioSnapshot();
  assert.equal(backgroundStart.paused, true, 'background setup did not pause the radio element');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    // pageshow is part of the iOS return path.
    window.dispatchEvent(new Event('pageshow'));
  });
  await waitFor(async () => !(await audioSnapshot()).paused, 'radio resume after foreground');
  await sleep(500);
  assertAdvanced(backgroundStart, await audioSnapshot(), 'foreground resume');

  // Complete through the real Stage 00 path, then tuck and restore the card.
  await page.evaluate(() => window.__oracle_completeLore?.());
  await page.waitForSelector('.oracle-stage00-shell', { timeout: 5_000 });
  await waitForTarget(loreBaseVolume, 'Stage 00 restore', 0.0002);
  const stage00Track = await audioSnapshot();
  assertAdvanced(ducked, stage00Track, 'Stage 00 restore');
  await page.click('.oracle-overlay-tuck');
  await page.waitForSelector('.oracle-overlay-tab', { timeout: 3_000 });
  await page.click('.oracle-overlay-tab');
  await page.waitForSelector('.oracle-stage00-card', { timeout: 3_000 });

  // The radio control is intentionally mounted only in Oracle mode. Use the
  // same state setter through a dev-only browser hook here so this regression
  // does not depend on a live Gemini connection or microphone permission.
  await waitFor(async () => (await page.evaluate(() => Boolean(window.__oracle_toggleRadio))), 'radio toggle hook');
  const toggleRadio = () => page.evaluate(() => window.__oracle_toggleRadio?.());
  const activeHandoffVolume = (await state()).target;
  assert.ok(activeHandoffVolume > 0, 'Handoff did not restore an audible radio target');
  // Explicit mute/unmute.
  await toggleRadio();
  await waitForTarget(0, 'explicit mute');
  await toggleRadio();
  await waitForTarget(activeHandoffVolume, 'explicit unmute', 0.0002);
  const afterUnmute = await audioSnapshot();
  await waitFor(async () => !(await audioSnapshot()).paused, 'radio resume after unmute');
  await sleep(500);
  assertAdvanced(afterUnmute, await audioSnapshot(), 'explicit unmute');

  // Rapid reversal must cancel the stale hard-mute timer and leave playback live.
  await toggleRadio();
  await toggleRadio();
  await waitForTarget(activeHandoffVolume, 'rapid mute/unmute reversal', 0.0002);
  const reversalStart = await audioSnapshot();
  await sleep(1_000);
  const reversalEnd = await audioSnapshot();
  assertAdvanced(reversalStart, reversalEnd, 'rapid reversal');
  assert.equal(reversalEnd.paused, false, 'rapid reversal left radio paused');

  const runtimeErrors = await page.evaluate(() => window.__oracle_runtimeErrors ?? []);
  assert.deepEqual(runtimeErrors, [], `unexpected runtime errors: ${JSON.stringify(runtimeErrors)}`);
  assert.deepEqual(errors, [], `unexpected page errors: ${JSON.stringify(errors)}`);
  assert.deepEqual(consoleErrors, [], `unexpected console errors: ${JSON.stringify(consoleErrors)}`);
  console.log('radio handoff regression passed: lore start → background/foreground → Stage 00 restore → mute/unmute → rapid reversal');
} finally {
  await browser.close();
}