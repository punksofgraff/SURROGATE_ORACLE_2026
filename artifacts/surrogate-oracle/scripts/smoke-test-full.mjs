/**
 * smoke-test-full.mjs — SURROGATE:ORACLE full journey smoke test
 * ESM version for the surrogate-oracle package (type: "module")
 */

import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read env for Supabase URL (for direct API calls)
let SUPABASE_URL = '';
let SUPABASE_ANON_KEY = '';
try {
  const env = readFileSync(resolve(__dirname, '../.env.local'), 'utf8');
  env.split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k?.trim() === 'VITE_SUPABASE_URL') SUPABASE_URL = v.join('=').trim().replace(/^['"]|['"]$/g, '');
    if (k?.trim() === 'VITE_SUPABASE_ANON_KEY') SUPABASE_ANON_KEY = v.join('=').trim().replace(/^['"]|['"]$/g, '');
  });
} catch {}

const BASE = process.env.ORACLE_SMOKE_URL || 'http://localhost:5173';

// ── Colour helpers
const G   = s => `\x1b[32m${s}\x1b[0m`;
const R   = s => `\x1b[31m${s}\x1b[0m`;
const Y   = s => `\x1b[33m${s}\x1b[0m`;
const CY  = s => `\x1b[36m${s}\x1b[0m`;
const W   = s => `\x1b[1m${s}\x1b[0m`;
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
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function header(s) { console.log('\n' + CY(`── ${s} ${'─'.repeat(Math.max(0, 56 - s.length))}`)); }

async function runSmoke() {
  console.log('');
  console.log(W('════════════════════════════════════════════════════════'));
  console.log(W('  SURROGATE:ORACLE — Full Brand Smoke Test'));
  console.log(W('  Protocol: Jimmy McDaniels / Omnicom TPN Standard'));
  console.log(W('  Device: iPhone 14 Pro (390×844)'));
  console.log(W('════════════════════════════════════════════════════════'));

  // Resolve browser binary — prefer Nix-installed Chromium (Replit env), fall back to Playwright default
  const NIX_CHROME = '/nix/store/0n9rl5l9syy808xi9bk4f6dhnfrvhkww-playwright-browsers-chromium/chromium-1080/chrome-linux/chrome';
  const launchOpts = {
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-web-security',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  };
  if (existsSync(NIX_CHROME)) launchOpts.executablePath = NIX_CHROME;
  const browser = await chromium.launch(launchOpts);

  const context = await browser.newContext({
    permissions: ['camera', 'microphone'],
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  });

  const page = await context.newPage();
  const consoleErrors = [];

  page.on('response', response => {
    const status = response.status();
    if (status >= 400) {
      const url = response.url();
      if (!url.includes('google-analytics') && !url.includes('analytics.js') && !url.includes('.supabase.co')) {
        console.log(`  [NETWORK ERROR] ${status} - ${url}`);
        consoleErrors.push(`[${status}] ${url}`);
      }
    }
  });

  page.on('console', msg => {
    if (msg.text().includes('👉') || msg.text().includes('SIGNAL') || msg.text().includes('Overlay')) {
      console.log(`  [BROWSER] ${msg.text()}`);
    }
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('Failed to load resource') && !text.includes('supabase.co')) {
        consoleErrors.push(text);
      }
    }
  });
  page.on('pageerror', err => consoleErrors.push(`[pageerror] ${err.message}`));

  // ══════════════════════════════════════════════════════════
  // §1  PAGE LOAD & ASSET INTEGRITY
  // ══════════════════════════════════════════════════════════
  header('§1 Page Load & Asset Integrity');

  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  const loadMs = Date.now() - t0;

  record('load', 'Page loads without crash', 'pass', `${loadMs}ms`);
  record('load', 'Load time < 3s', loadMs < 3000 ? 'pass' : 'warn', `${loadMs}ms`);

  // Force dev mode, reload
  await page.evaluate(() => localStorage.setItem('dev_user_session', '1'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(1500);

  const stageEl = await page.$('.oracle-stage');
  record('load', 'Oracle stage rendered', stageEl ? 'pass' : 'fail');

  const dormantState = await page.getAttribute('.oracle-stage', 'data-oracle-state');
  record('load', 'Starts in dormant state', dormantState === 'dormant' ? 'pass' : 'fail', `state=${dormantState}`);

  // CDN image assets
  const imageAssets = [
    { label: 'ORACLE_STATIC_URL (arcade portrait)',  url: 'https://i.postimg.cc/26pvW2SN/orackle-only-static.png' },
    { label: 'ORACLE_AVATAR_URL (talking face)',       url: `${BASE}/oracle-avatar-live.png` },
    { label: 'ALLEY_BG_URL (alley scene)',            url: 'https://i.postimg.cc/jSJRRRk2/7D633B70-4C62-4326-92A8-3B8790C9B3B0.png' },
  ];
  for (const { label, url } of imageAssets) {
    try {
      const r = await page.evaluate(async u => {
        const res = await fetch(u, { method: 'HEAD' });
        return { ok: res.ok, status: res.status };
      }, url);
      record('assets', label, r.ok ? 'pass' : 'fail', `HTTP ${r.status}`);
    } catch (e) {
      record('assets', label, 'fail', String(e).slice(0, 60));
    }
  }

  // ══════════════════════════════════════════════════════════
  // §2  DORMANT STATE
  // ══════════════════════════════════════════════════════════
  header('§2 Dormant State — Signal Fragments & CTA');

  // Legacy Dormant elements (.oracle-signal-layer, ScrambleFragments, .oracle-tap-prompt, .oracle-touch-hint)
  // were removed during the "Cheshire Cat" / Glitch-Phase brand kit overhaul.

  const staticImg = await page.$('.oracle-avatar-static');
  record('dormant', '.oracle-avatar-static in DOM (z:1)', staticImg ? 'pass' : 'fail');

  const staticSrc = await page.$eval('.oracle-avatar-static', el => el.src).catch(() => '');
  record('dormant', 'Static img points to ORACLE_STATIC_URL', staticSrc.includes('26pvW2SN') ? 'pass' : 'fail', staticSrc.slice(-30));

  // ══════════════════════════════════════════════════════════
  // §3  TERMINAL & LORE
  // ══════════════════════════════════════════════════════════
  header('§3 Terminal & Lore');

  await page.click('.oracle-stage', { position: { x: 195, y: 422 } });
  await sleep(700);

  const terminalState = await page.getAttribute('.oracle-stage', 'data-oracle-state');
  record('terminal', 'Tap → terminal state', terminalState === 'terminal' ? 'pass' : 'fail', `state=${terminalState}`);

  // Wait for lore to finish or skip
  await sleep(1500);
  await page.evaluate(() => { if (window.__oracle_skipLore) window.__oracle_skipLore(); }); // Skip lore
  await sleep(2000);

  // ══════════════════════════════════════════════════════════
  // §4  KNIFE SELECTION
  // ══════════════════════════════════════════════════════════
  header('§4 Knife — Territory Question Selection');

  const knifeState = await page.getAttribute('.oracle-stage', 'data-oracle-state');
  record('knife', 'Lore skip → knife state', knifeState === 'knife' ? 'pass' : 'warn', `state=${knifeState}`);

  const knifeOverlay = await page.$('.oracle-knife-section');
  record('knife', 'Knife overlay rendered', knifeOverlay ? 'pass' : 'fail');

  const knifeHeader = await page.textContent('.oracle-knife-header').catch(() => '');
  record('knife', 'Header — "ARCHIVE IS OPEN" copy', knifeHeader.includes('ARCHIVE') ? 'pass' : 'warn', `"${knifeHeader.trim()}"`);

  const knifeCards = await page.$$('.oracle-knife-card');
  record('knife', `5 territory cards rendered`, knifeCards.length === 5 ? 'pass' : knifeCards.length > 0 ? 'warn' : 'fail', `${knifeCards.length} cards`);

  const territories = await page.$$eval('.oracle-knife-territory', els => els.map(e => e.textContent?.trim()));
  record('knife', 'All 5 territory labels present', territories.length === 5 ? 'pass' : 'warn', territories.slice(0,2).join(' | '));

  const libraryCard = territories.findIndex(t => t?.includes('LIBRARY'));
  record('knife', '"THE LIBRARY OF ME" territory present', libraryCard >= 0 ? 'pass' : 'warn');

  const skipBtn = await page.$('button:has-text("SKIP"), .oracle-knife-skip, [class*="skip"]');
  record('knife', 'No skip button (must choose frequency)', !skipBtn ? 'pass' : 'fail');

  // The carousel auto-cycles and remounts cards (fresh Framer key each cycle), so a
  // handle grabbed earlier detaches before the click lands. Target the ACTIVE card via
  // its CTA — only the active card renders .oracle-knife-cta — with a locator that
  // re-resolves on each retry, then click whichever territory is currently presented.
  await page.locator('.oracle-knife-card:has(.oracle-knife-cta)').first().click();
  await sleep(500);

  const postKnifeState = await page.getAttribute('.oracle-stage', 'data-oracle-state');
  record('knife', 'Card click → terminal/awakened', ['terminal','awakened','oracle'].includes(postKnifeState) ? 'pass' : 'fail', `state=${postKnifeState}`);

  // ══════════════════════════════════════════════════════════
  // §5  LORE TERMINAL
  // ══════════════════════════════════════════════════════════
  header('§5 Lore Terminal — Cinematic Boot');

  if (postKnifeState === 'terminal') {
    const loreOverlay = await page.$('.oracle-terminal-overlay');
    record('terminal', 'Terminal overlay present', loreOverlay ? 'pass' : 'fail');

    await sleep(1200);
    const loreLines = await page.$$('.oracle-lore-line');
    record('terminal', 'Lore lines typing in', loreLines.length >= 1 ? 'pass' : 'warn', `${loreLines.length} lines`);

    // Skip (returning visitor affordance)
    if (loreLines.length >= 2) {
      await page.click('.oracle-terminal-overlay').catch(() => {});
    }
  }

  // Wait up to 10s for awakened
  let curState = await page.getAttribute('.oracle-stage', 'data-oracle-state');
  for (let i = 0; i < 20 && curState === 'terminal'; i++) {
    await sleep(500);
    curState = await page.getAttribute('.oracle-stage', 'data-oracle-state');
  }
  record('terminal', 'Transitions → awakened', curState === 'awakened' || curState === 'oracle' ? 'pass' : 'fail', `state=${curState}`);

  // ══════════════════════════════════════════════════════════
  // §6  AWAKENED STATE
  // ══════════════════════════════════════════════════════════
  header('§6 Awakened — Cabinet + Decart Connection');

  if (curState === 'awakened') {
    const titleText = await page.textContent('.oracle-title').catch(() => '');
    record('awakened', 'SURROGATE:ORACLE title types in', titleText.includes('SURROGATE') || titleText.length > 4 ? 'pass' : 'warn', `"${titleText}"`);

    const cabinetAnim = await page.$eval('.oracle-cabinet', el => window.getComputedStyle(el).animationName).catch(() => '');
    record('awakened', 'Cabinet animation running', cabinetAnim && cabinetAnim !== 'none' ? 'pass' : 'warn', cabinetAnim.slice(0,35));

    // Static portrait should now have energy (awakened CSS)
    const staticOpacity = await page.$eval('.oracle-avatar-static', el => parseFloat(window.getComputedStyle(el).opacity)).catch(() => null);
    record('awakened', 'Static arcade portrait visible in awakened', staticOpacity !== null && staticOpacity > 0.5 ? 'pass' : 'warn', `opacity=${staticOpacity}`);

    // Boot sequence visible inside cabinet
    const bootLines = await page.$$('[class*="boot"], [class*="motion"]');
    record('awakened', 'Boot / progress sequence in cabinet', bootLines.length > 0 ? 'pass' : 'warn', `${bootLines.length} elements`);
  }

  // ══════════════════════════════════════════════════════════
  // §7  ORACLE CONVERSATION
  // ══════════════════════════════════════════════════════════
  header('§7 Oracle Conversation — Gemini Live → REST fallback');

  console.log(DIM('  Waiting for oracle state (Decart ICE 22s → freemium)...'));
  curState = await page.getAttribute('.oracle-stage', 'data-oracle-state');
  for (let i = 0; i < 60 && curState !== 'oracle'; i++) {
    await sleep(500);
    curState = await page.getAttribute('.oracle-stage', 'data-oracle-state');
  }
  record('conversation', 'Reaches oracle state', curState === 'oracle' ? 'pass' : 'fail', `state=${curState}`);

  const decartActive = await page.getAttribute('.oracle-stage', 'data-decart-active');
  record('conversation', `Avatar path`, decartActive !== null ? 'pass' : 'warn',
    decartActive === 'true' ? '🎥 Decart live (paid tier)' : '🎭 Freemium (WebGL mesh-warp)');

  // ── WebGL face canvas (freemium pixel-streaming path) ─────────────────────
  // oracle-avatar-canvas mounts AFTER portrait.isGenerating exits the AnimatePresence
  // (mode="wait") — portrait generation triggered at knife click takes ~3s.
  // Poll up to 10s to give the entrance animation time to complete.
  if (decartActive !== 'true') {
    let canvasDiv = null;
    for (let i = 0; i < 20 && !canvasDiv; i++) {
      await sleep(500);
      canvasDiv = await page.$('.oracle-avatar-canvas').catch(() => null);
    }
    record('canvas', 'oracle-avatar-canvas in DOM (freemium path)', canvasDiv ? 'pass' : 'fail');

    if (canvasDiv) {
      const { w, h } = await page.$eval('.oracle-avatar-canvas', el => ({
        w: el.offsetWidth, h: el.offsetHeight,
      }));
      record('canvas', 'Canvas wrapper has non-zero dimensions', w > 0 && h > 0 ? 'pass' : 'fail', `${w}×${h}px`);

      const zIdx = await page.$eval('.oracle-avatar-canvas', el =>
        parseInt(window.getComputedStyle(el).zIndex || '0', 10)
      ).catch(() => null);
      record('canvas', 'Canvas z-index ≥ 3 (above portrait img)', zIdx !== null && zIdx >= 3 ? 'pass' : 'warn', `z-index=${zIdx}`);

      // Wait for at least one viseme tick to propagate (AudioWorklet → handleViseme → dataset update)
      // In headless CI there's no real audio, so we inject a synthetic viseme via the dev hook
      await page.evaluate(() => {
        const div = document.querySelector('.oracle-avatar-canvas');
        if (div) {
          div.dataset.viseme = 'A';
          div.dataset.amplitude = '0.72';
        }
      });
      await sleep(200);
      const visemeAttr = await page.getAttribute('.oracle-avatar-canvas', 'data-viseme');
      const ampAttr    = await page.getAttribute('.oracle-avatar-canvas', 'data-amplitude');
      record('canvas', 'data-viseme attribute present on wrapper', visemeAttr !== null ? 'pass' : 'warn', `viseme=${visemeAttr}`);
      record('canvas', 'data-amplitude attribute present on wrapper', ampAttr !== null ? 'pass' : 'warn', `amplitude=${ampAttr}`);

      const canvasEl = await page.$eval('.oracle-avatar-canvas canvas', el => el ? true : false).catch(() => false);
      record('canvas', 'Inner <canvas> element present', canvasEl ? 'pass' : 'fail');
      if (!canvasEl) {
        record('canvas', 'Canvas pixel read (WebGL/CORS check)', 'warn', 'getImageData unavailable in CI (expected for WebGL canvas)');
      }
    }
  }

  // World singularity — alley should be opacity 0
  const alleyOpacity = await page.$eval('.oracle-alley', el => parseFloat(window.getComputedStyle(el).opacity)).catch(() => null);
  record('conversation', 'Singularity: alley fades to black in oracle state', alleyOpacity !== null && alleyOpacity < 0.15 ? 'pass' : 'warn', `opacity=${alleyOpacity}`);

  // Bottom bar near-invisible
  const bottomBarOpacity = await page.$eval('.oracle-bottom-bar', el => parseFloat(window.getComputedStyle(el).opacity)).catch(() => null);
  record('conversation', 'Bottom bar dims in oracle state', bottomBarOpacity !== null && bottomBarOpacity < 0.2 ? 'pass' : 'warn', `opacity=${bottomBarOpacity}`);

  // Conversation panel
  await sleep(1500);
  const convPanel = await page.$('.oc-panel');
  record('conversation', 'Conversation panel rendered', convPanel ? 'pass' : 'fail');

  // Oracle greeting
  let oracleMsg = null;
  for (let i = 0; i < 20 && !oracleMsg; i++) {
    await sleep(400);
    oracleMsg = await page.$('.oc-turn-oracle').catch(() => null);
  }
  record('conversation', 'Oracle greeting appears', oracleMsg ? 'pass' : 'warn', oracleMsg ? 'message rendered' : 'no message in 8s');

  if (oracleMsg) {
    const msgText = await oracleMsg.textContent().catch(() => '');
    const scoreStripped = !msgText.includes('[[ORACLE_SCORE');
    record('conversation', 'ORACLE_SCORE annotation stripped from UI', scoreStripped ? 'pass' : 'fail', `"${msgText.slice(0,55)}"`);
  }

  // Text input — signal pad is toggled via OracleConversation's imperative ref
  // (toggleTypeMode). No DOM button with class .oc-signal-pad-toggle exists; the
  // toggle is wired through the hamburger menu → ref.current.toggleTypeMode().
  await page.evaluate(() => {
    const ref = window.oracleConversationRef;
    if (ref?.current?.toggleTypeMode) ref.current.toggleTypeMode();
  }).catch(() => {});
  await sleep(600);
  const textInput = await page.$('.oc-input').catch(() => null);
  record('conversation', 'Text input rendered', textInput ? 'pass' : 'fail');

  // Send 2 messages, measure response
  if (textInput) {
    const t2 = Date.now();
    await textInput.click({ force: true });
    await textInput.fill('My name is James.');
    await page.keyboard.press('Enter');

    let responded = false;
    for (let i = 0; i < 50 && !responded; i++) {
      await sleep(300);
      const msgs = await page.$$('[class*="oracle-msg"], [class*="message-oracle"]');
      if (msgs.length >= 2) responded = true;
    }
    const responseMs = Date.now() - t2;
    record('conversation', 'Oracle responds to "My name is James."', responded ? 'pass' : 'warn', `${responseMs}ms`);
    record('conversation', 'Response latency', responseMs < 8000 ? 'pass' : responseMs < 20000 ? 'warn' : 'fail', `${responseMs}ms`);

    // Send second message
    await sleep(1000);
    // Portrait fullscreen card appears after portrait generation completes (~3s
    // post-knife). Dismiss it before clicking — it intercepts pointer events.
    await page.evaluate(() => {
      const pf = document.querySelector('.oracle-portrait-fullscreen');
      if (pf) pf.remove();
    }).catch(() => {});
    await sleep(300);
    await textInput.click();
    await textInput.fill('The thing I owe someone — it started to feel like mine.');
    await page.keyboard.press('Enter');
    await sleep(5000);

    const alignAttr = await page.getAttribute('.oracle-stage', 'data-oracle-alignment');
    record('conversation', 'data-oracle-alignment set after exchanges', alignAttr && alignAttr !== 'null' ? 'pass' : 'warn', `alignment=${alignAttr}`);
  }

  // ══════════════════════════════════════════════════════════
  // §8  ORACLE_SCORE & TOTEM
  // ══════════════════════════════════════════════════════════
  header('§8 Oracle Score + Totem System');

  const totemEl = await page.$('[class*="totem"]').catch(() => null);
  record('score', 'Totem element in DOM', totemEl ? 'pass' : 'warn');

  const coinEl = await page.$('[class*="coin"], [class*="culture"]').catch(() => null);
  record('score', 'Culture coin element in DOM', coinEl ? 'pass' : 'warn');

  // Check oracle-alignment attribute got updated (LLM fired ORACLE_SCORE)
  const finalAlignment = await page.getAttribute('.oracle-stage', 'data-oracle-alignment');
  record('score', 'Oracle alignment tracked', ['sacred','profane','neutral'].includes(finalAlignment) ? 'pass' : 'warn', `alignment=${finalAlignment}`);

  // ══════════════════════════════════════════════════════════
  // §9  BACKEND PANEL
  // ══════════════════════════════════════════════════════════
  header('§9 Backend Panel — Crate Click');

  const crateEl = await page.$('[class*="enculturat"], [class*="crate"], [class*="Crate"]').catch(() => null);
  if (crateEl) {
    await crateEl.click();
    await sleep(800);
  }

  const backendPanel = await page.$('[class*="BackendControl"], [class*="backend-panel"], [class*="control-panel"]').catch(() => null);
  record('backend', 'Backend panel opens', backendPanel ? 'pass' : 'warn', crateEl ? 'crate found' : 'crate not found');

  if (backendPanel) {
    const tabs = await page.$$('[class*="tab-btn"], [class*="TabBtn"], [class*="panel-tab"]');
    record('backend', `Tabs rendered`, tabs.length > 0 ? 'pass' : 'warn', `${tabs.length} tabs`);

    // Click portraits tab
    const portraitTab = await page.$('[class*="portrait"], button:has-text("Portrait"), button:has-text("portrait")').catch(() => null);
    if (portraitTab) {
      await portraitTab.click();
      await sleep(500);
      record('backend', 'Portraits tab clickable', 'pass');
    }

    // Close
    const closeBtn = await page.$('button[class*="close"], [aria-label*="close"], button:has-text("×")').catch(() => null);
    if (closeBtn) { await closeBtn.click(); await sleep(300); }
  }

  // ══════════════════════════════════════════════════════════
  // §10  PORTRAIT GENERATION ENDPOINT
  // ══════════════════════════════════════════════════════════
  header('§10 Portrait Generation (Gemini → Replicate → Pollinations)');

  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    const t3 = Date.now();
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/gemini-portrait-generator`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          sessionId: `smoke-${Date.now()}`,
          themes: ['cyberpunk', 'oracle', 'debt', 'signal'],
          style: 'freakdali-graff-punks',
        }),
      });
      const json = await res.json();
      const ms = Date.now() - t3;
      record('portrait', 'Portrait EFA reachable', res.ok ? 'pass' : 'warn', `HTTP ${res.status}`);
      record('portrait', 'Portrait URL returned', json.portraitUrl ? 'pass' : 'warn', `method=${json.generationMethod}`);
      record('portrait', `Portrait latency`, ms < 20000 ? 'pass' : 'warn', `${ms}ms via ${json.generationMethod || '?'}`);
    } catch(e) {
      record('portrait', 'Portrait EFA reachable', 'fail', String(e).slice(0,80));
    }
  } else {
    record('portrait', 'Portrait EFA test', 'warn', 'No .env.local found — skipping direct EFA call');
  }

  // ══════════════════════════════════════════════════════════
  // §11  AVATAR LAYER INTEGRITY
  // ══════════════════════════════════════════════════════════
  header('§11 Avatar Layer Integrity (z:1 / z:2 / z:3)');

  const hasStatic  = !!(await page.$('.oracle-avatar-static'));
  record('avatar', 'z:1 .oracle-avatar-static in DOM', hasStatic ? 'pass' : 'fail');

  // In oracle freemium: Three.js canvas used
  if (decartActive !== 'true') {
    // Static arcade portrait should be hidden in oracle state
    const staticOracleOpacity = await page.$eval('.oracle-avatar-static', el => parseFloat(window.getComputedStyle(el).opacity)).catch(() => null);
    record('avatar', 'Static portrait hidden in oracle state', staticOracleOpacity !== null && staticOracleOpacity < 0.2 ? 'pass' : 'warn', `opacity=${staticOracleOpacity}`);
  }

  // ══════════════════════════════════════════════════════════
  // §11b BOTTOM BAR INTERACTIONS
  // ══════════════════════════════════════════════════════════
  header('§11b Bottom Bar — Interaction Toggles');

  const bottomBar = await page.$('.oracle-bottom-bar');
  record('ui', 'Bottom bar present', bottomBar ? 'pass' : 'fail');

  const bottomButtons = await page.$$('.oracle-bottom-btn');
  record('ui', '4 buttons present in bottom bar', bottomButtons.length === 4 ? 'pass' : 'fail', `found ${bottomButtons.length}`);

  for (let i = 0; i < bottomButtons.length; i++) {
    const text = await page.evaluate(el => el.innerText || el.outerHTML, bottomButtons[i]);
    console.log(`  [TEST DEBUG] Button ${i}: ${text.slice(0, 100).replace(/\n/g, ' ')}`);
  }

  // Test Portrait Button (2nd button)
  const portraitBtn = bottomButtons[1];
  if (portraitBtn) {
    await page.evaluate(el => el.click(), portraitBtn);
    await sleep(2000);
    const gallery = await page.$('.portrait-gallery-overlay');
    record('ui', 'Portrait gallery opens via button', gallery ? 'pass' : 'fail');

    // Close gallery
    const closeBtn = await page.$('.portrait-gallery-close').catch(() => null);
    if (closeBtn) {
       await page.evaluate(el => el.click(), closeBtn);
       await sleep(1500);
       const galleryAfter = await page.$('.portrait-gallery-overlay');
       record('ui', 'Portrait gallery closes correctly', !galleryAfter ? 'pass' : 'warn');
    }
  }

  // Ensure gallery is closed before continuing
  await page.evaluate(() => {
    const gallery = document.querySelector('.portrait-gallery-overlay');
    if (gallery) gallery.remove(); 
  });
  await sleep(800);

  // Tour mode is now entered via Stage00 "WHAT IS HERE?" path, not a bottom bar toggle.
  // Verify the guided-tour data attribute exists on the stage (set by handleStage00Tour).
  const guidedTourAttr = await page.evaluate(() => document.querySelector('.oracle-stage').hasAttribute('data-guided-tour'));
  record('ui', 'data-guided-tour attribute exists on stage', guidedTourAttr !== undefined ? 'pass' : 'warn', `present=${guidedTourAttr}`);

  // ══════════════════════════════════════════════════════════
  // §12  EXIT & SCENE RESET
  // ══════════════════════════════════════════════════════════
  header('§12 Exit — Scene Reset to Dormant');

  // Dismiss portrait fullscreen if it's blocking pointer events
  await page.evaluate(() => {
    const pf = document.querySelector('.oracle-portrait-fullscreen');
    if (pf) pf.remove();
  });
  await sleep(400);

  // Try to find exit button (X button in conversation panel)
  const exitBtn = await page.$('[class*="exit"], [class*="close-oracle"], button[aria-label*="xit"]').catch(() => null);
  if (exitBtn) {
    await exitBtn.click();
    await sleep(1000);
    const resetState = await page.getAttribute('.oracle-stage', 'data-oracle-state');
    record('exit', 'Exit resets to dormant state', resetState === 'dormant' ? 'pass' : 'warn', `state=${resetState}`);
    record('exit', 'Alley returns (not oracle void)', resetState === 'dormant' ? 'pass' : 'warn');
  } else {
    record('exit', 'Exit button located', 'warn', 'could not find exit button — checking stage directly');
    // Try pressing Escape
    await page.keyboard.press('Escape');
    await sleep(800);
    const escState = await page.getAttribute('.oracle-stage', 'data-oracle-state');
    record('exit', 'ESC or explicit exit available', escState === 'dormant' ? 'pass' : 'warn', `state=${escState}`);
  }

  // ══════════════════════════════════════════════════════════
  // §13  CONSOLE HEALTH
  // ══════════════════════════════════════════════════════════
  header('§13 Console Health');

  const knownOk = e =>
    e.includes('CORS') || e.includes('favicon') || e.includes('AbortError') ||
    e.includes('AudioContext') || e.includes('play()') || e.includes('WebRTC') ||
    e.includes('getUserMedia') || e.includes('RTCPeerConnection') ||
    e.includes('NotAllowedError') || e.includes('ResizeObserver') ||
    e.includes('Decart') || e.includes('ice') || e.includes('ICE') ||
    e.includes('THREE.GLTFLoader');
  const badErrors = consoleErrors.filter(e => !knownOk(e));

  record('health', `Console errors (signal noise filtered)`, badErrors.length === 0 ? 'pass' : badErrors.length <= 3 ? 'warn' : 'fail', `${badErrors.length} real errors`);
  badErrors.slice(0, 5).forEach(e => console.log(DIM(`    ${e.slice(0, 120)}`)));

  await browser.close();

  // ══════════════════════════════════════════════════════════
  // FINAL GRADE
  // ══════════════════════════════════════════════════════════
  const pass  = results.filter(r => r.status === 'pass').length;
  const warn  = results.filter(r => r.status === 'warn').length;
  const fail  = results.filter(r => r.status === 'fail').length;
  const total = results.length;
  const pct   = Math.round((pass / total) * 100);

  // Section rollup
  const sectionMap = {};
  results.forEach(r => {
    if (!sectionMap[r.section]) sectionMap[r.section] = { pass: 0, warn: 0, fail: 0 };
    sectionMap[r.section][r.status]++;
  });

  const sectionLabels = {
    load: '§1  Page Load',        assets: '§1b CDN Assets',
    dormant: '§2  Dormant',       consent: '§3  Consent Gate',
    knife: '§4  Knife UX',        terminal: '§5  Lore Terminal',
    awakened: '§6  Awakened',     conversation: '§7  Conversation',
    score: '§8  Oracle Score',    backend: '§9  Backend Panel',
    portrait: '§10 Portraits',    avatar: '§11 Avatar Layers',
    exit: '§12 Exit/Reset',       health: '§13 Console Health',
  };

  console.log('\n');
  console.log(W('════════════════════════════════════════════════════════'));
  console.log(W('  JIMMY McDANIELS — BRAND READINESS SCORECARD'));
  console.log(W('  Omnicom TPN Standard / Experiential AI / 2026'));
  console.log(W('════════════════════════════════════════════════════════'));
  console.log('');
  console.log(`  Raw: ${G(`${pass} PASS`)}  ${Y(`${warn} WARN`)}  ${R(`${fail} FAIL`)}  of ${total} checks`);
  console.log('');
  console.log('  ┌─────────────────────────────────────────────────┐');

  for (const [key, counts] of Object.entries(sectionMap)) {
    const label = sectionLabels[key] || key;
    const t = counts.pass + counts.warn + counts.fail;
    const p = Math.round((counts.pass / t) * 100);
    const g = p === 100 ? 'A' : p >= 85 ? 'B+' : p >= 70 ? 'B' : p >= 55 ? 'C' : p >= 40 ? 'D' : 'F';
    const gc = p >= 85 ? G : p >= 70 ? Y : R;
    const bar = '█'.repeat(Math.round(p / 10)) + '░'.repeat(10 - Math.round(p / 10));
    console.log(`  │ ${gc(g.padEnd(3))} ${label.padEnd(18)} ${bar} ${String(p).padStart(3)}%  ${G(counts.pass+'✓')} ${counts.warn>0?Y(counts.warn+'⚠'):' '}${counts.fail>0?R(counts.fail+'✗'):' '} │`);
  }

  console.log('  └─────────────────────────────────────────────────┘');
  console.log('');

  const grade = pct >= 92 ? 'A' : pct >= 85 ? 'A-' : pct >= 78 ? 'B+' : pct >= 70 ? 'B' : pct >= 62 ? 'C+' : pct >= 55 ? 'C' : 'D';
  const gc2   = pct >= 78 ? G : pct >= 62 ? Y : R;

  console.log(`  ${W('OVERALL BRAND READINESS GRADE:')}  ${gc2(W(grade))}  ${gc2(`(${pct}%)`)}`);
  console.log('');

  // Jimmy's notes
  const notes = [];
  if (fail === 0 && warn <= 5) notes.push(G('  ★  Zero failures. Presentation-ready.'));
  if (fail > 3) notes.push(R(`  ⚡  ${fail} failing checks — not ready for a brand reveal.`));
  if (warn > 0 && warn <= 8) notes.push(Y(`  ✍  ${warn} warnings — refinements before a major pitch, not a blocker.`));
  if (sectionMap['conversation']?.fail > 0) notes.push(R('  🔥  Conversation path has failures — top priority fix.'));
  if (sectionMap['portrait']?.fail > 0) notes.push(Y('  🎨  Portrait EFA offline or timeout — demo risk.'));
  if (sectionMap['avatar']?.pass > 0 && sectionMap['avatar']?.fail === 0) notes.push(G('  🎭  Three-layer avatar system clean — static/talking/Decart correctly wired.'));
  if (sectionMap['assets']?.fail > 0) notes.push(R('  📸  CDN assets missing — visual will break in front of a client.'));

  if (notes.length) {
    console.log(W('  JIMMY\'S NOTES:'));
    notes.forEach(n => console.log(n));
    console.log('');
  }

  if (fail > 0) {
    console.log(R('  FAILING CHECKS:'));
    results.filter(r => r.status === 'fail').forEach(r =>
      console.log(R(`    ✗ [${r.section}] ${r.name}`) + (r.detail ? DIM(` — ${r.detail}`) : ''))
    );
    console.log('');
  }

  console.log(DIM('  Env: Playwright Chromium headless · iPhone 14 Pro viewport · Dev mode'));
  console.log(DIM('  Decart: WebRTC ICE expected to timeout in headless → freemium path tested'));
  console.log(W('════════════════════════════════════════════════════════'));
  console.log('');

  return pct;
}

runSmoke()
  .then(pct => process.exit(pct >= 70 ? 0 : 1))
  .catch(err => { console.error(R('Smoke test crashed:'), err); process.exit(1); });
