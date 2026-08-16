/**
 * Verify the persistent session trace logger (dev logger for full Oracle traces).
 *
 * Phase A — no dev token: confirms the tracer is a silent no-op (no POSTs).
 * Phase B — token in localStorage.oracle_trace_token: confirms capture,
 *           batched upload via the oracle-trace Edge Function, and the
 *           TraceViewer session list.
 *
 * Reads the token from artifacts/surrogate-oracle/.env.local (gitignored).
 * Run: node scripts/oracle-trace-verify.mjs
 */
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';

const CHROMIUM = execSync('which chromium').toString().trim();
const BASE_URL = 'http://localhost:80/surrogate-oracle?devui';

const envLocal = readFileSync('artifacts/surrogate-oracle/.env.local', 'utf8');
const DEV_TOKEN = envLocal.match(/^ORACLE_TRACE_DEV_TOKEN=(.+)$/m)?.[1]?.trim();
if (!DEV_TOKEN) { console.error('✗ no ORACLE_TRACE_DEV_TOKEN in .env.local'); process.exit(1); }

const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: [
    '--no-sandbox',
    '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

async function run(label, withToken) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const tracePosts = [];
  page.on('request', (req) => {
    if (req.url().includes('/functions/v1/oracle-trace') && req.method() === 'POST') {
      tracePosts.push(req.postData()?.slice(0, 300));
    }
  });

  if (withToken) {
    await ctx.addInitScript((t) => localStorage.setItem('oracle_trace_token', t), DEV_TOKEN);
  }

  console.log(`\n── ${label} ──`);
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const sessionId = await page.evaluate(() => localStorage.getItem('oracle_active_session_id'));
  try { await page.click('.oracle-stage', { position: { x: 640, y: 400 } }); } catch { /* ok */ }
  await page.waitForTimeout(5000);

  console.log(`  session id: ${sessionId}`);
  console.log(`  trace POST batches: ${tracePosts.length} ${withToken ? '(expected >0)' : '(expected 0)'}`);
  if (tracePosts[0]) console.log('  first batch:', tracePosts[0].slice(0, 200));

  if (withToken) {
    // Open TraceViewer and confirm the session list loads via the edge fn
    const viewer = await page.locator('[data-testid="trace-viewer"]').count();
    console.log('  TraceViewer rendered:', viewer > 0);
    if (viewer > 0) {
      await page.locator('[data-testid="trace-viewer"] > div').first().click();
      await page.waitForTimeout(3000);
      const text = await page.locator('[data-testid="trace-viewer"]').innerText();
      console.log('  viewer preview:\n' + text.split('\n').slice(0, 8).map((l) => '    ' + l).join('\n'));
    }
    // Final-flush path
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(1500);
  }

  await ctx.close();
  return { sessionId, posts: tracePosts.length };
}

const a = await run('PHASE A — no dev token (real seeker)', false);
const b = await run('PHASE B — dev token set', true);

console.log('\n══ RESULT ══');
console.log(`no-token uploads:   ${a.posts === 0 ? '✓ none (silent no-op)' : '✗ ' + a.posts + ' UNEXPECTED'}`);
console.log(`with-token uploads: ${b.posts > 0 ? '✓ ' + b.posts + ' batch(es)' : '✗ none'}`);
console.log('SESSION_ID=' + b.sessionId);
await browser.close();
process.exit(a.posts === 0 && b.posts > 0 ? 0 : 1);
