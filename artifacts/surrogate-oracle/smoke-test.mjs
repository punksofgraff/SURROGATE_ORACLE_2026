/**
 * Smoke test: "Alley Comes Alive" state machine
 *
 * Tests the full 4-phase flow:
 *   dormant → terminal → awakened → (oracle skipped — needs Decart backend)
 *
 * Run: node smoke-test.mjs
 */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Helpers ──────────────────────────────────────────────────────────────────

const PASS = (msg) => console.log(`  ✅  ${msg}`);
const FAIL = (msg) => { console.error(`  ❌  ${msg}`); process.exitCode = 1; };
const INFO = (msg) => console.log(`  ℹ️   ${msg}`);

async function screenshot(page, name) {
  const p = `/tmp/smoke-${name}.png`;
  await page.screenshot({ path: p, fullPage: false });
  INFO(`Screenshot → ${p}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const BASE = 'http://localhost:5173';
const TIMEOUT = 8000;

async function run() {
  console.log('\n🔬  SURROGATE:ORACLE — Smoke Test\n');

  // Use nix-store playwright-bundled chromium — all libs satisfied in this environment
  const CHROME = '/nix/store/0n9rl5l9syy808xi9bk4f6dhnfrvhkww-playwright-browsers-chromium/chromium-1080/chrome-linux/chrome';
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    // Stub audio so the radio stream never blocks
    permissions: [],
  });
  const page = await ctx.newPage();

  // Capture console errors
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  // ── TEST 1: App loads ─────────────────────────────────────────────────────
  console.log('TEST 1 — App loads and lands in DORMANT phase');
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(async (e) => {
    FAIL(`Page failed to load: ${e.message}`);
    await browser.close();
    process.exit(1);
  });

  // data-oracle-state should be "dormant"
  const initialState = await page.getAttribute('.oracle-stage', 'data-oracle-state');
  if (initialState === 'dormant') {
    PASS(`data-oracle-state = "dormant" on load`);
  } else {
    FAIL(`Expected "dormant" on load, got "${initialState}" — auto-awakening still happening!`);
  }

  // CTA text visible
  const ctaVisible = await page.isVisible('.ghost-tx--cta');
  if (ctaVisible) {
    PASS('Dormant CTA (.ghost-tx--cta) is visible');
  } else {
    INFO('Dormant CTA not found yet (randomly typed) — checking for GhostText generally');
    const ghostVisible = await page.isVisible('.ghost-tx');
    if (ghostVisible) PASS('Ghost transmissions are visible ✓');
    else FAIL('No ghost transmissions or CTA found');
  }

  // Title should NOT be typed yet
  const titleText = await page.textContent('.oracle-title').catch(() => '');
  if (!titleText || titleText.trim() === '') {
    PASS('Title typewriter has NOT started (correct — waiting for terminal phase)');
  } else {
    FAIL(`Title typewriter started prematurely: "${titleText.trim()}"`);
  }

  await screenshot(page, '01-dormant');

  // ── TEST 1b: Verify GhostText components ────────────────────────────────
  const ghostTexts = await page.$$('.ghost-tx');
  if (ghostTexts.length > 0) PASS(`${ghostTexts.length} ghost transmission(s) active ✓`);
  else FAIL('No ghost transmissions found');

  // ── TEST 2: Wait 1.5s — confirm still dormant (no auto-awaken) ────────────
  console.log('\nTEST 2 — Still DORMANT after 1.5s (no auto-awaken)');
  await page.waitForTimeout(1500);
  const stateAfterWait = await page.getAttribute('.oracle-stage', 'data-oracle-state');
  if (stateAfterWait === 'dormant') {
    PASS('Still dormant after 1.5s — auto-awaken is gone ✓');
  } else {
    FAIL(`Auto-advanced to "${stateAfterWait}" without user interaction!`);
  }

  // ── TEST 3: User taps the cabinet → TERMINAL phase ───────────────────────
  console.log('\nTEST 3 — Click cabinet → TERMINAL phase starts');
  await page.click('.oracle-center');

  // Should transition quickly
  await page.waitForFunction(
    () => document.querySelector('.oracle-stage')?.getAttribute('data-oracle-state') === 'terminal',
    { timeout: TIMEOUT }
  ).catch(() => {});

  const terminalState = await page.getAttribute('.oracle-stage', 'data-oracle-state');
  if (terminalState === 'terminal') {
    PASS('data-oracle-state = "terminal" after tap ✓');
  } else {
    FAIL(`Expected "terminal" after tap, got "${terminalState}"`);
  }

  // ── TEST 4: Lore lines appear in the cabinet ──────────────────────────────
  console.log('\nTEST 4 — Lore terminal lines typing in cabinet');
  // Wait for at least the first lore line to appear
  const firstLoreVisible = await page.waitForSelector(
    '.oracle-lore-line', { timeout: TIMEOUT }
  ).then(() => true).catch(() => false);

  if (firstLoreVisible) {
    PASS('First lore line visible in cabinet ✓');
  } else {
    FAIL('Lore terminal never appeared in cabinet');
  }

  // Wait for more lines (2+ seconds into lore)
  await page.waitForTimeout(2500);
  await screenshot(page, '03-terminal-lore-playing');

  // Skip lore — force click because the avatar wrapper may intercept
  await page.evaluate(() => {
    const el = document.querySelector('.oracle-terminal-overlay');
    if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  INFO('Dispatched click to lore overlay to skip');

  // ── TEST 5: Auto-advance to AWAKENED after lore completes ────────────────
  console.log('\nTEST 5 — Auto-advance to AWAKENED phase after lore skip');
  await page.waitForFunction(
    () => {
      const s = document.querySelector('.oracle-stage')?.getAttribute('data-oracle-state');
      return s === 'awakened' || s === 'oracle';
    },
    { timeout: 15000 }
  ).catch(() => {});

  const awakenedState = await page.getAttribute('.oracle-stage', 'data-oracle-state');
  if (awakenedState === 'awakened' || awakenedState === 'oracle') {
    PASS(`data-oracle-state = "${awakenedState}" — lore advanced correctly ✓`);
  } else {
    FAIL(`Still in "${awakenedState}" — lore sequence did not advance to awakened`);
  }

  // ── TEST 5b: Lore Completion Tracking (The Ticker) ──────────────────────
  console.log('\nTEST 5b — Verify lore completion ticker');
  // Wait a moment for async markLoreCompleted (Supabase call) to finish
  await page.waitForTimeout(1000);
  const loreCompleted = await page.evaluate(() => {
    // We can't easily know the IP here, so we check if any key matching the pattern exists
    for (let i = 0; i < localStorage.length; i++) {
      if (localStorage.key(i).startsWith('surrogate_lore_completed_')) return true;
    }
    return false;
  });
  if (loreCompleted) {
    PASS('Lore completion marker found in localStorage ✓');
  } else {
    FAIL('Lore completion marker NOT found after finishing/skipping lore');
  }

  await screenshot(page, '04-awakened');

  // ── TEST 5c: Returning Seeker Routing (Agnostic Path) ───────────────────
  console.log('\nTEST 5c — Returning Seeker Routing (Lore Completed)');
  // We'll simulate a return trip by manually injecting the keys and reloading
  // (In headless/CI, IP-based detection can be flaky due to network sandboxing)
  await page.evaluate(() => {
    localStorage.setItem('surrogate_visited_smoke_ip', 'true');
    localStorage.setItem('surrogate_lore_completed_smoke_ip', 'true');
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  
  // Should show wallet connect
  await page.waitForSelector('text=CONNECT CHAIN FUELZ WALLET', { timeout: 15000 });
  const buttonText = await page.textContent('button:has-text("RETURN TO ALLEY"), button:has-text("PROCEED UNBOUND")');
  if (buttonText === 'RETURN TO ALLEY') {
    PASS('Wallet overlay shows "RETURN TO ALLEY" for completed lore Seeker ✓');
  } else {
    FAIL(`Expected "RETURN TO ALLEY", got "${buttonText}"`);
  }

  // Click it — should go straight to awakened (knives)
  await page.click('button:has-text("RETURN TO ALLEY")');
  await page.waitForTimeout(1000);
  const routingState = await page.getAttribute('.oracle-stage', 'data-oracle-state');
  if (routingState === 'awakened' || routingState === 'oracle') {
    PASS(`Released to "${routingState}" (knives) — bypassed lore archive correctly ✓`);
  } else {
    FAIL(`Expected skip to awakened/oracle, but got state: "${routingState}"`);
  }

  // ── TEST 6: Branding typewriter starts in awakened phase ─────────────────
  console.log('\nTEST 6 — Branding typewriter starts in AWAKENED phase');
  await page.waitForFunction(
    () => (document.querySelector('.oracle-title')?.textContent?.length ?? 0) > 0,
    { timeout: 5000 }
  ).catch(() => {});

  const titleInAwakened = await page.textContent('.oracle-title').catch(() => '');
  if (titleInAwakened && titleInAwakened.trim().length > 0) {
    PASS(`Title typewriter started: "${titleInAwakened.trim()}" ✓`);
  } else {
    FAIL('Title typewriter did NOT start in awakened phase');
  }

  // Boot sequence should appear (INITIALIZING NEURAL LINK or similar)
  const bootVisible = await page.isVisible('text=INITIALIZING NEURAL LINK').catch(() => false)
    || await page.isVisible('text=DECRYPTING ORACLE AVATAR').catch(() => false)
    || await page.isVisible('text=ESTABLISHING WEB_RTC').catch(() => false);
  if (bootVisible) {
    PASS('Boot sequence (technical connect lines) visible in cabinet ✓');
  } else {
    INFO('Boot sequence not visible (may have already completed or Decart env missing — OK)');
  }

  await screenshot(page, '05-awakened-typewriter');

  // ── TEST 6b: Select a knife → ORACLE phase ───────────────────────────────
  console.log('\nTEST 6b — Select a knife → ORACLE phase starts');
  // Wait for knife cards to appear (they have a 2.2s delay in the code)
  await page.waitForSelector('.oracle-knife-card', { timeout: 10000 });
  await page.click('.oracle-knife-card:first-child');

  await page.waitForFunction(
    () => document.querySelector('.oracle-stage')?.getAttribute('data-oracle-state') === 'oracle',
    { timeout: TIMEOUT }
  ).catch(() => {});

  const finalPhase = await page.getAttribute('.oracle-stage', 'data-oracle-state');
  if (finalPhase === 'oracle') {
    PASS('data-oracle-state = "oracle" after knife selection ✓');
  } else {
    FAIL(`Expected "oracle" after knife selection, got "${finalPhase}"`);
  }

  // Conversation panel should be visible
  const ocVisible = await page.isVisible('.oc-panel-v2');
  if (ocVisible) {
    PASS('OracleConversation panel (.oc-panel-v2) is visible ✓');
  } else {
    FAIL('OracleConversation panel not found in oracle phase');
  }

  await screenshot(page, '06-oracle-phase');

  // ── TEST 7: Confirm no JS errors during the whole flow ───────────────────
  console.log('\nTEST 7 — No console errors throughout');
  const relevantErrors = consoleErrors.filter(e =>
    !e.includes('Failed to load resource') &&
    !e.includes('net::ERR') &&
    !e.includes('supabase') &&
    !e.includes('VITE_SUPABASE') &&
    !e.includes('Decart') &&
    !e.includes('WebRTC') &&
    !e.includes('[Mic]') &&                        // no mic hardware in headless CI
    !e.includes('Requested device not found') &&   // headless: no mic/camera
    !e.includes('Permission denied')               // headless: no media permissions
  );
  if (relevantErrors.length === 0) {
    PASS('No unexpected JS errors ✓');
  } else {
    FAIL(`Console errors detected:\n    ${relevantErrors.join('\n    ')}`);
  }

  // ── BACKEND PANEL TESTS ───────────────────────────────────────────────────
  await testBackendPanel(page, consoleErrors, screenshot);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────────────');
  if (process.exitCode === 1) {
    console.log('❌  Some tests FAILED — see above\n');
  } else {
    console.log('✅  All smoke tests PASSED\n');
  }

  await browser.close();
}

// ── Backend Panel smoke tests ─────────────────────────────────────────────────
async function testBackendPanel(page, consoleErrors, screenshot) {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('BACKEND PANEL TESTS — ENCULTURATE CRATE');
  console.log('═══════════════════════════════════════════════════');

  // ── BP-SETUP: Inject dev session so panel is accessible without real auth ─
  await page.evaluate(() => {
    localStorage.setItem('dev_user_session', JSON.stringify({
      id: 'smoke-test-user-001',
      email: 'smoke@test.io',
    }));
  });
  await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
  INFO('Dev session injected — reloaded page');

  // ── BP-TEST 1: EnculturateCrate exists and is reachable after awakening ───
  console.log('\nBP-TEST 1 — EnculturateCrate present and clickable after awakening');

  // Re-run the awakening flow: tap → terminal → skip lore → select knife
  await page.click('.oracle-center');
  await page.waitForSelector('.oracle-terminal-overlay');
  await page.click('.oracle-terminal-overlay'); // Skip lore
  
  await page.waitForSelector('.oracle-knife-card', { timeout: 10000 });
  await page.click('.oracle-knife-card:first-child'); // Select knife

  await page.waitForFunction(
    () => document.querySelector('.oracle-stage')?.getAttribute('data-oracle-state') === 'oracle',
    { timeout: 20000 }
  ).catch(() => {});

  const phaseForCrate = await page.getAttribute('.oracle-stage', 'data-oracle-state');
  if (phaseForCrate === 'oracle') {
    PASS(`Scene phase = "${phaseForCrate}" — EnculturateCrate should be lit up ✓`);
  } else {
    FAIL(`Scene phase "${phaseForCrate}" — expected oracle for crate test`);
  }

  const crateVisible = await page.isVisible('[data-testid="enculturate-crate"]');
  if (crateVisible) {
    PASS('EnculturateCrate [data-testid="enculturate-crate"] is visible ✓');
  } else {
    FAIL('EnculturateCrate not found — data-testid="enculturate-crate" missing');
  }

  // ── BP-TEST 2: Click crate → panel opens ─────────────────────────────────
  console.log('\nBP-TEST 2 — Click EnculturateCrate → BackendControlPanel opens');
  
  // Dismiss any error toasts that might overlap the crate
  await page.click('.oracle-close-btn').catch(() => {});
  await page.waitForTimeout(300);

  await page.click('[data-testid="enculturate-crate"]');
  await page.waitForTimeout(600); // allow panel entrance animation

  const panelVisible = await page.isVisible('[data-testid="backend-panel"]');
  if (panelVisible) {
    PASS('BackendControlPanel [data-testid="backend-panel"] opened ✓');
  } else {
    FAIL('BackendControlPanel did not open after clicking EnculturateCrate');
    return; // no point continuing panel tests without the panel
  }

  await screenshot(page, '06-backend-panel-open');

  // ── BP-TEST 3: All 6 tabs are rendered ────────────────────────────────────
  console.log('\nBP-TEST 3 — All 6 tabs present');
  const EXPECTED_TABS = ['vault', 'squad', 'portraits', 'decart', 'gemini', 'dev'];
  for (const tab of EXPECTED_TABS) {
    const tabEl = await page.isVisible(`[data-testid="tab-${tab}"]`);
    if (tabEl) {
      PASS(`Tab "${tab}" [data-testid="tab-${tab}"] present ✓`);
    } else {
      FAIL(`Tab "${tab}" [data-testid="tab-${tab}"] NOT found`);
    }
  }

  // ── BP-TEST 4: VAULT tab renders coin display ─────────────────────────────
  console.log('\nBP-TEST 4 — VAULT tab renders neural vault content');
  // VAULT should be the default active tab
  const vaultContent = await page.isVisible('text=NEURAL VAULT').catch(() => false)
    || await page.isVisible('text=VAULT').catch(() => false)
    || await page.isVisible('text=Culture Coins').catch(() => false);
  if (vaultContent) {
    PASS('Vault/coin content visible on VAULT tab ✓');
  } else {
    // Try clicking the vault tab explicitly
    await page.click('[data-testid="tab-vault"]');
    await page.waitForTimeout(300);
    const vaultContentAfterClick = await page.isVisible('text=NEURAL VAULT').catch(() => false)
      || await page.isVisible('text=Culture Coins').catch(() => false);
    if (vaultContentAfterClick) {
      PASS('Vault content visible after clicking VAULT tab ✓');
    } else {
      FAIL('VAULT tab content did not render (no coin/vault text found)');
    }
  }

  // ── BP-TEST 5: SQUAD tab renders Learn2Earn interface ─────────────────────
  console.log('\nBP-TEST 5 — SQUAD tab renders Learn2Earn interface');
  await page.click('[data-testid="tab-squad"]');
  // AnimatePresence mode="wait" means we need to wait for exit+enter animations
  // Learn2EarnInterface renders sub-tabs: COINS, TIERS, MISSION, README
  const squadFound = await page.waitForSelector(
    'button:has-text("TIERS"), button:has-text("MISSION"), button:has-text("README")',
    { timeout: 3000 }
  ).then(() => true).catch(() => false);
  if (squadFound) {
    PASS('Learn2Earn interface sub-tabs (TIERS/MISSION/README) visible in SQUAD tab ✓');
  } else {
    // Fallback: check for any Learn2Earn text content
    const squadFallback = await page.isVisible('text=CONSCIOUSNESS TIERS').catch(() => false)
      || await page.isVisible('text=HOW TO EARN').catch(() => false)
      || await page.isVisible('text=MULTIPLIERS').catch(() => false);
    if (squadFallback) {
      PASS('SQUAD tab rendered Learn2Earn content (via fallback text check) ✓');
    } else {
      FAIL('SQUAD tab did not render Learn2EarnInterface content');
    }
  }

  // Also verify ElevenLabs is gone
  await page.click('[data-testid="tab-squad"]');
  await page.waitForTimeout(500);
  // Navigate to README sub-tab inside Learn2Earn to check tech stack
  const readmeBtn = await page.isVisible('button:has-text("README")').catch(() => false);
  if (readmeBtn) {
    await page.click('button:has-text("README")');
    await page.waitForTimeout(300);
  }
  const elevenLabsPresent = await page.isVisible('text=ElevenLabs').catch(() => false);
  if (!elevenLabsPresent) {
    PASS('ElevenLabs reference is GONE from SQUAD/Learn2Earn ✓');
  } else {
    FAIL('ElevenLabs still present in SQUAD tab — stale reference not removed');
  }

  // ── BP-TEST 6: NEURAL PRINTS tab renders portrait gallery ─────────────────
  console.log('\nBP-TEST 6 — NEURAL PRINTS tab renders portrait gallery');
  await page.click('[data-testid="tab-portraits"]');
  await page.waitForTimeout(500);
  const portraitsContent = await page.isVisible('text=PORTRAITS').catch(() => false)
    || await page.isVisible('text=NEURAL').catch(() => false)
    || await page.isVisible('[data-testid="portrait-gallery"]').catch(() => false);
  if (portraitsContent) {
    PASS('NEURAL PRINTS tab rendered portrait gallery content ✓');
  } else {
    INFO('NEURAL PRINTS tab content not found by text (may render differently — checking for no crash)');
    const panelStillOpen = await page.isVisible('[data-testid="backend-panel"]');
    if (panelStillOpen) PASS('Panel still open after clicking NEURAL PRINTS tab (no crash) ✓');
    else FAIL('Panel crashed on NEURAL PRINTS tab click');
  }

  // ── BP-TEST 7: DECART LIVE tab renders diagnostics ────────────────────────
  console.log('\nBP-TEST 7 — DECART LIVE tab renders stream diagnostics');
  await page.click('[data-testid="tab-decart"]');
  await page.waitForTimeout(400);
  const decartContent = await page.isVisible('text=DECART').catch(() => false)
    || await page.isVisible('text=STREAM').catch(() => false)
    || await page.isVisible('text=CONNECTION').catch(() => false);
  if (decartContent) {
    PASS('DECART LIVE tab rendered diagnostics content ✓');
  } else {
    INFO('DECART LIVE content not found by text — checking panel still open');
    const panelOk = await page.isVisible('[data-testid="backend-panel"]');
    if (panelOk) PASS('Panel still open after DECART LIVE tab (no crash) ✓');
    else FAIL('Panel crashed on DECART LIVE tab');
  }

  // ── BP-TEST 8: GEMINI LIVE tab renders WebSocket diagnostics ──────────────
  console.log('\nBP-TEST 8 — GEMINI LIVE tab renders WS diagnostics');
  await page.click('[data-testid="tab-gemini"]');
  await page.waitForTimeout(400);
  const geminiContent = await page.isVisible('text=GEMINI').catch(() => false)
    || await page.isVisible('text=WEBSOCKET').catch(() => false)
    || await page.isVisible('text=WS STATE').catch(() => false)
    || await page.isVisible('text=VERTEX').catch(() => false);
  if (geminiContent) {
    PASS('GEMINI LIVE tab rendered WS diagnostics content ✓');
  } else {
    INFO('GEMINI LIVE content not found by text — checking panel still open');
    const panelOk = await page.isVisible('[data-testid="backend-panel"]');
    if (panelOk) PASS('Panel still open after GEMINI LIVE tab (no crash) ✓');
    else FAIL('Panel crashed on GEMINI LIVE tab');
  }

  await screenshot(page, '07-gemini-live-tab');

  // ── BP-TEST 9: DEV tab — password gate + unlock ───────────────────────────
  console.log('\nBP-TEST 9 — DEV tab: password-gated access');
  await page.click('[data-testid="tab-dev"]');
  await page.waitForTimeout(400);

  const passwordInput = await page.isVisible('[data-testid="debug-password-input"]');
  if (passwordInput) {
    PASS('DEV tab shows password gate ✓');
  } else {
    FAIL('DEV tab password gate not found');
  }

  // Enter the dev password
  await page.fill('[data-testid="debug-password-input"]', '3nculturate!').catch(() => {});
  await page.click('[data-testid="debug-access-btn"]').catch(() => {});
  await page.waitForTimeout(400);

  const devContent = await page.isVisible('text=SUPABASE').catch(() => false)
    || await page.isVisible('text=EDGE FUNCTION').catch(() => false)
    || await page.isVisible('text=CHAINFUELZ').catch(() => false);
  if (devContent) {
    PASS('DEV tab unlocked — developer console content visible ✓');
  } else {
    FAIL('DEV tab did not unlock after correct password');
  }

  // Confirm D-ID is NOT in the dev panel
  const dIdPresent = await page.isVisible('text=d-id').catch(() => false)
    || await page.isVisible('text=D-ID').catch(() => false)
    || await page.isVisible('text=d-id-api-handler').catch(() => false);
  if (!dIdPresent) {
    PASS('D-ID reference is GONE from DEV tab ✓');
  } else {
    FAIL('D-ID / d-id-api-handler still present in DEV tab — stale reference not removed');
  }

  await screenshot(page, '08-dev-tab-unlocked');

  // ── BP-TEST 10: No new JS errors after panel interaction ──────────────────
  console.log('\nBP-TEST 10 — No new JS errors during backend panel interaction');
  const panelErrors = consoleErrors.filter(e =>
    !e.includes('Failed to load resource') &&
    !e.includes('net::ERR') &&
    !e.includes('supabase') &&
    !e.includes('VITE_SUPABASE') &&
    !e.includes('Decart') &&
    !e.includes('WebRTC') &&
    !e.includes('404') &&
    !e.includes('culture-coin')
  );
  // Filter to only errors that could be new (panel-related)
  const newErrors = panelErrors.filter(e =>
    e.toLowerCase().includes('panel') ||
    e.toLowerCase().includes('tab') ||
    e.toLowerCase().includes('vault') ||
    e.toLowerCase().includes('typeerror') ||
    e.toLowerCase().includes('cannot read') ||
    e.toLowerCase().includes('undefined')
  );
  if (newErrors.length === 0) {
    PASS('No JS errors from backend panel interaction ✓');
  } else {
    FAIL(`Panel-related JS errors:\n    ${newErrors.join('\n    ')}`);
  }

  console.log('\n── Backend Panel Tests Complete ──────────────────');
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
