#!/usr/bin/env node
/**
 * Responsive reference-image viewer regression check.
 *
 * This enters the real Oracle journey through the deterministic dev hooks,
 * opens the reference image from the live burger menu, and verifies that the
 * supplied JPEG remains fully visible at mobile and desktop widths. Each
 * dismissal path must remove the dialog and restore focus to the menu trigger.
 *
 * Usage:
 *   pnpm run reference-image-browser-verify
 *   DEV_URL=http://localhost:80/surrogate-oracle pnpm run reference-image-browser-verify
 */

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const DEV_URL = process.env.DEV_URL ?? 'http://localhost:80/surrogate-oracle';
const NIX_CHROME = '/nix/store/0n9rl5l9syy808xi9bk4f6dhnfrvhkww-playwright-browsers-chromium/chromium-1080/chrome-linux/chrome';
const CHROME_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--enable-unsafe-swiftshader',
  '--use-gl=angle',
  '--use-angle=swiftshader',
];
const VIEWPORTS = [
  { name: 'mobile', width: 402, height: 874 },
  { name: 'desktop', width: 1280, height: 800 },
];
const REFERENCE_IMAGE_NAME = 'IMG_1067_1788314330444.jpeg';

let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed += 1;
  } else {
    console.log(`  ✗ ${message}`);
    failed += 1;
  }
}

async function enterOracle(page) {
  const url = `${DEV_URL}${DEV_URL.includes('?') ? '&' : '?'}reset&devui`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(1_200);
  await page.locator('.oracle-center, .oracle-stage').first().click();
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__oracle_skipLore?.());
  await page.waitForSelector('[data-oracle-state="awakened"]', { timeout: 20_000 });
  await page.locator('.oracle-knife-card').first().click();
  await page.waitForSelector('[data-oracle-state="oracle"]', { timeout: 20_000 });
  await page.waitForTimeout(1_000);
}

async function openReferenceImage(page) {
  const trigger = page.getByRole('button', { name: 'Open Oracle menu' });
  await trigger.click();
  await page.getByRole('button', { name: /REFERENCE IMAGE/ }).click();
  await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5_000 });
  await page.waitForFunction(() => {
    const image = document.querySelector('[role="dialog"] img');
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
  }, { timeout: 15_000 });
  return trigger;
}

async function assertViewerLayout(page, viewportName) {
  const viewer = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const frame = document.querySelector('.oracle-reference-image-frame');
    const image = document.querySelector('[role="dialog"] img');
    if (!(dialog instanceof HTMLElement) || !(frame instanceof HTMLElement) || !(image instanceof HTMLImageElement)) {
      return null;
    }

    const dialogBox = dialog.getBoundingClientRect();
    const frameBox = frame.getBoundingClientRect();
    const imageBox = image.getBoundingClientRect();
    return {
      title: dialog.querySelector('#oracle-reference-title')?.textContent?.trim(),
      labelledBy: dialog.getAttribute('aria-labelledby'),
      imageSource: image.currentSrc || image.src,
      imageLoaded: image.complete && image.naturalWidth > 0 && image.naturalHeight > 0,
      naturalAspectRatio: image.naturalWidth / image.naturalHeight,
      renderedAspectRatio: imageBox.width / imageBox.height,
      imageWithinFrame: imageBox.left >= frameBox.left - 1
        && imageBox.right <= frameBox.right + 1
        && imageBox.top >= frameBox.top - 1
        && imageBox.bottom <= frameBox.bottom + 1,
      dialogWithinViewport: dialogBox.left >= -1
        && dialogBox.right <= window.innerWidth + 1
        && dialogBox.top >= -1
        && dialogBox.bottom <= window.innerHeight + 1,
      noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1
        && document.body.scrollWidth <= window.innerWidth + 1,
    };
  });

  assert.ok(viewer, `${viewportName}: reference viewer elements should be present`);
  check(viewer.title === 'ORACLE SIGNAL', `${viewportName}: dialog has the ORACLE SIGNAL label`);
  check(viewer.labelledBy === 'oracle-reference-title', `${viewportName}: dialog is labelled by its title`);
  check(viewer.imageSource.includes(REFERENCE_IMAGE_NAME), `${viewportName}: supplied JPEG is loaded`);
  check(viewer.imageLoaded, `${viewportName}: supplied JPEG has decoded dimensions`);
  check(viewer.imageWithinFrame, `${viewportName}: image stays fully inside its frame`);
  check(
    Math.abs(viewer.renderedAspectRatio - viewer.naturalAspectRatio) < 0.02,
    `${viewportName}: image aspect ratio is preserved without cropping`,
  );
  check(viewer.dialogWithinViewport, `${viewportName}: dialog stays inside the viewport`);
  check(viewer.noHorizontalOverflow, `${viewportName}: page has no horizontal overflow`);
}

async function dismissAndCheck(page, trigger, dismiss, label, viewportName) {
  await dismiss();
  await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 5_000 });
  const focusReturned = await trigger.evaluate((element) => element === document.activeElement);
  check(focusReturned, `${viewportName}: ${label} returns focus to the menu trigger`);
}

async function main() {
  console.log(`\n── ORACLE REFERENCE IMAGE VIEWER VERIFY ──\n   Dev server: ${DEV_URL}\n`);
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_BIN || (existsSync(NIX_CHROME) ? NIX_CHROME : undefined),
    args: CHROME_ARGS,
  });

  try {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      });
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

      const trigger = await openReferenceImage(page);
      check(await page.getByRole('dialog', { name: 'ORACLE SIGNAL' }).count() === 1, `${viewport.name}: REFERENCE IMAGE opens the labelled dialog`);
      await assertViewerLayout(page, viewport.name);

      await dismissAndCheck(
        page,
        trigger,
        () => page.getByRole('button', { name: 'Close reference image' }).click(),
        'close-button dismissal',
        viewport.name,
      );

      await openReferenceImage(page);
      await dismissAndCheck(
        page,
        trigger,
        () => page.locator('.oracle-reference-overlay').click({ position: { x: 2, y: 2 } }),
        'backdrop dismissal',
        viewport.name,
      );

      await openReferenceImage(page);
      await dismissAndCheck(page, trigger, () => page.keyboard.press('Escape'), 'Escape dismissal', viewport.name);

      check(
        browserErrors.length === 0,
        `${viewport.name}: no unexpected browser errors${browserErrors.length ? ` (${browserErrors[0]})` : ''}`,
      );
      await context.close();
    }
  } finally {
    await browser.close();
  }

  console.log(`\n  RESULT: ${passed} pass, ${failed} fail\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(`Reference image viewer verify crashed: ${error.stack || error}`);
  process.exit(1);
});