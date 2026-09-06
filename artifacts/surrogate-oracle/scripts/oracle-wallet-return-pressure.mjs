/**
 * SURROGATE Oracle — wallet return/session-limit pressure test
 *
 * Exercises the production gate while a returning IP check is delayed:
 *   - ?seeker= and ?session_id= are present on entry
 *   - wallet state arrives while the oracle-entry limit gate evaluates
 *   - the wallet card must never win over the confirmed wallet return
 *   - the seeker/session identity must survive URL cleanup
 *
 * Run against the dev workflow:
 *   pnpm run wallet-return-pressure
 *
 * ORACLE_WALLET_PRESSURE_URL may point at another preview or published host.
 */
import { chromium } from 'playwright';

const BASE_URL = process.env.ORACLE_WALLET_PRESSURE_URL
  || process.env.ORACLE_PRESSURE_URL
  || 'http://localhost:5173';
const WALLET = '0xpressure-wallet-9f3c';
const SESSION_ID = 'pressure-session-20260906';
const DERIVED_IP = '203.0.113.77';
const LEDGER_KEY = `surrogate_completed_exchanges_v3_20260823_${WALLET}`;
const CHROMIUM = process.env.CHROMIUM_PATH
  || '/nix/store/zvpmjmxyjdkjs0rnby54xhwjkp7fj2ff-ungoogled-chromium-114.0.5735.90/bin/chromium';

const pass = [];
const fail = [];

function check(condition, label, detail = '') {
  if (condition) {
    pass.push(label);
    console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail.push(label);
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const browser = await chromium.launch({
  headless: true,
  executablePath: CHROMIUM,
  args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'],
});
const context = await browser.newContext({
  viewport: { width: 402, height: 874 },
  ignoreHTTPSErrors: true,
});
const page = await context.newPage();
const functionRequests = [];
const consoleErrors = [];

page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('request', (request) => {
  if (request.url().includes('/functions/v1/user-wallet-sync')) {
    functionRequests.push({
      action: JSON.parse(request.postData() || '{}').action,
      at: Date.now(),
    });
  }
});

await page.addInitScript(({ wallet, ledgerKey }) => {
  window.__stepLog = [];
  window.addEventListener('oracle:step', (event) => {
    window.__stepLog.push({
      label: event.detail?.label || '',
      status: event.detail?.status || 'ok',
      wall: Date.now(),
    });
  });
  localStorage.setItem('surrogate_journey_reset_20260824', 'true');
  // Model a restored wallet identity whose React state has not settled yet.
  localStorage.setItem('oracle_seeker_key', wallet);
  localStorage.removeItem('oracle_wallet_signed');
  localStorage.setItem(ledgerKey, '20');
  localStorage.setItem('oracle_step_log', '1');
  sessionStorage.clear();
  sessionStorage.setItem('oracle_scene_phase', 'oracle');
}, { wallet: WALLET, ledgerKey: LEDGER_KEY });

// Use a broad route because Supabase is an absolute URL in the browser bundle.
// Delay the IP check and wallet upsert independently so this remains a real
// ordering pressure test rather than a synchronous mock.
await context.route('**/*', async (route) => {
  const url = route.request().url();
  if (url.includes('/functions/v1/user-wallet-sync')) {
    const body = JSON.parse(route.request().postData() || '{}');
    await new Promise((resolve) => setTimeout(resolve, body.action === 'get' ? 450 : 900));
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ip_address: DERIVED_IP,
        data: { ip_address: DERIVED_IP, onboarding_status: 'wallet_signed' },
      }),
    });
  }
  if (url.includes('/functions/v1/seeker-echo')) {
    const body = JSON.parse(route.request().postData() || '{}');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        echo: null,
        compactSummaries: [],
        rawTurns: [],
        ...(body.op === 'fragments' ? { phrases: [] } : {}),
      }),
    });
  }
  return route.continue();
});

const returnUrl = new URL(BASE_URL);
returnUrl.searchParams.set('pressure_gate', '');
returnUrl.searchParams.set('devui', '');
returnUrl.searchParams.set('seeker', WALLET);
returnUrl.searchParams.set('session_id', SESSION_ID);
returnUrl.searchParams.set('event', 'signin');

await page.goto(returnUrl.toString(), { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

const result = await page.evaluate(() => {
  const steps = window.__stepLog || [];
  const keepGoingButton = [...document.querySelectorAll('button')]
    .find((button) => button.textContent?.includes('KEEP GOING'));
  const currentUrl = new URL(window.location.href);
  return {
    state: document.querySelector('[data-oracle-state]')?.getAttribute('data-oracle-state') || null,
    walletGateVisible: Boolean(keepGoingButton),
    urlHasWalletReturn: ['seeker', 'wallet', 'address', 'event', 'session_id']
      .some((key) => currentUrl.searchParams.has(key)),
    wallet: localStorage.getItem('oracle_seeker_key'),
    walletSigned: localStorage.getItem('oracle_wallet_signed'),
    activeSession: localStorage.getItem('oracle_active_session_id'),
    steps,
    runtimeErrors: window.__oracle_runtimeErrors || [],
  };
});

const returnSteps = result.steps.filter((step) => step.label.includes('WALLET RETURN DETECTED'));
const signedSteps = result.steps.filter((step) => step.label.includes('WALLET SIGNED — ALLEY RETURN ENABLED'));

check(result.state === 'oracle', 'restored Oracle session', `state=${result.state}`);
check(!result.walletGateVisible, 'no free-session wallet gate after return');
check(!result.urlHasWalletReturn, 'wallet return parameters removed');
check(result.wallet === WALLET, 'wallet identity restored', result.wallet || 'missing');
check(result.walletSigned === 'true', 'wallet signed marker persisted');
check(result.activeSession === SESSION_ID, 'active session restored', result.activeSession || 'missing');
check(returnSteps.length === 1, 'wallet return processed once', `count=${returnSteps.length}`);
check(signedSteps.length === 1, 'wallet sign activation emitted once', `count=${signedSteps.length}`);
check(functionRequests.some((request) => request.action === 'get'), 'IP check requested existing record');
check(functionRequests.some((request) => request.action === 'upsert'), 'wallet state upsert requested');
check(result.runtimeErrors.length === 0, 'no runtime errors', `count=${result.runtimeErrors.length}`);
check(consoleErrors.filter((line) => !line.includes('401')).length === 0, 'no unexpected browser errors');

console.log(`\nWallet return pressure: ${pass.length} passed, ${fail.length} failed`);
if (fail.length) {
  console.log('\nFailure details:');
  fail.forEach((label) => console.log(`  - ${label}`));
  console.log('\nObserved state:');
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
  process.exitCode = 1;
} else {
  await browser.close();
}