import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch({
  executablePath: '/home/runner/workspace/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});
const ctx = await browser.newContext({ permissions: ['microphone', 'camera'] });
const page = await ctx.newPage();

const consoleLogs = [];
const wsFrames = [];

page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', e => consoleLogs.push(`[pageerror] ${e.message}`));

page.on('websocket', ws => {
  console.log(`\n🔌 WS OPENED: ${ws.url().slice(0, 90)}`);
  ws.on('framesent',     f => { const t=(f.payload||'').toString(); wsFrames.push(`→ ${t.slice(0,300)}`); });
  ws.on('framereceived', f => { const t=(f.payload||'').toString(); wsFrames.push(`← ${t.slice(0,300)}`); });
  ws.on('close', () => wsFrames.push('— WS CLOSED —'));
});

console.log('▶ Loading…');
await page.goto(`${BASE}/?newuser`, { waitUntil: 'domcontentloaded', timeout: 20000 });
await sleep(2000);
await page.evaluate(() => { localStorage.setItem('oracle_lore_complete','1'); localStorage.setItem('oracle_step_log','1'); });
await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
await sleep(3000);

console.log('▶ Tap + skip lore…');
await page.click('body');
await sleep(800);
await page.evaluate(() => window.__oracle_skipLore?.());
await sleep(3000);

console.log('▶ Select knife…');
const knife = await page.$('.oracle-knife-card');
if (knife) { await knife.click(); console.log('  Knife clicked'); }
else console.log('  ⚠ No knife card found');
await sleep(12000);

const phase = await page.evaluate(() => document.querySelector('[data-oracle-state]')?.getAttribute('data-oracle-state'));
console.log('\nFinal phase:', phase);

console.log(`\n═══ WS FRAMES (${wsFrames.length} total) ═══`);
wsFrames.slice(0,60).forEach(f => console.log(f));

console.log(`\n═══ CONSOLE (filtered) ═══`);
consoleLogs
  .filter(l => /VAD|mic|MIC|WS|session|gemini|GEMINI|ORACLE|oracle|activity|activ|Error|error|boot|BOOT|fade|FADE|step|STEP|startMic|isListening|AudioContext/i.test(l))
  .slice(0,80).forEach(l => console.log(l));

await browser.close();
