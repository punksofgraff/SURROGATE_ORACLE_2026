/**
 * oracle-trace-forensic-verify.mjs — Task: forensic trace logger verification.
 *
 * Runs a trace-enabled headless session and asserts:
 *   1. Interactive taps emit 'tap' trace events (selector + coords + top element).
 *   2. Edge-function calls carry x-oracle-request-id / x-oracle-session-id headers
 *      and emit 'api' trace events with status + duration + request_id.
 *   3. Wallet-bridge messages emit 'bridge' trace events.
 *   4. All of the above actually land server-side in oracle_session_traces
 *      (read back through the oracle-trace edge function with the dev token).
 *
 * Recipe: nix chromium + SwiftShader (WebGL), ?devui, fake media streams.
 * Usage: node scripts/oracle-trace-forensic-verify.mjs
 */

import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── env ──────────────────────────────────────────────────────────────────
const env = {};
readFileSync(resolve(__dirname, '../.env.local'), 'utf8').split('\n').forEach(l => {
  const [k, ...v] = l.split('=');
  if (k?.trim()) env[k.trim()] = v.join('=').trim().replace(/^['"]|['"]$/g, '');
});
const TRACE_TOKEN = env.ORACLE_TRACE_DEV_TOKEN;
const SUPA_URL = env.VITE_SUPABASE_URL;
if (!TRACE_TOKEN || !SUPA_URL) { console.error('missing ORACLE_TRACE_DEV_TOKEN / VITE_SUPABASE_URL in .env.local'); process.exit(1); }

const BASE = process.env.ORACLE_SMOKE_URL || 'http://localhost:80/surrogate-oracle';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? '  — ' + detail : ''}`);
};

// ── browser ──────────────────────────────────────────────────────────────
let execPath;
try { execPath = execSync('which chromium').toString().trim(); } catch {}
const browser = await chromium.launch({
  headless: true,
  executablePath: execPath || undefined,
  args: [
    '--no-sandbox', '--disable-dev-shm-usage',
    '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['microphone'] });
const page = await ctx.newPage();

// Opt into tracing + dev UI BEFORE the app bundle evaluates (token read at module load).
await page.addInitScript(([token]) => {
  localStorage.setItem('oracle_trace_token', token);
  localStorage.setItem('oracle_step_log', '1');
}, [TRACE_TOKEN]);

// ── network capture ──────────────────────────────────────────────────────
const ingestRows = [];          // rows posted to oracle-trace
const correlatedRequests = [];  // edge-fn requests carrying our correlation headers
page.on('request', req => {
  const url = req.url();
  if (!url.includes('/functions/v1/')) return;
  if (url.includes('/functions/v1/oracle-trace')) {
    try {
      const body = JSON.parse(req.postData() || '{}');
      if (body.action === 'ingest' && Array.isArray(body.rows)) ingestRows.push(...body.rows);
    } catch {}
    return;
  }
  const h = req.headers();
  if (h['x-oracle-request-id']) {
    correlatedRequests.push({
      fn: url.split('/functions/v1/')[1]?.split('?')[0],
      rid: h['x-oracle-request-id'],
      sid: h['x-oracle-session-id'],
    });
  }
});

// ── journey: dormant → oracle ────────────────────────────────────────────
console.log(`\n── loading ${BASE}/?devui`);
await page.goto(`${BASE}/?devui`, { waitUntil: 'load' });
await sleep(2500);

await page.evaluate(() => document.querySelector('.oracle-center')?.click());
await sleep(1000);
await page.evaluate(() => window.__oracle_skipLore && window.__oracle_skipLore());
await sleep(2500);

// Knife selection (locator re-resolves each retry; carousel remounts cards)
try {
  await page.locator('.oracle-knife-card:has(.oracle-knife-cta)').first().click({ timeout: 8000 });
} catch {
  await page.evaluate(() => document.querySelector('.oracle-knife-card')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}
console.log('── knife selected, waiting for oracle state…');

let state = null;
for (let i = 0; i < 90; i++) {
  await sleep(500);
  state = await page.getAttribute('.oracle-stage', 'data-oracle-state').catch(() => null);
  if (state === 'oracle') break;
}
check('journey reaches oracle state (trace session bound)', state === 'oracle', `state=${state}`);

await sleep(3000); // let world-briefing/api traffic + first flush land

// ── 1. taps ──────────────────────────────────────────────────────────────
// Real pointer taps on interactive elements (pointerup capture listener).
await page.evaluate(() => window.scrollTo(0, 0));
for (const sel of ['.oracle-exit-btn', '.oc-send-btn', 'button']) {
  const el = await page.$(sel);
  if (el) {
    const box = await el.boundingBox();
    if (box) {
      // pointerdown+up without full click semantics where click would navigate away:
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.up();
      await sleep(300);
      break;
    }
  }
}
// Guaranteed additional tap on a synthetic interactive element (doesn't depend on layout)
await page.evaluate(() => {
  const b = document.createElement('button');
  b.textContent = 'trace-probe';
  b.id = 'trace-probe-btn';
  b.style.cssText = 'position:fixed;top:200px;left:20px;z-index:999999;';
  document.body.appendChild(b);
});
await page.click('#trace-probe-btn');
await sleep(300);

// ── 2. traced API call ───────────────────────────────────────────────────
// Force one deterministic edge-fn call through the traced supabase client path.
await page.evaluate(() => {
  window.dispatchEvent(new CustomEvent('oracle:telemetry', { detail: { event: 'trace_verify_marker' } }));
});

// ── 3. bridge event ──────────────────────────────────────────────────────
// A same-origin wallet-ish message with an unrecognized type exercises the
// inbound-message trace path without triggering a real sign-in.
await page.evaluate(() => window.postMessage({ type: 'wallet_trace_probe' }, window.location.origin));
await sleep(400);

// Final flush: hide the page (visibilitychange flush) then wait.
await sleep(3500);

// ── assertions on captured network ───────────────────────────────────────
const byType = t => ingestRows.filter(r => r.event_type === t);
const tapRows = byType('tap');
const apiRows = byType('api');
const bridgeRows = byType('bridge');

check('tap events ingested', tapRows.length > 0, `${tapRows.length} taps`);
if (tapRows.length) {
  const t = tapRows[tapRows.length - 1];
  check('tap payload has selector/coords/top element',
    !!t.payload?.target && typeof t.payload?.x === 'number' && !!t.payload?.top_el,
    JSON.stringify(t.payload).slice(0, 140));
}
check('api events ingested', apiRows.length > 0, `${apiRows.length} calls: ${[...new Set(apiRows.map(r => r.payload?.fn))].join(', ')}`);
if (apiRows.length) {
  const a = apiRows[0];
  check('api payload has fn/method/status/ms/request_id',
    !!a.payload?.fn && !!a.payload?.method && typeof a.payload?.status === 'number' && typeof a.payload?.ms === 'number' && !!a.payload?.request_id);
}
check('bridge events ingested', bridgeRows.length > 0, `${bridgeRows.length}: ${bridgeRows.map(r => r.payload?.kind).join(', ')}`);
check('edge-fn requests carried correlation headers', correlatedRequests.length > 0,
  `${correlatedRequests.length} reqs: ${[...new Set(correlatedRequests.map(r => r.fn))].join(', ')}`);
if (correlatedRequests.length) {
  const withSid = correlatedRequests.filter(r => r.sid && r.sid !== 'unknown');
  check('session id present on correlated requests (post-session)', withSid.length > 0, `${withSid.length}/${correlatedRequests.length}`);
}

// api trace request_id should match a header we saw on the wire
if (apiRows.length && correlatedRequests.length) {
  const headerRids = new Set(correlatedRequests.map(r => r.rid));
  const matched = apiRows.filter(r => headerRids.has(r.payload?.request_id));
  check('api trace request_ids match on-the-wire headers', matched.length > 0, `${matched.length}/${apiRows.length}`);
}

// ── 4. server-side readback ──────────────────────────────────────────────
const sessionId = ingestRows.find(r => r.session_id)?.session_id;
if (sessionId) {
  const res = await fetch(`${SUPA_URL}/functions/v1/oracle-trace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-trace-token': TRACE_TOKEN },
    body: JSON.stringify({ action: 'trace', session_id: sessionId }),
  });
  const rows = res.ok ? await res.json() : [];
  const persisted = new Set(rows.map(r => r.event_type));
  check('server-side trace readback works', res.ok && rows.length > 0, `${rows.length} rows for ${sessionId.slice(0, 12)}…`);
  check('tap/api/bridge all persisted server-side',
    persisted.has('tap') && persisted.has('api') && persisted.has('bridge'),
    [...persisted].sort().join(','));
} else {
  check('server-side trace readback works', false, 'no session id captured');
}

await browser.close();

const fails = results.filter(r => !r.ok).length;
console.log(`\n${fails === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${fails}/${results.length} CHECKS FAILED`}`);
process.exit(fails === 0 ? 0 : 1);
