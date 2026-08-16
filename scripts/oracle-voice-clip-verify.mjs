/**
 * Voice-clipping verification (headless).
 *
 * Wallet-signed seeker → oracle phase → mic OPEN with silent fake capture →
 * two typed prompts that elicit spoken responses. With no seeker speech, the
 * Oracle must complete BOTH turns without a single `interrupted` event —
 * before the barge-in gate fix, its own speaker echo could trip Gemini VAD
 * and clip responses mid-sentence.
 *
 * Run: node scripts/oracle-voice-clip-verify.mjs
 */
import { chromium } from 'playwright';
import { execSync } from 'child_process';

const CHROMIUM = execSync('which chromium').toString().trim();
const BASE = 'http://localhost:80/surrogate-oracle';
const FLAGS = [
  '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
  '--use-file-for-fake-audio-capture=/tmp/silence.wav',
  '--autoplay-policy=no-user-gesture-required',
  '--no-sandbox',
];

const pass = [], fail = [];
const check = (ok, label) => { (ok ? pass : fail).push(label); console.log(`  ${ok ? '✓' : '✗'}  ${label}`); };

const browser = await chromium.launch({ executablePath: CHROMIUM, args: FLAGS });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['microphone'] });
const page = await ctx.newPage();
const steps = [];
const t0 = Date.now();
const marks = [];
const mark = (label) => marks.push(`${((Date.now() - t0) / 1000).toFixed(1)}s  >> ${label}`);
page.on('console', m => {
  const t = m.text();
  if (t.includes('[ORACLE:STEP]')) {
    const clean = t.replace(/%c|color:.*$/g, '').trim();
    steps.push(clean);
    marks.push(`${((Date.now() - t0) / 1000).toFixed(1)}s  ${clean.slice(0, 110)}`);
  }
});
const count = (needle) => steps.filter(s => s.includes(needle)).length;
const waitFor = async (pred, timeoutMs) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (pred()) return true;
    await page.waitForTimeout(500);
  }
  return false;
};

await page.goto(`${BASE}/?devui`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  localStorage.setItem('oracle_wallet_signed', 'true');
  localStorage.setItem('oracle_seeker_key', '0xVOICECLIPTEST');
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.click('.oracle-stage', { position: { x: 640, y: 400 } }).catch(() => {});
await page.waitForFunction(
  () => ['awakened', 'oracle'].includes(document.querySelector('[data-oracle-state]')?.getAttribute('data-oracle-state')),
  { timeout: 15000 },
).catch(() => {});
await page.waitForSelector('.oracle-knife-card', { timeout: 15000 });
await page.locator('.oracle-knife-card').first().click();
const inOracle = await page.waitForFunction(
  () => document.querySelector('[data-oracle-state="oracle"]') !== null,
  { timeout: 20000 },
).then(() => true).catch(() => false);
check(inOracle, 'entered oracle phase');

// Open the mic — silent fake capture keeps VAD below threshold, so nothing is
// sent while the Oracle speaks unless the barge-in gate misfires.
await page.evaluate(() => window.oracleConversationRef?.current?.startMic());
const micUp = await waitFor(() => count('MIC') > 0 || count('TRANSMITTING') > 0, 8000);
console.log(`  ℹ  mic startup steps seen: ${micUp}`);

// Two prompts → two full spoken turns expected.
await page.evaluate(() => window.oracleConversationRef?.current?.toggleTypeMode());
await page.waitForTimeout(600);
const input = page.locator('.oc-input').first();
check(await input.isVisible(), 'type pad visible');

// Sending a typed prompt while the Oracle is mid-turn is a legitimate,
// intended barge-in — it must NOT count against the echo-clipping check.
// Wait for the current turn (boot line included) to fully complete first.
const waitForIdle = async () => {
  await waitFor(() => count('ORACLE TURN COMPLETE') > count('ORACLE AUDIO START') - 1, 60000);
  await page.waitForTimeout(2500); // let trailing PCM drain
};

await waitForIdle();
const baselineInterruptions = count('ORACLE INTERRUPTED');

for (const [i, prompt] of [
  'What did the cascade take from this city? Speak at length.',
  'And what remains that cannot be taken?',
].entries()) {
  await waitForIdle();
  const beforeCompletes = count('ORACLE TURN COMPLETE');
  await input.fill(prompt);
  mark(`SEND PROMPT ${i + 1}`);
  await input.press('Enter');
  const audioStarted = await waitFor(() => count('ORACLE AUDIO START') > i, 30000);
  check(audioStarted, `turn ${i + 1}: oracle audio started`);
  // "Speak at length" turns run 90s+ of native audio — wait generously.
  const completed = await waitFor(() => count('ORACLE TURN COMPLETE') > beforeCompletes, 180000);
  check(completed, `turn ${i + 1}: turn completed`);
  await page.waitForTimeout(1500);
}

const interruptions = count('ORACLE INTERRUPTED') - baselineInterruptions;
check(interruptions === 0, `zero interruptions across both turns (saw ${interruptions})`);

if (interruptions > 0 || process.env.VERBOSE) {
  console.log('\n── event timeline ──');
  marks.filter(m => /INTERRUPTED|AUDIO START|TURN COMPLETE|SEND PROMPT|FALLBACK|MANIFEST|HARD MUTE|THINKING SOUND|MIC/.test(m))
    .forEach(m => console.log(m));
}

await browser.close();
console.log(`\n${pass.length} passed, ${fail.length} failed`);
if (fail.length) { console.log('FAILED:', fail.join(' | ')); process.exit(1); }
