#!/usr/bin/env node
/**
 * First-turn Co-pilot contract:
 * - exact typed commands switch while the opening Oracle response is active;
 * - Oracle/Copilot alone stay ordinary Deep-mode input;
 * - the command itself is not sent as a normal realtime text turn;
 * - the selected persona survives a reconnect and the browser stays clean.
 */
import { chromium } from 'playwright';

const DEV_URL = process.env.DEV_URL ?? 'http://localhost:5173';
const CHROME_BIN = process.env.CHROME_BIN;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function check(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`  ✓ ${message}`);
}

async function enterOracle(page) {
  await page.locator('.oracle-center, .oracle-stage').first().click();
  await wait(350);
  await page.evaluate(() => window.__oracle_skipLore?.());
  await page.waitForSelector('[data-oracle-state="awakened"]', { timeout: 15_000 });
  await page.locator('.oracle-knife-card').first().click();
  await page.waitForSelector('[data-oracle-state="oracle"]', { timeout: 12_000 });
}

async function typeSignal(page, text) {
  const input = page.locator('input[placeholder="TYPE SIGNAL..."]');
  if (await input.count() === 0) {
    await page.getByRole('button', { name: 'Open Oracle menu' }).click();
    await page.getByRole('button', { name: 'TYPE SIGNAL' }).click();
  }
  await input.fill(text);
  await page.locator('.oc-send-btn').click();
}

async function waitForCondition(predicate, timeoutMs, description) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await wait(100);
  }
  throw new Error(`timed out waiting for ${description}`);
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_BIN || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const browserErrors = [];
  const sentFrames = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('websocket', (socket) => socket.on('framesent', (payload) => {
    const text = typeof payload === 'string'
      ? payload
      : payload instanceof Buffer
        ? payload.toString('utf8')
        : payload?.payload ?? payload?.data ?? String(payload);
    try { sentFrames.push(JSON.parse(text)); } catch { /* non-JSON frame */ }
  }));

  try {
    await page.goto(`${DEV_URL}?reset&devui`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await wait(1_000);
    await enterOracle(page);

    // The greeting begins as soon as the knife is drawn. Exercise the typed
    // control path immediately instead of waiting for a turn boundary.
    await typeSignal(page, 'Oracle');
    await wait(350);
    check(await page.locator('[data-oracle-persona="deep"]').count() === 1, 'Oracle alone does not switch persona');

    await typeSignal(page, 'Oracle Copilot');
    await page.waitForSelector('[data-oracle-persona="creative-director"]', { timeout: 5_000 });
    check(true, 'exact first-turn command switches to Money Mite');

    const textFrames = sentFrames
      .filter((frame) => frame.type === 'client.realtimeInput')
      .map((frame) => frame.realtimeInput?.text)
      .filter((text) => typeof text === 'string');
    check(!textFrames.includes('Oracle Copilot'), 'control phrase is not sent as a normal seeker turn');
    check(sentFrames.some((frame) =>
      frame.type === 'client.realtimeInput' &&
      frame.realtimeInput?.activityStart
    ), 'first-turn activation sends protocol interruption');
    await waitForCondition(
      () => sentFrames.filter((frame) => frame.type === 'session.config').length >= 2,
      5_000,
      'replacement session config',
    );
    const configsAfterTakeover = sentFrames.filter((frame) => frame.type === 'session.config');
    const latestSystemText = configsAfterTakeover.at(-1)?.systemInstruction?.parts
      ?.map((part) => part.text || '').join('\n') || '';
    check(configsAfterTakeover.length >= 2, 'first-turn activation replaces the live session');
    check(
      latestSystemText.includes('[ACTIVE PERSONA — MONEY MITE CREATIVE DIRECTOR / FAST, QUIPPY, WITTY ORACLE]'),
      'replacement session config is authoritative for Money Mite'
    );

    // Force the same reconnect lifecycle used by the existing persona contract.
    await page.evaluate(() => {
      const handle = window.oracleConversationRef?.current;
      handle?.disconnect();
      setTimeout(() => handle?.startSession('[FIRST TURN COPILOT RECONNECT]', true), 150);
    });
    await wait(3_500);
    check(await page.locator('[data-oracle-persona="creative-director"]').count() === 1, 'Money Mite persists across reconnect');
    check(browserErrors.length === 0, 'no browser errors');
  } finally {
    await context.close();
    await browser.close();
  }

  console.log('\n✅ PASS — first-turn Co-pilot interruption contract is intact.\n');
})().catch((error) => {
  console.error(`\n❌ FAIL — ${error.message}\n`);
  process.exit(1);
});