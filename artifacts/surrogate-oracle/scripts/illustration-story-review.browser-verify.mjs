#!/usr/bin/env node
/**
 * Browser-level review gate regression check.
 *
 * Seeds the same localStorage artifact that the app restores after a refresh,
 * then drives the real CreativeArtifactCard and Open Kitchen controls. All
 * media is data-backed and provider-generation actions are rejected, so this
 * exercises review state without spending or depending on a provider.
 *
 * Usage:
 *   pnpm run story-review-browser-verify
 *   DEV_URL=http://localhost:80/surrogate-oracle pnpm run story-review-browser-verify
 */
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createIllustrationStoryReviewFixture,
  illustrationStoryReviewFixtureSessionId,
} from './fixtures/illustration-story-review.fixture.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEV_URL = process.env.DEV_URL ?? 'http://localhost:80/surrogate-oracle';
const TEST_URL = `${DEV_URL}${DEV_URL.includes('?') ? '&' : '?'}devui&story-review-test`;
const NIX_CHROME = '/nix/store/0n9rl5l9syy808xi9bk4f6dhnfrvhkww-playwright-browsers-chromium/chromium-1080/chrome-linux/chrome';
const CHROME = process.env.PUPPETEER_EXECUTABLE_PATH
  ?? process.env.CHROME_BIN
  ?? (existsSync(NIX_CHROME) ? NIX_CHROME : puppeteer.executablePath());
const STORY_STORAGE_KEY = `oracle_creative_story_${illustrationStoryReviewFixtureSessionId}`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function check(condition, message) {
  assert.equal(Boolean(condition), true, message);
  console.log(`  ✓ ${message}`);
}

async function waitForWorkspace(page) {
  await page.waitForSelector('[data-testid="story-review-workspace"]', { timeout: 20_000 });
  await page.waitForFunction(() => (
    document.querySelectorAll('[data-testid^="story-shot-"]:not([data-testid="story-shot-timeline"])').length === 32
  ), { timeout: 20_000 });
}

async function reviewShot(page, pageNumber) {
  await page.click(`[data-testid="story-shot-${pageNumber}"]`);
  await page.waitForFunction(expected => (
    document.querySelector(`[data-testid="story-shot-${expected}"]`)?.getAttribute('aria-current') === 'step'
  ), { timeout: 5_000 }, pageNumber);
  const markButton = await page.$('button.story-kitchen__button--quiet');
  assert.ok(markButton, `shot ${pageNumber} should expose an inspection control`);
  await markButton.click();
}

async function cardReviewState(page) {
  return page.evaluate(() => {
    const timeline = document.querySelector('[data-testid="story-shot-timeline"]');
    const approval = document.querySelector('[data-testid="button-approve-story-review"]');
    const audio = document.querySelector('.story-kitchen__listen-check input');
    return {
      inspectedCount: timeline?.querySelectorAll('[data-reviewed="true"]').length ?? 0,
      timelineCount: timeline?.querySelectorAll('[data-testid^="story-shot-"]').length ?? 0,
      approvalDisabled: approval?.hasAttribute('disabled') ?? true,
      audioChecked: audio?.checked ?? false,
      selectedShot: [...(timeline?.querySelectorAll('[aria-current="step"]') ?? [])][0]?.getAttribute('data-testid') ?? null,
    };
  });
}

async function seedFixture(page) {
  const artifact = createIllustrationStoryReviewFixture();
  await page.evaluate(({ sessionId, storageKey, value }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('oracle_active_session_id', sessionId);
    localStorage.setItem(storageKey, JSON.stringify(value));
    localStorage.setItem('dev_user_session', '1');
  }, {
    sessionId: illustrationStoryReviewFixtureSessionId,
    storageKey: STORY_STORAGE_KEY,
    value: artifact,
  });
}

async function configurePage(page, providerCalls, pageErrors) {
  await page.setViewport({ width: 1440, height: 1100 });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    const url = request.url();
    const body = request.postData() ?? '';
    if (url.includes('lyria-music-generator') || /oracle-story-film-job/.test(url) && /"action"\s*:\s*"(start|retry|generate|scene)"/.test(body)) {
      providerCalls.push({ url, body });
      void request.abort();
      return;
    }
    if (request.method() === 'POST' && url.includes('oracle-story-film-job')) {
      void request.respond({
        status: 200,
        contentType: 'application/json',
        body: '{}',
      });
      return;
    }
    void request.continue();
  });
  await page.setRequestInterception(true);
}

async function run() {
  let browser;
  const providerCalls = [];
  const pageErrors = [];

  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: CHROME,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
    let page = await browser.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.close();
    page = await browser.newPage();
    await configurePage(page, providerCalls, pageErrors);

    await page.goto(TEST_URL, { waitUntil: 'load', timeout: 45_000 });
    await seedFixture(page);
    // A new tab in the same browser context is a clean document reload with
    // the exact persisted localStorage, without asking Chromium to tear down
    // the scene's WebGL context in place.
    await page.close();
    page = await browser.newPage();
    await configurePage(page, providerCalls, pageErrors);
    await page.goto(TEST_URL, { waitUntil: 'load', timeout: 45_000 });
    await sleep(1_500);
    await waitForWorkspace(page);

    const initial = await cardReviewState(page);
    check(initial.timelineCount === 32, 'fixture loads all 32 timeline shots');
    check(initial.inspectedCount === 0, 'fixture starts with no shot attestations');
    check(initial.audioChecked === false, 'fixture starts with the mix-listened control unchecked');
    check(initial.approvalDisabled === true, 'approval is locked before the review prerequisites');

    await reviewShot(page, 1);
    await reviewShot(page, 17);
    const selected = await cardReviewState(page);
    check(selected.selectedShot === 'story-shot-17', 'timeline selection follows the selected shot');
    check(selected.inspectedCount === 2, 'selected shots can be marked inspected');
    check(selected.approvalDisabled === true, 'approval stays locked while shots remain uninspected');

    for (const pageNumber of Array.from({ length: 32 }, (_, index) => index + 1)) {
      const current = await cardReviewState(page);
      if (current.inspectedCount < 32) {
        const alreadyInspected = await page.$eval(
          `[data-testid="story-shot-${pageNumber}"]`,
          element => element.getAttribute('data-reviewed') === 'true',
        );
        if (!alreadyInspected) await reviewShot(page, pageNumber);
      }
    }
    const shotsReviewed = await cardReviewState(page);
    check(shotsReviewed.inspectedCount === 32, 'all 32 shots can be explicitly inspected');
    check(shotsReviewed.approvalDisabled === true, 'approval remains locked until the current mix is heard');

    await page.click('.story-kitchen__listen-check input');
    await page.waitForFunction(() => document.querySelector('.story-kitchen__listen-check input')?.checked === true);
    const fullyReviewed = await cardReviewState(page);
    check(fullyReviewed.audioChecked === true, 'the current mix can be marked listened');
    check(fullyReviewed.approvalDisabled === false, 'approval unlocks only after all shots and audio are reviewed');

    await page.click('[data-testid="story-shot-17"]');
    await page.waitForFunction(() => document.querySelector('[data-testid="story-shot-17"]')?.getAttribute('aria-current') === 'step');
    await page.type('textarea[id^="story-reject-"]', 'Shot 17 obscures the source artwork at the end checkpoint.');
    await page.click('[data-testid="button-reject-story-review"]');
    await sleep(700);
    const rejected = await page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey) ?? 'null'), STORY_STORAGE_KEY);
    const rejection = rejected?.metadata?.reviewRejections?.at(-1);
    check(rejection?.pageNumber === 17, 'rejection records the selected shot');
    check(rejection?.reason === 'Shot 17 obscures the source artwork at the end checkpoint.', 'rejection records the entered reason');

    await page.reload({ waitUntil: 'load', timeout: 45_000 });
    await sleep(1_500);
    await waitForWorkspace(page);
    const restored = await cardReviewState(page);
    check(restored.inspectedCount === 32, 'reload restores all 32 shot attestations');
    check(restored.audioChecked === true, 'reload restores the listened-to-mix state');
    const restoredRejection = await page.evaluate(storageKey => {
      const artifact = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      return artifact?.metadata?.reviewRejections?.at(-1) ?? null;
    }, STORY_STORAGE_KEY);
    check(restoredRejection?.pageNumber === 17, 'reload retains the rejected shot');
    check(restoredRejection?.reason === 'Shot 17 obscures the source artwork at the end checkpoint.', 'reload retains the rejection reason');
    check(providerCalls.length === 0, 'review fixture makes no provider-generation calls');
    check(pageErrors.length === 0, 'browser review run produces no page errors');

    console.log('illustration story review browser passed (32-shot attestations, audio gate, rejection, and reload persistence)');
  } finally {
    if (browser) await browser.close();
  }
}

run().catch(error => {
  console.error(`illustration story review browser failed: ${error instanceof Error ? error.stack : error}`);
  process.exitCode = 1;
});