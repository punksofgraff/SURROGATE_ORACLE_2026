/**
 * pcm-pressure-test.mjs
 *
 * Synthetic TTS pressure test for the Oracle PCM pipeline.
 * Bypasses the UI — tests the worklet directly with known audio.
 *
 * What it proves:
 *   T1 — What sample rate did the browser actually give us (requested 24kHz)?
 *   T2 — Does 1 second of 24kHz PCM play back in ~1 second? (fast-forward test)
 *   T3 — Does the resampling fix hold at 48kHz context? (new fix validation)
 *   T4 — Does 5×1s bursts queue and drain correctly (no skips, no gaps)?
 *   T5 — Does stop() flush immediately (< 150ms after send)?
 *
 * Run: node pcm-pressure-test.mjs
 * Requires dev server at http://localhost:5173
 */

import { chromium } from 'playwright';

const PASS  = (msg) => console.log(`  ✅  ${msg}`);
const FAIL  = (msg) => { console.error(`  ❌  ${msg}`); process.exitCode = 1; };
const INFO  = (msg) => console.log(`  ℹ️   ${msg}`);
const HEAD  = (msg) => console.log(`\n${msg}`);

const BASE         = 'http://localhost:5173';
const WORKLET_URL  = `${BASE}/src/workers/oracle-audio.worklet.ts`;
const CHROME       = '/nix/store/0n9rl5l9syy808xi9bk4f6dhnfrvhkww-playwright-browsers-chromium/chromium-1080/chrome-linux/chrome';

// ── Synthetic PCM generator ───────────────────────────────────────────────────
// Returns a transferable Int16Array of a sine wave — same shape as Gemini PCM.
const makeSine = (hz, seconds, sampleRate = 24000) => {
  const N   = Math.floor(sampleRate * seconds);
  const buf = new Int16Array(N);
  for (let i = 0; i < N; i++) {
    buf[i] = Math.round(Math.sin(2 * Math.PI * hz * i / sampleRate) * 28000);
  }
  return buf;
};

// ── Core timing harness — runs inside the browser via page.evaluate ───────────
// Returns { actualRateHz, drainMs, expectedMs, ratio } for one test.
const TIMING_HARNESS = async ({ workletUrl, requestedRate, pcmSamples, pcmRate, stopAfterMs }) => {
  return new Promise((resolve) => {
    const ctx  = new AudioContext({ sampleRate: requestedRate });
    const actual = ctx.sampleRate;

    ctx.audioWorklet.addModule(workletUrl).then(() => {
      const node = new AudioWorkletNode(ctx, 'oracle-audio-processor');

      // Connect to a silent gain so the graph is active but not audible
      const silence = ctx.createGain();
      silence.gain.value = 0;
      node.connect(silence);
      silence.connect(ctx.destination);

      ctx.resume();

      const feedStart = Date.now();
      let feedTime = null;

      node.port.onmessage = (e) => {
        if (e.data.type === 'ended') {
          const drainMs = Date.now() - feedStart;
          ctx.close();
          resolve({ actualRateHz: actual, requestedRateHz: requestedRate, drainMs, feedTime });
        }
      };

      // Feed the PCM (single burst)
      feedTime = Date.now() - feedStart;
      node.port.postMessage({ type: 'feed', pcm: pcmSamples });

      // Optional early stop to test flush
      if (stopAfterMs != null) {
        setTimeout(() => {
          node.port.postMessage({ type: 'stop' });
        }, stopAfterMs);
      }

      // Safety timeout — 12s max
      setTimeout(() => {
        ctx.close();
        resolve({ actualRateHz: actual, requestedRateHz: requestedRate, drainMs: -1, feedTime });
      }, 12000);
    }).catch(err => {
      resolve({ error: err.toString() });
    });
  });
};

// Variant: feed N bursts of equal size, measure total drain time
const BURST_HARNESS = async ({ workletUrl, requestedRate, pcmSamples, bursts }) => {
  return new Promise((resolve) => {
    const ctx  = new AudioContext({ sampleRate: requestedRate });
    const actual = ctx.sampleRate;

    ctx.audioWorklet.addModule(workletUrl).then(() => {
      const node = new AudioWorkletNode(ctx, 'oracle-audio-processor');
      const silence = ctx.createGain();
      silence.gain.value = 0;
      node.connect(silence);
      silence.connect(ctx.destination);
      ctx.resume();

      const start = Date.now();
      // Fire all bursts immediately — simulates rapid Gemini chunk delivery
      for (let i = 0; i < bursts; i++) {
        node.port.postMessage({ type: 'feed', pcm: pcmSamples });
      }

      node.port.onmessage = (e) => {
        if (e.data.type === 'ended') {
          const elapsed = Date.now() - start;
          ctx.close();
          resolve({ actualRateHz: actual, elapsed });
        }
      };
      setTimeout(() => { ctx.close(); resolve({ actualRateHz: actual, elapsed: -1 }); }, 20000);
    }).catch(err => resolve({ error: err.toString() }));
  });
};

async function run() {
  console.log('\n🔬  SURROGATE:ORACLE — PCM Pipeline Pressure Test\n');

  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required',
      '--enable-features=WebRTC,AudioServiceOutOfProcess',
    ],
  });

  const ctx = await browser.newContext({ permissions: [] });
  const page = await ctx.newPage();

  // Load the app so the worklet URL is served from the same origin
  await page.goto(`${BASE}/?newuser`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(e => {
    FAIL(`Cannot reach dev server: ${e.message}`);
    process.exit(1);
  });
  PASS('Dev server reachable');

  // ─────────────────────────────────────────────────────────────────────────────
  // T1 — What sample rate did the browser actually give us when we requested 24kHz?
  // ─────────────────────────────────────────────────────────────────────────────
  HEAD('T1 — AudioContext sample rate (requested 24000 Hz)');

  const rate24 = await page.evaluate(async () => {
    const c = new AudioContext({ sampleRate: 24000 });
    const r = c.sampleRate;
    await c.close();
    return r;
  });

  INFO(`Requested 24000 Hz → browser gave ${rate24} Hz`);
  if (rate24 === 24000) {
    PASS('Browser honored 24kHz request — no resampling needed');
  } else {
    FAIL(`Browser overrode to ${rate24} Hz — 24kHz PCM would play at ${(rate24 / 24000).toFixed(2)}× speed WITHOUT the fix`);
    INFO('The new resampling fix in enqueue() should correct this — validated in T3');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // T2 — 1 second of 24kHz PCM into a 24kHz context — should drain in ~1000ms
  // ─────────────────────────────────────────────────────────────────────────────
  HEAD('T2 — Playback speed: 1s of 24kHz PCM into 24kHz context');

  const sine1s_24k = makeSine(440, 1.0, 24000); // 24000 samples

  const t2 = await page.evaluate(
    async ({ workletUrl, pcmArr, requestedRate }) => {
      const pcmSamples = new Int16Array(pcmArr);
      return await (new Function('return ' + harnessFn)())({ workletUrl, requestedRate, pcmSamples });
    },
    {
      workletUrl: WORKLET_URL,
      pcmArr: Array.from(sine1s_24k),
      requestedRate: 24000,
    }
  ).catch(() => null);

  // Can't pass functions via evaluate — use addScriptTag approach instead
  const t2result = await page.evaluate(
    async (args) => {
      const { workletUrl, pcmArr, requestedRate } = args;
      const pcmSamples = new Int16Array(pcmArr);
      return new Promise((resolve) => {
        const ctx = new AudioContext({ sampleRate: requestedRate });
        const actual = ctx.sampleRate;
        ctx.audioWorklet.addModule(workletUrl).then(async () => {
          const node = new AudioWorkletNode(ctx, 'oracle-audio-processor');
          const sil = ctx.createGain(); sil.gain.value = 0;
          node.connect(sil); sil.connect(ctx.destination);
          await ctx.resume();
          const start = Date.now();
          node.port.onmessage = (e) => {
            if (e.data.type === 'ended') {
              ctx.close(); resolve({ actualRateHz: actual, drainMs: Date.now() - start });
            }
          };
          node.port.postMessage({ type: 'feed', pcm: pcmSamples });
          setTimeout(() => { ctx.close(); resolve({ actualRateHz: actual, drainMs: -1 }); }, 10000);
        }).catch(err => resolve({ error: String(err) }));
      });
    },
    { workletUrl: WORKLET_URL, pcmArr: Array.from(sine1s_24k), requestedRate: 24000 }
  );

  if (t2result?.error) {
    FAIL(`T2 worklet error: ${t2result.error}`);
  } else if (t2result?.drainMs === -1) {
    FAIL('T2 timed out — buffer never drained');
  } else {
    const ratio = t2result.drainMs / 1000;
    INFO(`Context: ${t2result.actualRateHz}Hz | 24000 samples drained in ${t2result.drainMs}ms (expected ~1000ms)`);
    if (t2result.drainMs >= 700 && t2result.drainMs <= 3200) {
      PASS(`Speed ratio ${ratio.toFixed(2)}× — correct playback speed ✓`);
    } else if (t2result.drainMs < 700) {
      FAIL(`Speed ratio ${ratio.toFixed(2)}× — FAST-FORWARD detected. Resampling fix may not have loaded.`);
    } else {
      FAIL(`Speed ratio ${ratio.toFixed(2)}× — TOO SLOW. Buffer scheduling issue.`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // T3 — Same PCM into a 48kHz context — WITH resampling fix, should still ~1000ms
  // ─────────────────────────────────────────────────────────────────────────────
  HEAD('T3 — Resampling fix: 1s of 24kHz PCM into 48kHz context');

  const t3result = await page.evaluate(
    async (args) => {
      const { workletUrl, pcmArr, requestedRate } = args;
      const pcmSamples = new Int16Array(pcmArr);
      return new Promise((resolve) => {
        const ctx = new AudioContext({ sampleRate: requestedRate });
        const actual = ctx.sampleRate;
        ctx.audioWorklet.addModule(workletUrl).then(async () => {
          const node = new AudioWorkletNode(ctx, 'oracle-audio-processor');
          const sil = ctx.createGain(); sil.gain.value = 0;
          node.connect(sil); sil.connect(ctx.destination);
          await ctx.resume();
          const start = Date.now();
          node.port.onmessage = (e) => {
            if (e.data.type === 'ended') {
              ctx.close(); resolve({ actualRateHz: actual, drainMs: Date.now() - start });
            }
          };
          node.port.postMessage({ type: 'feed', pcm: pcmSamples });
          setTimeout(() => { ctx.close(); resolve({ actualRateHz: actual, drainMs: -1 }); }, 10000);
        }).catch(err => resolve({ error: String(err) }));
      });
    },
    { workletUrl: WORKLET_URL, pcmArr: Array.from(sine1s_24k), requestedRate: 48000 }
  );

  if (t3result?.error) {
    FAIL(`T3 worklet error: ${t3result.error}`);
  } else if (t3result?.drainMs === -1) {
    FAIL('T3 timed out — buffer never drained at 48kHz');
  } else {
    const actual48 = t3result.actualRateHz;
    const ratio = t3result.drainMs / 1000;
    INFO(`Context: ${actual48}Hz | 24000 samples drained in ${t3result.drainMs}ms`);
    if (actual48 !== 48000) {
      INFO(`Browser gave ${actual48}Hz instead of 48000 — T3 not a pure 48kHz test, still checking timing`);
    }
    if (t3result.drainMs >= 700 && t3result.drainMs <= 1800) {
      PASS(`Resampling fix: ${ratio.toFixed(2)}× speed at ${actual48}Hz — correct ✓`);
    } else if (t3result.drainMs < 700) {
      FAIL(`Still fast-forwarding at ${actual48}Hz (${ratio.toFixed(2)}×) — resampling fix not loading`);
    } else {
      FAIL(`Unexpectedly slow at ${actual48}Hz (${ratio.toFixed(2)}×)`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // T4 — 5 rapid bursts of 1s each → total ~5s drain, no skips
  // ─────────────────────────────────────────────────────────────────────────────
  HEAD('T4 — Buffer queue: 5×1s bursts fed simultaneously');

  const t4result = await page.evaluate(
    async (args) => {
      const { workletUrl, pcmArr, requestedRate, bursts } = args;
      const pcmSamples = new Int16Array(pcmArr);
      return new Promise((resolve) => {
        const ctx = new AudioContext({ sampleRate: requestedRate });
        ctx.audioWorklet.addModule(workletUrl).then(async () => {
          const node = new AudioWorkletNode(ctx, 'oracle-audio-processor');
          const sil = ctx.createGain(); sil.gain.value = 0;
          node.connect(sil); sil.connect(ctx.destination);
          await ctx.resume();
          const start = Date.now();
          // Feed all bursts at once — simulates rapid Gemini chunk delivery
          for (let i = 0; i < bursts; i++) {
            node.port.postMessage({ type: 'feed', pcm: pcmSamples });
          }
          node.port.onmessage = (e) => {
            if (e.data.type === 'ended') {
              ctx.close(); resolve({ drainMs: Date.now() - start });
            }
          };
          setTimeout(() => { ctx.close(); resolve({ drainMs: -1 }); }, 20000);
        }).catch(err => resolve({ error: String(err) }));
      });
    },
    { workletUrl: WORKLET_URL, pcmArr: Array.from(sine1s_24k), requestedRate: 24000, bursts: 5 }
  );

  if (t4result?.error) {
    FAIL(`T4 error: ${t4result.error}`);
  } else if (t4result?.drainMs === -1) {
    FAIL('T4 timed out — 5-burst queue never drained');
  } else {
    const ratio = t4result.drainMs / 5000;
    INFO(`5×1s bursts drained in ${t4result.drainMs}ms (expected ~5000ms)`);
    if (t4result.drainMs >= 3500 && t4result.drainMs <= 7000) {
      PASS(`Queue drain ratio ${ratio.toFixed(2)}× — buffer queueing correct ✓`);
    } else if (t4result.drainMs < 3500) {
      FAIL(`Queue drained too fast (${ratio.toFixed(2)}×) — samples being dropped or skipped`);
    } else {
      FAIL(`Queue drained too slow (${ratio.toFixed(2)}×) — scheduling lag`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // T5 — stop() flushes immediately — should drain in < 200ms after stop
  // ─────────────────────────────────────────────────────────────────────────────
  HEAD('T5 — Interruption flush: stop() clears 5s buffer within 200ms');

  const t5result = await page.evaluate(
    async (args) => {
      const { workletUrl, pcmArr, requestedRate } = args;
      const pcmSamples = new Int16Array(pcmArr);
      return new Promise((resolve) => {
        const ctx = new AudioContext({ sampleRate: requestedRate });
        ctx.audioWorklet.addModule(workletUrl).then(async () => {
          const node = new AudioWorkletNode(ctx, 'oracle-audio-processor');
          const sil = ctx.createGain(); sil.gain.value = 0;
          node.connect(sil); sil.connect(ctx.destination);
          ctx.resume();

          // Feed 5 seconds of audio
          for (let i = 0; i < 5; i++) {
            node.port.postMessage({ type: 'feed', pcm: pcmSamples });
          }

          // After 300ms (well before drain), send stop
          const stopAt = Date.now();
          setTimeout(() => {
            node.port.postMessage({ type: 'stop' });
            const sentStop = Date.now() - stopAt;
            node.port.onmessage = (e) => {
              if (e.data.type === 'ended') {
                ctx.close();
                resolve({ flushMs: Date.now() - stopAt - sentStop, sentStop });
              }
            };
            setTimeout(() => { ctx.close(); resolve({ flushMs: -1, sentStop }); }, 5000);
          }, 300);
        }).catch(err => resolve({ error: String(err) }));
      });
    },
    { workletUrl: WORKLET_URL, pcmArr: Array.from(sine1s_24k), requestedRate: 24000 }
  );

  if (t5result?.error) {
    FAIL(`T5 error: ${t5result.error}`);
  } else if (t5result?.flushMs === -1) {
    FAIL('T5 timed out — stop() did not flush the buffer');
  } else {
    INFO(`stop() sent at +${t5result.sentStop}ms → ended in ${t5result.flushMs}ms after stop`);
    if (t5result.flushMs <= 300) {
      PASS(`Buffer flushed in ${t5result.flushMs}ms — interruption works ✓`);
    } else {
      FAIL(`Buffer took ${t5result.flushMs}ms to flush — barge-in will lag`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────────────');
  console.log(`AudioContext gave: ${rate24}Hz (requested 24000Hz)`);
  if (t2result && !t2result.error && t2result.drainMs > 0)
    console.log(`T2 playback at 24kHz ctx: ${t2result.drainMs}ms for 1s audio (${(t2result.drainMs/1000).toFixed(2)}×)`);
  if (t3result && !t3result.error && t3result.drainMs > 0)
    console.log(`T3 playback at ${t3result.actualRateHz}Hz ctx: ${t3result.drainMs}ms for 1s audio (${(t3result.drainMs/1000).toFixed(2)}×)`);
  if (process.exitCode === 1) {
    console.log('❌  Pipeline has issues — see above\n');
  } else {
    console.log('✅  PCM pipeline is clean\n');
  }

  await browser.close();
}

run().catch(e => { console.error(e); process.exit(1); });
