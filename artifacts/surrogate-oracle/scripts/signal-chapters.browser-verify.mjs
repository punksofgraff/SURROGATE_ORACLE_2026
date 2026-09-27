#!/usr/bin/env node
/**
 * Real dormant UI / browser-profile Signal Chapters verification. No provider calls.
 * Run manually: DEV_URL=http://localhost:80/ CHROMIUM_PATH="$(which chromium)" node scripts/signal-chapters.browser-verify.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.DEV_URL ?? 'http://localhost:80/';
const key = 'surrogate_signal_chapters_v1';
const marker = `APPROVED_BROWSER_CHAPTER_${Date.now()}`;
const otherMarker = `UNSELECTED_BROWSER_CHAPTER_${Date.now()}`;
const forbidden = 'RAW_TRANSCRIPT_SENTINEL_DO_NOT_SEND';
const outputUrl = 'https://example.org/browser-reference.jpg';
const chrome = process.env.CHROMIUM_PATH || execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim();
const shots = resolve(root, 'screenshots');
const resume = process.env.RESUME_AFTER_RELOAD === '1';
const tailOnly = process.env.CHAPTER_TAIL_ONLY === '1';
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; console.log(`✓ ${message}`); }
const tid = (page, name) => page.getByTestId(name);
const records = page => page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey) || '[]'), key);
const open = async page => {
  await tid(page, 'open-chapters').waitFor({ timeout: 30000 });
  await tid(page, 'open-chapters').click();
  await tid(page, 'signal-chapters').waitFor();
};
const close = page => page.getByRole('button', { name: 'Close chapters' }).click();
async function blockedNetwork(context, { immediate = false } = {}) {
  await context.route('**/*', async route => {
    const request = route.request();
    const target = new URL(request.url());
    if (target.origin === new URL(url).origin && !target.pathname.includes('/functions/v1/') &&
        !target.pathname.includes('/rest/v1/') && !target.pathname.startsWith('/api/')) return route.continue();
    if (target.pathname.includes('/functions/v1/') || target.pathname.includes('/rest/v1/') ||
        target.hostname.includes('supabase')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        data: null, walletAddress: null, isReturning: false, compactSummaries: [], rawTurns: [],
      }) });
    }
    return route.abort(); // Never send test identity, prompt, or provider traffic outward.
  });
  await context.addInitScript(({ immediate }) => {
    sessionStorage.setItem('oracle_presence_preference_v1', 'none');
    const NativeSocket = window.WebSocket;
    window.__chapterFrames = [];
    const pendingSockets = new Set();
    // The app dials its voice socket on dormant mount. Do not acknowledge that
    // warm socket until actual entry; otherwise onConnected locks chapter choice
    // before the seeker has touched the chapter dialog.
    window.__chapterEntryClicked = false;
    document.addEventListener('click', event => {
      if (!event.target.closest?.('.oracle-center')) return;
      window.__chapterEntryClicked = true;
      for (const socket of pendingSockets) socket.activate();
      pendingSockets.clear();
    }, true);
    class FakeGeminiSocket extends EventTarget {
      static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
      readyState = 0;
      bufferedAmount = 0;
      onopen = null;
      onmessage = null;
      onclose = null;
      onerror = null;
      emit(event) {
        this.dispatchEvent(event);
        this[`on${event.type}`]?.call(this, event);
      }
      constructor(address) {
        super();
        this.url = String(address);
        if (immediate || window.__chapterEntryClicked) this.activate();
        else pendingSockets.add(this);
      }
      activate() {
        if (this.readyState !== 0) return;
        setTimeout(() => {
          if (this.readyState !== 0) return;
          this.readyState = 1;
          this.emit(new Event('open'));
        }, 20);
      }
      send(payload) {
        let frame;
        try { frame = JSON.parse(payload); } catch { return; }
        window.__chapterFrames.push(frame);
        if (frame.type === 'session.config') setTimeout(() => {
          const event = new MessageEvent('message', { data: JSON.stringify({ type: 'session.created' }) });
          this.emit(event);
        }, 20);
      }
      close() {
        pendingSockets.delete(this);
        this.readyState = 3;
        this.emit(new CloseEvent('close', { code: 1000 }));
      }
    }
    window.WebSocket = class extends NativeSocket {
      constructor(address, protocols) {
        // Preserve Vite HMR; only fake the voice backend.
        if (String(address).includes('/functions/v1/gemini-live-proxy')) return new FakeGeminiSocket(address);
        super(address, protocols);
      }
    };
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'surrogate_signal_chapters_v1' && window.__denyChapterWrite) throw new DOMException('quota test', 'QuotaExceededError');
      return original.call(this, k, v);
    };
  }, { immediate });
}
async function freshPage(context) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'load' }); // networkidle never settles (HMR).
  await tid(page, 'open-chapters').waitFor({ timeout: 30000 });
  return page;
}
async function save(page) {
  await tid(page, 'chapter-save').click();
  await tid(page, 'status-chapter-saved').waitFor();
}
async function create(page, title, summary, kind = 'reflective') {
  await tid(page, 'chapter-new').click();
  await tid(page, 'chapter-title').fill(title);
  await tid(page, 'chapter-summary').fill(summary);
  await tid(page, 'chapter-thread').fill('A creative thread to pick up later.');
  await tid(page, `chapter-kind-${kind}`).check();
  await save(page);
}
async function layout(page, width, filename) {
  await page.setViewportSize({ width, height: 850 });
  await tid(page, 'signal-chapters').waitFor();
  const metrics = await page.evaluate(() => {
    const dialog = document.querySelector('.oracle-chapters-dialog');
    return { viewport: innerWidth, docWidth: document.documentElement.scrollWidth,
      dialogWidth: dialog?.getBoundingClientRect().width, dialogScroll: dialog?.scrollWidth,
      dialogClient: dialog?.clientWidth };
  });
  check(metrics.docWidth <= metrics.viewport + 1 && metrics.dialogWidth <= metrics.viewport + 1 &&
    metrics.dialogScroll <= metrics.dialogClient + 1, `${width}px dialog has no horizontal overflow`);
  await page.locator('.oracle-chapters-dialog').screenshot({ path: resolve(shots, filename), type: 'jpeg' });
}

async function verifyTail(browser) {
  const at = Date.now();
  const approved = {
    id: randomUUID(), title: 'Browser test chapter', summary: `${marker} — approved summary`,
    thread: 'Return to the drawing.', threadKind: 'creative',
    outputs: [{ id: 'approved-reference', label: 'Test reference', kind: 'image', url: outputUrl, availability: 'external' }],
    createdAt: new Date(at - 2000).toISOString(), updatedAt: new Date(at - 2000).toISOString(),
  };
  const unrelated = {
    id: randomUUID(), title: 'Unrelated chapter', summary: otherMarker,
    thread: '', threadKind: 'reflective', outputs: [],
    createdAt: new Date(at - 1000).toISOString(), updatedAt: new Date(at - 1000).toISOString(),
  };
  async function profile() {
    const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
    await blockedNetwork(context, { immediate: true });
    await context.addInitScript(({ storageKey, chapterList }) => {
      if (localStorage.getItem(storageKey) === null) {
        localStorage.setItem(storageKey, JSON.stringify(chapterList));
      }
      localStorage.setItem('surrogate_journey_reset_20260824', 'true');
      localStorage.setItem('oracle_wallet_signed', 'true');
      sessionStorage.setItem('oracle_presence_preference_v1', 'none');
    }, { storageKey: key, chapterList: [unrelated, approved] });
    return context;
  }
  async function initialConfig(page) {
    await page.waitForFunction(() => window.__chapterFrames.some(f => f.type === 'session.config'), undefined, { timeout: 15000 });
    return page.evaluate(() => window.__chapterFrames.filter(f => f.type === 'session.config').length);
  }
  async function afterEntryConfig(page, baseline) {
    await close(page);
    // The animated cabinet never becomes geometrically "stable" in headless
    // Chromium; dispatch the click to its real UI handler without hit-test wait.
    await page.locator('.oracle-center').dispatchEvent('click');
    await page.waitForFunction(count =>
      window.__chapterFrames.filter(f => f.type === 'session.config').length > count,
    baseline, { timeout: 15000 });
    return page.evaluate(() => window.__chapterFrames);
  }
  {
    const context = await profile();
    try {
      const page = await freshPage(context);
      await initialConfig(page);
      await open(page);
      await tid(page, `chapter-item-${approved.id}`).click();
      await tid(page, 'chapter-continue').click();
      await page.waitForFunction(() =>
        document.querySelector('[data-testid="status-continuation"]')?.textContent?.includes('Browser test chapter'),
      undefined, { timeout: 10000 });
      await page.evaluate(() => localStorage.setItem('browser_unrelated_artifact_sentinel', 'untouched'));
      await tid(page, 'chapter-delete').click();
      await tid(page, 'chapter-delete-confirm').click();
      await page.waitForFunction(({ storageKey, removedId }) => {
        const chapters = JSON.parse(localStorage.getItem(storageKey) || '[]');
        return chapters.length === 1 && !chapters.some(c => c.id === removedId) &&
          document.querySelector('[data-testid="status-continuation"]')?.textContent?.includes('Nothing');
      }, { storageKey: key, removedId: approved.id }, { timeout: 10000 });
      const remaining = await records(page);
      check(remaining.length === 1 && remaining[0].id === unrelated.id &&
        await page.evaluate(() => localStorage.getItem('browser_unrelated_artifact_sentinel')) === 'untouched',
      'async deletion removes selected context, retaining unrelated chapter and artifact');
      await page.evaluate(storageKey => {
        localStorage.setItem(storageKey, '{corrupt JSON');
        window.dispatchEvent(new Event('surrogate_signal_chapters_changed'));
      }, key);
      await page.getByRole('alert').filter({ hasText: 'Chapters could not be read' }).waitFor();
      check(!(await page.getByText('NO CHAPTERS YET').isVisible().catch(() => false)),
        'corrupt storage reports read error rather than an empty collection');
      await tid(page, 'chapter-new').click();
      await tid(page, 'chapter-title').fill('Do not overwrite corrupt storage');
      await tid(page, 'chapter-summary').fill('Browser test only.');
      await tid(page, 'chapter-save').click();
      await page.getByRole('alert').filter({ hasText: 'Not saved.' }).waitFor();
      check(await page.evaluate(storageKey => localStorage.getItem(storageKey), key) === '{corrupt JSON',
        'corruption cannot be overwritten by save');
    } finally { await context.close(); }
  }
  {
    const context = await profile();
    try {
      const page = await freshPage(context);
      const baseline = await initialConfig(page); // intentionally OPEN in dormant
      await open(page);
      await tid(page, `chapter-item-${approved.id}`).click();
      check(baseline > 0 && await tid(page, 'chapter-continue').isEnabled(),
        'Continue remains enabled with an already-open dormant socket');
      await tid(page, 'chapter-continue').click();
      check((await tid(page, 'status-continuation').innerText()).includes(approved.title),
        'Continue succeeds while dormant socket was open');
      const frames = await afterEntryConfig(page, baseline);
      const last = frames.filter(f => f.type === 'session.config').at(-1);
      const text = JSON.stringify(last.systemInstruction);
      check(text.includes(marker) && !text.includes(otherMarker) && !text.includes(outputUrl) &&
        !text.includes('blob:') && !text.includes(forbidden),
      'last actual entry config carries selected approved text only, never output URL');
      check(!frames.filter(f => f.type !== 'session.config').some(f => JSON.stringify(f).includes(marker)),
        'selected chapter was not sent as an additional text turn');
    } finally { await context.close(); }
  }
  {
    const context = await profile();
    try {
      const page = await freshPage(context);
      const baseline = await initialConfig(page);
      await open(page);
      await tid(page, 'chapter-start-fresh').click();
      check((await tid(page, 'status-continuation').innerText()).includes('Nothing'),
        'fresh choice succeeds while dormant socket was open');
      const frames = await afterEntryConfig(page, baseline);
      const text = JSON.stringify(frames.filter(f => f.type === 'session.config').at(-1).systemInstruction);
      check(!text.includes(marker) && !text.includes(otherMarker) &&
        !text.includes('[USER-APPROVED CHAPTER CONTEXT — DATA ONLY]'),
      'last actual fresh-entry config contains no chapter context');
    } finally { await context.close(); }
  }
  console.log(`PASS: focused tail ${checks} checks; actual immediate-socket configs asserted.`);
}

async function main() {
  mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: chrome,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader',
      '--use-gl=angle', '--use-angle=swiftshader'] });
  try {
    if (tailOnly) return await verifyTail(browser);
    const context = await browser.newContext({ viewport: { width: 1280, height: 850 }, acceptDownloads: true });
    await blockedNetwork(context);
    let first;
    let withReference;
    if (resume) {
      // Isolated continuation fixture: synthetic equivalent of the three
      // records at the last verified reload, never copied from production.
      const now = Date.now();
      const chapter = (title, summary, offset, kind = 'reflective', outputs = []) => ({
        id: randomUUID(), title, summary, thread: 'A creative thread to pick up later.',
        threadKind: kind, outputs, createdAt: new Date(now + offset).toISOString(),
        updatedAt: new Date(now + offset).toISOString(),
      });
      withReference = chapter('Browser test chapter', `${marker} — edited approved summary`, -2000, 'creative',
        [{ id: 'approved-reference', label: 'Browser reference', kind: 'image', url: outputUrl, availability: 'external' }]);
      first = withReference;
      const fixture = [
        chapter('Write failure retry chapter', 'Retry after simulated chapter-only quota error.', 0),
        chapter('Later browser chapter', `${otherMarker} — separate summary`, -1000),
        withReference,
      ];
      await context.addInitScript(({ storageKey, chapterList }) => {
        if (localStorage.getItem(storageKey) === null) {
          localStorage.setItem(storageKey, JSON.stringify(chapterList));
        }
      }, { storageKey: key, chapterList: fixture });
    }
    const page = await freshPage(context);
    await open(page);
    if (!resume) {
    check(await tid(page, 'signal-chapters').isVisible(), 'real dormant chapter dialog opens');
    await create(page, 'Browser test chapter', `${marker} — approved summary`, 'creative');
    let saved = await records(page);
    check(saved.length === 1 && saved[0].title === 'Browser test chapter' && saved[0].threadKind === 'creative', 'explicit save persists creative chapter');
    first = saved[0];
    await save(page);
    check((await records(page)).length === 1, 'repeated save does not duplicate record');

    await create(page, 'Later browser chapter', `${otherMarker} — separate summary`);
    saved = await records(page);
    check(saved.length === 2 && saved[0].title === 'Later browser chapter', 'second distinct chapter sorts newest first');
    await tid(page, `chapter-item-${first.id}`).click();
    await tid(page, 'chapter-summary').fill(`${marker} — edited approved summary`);
    await save(page);
    saved = await records(page);
    const edited = saved.find(c => c.id === first.id);
    check(saved.length === 2 && edited.createdAt === first.createdAt && edited.id === first.id, 'edit preserves ID and creation time');

    // Seed only a synthetic browser-local output reference; use the real editor
    // checkbox to approve one link and exclude the other. No backend/media fetch.
    await page.evaluate(({ storageKey, id, reference }) => {
      const all = JSON.parse(localStorage.getItem(storageKey));
      const chapter = all.find(c => c.id === id);
      chapter.outputs = [
        { id: 'approved-reference', label: 'Browser reference', kind: 'image', url: reference, availability: 'external' },
        { id: 'excluded-reference', label: 'Excluded browser reference', kind: 'image', url: 'https://example.org/excluded.jpg', availability: 'external' },
      ];
      localStorage.setItem(storageKey, JSON.stringify(all));
      window.dispatchEvent(new Event('surrogate_signal_chapters_changed'));
    }, { storageKey: key, id: first.id, reference: outputUrl });
    await tid(page, 'chapter-close').click();
    await tid(page, `chapter-item-${first.id}`).click();
    await tid(page, 'chapter-output-excluded-reference').uncheck();
    await save(page);
    withReference = (await records(page)).find(c => c.id === first.id);
    const downloadPromise = page.waitForEvent('download');
    await tid(page, 'chapter-export').click();
    const download = await downloadPromise;
    const json = JSON.parse(readFileSync(await download.path(), 'utf8'));
    check(json.id === first.id && json.outputs.length === 1 && json.outputs[0].url === outputUrl &&
      !JSON.stringify(json).includes('blob:') && !JSON.stringify(json).includes('excluded.jpg') &&
      !JSON.stringify(json).includes(forbidden), 'downloaded JSON exports approved links only, without blobs');

    await tid(page, 'chapter-new').click();
    await tid(page, 'chapter-title').fill('Write failure retry chapter');
    await tid(page, 'chapter-summary').fill('Retry after simulated chapter-only quota error.');
    await page.evaluate(() => { window.__denyChapterWrite = true; });
    await tid(page, 'chapter-save').click();
    await page.getByRole('alert').filter({ hasText: 'Not saved.' }).waitFor();
    check((await records(page)).length === 2 && await tid(page, 'chapter-title').inputValue() === 'Write failure retry chapter', 'failed save reports error and retains draft');
    await page.evaluate(() => { window.__denyChapterWrite = false; });
    await save(page);
    check((await records(page)).length === 3 && (await records(page)).filter(c => c.title === 'Write failure retry chapter').length === 1, 'retry saves exactly one record');
    await close(page);
    await page.reload({ waitUntil: 'load' });
    await open(page);
    check((await records(page)).length === 3 && await tid(page, `chapter-item-${first.id}`).isVisible(), 'reload retains saved browser records');
    check((await tid(page, 'status-continuation').innerText()).includes('Nothing'), 'reload requires explicit selection');
    } else {
      check((await records(page)).length === 3 && (await tid(page, 'status-continuation').innerText()).includes('Nothing'),
        'resume fixture loaded three synthetic records without auto-selection');
    }

    const secondContext = await browser.newContext({ viewport: { width: 1280, height: 850 } });
    await blockedNetwork(secondContext);
    await secondContext.addInitScript(() => {
      localStorage.setItem('surrogate_journey_reset_20260824', 'true');
      localStorage.setItem('oracle_seeker_key', 'browser-spoofed-seeker');
      localStorage.setItem('oracle_wallet_signed', 'true');
    });
    const secondPage = await secondContext.newPage();
    const secondErrors = [];
    secondPage.on('pageerror', error => secondErrors.push(error.message));
    await secondPage.goto(url, { waitUntil: 'load' });
    try {
      await tid(secondPage, 'open-chapters').waitFor({ timeout: 12000 });
    } catch (error) {
      const diagnostic = await secondPage.evaluate(() => ({
        body: document.body?.innerText?.slice(0, 1200),
        location: location.href,
        storage: {
          key: localStorage.getItem('oracle_seeker_key'),
          signed: localStorage.getItem('oracle_wallet_signed'),
          reset: localStorage.getItem('surrogate_journey_reset_20260824'),
        },
      })).catch(reason => ({ evaluationError: reason.message }));
      await secondPage.screenshot({ path: resolve(shots, 'chapter-second-profile-failure.jpg'), type: 'jpeg' });
      console.error('SECOND PROFILE DIAGNOSTIC', JSON.stringify({ diagnostic, secondErrors }));
      throw error;
    }
    await open(secondPage);
    check((await records(secondPage)).length === 0 && await secondPage.getByText('NO CHAPTERS YET').isVisible(), 'same spoofed wallet in another browser profile cannot see chapters');
    await secondContext.close();

    if (!(await tid(page, `chapter-item-${first.id}`).count())) {
      console.error('MAIN PROFILE AFTER SECOND DIAGNOSTIC', JSON.stringify(await page.evaluate(storageKey => ({
        phase: document.querySelector('.oracle-stage')?.getAttribute('data-oracle-state'),
        dialogOpen: document.querySelector('.oracle-chapters-dialog')?.open,
        chapters: JSON.parse(localStorage.getItem(storageKey) || '[]').map(c => c.id),
        visible: document.querySelector('.oracle-chapters-dialog')?.innerText?.slice(0, 700),
        frames: window.__chapterFrames?.map(f => f.type),
      }), key)));
    }
    await tid(page, `chapter-item-${first.id}`).click();
    if (await tid(page, 'chapter-continue').isDisabled()) {
      console.error('CONTINUE DIAGNOSTIC', JSON.stringify({
        note: await page.locator('#sc-continue-note').innerText(),
        state: await page.locator('.sc-editor__top').innerText(),
        status: await tid(page, 'status-continuation').innerText(),
        runtime: await page.evaluate(() => ({
          phase: document.querySelector('.oracle-stage')?.getAttribute('data-oracle-state'),
          frames: window.__chapterFrames?.map(f => f.type),
          dialogOpen: document.querySelector('.oracle-chapters-dialog')?.open,
        })),
      }));
    }
    await tid(page, 'chapter-continue').click();
    check((await tid(page, 'status-continuation').innerText()).includes('Browser test chapter'), 'explicit continue selects saved chapter');
    await layout(page, 390, 'chapter-mobile.jpg');
    await layout(page, 1280, 'chapter-desktop.jpg');
    await tid(page, 'chapter-start-fresh').click();
    check((await tid(page, 'status-continuation').innerText()).includes('Nothing'), 'start fresh clears continuation state');
    await close(page);
    await page.reload({ waitUntil: 'load' });
    await open(page);
    check((await tid(page, 'status-continuation').innerText()).includes('Nothing'), 'fresh reload cannot auto-select chapter');
    await tid(page, `chapter-item-${first.id}`).click();
    await tid(page, 'chapter-continue').click();
    await page.evaluate(() => localStorage.setItem('browser_unrelated_artifact_sentinel', 'untouched'));
    await tid(page, 'chapter-delete').click();
    await tid(page, 'chapter-delete-confirm').click();
    await page.waitForFunction(({ storageKey, removedId }) =>
      !JSON.parse(localStorage.getItem(storageKey) || '[]').some(chapter => chapter.id === removedId) &&
      document.querySelector('[data-testid="status-continuation"]')?.textContent?.includes('Nothing'),
    { storageKey: key, removedId: first.id });
    check((await records(page)).length === 2 && !(await records(page)).some(c => c.id === first.id) &&
      (await tid(page, 'status-continuation').innerText()).includes('Nothing') &&
      await page.evaluate(() => localStorage.getItem('browser_unrelated_artifact_sentinel')) === 'untouched',
    'deleting selected chapter clears selection, keeps other chapters and unrelated artifact');

    const beforeCorruption = await records(page);
    await page.evaluate(storageKey => {
      localStorage.setItem(storageKey, '{corrupt JSON');
      window.dispatchEvent(new Event('surrogate_signal_chapters_changed'));
    }, key);
    await page.getByRole('alert').filter({ hasText: 'Chapters could not be read' }).waitFor();
    check(await page.evaluate(() => localStorage.getItem('browser_unrelated_artifact_sentinel')) === 'untouched' &&
      !(await page.getByText('NO CHAPTERS YET').isVisible().catch(() => false)), 'corruption reports read error, not empty collection; unrelated storage intact');
    await tid(page, 'chapter-new').click();
    await tid(page, 'chapter-title').fill('Must not overwrite corruption');
    await tid(page, 'chapter-summary').fill('Blocked on corrupt storage.');
    await tid(page, 'chapter-save').click();
    await page.getByRole('alert').filter({ hasText: 'Not saved.' }).waitFor();
    check(await page.evaluate(storageKey => localStorage.getItem(storageKey), key) === '{corrupt JSON' &&
      beforeCorruption.length === 2, 'corrupt chapter storage is not overwritten');
    await context.close();

    // Best-effort real entry in an isolated test profile, with only synthetic
    // chapter data and a fake WS. Never press a voice/mic control.
    let configReached = false;
    const probe = await browser.newContext({ viewport: { width: 1280, height: 850 } });
    await blockedNetwork(probe);
    await probe.addInitScript(({ storageKey, chapterList }) => {
      localStorage.setItem(storageKey, JSON.stringify(chapterList));
      // Returning-seeker shortcut avoids playing lore and requesting mic access.
      localStorage.setItem('oracle_wallet_signed', 'true');
      localStorage.setItem('surrogate_journey_reset_20260824', 'true');
    }, { storageKey: key, chapterList: [withReference, ...beforeCorruption.filter(c => c.id !== first.id)] });
    try {
      const selectedPage = await freshPage(probe);
      await open(selectedPage);
      await tid(selectedPage, `chapter-item-${first.id}`).click();
      await tid(selectedPage, 'chapter-continue').click();
      await close(selectedPage);
      await selectedPage.locator('.oracle-center').dispatchEvent('click');
      let selectedConfigAvailable = false;
      try {
        await selectedPage.waitForFunction(() => window.__chapterFrames.some(f => f.type === 'session.config'), undefined, { timeout: 10000 });
        selectedConfigAvailable = true;
      } catch (error) {
        console.log(`INFO: live selected session.config not reached (${error.message}); source-contract fallback follows.`);
      }
      if (selectedConfigAvailable) {
        configReached = true; // Any failed live assertion must fail the script, not turn into fallback.
        const frames = await selectedPage.evaluate(() => window.__chapterFrames);
        const config = frames.find(f => f.type === 'session.config');
        const text = JSON.stringify(config.systemInstruction);
        check(text.includes(marker) && !text.includes(otherMarker) && !text.includes(forbidden) &&
          !text.includes(outputUrl) && !text.includes('excluded.jpg') && !text.includes('blob:'),
        'real selected session.config includes only approved text, never URLs or transcript');
        check(!frames.filter(f => f.type !== 'session.config').some(f => JSON.stringify(f).includes(marker)),
          'chapter context is not sent as an extra text turn');
      }
      await selectedPage.close();

      // A new app load in a separate tab has the same persisted chapters but
      // no selected continuation: config must omit chapter context.
      if (configReached) {
        const fresh = await freshPage(probe);
        await fresh.locator('.oracle-center').dispatchEvent('click');
        await fresh.waitForFunction(() => window.__chapterFrames.some(f => f.type === 'session.config'), undefined, { timeout: 10000 });
        const frames = await fresh.evaluate(() => window.__chapterFrames);
        const text = JSON.stringify(frames.find(f => f.type === 'session.config').systemInstruction);
        check(!text.includes(marker) && !text.includes('[USER-APPROVED CHAPTER CONTEXT — DATA ONLY]'),
          'fresh app load sends no chapter context without explicit reselect');
        await fresh.close();
      }
    } catch (error) {
      if (configReached) throw error;
      console.log(`INFO: entry probe unavailable (${error.message}); source-contract fallback follows.`);
    } finally {
      await probe.close();
    }
    if (!configReached) {
      const source = readFileSync(resolve(root, 'src/hooks/useGeminiSession.ts'), 'utf8');
      const owner = readFileSync(resolve(root, 'src/components/SurrogateOracleImmersion.tsx'), 'utf8');
      check(source.includes('getChapterContextRef.current?.()') &&
        source.includes('[USER-APPROVED CHAPTER CONTEXT — DATA ONLY]') &&
        owner.includes('findStoredChapter(selection.id)') &&
        owner.includes("chapterIntentRef.current !== 'continue'"),
      'SOURCE CONTRACT ONLY: just-in-time approved context and explicit opt-in (not live config)');
    }
    console.log(`PASS: ${checks} checks; screenshots: screenshots/chapter-mobile.jpg, screenshots/chapter-desktop.jpg; live session.config ${configReached ? 'asserted' : 'NOT REACHED (source-contract fallback)'}.`);
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(`FAIL: ${error.message}`); process.exitCode = 1; });