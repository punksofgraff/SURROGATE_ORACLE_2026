#!/usr/bin/env node
/**
 * Verifies the live-session persona contract in a real browser:
 *   - Deep Oracle -> Co-pilot and Co-pilot -> Deep are hidden next-response
 *     messages on the live WebSocket.
 *   - A disconnected/re-established session includes the selected persona in
 *     its new session.config.
 *
 * Usage:
 *   pnpm persona-verify
 *   DEV_URL=http://localhost:5173 pnpm persona-verify
 */

import { chromium } from 'playwright';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEV_URL = process.env.DEV_URL ?? 'http://localhost:5173';
const PERSONA_MARKERS = {
  deep: '[ACTIVE PERSONA — DEEP ORACLE]',
  copilot: '[ACTIVE PERSONA — CREATIVE DIRECTOR / FAST, QUIPPY, WITTY ORACLE]',
};
const SWITCH_MARKERS = {
  deep: '[PERSONA SWITCH — DEEP ORACLE]',
  copilot: '[PERSONA SWITCH — CREATIVE DIRECTOR / FAST, QUIPPY, WITTY ORACLE]',
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function frameText(payload) {
  if (typeof payload === 'string') return payload;
  if (payload instanceof Buffer) return payload.toString('utf8');
  if (payload && typeof payload === 'object') {
    if (typeof payload.payload === 'string') return payload.payload;
    if (typeof payload.data === 'string') return payload.data;
  }
  return String(payload);
}

async function main() {
  console.log(`\n── ORACLE LIVE PERSONA CONTRACT VERIFY ──`);
  console.log(`   Dev server: ${DEV_URL}\n`);

  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_BIN || undefined,
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

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const sentFrames = [];
  const browserErrors = [];
  const sockets = [];

  page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.stack || error.message}`));
  page.on('error', (error) => browserErrors.push(`page: ${error.stack || error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
  });
  page.on('websocket', (socket) => {
    sockets.push(socket);
    socket.on('framesent', (payload) => sentFrames.push(frameText(payload)));
  });

  const url = DEV_URL + (DEV_URL.includes('?') ? '&' : '?') + 'reset&devui';
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1200);

  // Enter the normal journey without waiting through the authored lore.
  await page.locator('.oracle-center, .oracle-stage').first().click();
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__oracle_skipLore?.());
  await page.waitForSelector('[data-oracle-state="awakened"]', { timeout: 15000 });
  await page.locator('.oracle-knife-card').first().click();
  await page.waitForSelector('[data-oracle-state="oracle"]', { timeout: 12000 });
  await page.waitForTimeout(2500);

  const menu = page.getByRole('button', { name: 'Open Oracle menu' });
  await menu.click();
  await page.getByRole('button', { name: /CO-PILOT/ }).click();
  await page.waitForTimeout(500);

  // Persona buttons intentionally leave the menu open so the selection can be
  // changed repeatedly without reopening the panel.
  await page.getByRole('button', { name: 'DEEP ORACLE' }).click();
  await page.waitForTimeout(500);

  // The handle intentionally exposes the same lifecycle used by the UI. A
  // hidden start message causes the closed socket to be re-established.
  await page.evaluate(() => {
    const handle = window.oracleConversationRef?.current;
    handle?.disconnect();
    setTimeout(() => handle?.startSession('[PERSONA CONTRACT RECONNECT]', true), 150);
  });
  await page.waitForTimeout(4500);

  const parsedFrames = sentFrames
    .map((frame) => {
      try { return JSON.parse(frame); } catch { return null; }
    })
    .filter(Boolean);
  const textFrames = parsedFrames
    .filter((frame) => frame.type === 'client.realtimeInput')
    .map((frame) => frame.realtimeInput?.text)
    .filter((text) => typeof text === 'string');
  const configs = parsedFrames.filter((frame) => frame.type === 'session.config');
  const lastConfig = configs.at(-1);
  const lastSystemText = lastConfig?.systemInstruction?.parts?.map((part) => part.text || '').join('\n') || '';

  const checks = [
    ['Deep -> Co-pilot hidden switch', textFrames.some((text) => text.includes(SWITCH_MARKERS.copilot))],
    ['Co-pilot -> Deep hidden switch', textFrames.some((text) => text.includes(SWITCH_MARKERS.deep))],
    ['Re-established session.config exists', configs.length >= 2],
    ['Re-established session.config has Deep persona', lastSystemText.includes(PERSONA_MARKERS.deep)],
    ['No browser errors', browserErrors.length === 0],
  ];

  console.log(`  WebSockets observed: ${sockets.length}`);
  console.log(`  session.config frames: ${configs.length}`);
  for (const [label, passed] of checks) console.log(`  ${passed ? '✓' : '✗'} ${label}`);
  if (browserErrors.length > 0) {
    console.log('\n  Browser errors:');
    browserErrors.slice(0, 10).forEach((error) => console.log(`    ${error}`));
  }

  await context.close();
  await browser.close();

  if (!checks.every(([, passed]) => passed)) {
    throw new Error('Live-session persona contract failed');
  }
  console.log('\n  ✅ PASS — persona switches and reconnect setup contract are intact.\n');
}

main().catch((error) => {
  console.error(`\n  ❌ FAIL — ${error.message}\n`);
  process.exit(1);
});