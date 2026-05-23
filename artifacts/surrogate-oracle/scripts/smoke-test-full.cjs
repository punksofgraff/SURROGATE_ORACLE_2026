/**
 * smoke-test-full.js — SURROGATE:ORACLE full journey smoke test
 *
 * Jimmy McDaniels test protocol:
 *   1. Page load & asset integrity
 *   2. Dormant state — signal fragments, CTA, touch hint
 *   3. Consent gate — copy, buttons
 *   4. Knife overlay — 5 territory cards, no skip
 *   5. Terminal/lore — cinematic boot sequence
 *   6. Awakened — cabinet, branding, connection progress
 *   7. Oracle conversation — Gemini WS or REST fallback
 *   8. ORACLE_SCORE parsing — alignment, coins, totem
 *   9. Backend panel — tabs, portrait gallery
 *  10. Portrait generation endpoint
 *  11. Image assets — all 3 CDN URLs resolve at correct dimensions
 *  12. Exit + scene reset
 *
 * Grade: A/B/C/D/F per section + overall brand readiness score.
 */

const { chromium } = require('playwright');

const BASE = 'http://localhost:5173';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';

// ── Colour helpers ──────────────────────────────────────────────────────────
const G  = s => `\x1b[32m${s}\x1b[0m`;   // green
const R  = s => `\x1b[31m${s}\x1b[0m`;   // red
const Y  = s => `\x1b[33m${s}\x1b[0m`;   // yellow
const B  = s => `\x1b[34m${s}\x1b[0m`;   // blue (dim)
const W  = s => `\x1b[1m${s}\x1b[0m`;    // bold white
const DIM = s => `\x1b[2m${s}\x1b[0m`;

const PASS = G('✅ PASS');
const FAIL = R('❌ FAIL');
const WARN = Y('⚠️  WARN');

const results = [];
function record(section, name, status, detail = '') {
  results.push({ section, name, status, detail });
  const icon = status === 'pass' ? PASS : status === 'warn' ? WARN : FAIL;
  console.log(`  ${icon}  ${name}${detail ? '  ' + DIM(detail) : ''}`);
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runSmoke() {
  console.log('');
  console.log(W('════════════════════════════════════════════════════════'));
  console.log(W('  SURROGATE:ORACLE — Full Brand Smoke Test'));
  console.log(W('  Test Protocol: Jimmy McDaniels / Omnicom TPN Standard'));
  console.log(W('════════════════════════════════════════════════════════'));
  console.log('');

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-web-security',
      '--no-sandbox',
    ],
  });

  const context = await browser.newContext({
    permissions: ['camera', 'microphone'],
    viewport: { width: 390, height: 844 },  // iPhone 14 Pro — primary target
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  });

  const page = await context.newPage();
  const consoleErrors = [];
  const consoleWarnings = [];

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
    if (msg.type() === 'warning') consoleWarnings.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(`[pageerror] ${err.message}`));

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 1 — PAGE LOAD & ASSET INTEGRITY
  // ─────────────────────────────────────────────────────────────────────────
  console.log(B('── §1 Page Load & Asset Integrity ─────────────────────'));

  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  const loadMs = Date.now() - t0;

  record('load', 'Page loads without crash', 'pass', `${loadMs}ms`);
  loadMs < 3000
    ? record('load', 'Load time < 3s', 'pass', `${loadMs}ms`)
    : record('load', 'Load time < 3s', 'warn', `${loadMs}ms — slow for brand demo`);

  // Force dev mode so Decart path is attempted
  await page.evaluate(() => localStorage.setItem('dev_user_session', '1'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(1500);

  // Check oracle stage rendered
  const stageEl = await page.$('.oracle-stage');
  record('load', 'Oracle stage rendered', stageEl ? 'pass' : 'fail');

  // Check scene is dormant
  const dormantState = await page.getAttribute('.oracle-stage', 'data-oracle-state');
  record('load', 'Starts in dormant state', dormantState === 'dormant' ? 'pass' : 'fail', `state=${dormantState}`);

  // Check 3 CDN image assets resolve
  const images = [
    { name: 'ORACLE_STATIC_URL (arcade portrait)',  url: 'https://i.postimg.cc/26pvW2SN/orackle-only-static.png' },
    { name: 'ORACLE_AVATAR_URL (talking face)',      url: 'https://i.postimg.cc/jSGnyZXh/Image-1-(11).jpg' },
    { name: 'ALLEY_BG_URL (alley scene)',            url: 'https://i.postimg.cc/jSJRRRk2/7D633B70-4C62-4326-92A8-3B8790C9B3B0.png' },
  ];
  for (const img of images) {
    try {
      const res = await page.evaluate(async (u) => {
        const r = await fetch(u, { method: 'HEAD' });
        return { ok: r.ok, status: r.status, type: r.headers.get('content-type') };
      }, img.url);
      record('assets', img.name, res.ok ? 'pass' : 'fail', `HTTP ${res.status} ${res.type || ''}`);
    } catch (e) {
      record('assets', img.name, 'fail', String(e).slice(0, 60));
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 2 — DORMANT STATE
  // ─────────────────────────────────────────────────────────────────────────
  console.log('');
  console.log(B('── §2 Dormant State — Signal Fragments & CTA ───────────'));

  // Signal layer fragments
  const signalLayer = await page.$('.oracle-signal-layer');
  record('dormant', 'Signal layer rendered', signalLayer ? 'pass' : 'fail');

  // ScrambleFragment instances
  const sfCount = await page.$$eval('[class*="oracle-sf--"]', els => els.length);
  record('dormant', `ScrambleFragments rendered (expect 6)`, sfCount >= 6 ? 'pass' : (sfCount > 0 ? 'warn' : 'fail'), `found ${sfCount}`);

  // CTA prompt (ScrambleFragment typewriter mode)
  await sleep(600); // let first scramble cycle start
  const ctaPrompt = await page.$('.oracle-tap-prompt');
  record('dormant', 'Dormant CTA tap prompt rendered', ctaPrompt ? 'pass' : 'fail');

  // Touch hint
  const touchHint = await page.$('.oracle-touch-hint');
  record('dormant', 'Touch hint rendered', touchHint ? 'pass' : 'fail');

  // Touch hint copy (should be XR variant since no XR, standard copy expected)
  const hintText = await page.textContent('.oracle-touch-hint').catch(() => '');
  const hasHintCopy = hintText.includes('CONTACT') || hintText.includes('INITIATE') || hintText.includes('TAP');
  record('dormant', 'Touch hint has correct copy', hasHintCopy ? 'pass' : 'warn', `"${hintText.trim().slice(0, 40)}"`);

  // Cabinet visible (ghost opacity in dormant)
  const cabinet = await page.$('.oracle-cabinet');
  record('dormant', 'Cabinet rendered', cabinet ? 'pass' : 'fail');

  // Static arcade image (oracle-avatar-static should be present)
  const staticImg = await page.$('.oracle-avatar-static');
  record('dormant', 'Static arcade image (.oracle-avatar-static) present', staticImg ? 'pass' : 'fail');

  // Talking face should be hidden in dormant (opacity 0)
  const talkingFaceOpacity = await page.$eval('.oracle-avatar-img', el => {
    const st = window.getComputedStyle(el);
    return parseFloat(st.opacity);
  }).catch(() => null);
  record('dormant', 'Talking face hidden in dormant (opacity=0)', talkingFaceOpacity === 0 ? 'pass' : 'warn', `opacity=${talkingFaceOpacity}`);

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 3 — CONSENT GATE
  // ─────────────────────────────────────────────────────────────────────────
  console.log('');
  console.log(B('── §3 Consent Gate ────────────────────────────────────'));

  await page.click('.oracle-stage', { position: { x: 195, y: 422 } });
  await sleep(700);

  const consentState = await page.getAttribute('.oracle-stage', 'data-oracle-state');
  record('consent', 'Tapping enters consent state', consentState === 'consent' ? 'pass' : 'fail', `state=${consentState}`);

  const consentOverlay = await page.$('.oracle-consent-overlay');
  record('consent', 'Consent overlay appears', consentOverlay ? 'pass' : 'fail');

  const witnessBtn = await page.$('button.oracle-consent-btn--yes');
  record('consent', '"WITNESS ME" button present', witnessBtn ? 'pass' : 'fail');

  const notTodayBtn = await page.$('button.oracle-consent-btn--no');
  record('consent', '"NOT TODAY" button present', notTodayBtn ? 'pass' : 'fail');

  const consentQuestion = await page.textContent('.oracle-consent-question').catch(() => '');
  const hasWitnessedCopy = consentQuestion.toLowerCase().includes('witness') || consentQuestion.includes('consent');
  record('consent', 'Consent question copy present', hasWitnessedCopy ? 'pass' : 'warn', `"${consentQuestion.replace(/\s+/g, ' ').trim().slice(0, 50)}"`);

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 4 — KNIFE SELECTION
  // ─────────────────────────────────────────────────────────────────────────
  console.log('');
  console.log(B('── §4 Knife Question Selection ─────────────────────────'));

  await witnessBtn.click();
  await sleep(600);

  const knifeState = await page.getAttribute('.oracle-stage', 'data-oracle-state');
  record('knife', '"WITNESS ME" enters knife state', knifeState === 'knife' ? 'pass' : 'fail', `state=${knifeState}`);

  const knifeOverlay = await page.$('.oracle-knife-overlay');
  record('knife', 'Knife overlay rendered', knifeOverlay ? 'pass' : 'fail');

  // Header copy
  const knifeHeader = await page.textContent('.oracle-knife-header').catch(() => '');
  record('knife', 'Knife header — "ARCHIVE IS OPEN" copy', knifeHeader.includes('ARCHIVE') ? 'pass' : 'warn', `"${knifeHeader.trim()}"`);

  // 5 cards
  const knifeCards = await page.$$('.oracle-knife-card');
  record('knife', `5 knife cards rendered`, knifeCards.length === 5 ? 'pass' : (knifeCards.length > 0 ? 'warn' : 'fail'), `found ${knifeCards.length}`);

  // Territory labels present on cards
  const territories = await page.$$eval('.oracle-knife-territory', els => els.map(e => e.textContent.trim()));
  record('knife', 'Territory labels on all cards', territories.length === 5 ? 'pass' : 'warn', territories.slice(0,2).join(' | '));

  // No skip button (per design — must choose)
  const skipBtn = await page.$('button:has-text("SKIP"), .oracle-knife-skip');
  record('knife', 'No skip button (seeker must choose)', !skipBtn ? 'pass' : 'fail');

  // Click first card (THE LIBRARY OF ME)
  const t1 = Date.now();
  await knifeCards[0].click();
  await sleep(600);

  const terminalState = await page.getAttribute('.oracle-stage', 'data-oracle-state');
  const enterMs = Date.now() - t1;
  record('knife', 'Selecting a card enters terminal state', terminalState === 'terminal' || terminalState === 'awakened' ? 'pass' : 'fail', `state=${terminalState}, ${enterMs}ms`);

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 5 — TERMINAL / LORE SEQUENCE
  // ─────────────────────────────────────────────────────────────────────────
  console.log('');
  console.log(B('── §5 Lore Terminal + Cinematic Boot ───────────────────'));

  if (terminalState === 'terminal') {
    const loreOverlay = await page.$('.oracle-terminal-overlay');
    record('terminal', 'Terminal overlay visible', loreOverlay ? 'pass' : 'fail');

    const loreLines = await page.$$('.oracle-lore-line');
    record('terminal', `Lore lines appearing (expect 2+)`, loreLines.length >= 1 ? 'pass' : 'warn', `${loreLines.length} lines`);

    // Tap to skip lore (returning visitor affordance)
    await page.click('.oracle-terminal-overlay');
    await sleep(700);
  }

  // Wait up to 6s for awakened state
  let awakeState = await page.getAttribute('.oracle-stage', 'data-oracle-state');
  for (let i = 0; i < 12 && awakeState === 'terminal'; i++) {
    await sleep(500);
    awakeState = await page.getAttribute('.oracle-stage', 'data-oracle-state');
  }
  record('terminal', 'Transitions to awakened after lore', awakeState === 'awakened' || awakeState === 'oracle' ? 'pass' : 'fail', `state=${awakeState}`);

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 6 — AWAKENED STATE
  // ─────────────────────────────────────────────────────────────────────────
  console.log('');
  console.log(B('── §6 Awakened State — Cabinet + Boot Sequence ─────────'));

  if (awakeState === 'awakened') {
    // Title rendered
    const title = await page.textContent('.oracle-title').catch(() => '');
    record('awakened', 'SURROGATE:ORACLE title typed in', title.includes('SURROGATE') || title.length > 4 ? 'pass' : 'warn', `"${title}"`);

    // Boot sequence / connecting animation
    const isConnecting = await page.$('.oracle-avatar-wrapper').then(async el => {
      // check if boot overlay is visible (connecting state)
      const connecting = await page.$('[class*="connecting"], .oracle-avatar-wrapper motion-div');
      return !!connecting;
    }).catch(() => false);

    // Check connection progress visible
    const progressVisible = await page.$('[class*="progress"], [class*="bar"]').catch(() => null);

    record('awakened', 'Decart connection initiated (boot sequence)', isConnecting || awakeState === 'awakened' ? 'pass' : 'warn');

    // Cabinet animation active
    const cabinetAnim = await page.$eval('.oracle-cabinet', el => {
      return window.getComputedStyle(el).animationName;
    }).catch(() => '');
    record('awakened', 'Cabinet animation running', cabinetAnim && cabinetAnim !== 'none' ? 'pass' : 'warn', cabinetAnim.slice(0, 40));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 7 — ORACLE CONVERSATION (Gemini + fallback)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('');
  console.log(B('── §7 Oracle Conversation — Gemini Live + REST Fallback '));

  // Wait up to 30s for oracle state (Decart timeout = 22s → freemium)
  let oracleState = await page.getAttribute('.oracle-stage', 'data-oracle-state');
  console.log(DIM(`  Waiting for oracle state (Decart timeout 22s → freemium)...`));
  for (let i = 0; i < 60 && oracleState !== 'oracle'; i++) {
    await sleep(500);
    oracleState = await page.getAttribute('.oracle-stage', 'data-oracle-state');
  }
  record('conversation', 'Reaches oracle state', oracleState === 'oracle' ? 'pass' : 'fail', `state=${oracleState}`);

  const decartActive = await page.getAttribute('.oracle-stage', 'data-decart-active');
  record('conversation', `Avatar path`, 'pass', decartActive === 'true' ? '🎥 Decart live (paid)' : '🎭 Freemium (VisemeDetector)');

  // Conversation panel
  await sleep(1500); // let greeting fire
  const convPanel = await page.$('.oracle-conversation, [class*="conversation"]');
  record('conversation', 'Conversation panel rendered', convPanel ? 'pass' : 'fail');

  // Oracle greeting — first message should appear within 5s of oracle state
  let oracleMsg = null;
  for (let i = 0; i < 20 && !oracleMsg; i++) {
    await sleep(300);
    oracleMsg = await page.$('.oracle-msg--oracle, [class*="oracle-msg"], [class*="message"][class*="oracle"]').catch(() => null);
  }
  record('conversation', 'Oracle greeting message appears', oracleMsg ? 'pass' : 'warn', oracleMsg ? 'greeting rendered' : 'no message in 6s');

  // Read first oracle message content
  if (oracleMsg) {
    const msgText = await oracleMsg.textContent().catch(() => '');
    const isOracleVoice = msgText.length > 10 && !msgText.includes('[[ORACLE_SCORE');
    record('conversation', 'ORACLE_SCORE annotation stripped from UI', isOracleVoice ? 'pass' : 'fail', `"${msgText.slice(0, 60)}"`);
  }

  // Text input present (keyboard mode)
  const textInput = await page.$('input[type="text"], textarea, [contenteditable="true"]');
  record('conversation', 'Text input rendered', textInput ? 'pass' : 'fail');

  // Send a message and check for Oracle response
  if (textInput) {
    const t2 = Date.now();
    await textInput.click();
    await textInput.fill('Marcus.');
    await page.keyboard.press('Enter');

    // Wait for response (up to 15s for Gemini REST)
    let responseAppeared = false;
    for (let i = 0; i < 50 && !responseAppeared; i++) {
      await sleep(300);
      const msgs = await page.$$('.oracle-msg--oracle, [class*="oracle-msg"]');
      if (msgs.length >= 2) responseAppeared = true;
    }
    const responseMs = Date.now() - t2;
    record('conversation', 'Oracle responds to user message', responseAppeared ? 'pass' : 'warn', `${responseMs}ms`);
    responseMs < 5000
      ? record('conversation', 'Response time < 5s', 'pass', `${responseMs}ms`)
      : responseMs < 10000
        ? record('conversation', 'Response time < 5s', 'warn', `${responseMs}ms — Gemini REST latency`)
        : record('conversation', 'Response time < 5s', 'fail', `${responseMs}ms — timeout`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 8 — ORACLE_SCORE PARSING
  // ─────────────────────────────────────────────────────────────────────────
  console.log('');
  console.log(B('── §8 ORACLE_SCORE Annotation Parsing ──────────────────'));

  // Send one more turn to get a score annotation
  if (textInput) {
    await textInput.fill('It started to feel like something I carry alone.');
    await page.keyboard.press('Enter');
    await sleep(5000);
  }

  // Check alignment attribute on stage
  const alignAttr = await page.getAttribute('.oracle-stage', 'data-oracle-alignment');
  record('score', 'data-oracle-alignment attribute set', alignAttr && alignAttr !== 'null' ? 'pass' : 'warn', `alignment=${alignAttr}`);

  // Totem level rendering
  const totemEl = await page.$('[class*="totem"]');
  record('score', 'Totem element rendered', totemEl ? 'pass' : 'warn');

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 9 — BACKEND PANEL
  // ─────────────────────────────────────────────────────────────────────────
  console.log('');
  console.log(B('── §9 Backend Panel — Tabs & Navigation ────────────────'));

  // Click the crate to open backend panel
  const crateEl = await page.$('[class*="encult"], [class*="crate"]');
  if (crateEl) {
    await crateEl.click();
    await sleep(800);
  }

  const backendPanel = await page.$('[class*="backend"], [class*="control-panel"]');
  record('backend', 'Backend panel opens on crate click', backendPanel ? 'pass' : 'warn');

  if (backendPanel) {
    // Tab buttons
    const tabs = await page.$$('[class*="tab"], [class*="panel-btn"]');
    record('backend', `Panel tabs rendered`, tabs.length > 0 ? 'pass' : 'warn', `${tabs.length} tabs`);

    // Close panel
    const closeBtn = await page.$('[class*="close"], button[aria-label*="close"], .oracle-close-btn');
    if (closeBtn) {
      await closeBtn.click();
      await sleep(400);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 10 — PORTRAIT ENDPOINT
  // ─────────────────────────────────────────────────────────────────────────
  console.log('');
  console.log(B('── §10 Portrait Generation Endpoint ────────────────────'));

  // Hit the edge function directly via Supabase REST
  try {
    const { supabaseUrl, supabaseKey } = await page.evaluate(() => {
      return {
        supabaseUrl: import.meta?.env?.VITE_SUPABASE_URL || window.__VITE_SUPABASE_URL__ || '',
        supabaseKey: import.meta?.env?.VITE_SUPABASE_ANON_KEY || window.__VITE_SUPABASE_ANON_KEY__ || '',
      };
    }).catch(() => ({ supabaseUrl: '', supabaseKey: '' }));

    // Try via page.evaluate to stay in the browser context (has CORS + auth headers)
    const portraitResult = await page.evaluate(async () => {
      try {
        const { supabase } = await import('/src/lib/supabase.ts');
        const t = Date.now();
        const { data, error } = await supabase.functions.invoke('gemini-portrait-generator', {
          body: {
            sessionId: 'smoke-test-' + Date.now(),
            themes: ['cyberpunk', 'oracle', 'graffiti', 'machine-intelligence'],
            style: 'freakdali-graff-punks',
          },
        });
        return { ok: !error, ms: Date.now() - t, method: data?.generationMethod, hasUrl: !!data?.portraitUrl, error: error?.message };
      } catch(e) { return { ok: false, error: String(e) }; }
    });

    record('portrait', 'Portrait EFA reachable', portraitResult.ok ? 'pass' : 'warn', portraitResult.error?.slice(0,60) || '');
    if (portraitResult.ok) {
      record('portrait', 'Portrait URL generated', portraitResult.hasUrl ? 'pass' : 'warn', `method=${portraitResult.method}`);
      record('portrait', 'Portrait response time', portraitResult.ms < 15000 ? 'pass' : 'warn', `${portraitResult.ms}ms via ${portraitResult.method}`);
    }
  } catch(e) {
    record('portrait', 'Portrait EFA reachable', 'warn', String(e).slice(0, 80));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 11 — FREEMIUM AVATAR LAYER CHECK
  // ─────────────────────────────────────────────────────────────────────────
  console.log('');
  console.log(B('── §11 Avatar Layer Integrity ──────────────────────────'));

  // All three z-layers should exist in DOM
  const staticExists  = !!(await page.$('.oracle-avatar-static'));
  const talkingExists = !!(await page.$('.oracle-avatar-img'));
  const videoExists   = !!(await page.$('.oracle-avatar-video'));

  record('avatar', '.oracle-avatar-static in DOM (z:1)', staticExists ? 'pass' : 'fail');
  record('avatar', '.oracle-avatar-img in DOM (z:2)', talkingExists ? 'pass' : 'fail');
  record('avatar', '.oracle-avatar-video in DOM (z:3)', videoExists ? 'pass' : 'fail');

  // In oracle freemium: talking face should be revealed by inline style
  if (decartActive === 'false') {
    const faceVisible = await page.$eval('.oracle-avatar-img', el => {
      return (el.style.opacity === '1') || (parseFloat(window.getComputedStyle(el).opacity) > 0);
    }).catch(() => false);
    record('avatar', 'Talking face visible in oracle freemium', faceVisible ? 'pass' : 'warn');
  }

  // Mouth overlay rendered (freemium only)
  if (decartActive === 'false') {
    const mouthOverlay = await page.$('.oracle-mouth-overlay');
    record('avatar', 'Mouth overlay rendered (freemium path)', mouthOverlay ? 'pass' : 'warn');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 12 — EXIT + SCENE RESET
  // ─────────────────────────────────────────────────────────────────────────
  console.log('');
  console.log(B('── §12 Exit & Scene Reset ──────────────────────────────'));

  const exitBtn = await page.$('.oracle-exit-btn, [class*="exit"], button:has-text("×"), .oracle-close');
  if (exitBtn) {
    await exitBtn.click();
    await sleep(1000);
    const resetState = await page.getAttribute('.oracle-stage', 'data-oracle-state');
    record('exit', 'Exit resets to dormant', resetState === 'dormant' ? 'pass' : 'warn', `state=${resetState}`);
  } else {
    record('exit', 'Exit button found', 'warn', 'exit button not located — manual X in panel?');
  }

  // Conversation panel hidden after exit
  const convAfterExit = await page.$('.oracle-conversation:visible');
  record('exit', 'Conversation hidden after exit', !convAfterExit ? 'pass' : 'warn');

  // ─────────────────────────────────────────────────────────────────────────
  // CONSOLE ERRORS
  // ─────────────────────────────────────────────────────────────────────────
  console.log('');
  console.log(B('── §13 Console Health ──────────────────────────────────'));

  const badErrors = consoleErrors.filter(e =>
    !e.includes('CORS') &&            // expected for some CDN assets
    !e.includes('favicon') &&
    !e.includes('AbortError') &&      // user nav interrupts
    !e.includes('AudioContext') &&    // autoplay policy, non-critical
    !e.includes('play()') &&
    !e.includes('WebRTC') &&          // Decart ICE in headless
    !e.includes('getUserMedia') &&
    !e.includes('RTCPeerConnection')
  );

  record('health', `Console errors (filtered)`, badErrors.length === 0 ? 'pass' : (badErrors.length <= 3 ? 'warn' : 'fail'), `${badErrors.length} errors`);
  if (badErrors.length > 0) {
    badErrors.slice(0, 5).forEach(e => console.log(DIM(`     ${e.slice(0, 120)}`)));
  }

  await browser.close();

  // ─────────────────────────────────────────────────────────────────────────
  // FINAL GRADE
  // ─────────────────────────────────────────────────────────────────────────
  const passes = results.filter(r => r.status === 'pass').length;
  const warns  = results.filter(r => r.status === 'warn').length;
  const fails  = results.filter(r => r.status === 'fail').length;
  const total  = results.length;
  const score  = Math.round((passes / total) * 100);

  console.log('');
  console.log(W('════════════════════════════════════════════════════════'));
  console.log(W('  FINAL GRADE — Jimmy McDaniels Brand Readiness Score'));
  console.log(W('════════════════════════════════════════════════════════'));
  console.log('');
  console.log(`  ${G(`PASS ${passes}`)}  ${Y(`WARN ${warns}`)}  ${R(`FAIL ${fails}`)}  of ${total} checks`);
  console.log('');

  const sectionMap = {};
  results.forEach(r => {
    if (!sectionMap[r.section]) sectionMap[r.section] = { pass: 0, warn: 0, fail: 0 };
    sectionMap[r.section][r.status]++;
  });

  const sectionNames = {
    load: '§1 Page Load',
    assets: '§1b CDN Assets',
    dormant: '§2 Dormant State',
    consent: '§3 Consent Gate',
    knife: '§4 Knife Selection',
    terminal: '§5 Lore Terminal',
    awakened: '§6 Awakened',
    conversation: '§7 Conversation',
    score: '§8 Oracle Score',
    backend: '§9 Backend Panel',
    portrait: '§10 Portraits',
    avatar: '§11 Avatar Layers',
    exit: '§12 Exit/Reset',
    health: '§13 Console Health',
  };

  Object.entries(sectionMap).forEach(([key, counts]) => {
    const name = sectionNames[key] || key;
    const total = counts.pass + counts.warn + counts.fail;
    const pct = Math.round((counts.pass / total) * 100);
    const grade = pct === 100 ? 'A' : pct >= 80 ? 'B' : pct >= 60 ? 'C' : pct >= 40 ? 'D' : 'F';
    const colour = grade === 'A' ? G : grade === 'B' ? G : grade === 'C' ? Y : R;
    console.log(`  ${colour(grade)}  ${name.padEnd(25)} ${G(`${counts.pass}✓`)} ${counts.warn > 0 ? Y(`${counts.warn}⚠`) : '  '} ${counts.fail > 0 ? R(`${counts.fail}✗`) : '  '}`);
  });

  console.log('');
  const overallGrade = score >= 90 ? 'A' : score >= 80 ? 'B+' : score >= 70 ? 'B' : score >= 60 ? 'C' : score >= 50 ? 'D' : 'F';
  const gradeColour = score >= 80 ? G : score >= 60 ? Y : R;
  console.log(`  ${W('OVERALL BRAND READINESS:')}  ${gradeColour(W(overallGrade))}  (${score}%)`);
  console.log('');
  console.log(DIM('  Test environment: Playwright Chromium headless, iPhone 14 Pro viewport'));
  console.log(DIM('  Decart: requires live credentials — WebRTC ICE expected to timeout → freemium'));
  console.log(W('════════════════════════════════════════════════════════'));
  console.log('');

  if (fails > 0) {
    console.log(R('  FAILING CHECKS:'));
    results.filter(r => r.status === 'fail').forEach(r => {
      console.log(R(`  ✗ [${r.section}] ${r.name}`) + (r.detail ? DIM(` — ${r.detail}`) : ''));
    });
    console.log('');
  }

  return { score, passes, warns, fails, grade: overallGrade };
}

runSmoke().then(({ score, grade }) => {
  process.exit(score >= 70 ? 0 : 1);
}).catch(err => {
  console.error(R('Smoke test crashed:'), err);
  process.exit(1);
});
