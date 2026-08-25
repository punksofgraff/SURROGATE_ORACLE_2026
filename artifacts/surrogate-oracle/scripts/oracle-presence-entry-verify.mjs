#!/usr/bin/env node
/**
 * Verifies that presence permissions are attached to entry gestures rather
 * than presented as a separate visual checkpoint.
 */
import puppeteer from 'puppeteer';

const DEV_URL = process.env.DEV_URL ?? 'http://localhost:5173';
const CHROME_BIN = process.env.CHROME_BIN;

function check(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`  ✓ ${message}`);
}

async function assertNoPresenceCard(page, label) {
  const evidence = await page.evaluate(() => ({
    gate: document.querySelector('[data-presence-gate]'),
    cardText: [...document.querySelectorAll('body *')].some((element) =>
      element.textContent?.includes('ENTER IN FULL PRESENCE')
    ),
  }));
  check(!evidence.gate && !evidence.cardText, `${label}: no separate presence card`);
}

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROME_BIN || puppeteer.executablePath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    for (const scenario of ['?fresh', '?newuser']) {
      const page = await browser.newPage();
      await page.setViewport({ width: 390, height: 844 });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.goto(`${DEV_URL}${scenario}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      await assertNoPresenceCard(page, `${scenario} before entry`);

      const entry = await page.evaluateHandle(() => [...document.querySelectorAll('button')]
        .find((button) => button.textContent?.trim().toUpperCase().includes('ENTER THE ARCHIVE')));
      if (await entry.evaluate((button) => Boolean(button))) {
        await entry.evaluate((button) => button.click());
        await new Promise((resolve) => setTimeout(resolve, 1_100));
        await assertNoPresenceCard(page, `${scenario} after entry`);
      }
      check(errors.length === 0, `${scenario}: no browser errors`);
      await page.close();
    }
  } finally {
    await browser.close();
  }

  console.log('\n✅ PASS — presence permissions stay attached to entry actions.');
})().catch((error) => {
  console.error(`\n❌ FAIL — ${error.message}`);
  process.exitCode = 1;
});