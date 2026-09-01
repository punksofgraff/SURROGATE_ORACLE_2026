#!/usr/bin/env node
/**
 * Browser-level creative dispatch regression check.
 *
 * This drives the real CreativeArtifactCard and SurrogateOracleImmersion
 * callbacks, while intercepting the Lyria edge-function request. The
 * provider response is intentionally held until after cancellation, so the
 * check proves a late completion cannot revive the card. The retry then
 * gets one and only one fresh provider request.
 *
 * Usage:
 *   pnpm run creative-browser-verify
 *   DEV_URL=http://localhost:80/surrogate-oracle pnpm run creative-browser-verify
 */

import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEV_URL = process.env.DEV_URL ?? 'http://localhost:80/surrogate-oracle';
const TEST_URL = `${DEV_URL}${DEV_URL.includes('?') ? '&' : '?'}devui&creative-test`;
const CHROME = process.env.PUPPETEER_EXECUTABLE_PATH
  ?? process.env.CHROME_BIN
  ?? puppeteer.executablePath();

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const providerResponseHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

async function cardSnapshot(page) {
  return page.$eval('[data-testid="creative-artifact-card"]', card => ({
    text: card.textContent ?? '',
    status: card.querySelector('[data-testid="creative-artifact-status"]')?.textContent?.trim() ?? '',
  }));
}

async function waitForStatus(page, status, label) {
  await page.waitForFunction(
    expected => document.querySelector('[data-testid="creative-artifact-status"]')?.textContent?.trim() === expected,
    { timeout: 12000 },
    status,
  ).catch(async () => {
    throw new Error(`${label}: ${JSON.stringify(await cardSnapshot(page).catch(() => null))}`);
  });
}

async function waitForProviderRequests(getCount, expected, label, timeout = 12000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (getCount() >= expected) return;
    await sleep(50);
  }
  throw new Error(`${label}: observed ${getCount()} provider request(s), expected at least ${expected}`);
}

async function clickCardButton(page, name) {
  await page.waitForSelector(`[data-testid="creative-artifact-card"] button`);
  const clicked = await page.$$eval(
    '[data-testid="creative-artifact-card"] button',
    (buttons, expected) => {
      const button = buttons.find(item => item.textContent?.replace(/\s+/g, ' ').trim().includes(expected));
      if (!button) return false;
      button.click();
      return true;
    },
    name,
  );
  assert.equal(clicked, true, `card should expose ${name}`);
}

async function run() {
  let browser;
  const pendingProviderRequests = [];
  let providerRequestCount = 0;

  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: CHROME,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--enable-unsafe-swiftshader',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-audio-capture=${join(__dirname, '../public/mock-speech.wav')}`,
      ],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (request.url().includes('lyria-music-generator') && request.method() === 'OPTIONS') {
        void request.respond({ status: 204, headers: providerResponseHeaders });
        return;
      }
      if (request.method() === 'POST' && request.url().includes('lyria-music-generator')) {
        providerRequestCount += 1;
        pendingProviderRequests.push(request);
        return;
      }
      void request.continue();
    });

    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(TEST_URL, { waitUntil: 'load', timeout: 45000 });
    await sleep(1800);

    await page.waitForFunction(() => typeof window.__oracle_creative_test?.stage === 'function', { timeout: 12000 });
    await page.evaluate(() => {
      window.__oracle_creative_test.stage('Create an instrumental music track for a quiet night walk.');
    });
    await waitForStatus(page, 'Draft signal', 'music brief should be staged');

    await page.evaluate(() => window.__oracle_creative_test.confirm());
    await waitForStatus(page, 'Generating', 'music dispatch should be generating');
    await waitForProviderRequests(() => providerRequestCount, 1, 'initial confirmation should reach the provider');
    assert.equal(providerRequestCount, 1, 'initial confirmation should create exactly one provider request');

    await page.evaluate(() => window.__oracle_creative_test.cancel());
    await waitForStatus(page, 'Cancelled', 'cancel should be visible before the late provider response');
    await sleep(900);
    assert.equal(pendingProviderRequests.length, 1, 'the cancelled dispatch should have one held provider request');

    await pendingProviderRequests.shift().respond({
      status: 200,
      contentType: 'application/json',
      headers: providerResponseHeaders,
      body: JSON.stringify({
        audioBase64: 'AA==',
        mimeType: 'audio/mpeg',
        model: 'browser-test-lyria',
        requestId: 'browser-test-old',
      }),
    });
    await sleep(900);
    const afterLateResponse = await cardSnapshot(page);
    assert.equal(afterLateResponse.status, 'Cancelled', 'late Lyria completion must leave the card cancelled');
    assert.match(afterLateResponse.text, /cancelled before a complete artifact arrived/i);
    assert.doesNotMatch(afterLateResponse.text, /Generating|Ready/i, 'late Lyria completion must not revive the card');

    await clickCardButton(page, 'Retry dispatch');
    await waitForStatus(page, 'Draft signal', 'retry should re-arm the cancelled brief');
    await page.evaluate(() => window.__oracle_creative_test.confirm());
    await waitForStatus(page, 'Generating', 'retry should enter generating state');
    await waitForProviderRequests(() => providerRequestCount, 2, 'retry should reach the provider');
    assert.equal(providerRequestCount, 2, 'retry should create exactly one new provider request');
    assert.equal(pendingProviderRequests.length, 1, 'retry should leave exactly one new provider request pending');

    await pendingProviderRequests.shift().respond({
      status: 200,
      contentType: 'application/json',
      headers: providerResponseHeaders,
      body: JSON.stringify({
        audioBase64: 'AA==',
        mimeType: 'audio/mpeg',
        model: 'browser-test-lyria',
        requestId: 'browser-test-retry',
      }),
    });
    await waitForStatus(page, 'Ready', 'the intentional retry should own its provider completion');
    await sleep(500);
    assert.equal(providerRequestCount, 2, 'a settled retry must not duplicate its provider request');
    assert.deepEqual(pageErrors, [], 'browser verification should not produce page errors');

    console.log('creative browser dispatch passed (cancelled late response isolated; retry made one fresh request)');
  } finally {
    if (browser) await browser.close();
  }
}

run().catch(error => {
  console.error(`creative browser dispatch failed: ${error instanceof Error ? error.stack : error}`);
  process.exitCode = 1;
});