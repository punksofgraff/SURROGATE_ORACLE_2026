/**
 * SURROGATE:ORACLE — PCM Pipeline Pressure Test
 * Paste into DevTools console while the app is open.
 * Tests the actual AudioContext + AudioWorklet your browser is running.
 */
(async () => {
  const LOG = (emoji, label, msg) => console.log(`${emoji} [PCM-TEST] ${label}: ${msg}`);
  const PASS = (l, m) => LOG('✅', l, m);
  const FAIL = (l, m) => console.error(`❌ [PCM-TEST] ${l}: ${m}`);
  const INFO = (l, m) => LOG('ℹ️ ', l, m);

  // ── 1. Check actual AudioContext sample rate ──────────────────────────────
  const appCtx = window.__audioContext;
  if (appCtx) {
    const rate = appCtx.sampleRate;
    INFO('App AudioContext', `sampleRate = ${rate} Hz (requested 24000)`);
    if (rate === 24000) PASS('sample-rate', 'Browser honored 24kHz request');
    else FAIL('sample-rate', `Browser gave ${rate}Hz — WITHOUT resampling fix, audio plays at ${(rate/24000).toFixed(2)}× speed (fast-forward)`);
  } else {
    INFO('App AudioContext', 'window.__audioContext not found — tap the cabinet first');
  }

  // ── Sine wave generator (24kHz, 1 second = 24000 samples) ────────────────
  const makeSine = (hz = 440, seconds = 1, sr = 24000) => {
    const N = sr * seconds;
    const buf = new Int16Array(N);
    for (let i = 0; i < N; i++) buf[i] = Math.round(Math.sin(2 * Math.PI * hz * i / sr) * 28000);
    return buf;
  };

  const workletUrl = '/src/workers/oracle-audio.worklet.ts';
  const sine1s = makeSine(440, 1, 24000); // 1 second of 24kHz audio

  // ── Helper: load worklet on a context, feed PCM, return drain time ────────
  const timeDrain = (ctx, pcm) => new Promise((resolve) => {
    ctx.audioWorklet.addModule(workletUrl).then(() => {
      const node = new AudioWorkletNode(ctx, 'oracle-audio-processor');
      const sil = ctx.createGain(); sil.gain.value = 0;
      node.connect(sil); sil.connect(ctx.destination);
      ctx.resume();
      const start = Date.now();
      node.port.onmessage = (e) => {
        if (e.data.type === 'ended') resolve({ ms: Date.now() - start, rate: ctx.sampleRate });
      };
      node.port.postMessage({ type: 'feed', pcm });
      setTimeout(() => resolve({ ms: -1, rate: ctx.sampleRate }), 8000);
    }).catch(e => resolve({ ms: -1, error: String(e), rate: ctx.sampleRate }));
  });

  // ── T2: 24kHz context — 1s PCM should drain in ~1000ms ───────────────────
  INFO('T2', 'Loading worklet at 24kHz context...');
  const ctx24 = new AudioContext({ sampleRate: 24000 });
  const t2 = await timeDrain(ctx24, sine1s.slice()); // slice = copy so we can reuse
  await ctx24.close();
  if (t2.error) {
    FAIL('T2', t2.error);
  } else if (t2.ms === -1) {
    FAIL('T2', 'Timed out — worklet may not be loading from /src/...');
  } else {
    const ratio = (t2.ms / 1000).toFixed(2);
    INFO('T2', `Context ${t2.rate}Hz | 24000 samples drained in ${t2.ms}ms (expected ~1000ms)`);
    if (t2.ms >= 700 && t2.ms <= 1500) PASS('T2-speed', `${ratio}× — correct ✓`);
    else if (t2.ms < 700) FAIL('T2-speed', `${ratio}× — FAST-FORWARD. Resampling not active.`);
    else FAIL('T2-speed', `${ratio}× — too slow, scheduling issue`);
  }

  // ── T3: 48kHz context — with resampling fix, same PCM should still ~1000ms ─
  INFO('T3', 'Loading worklet at 48kHz context (resampling fix test)...');
  const ctx48 = new AudioContext({ sampleRate: 48000 });
  const t3 = await timeDrain(ctx48, sine1s.slice());
  await ctx48.close();
  if (t3.error) {
    FAIL('T3', t3.error);
  } else if (t3.ms === -1) {
    FAIL('T3', 'Timed out');
  } else {
    const ratio = (t3.ms / 1000).toFixed(2);
    INFO('T3', `Context ${t3.rate}Hz | 24000 samples drained in ${t3.ms}ms`);
    if (t3.ms >= 700 && t3.ms <= 1800) PASS('T3-resample', `${ratio}× at ${t3.rate}Hz — resampling fix works ✓`);
    else if (t3.ms < 700) FAIL('T3-resample', `${ratio}× — still fast at 48kHz, fix not loading`);
    else FAIL('T3-resample', `${ratio}×`);
  }

  // ── T4: 5-burst queue — 5s total ─────────────────────────────────────────
  INFO('T4', '5 bursts of 1s each — testing queue...');
  const ctx4 = new AudioContext({ sampleRate: 24000 });
  const t4 = await new Promise((resolve) => {
    ctx4.audioWorklet.addModule(workletUrl).then(() => {
      const node = new AudioWorkletNode(ctx4, 'oracle-audio-processor');
      const sil = ctx4.createGain(); sil.gain.value = 0;
      node.connect(sil); sil.connect(ctx4.destination);
      ctx4.resume();
      const start = Date.now();
      for (let i = 0; i < 5; i++) node.port.postMessage({ type: 'feed', pcm: sine1s.slice() });
      node.port.onmessage = (e) => { if (e.data.type === 'ended') resolve(Date.now() - start); };
      setTimeout(() => resolve(-1), 15000);
    }).catch(() => resolve(-1));
  });
  await ctx4.close();
  if (t4 === -1) FAIL('T4-queue', 'Timed out');
  else {
    const ratio = (t4 / 5000).toFixed(2);
    INFO('T4', `5 bursts drained in ${t4}ms (expected ~5000ms)`);
    if (t4 >= 3500 && t4 <= 7000) PASS('T4-queue', `${ratio}× — buffer queueing correct ✓`);
    else if (t4 < 3500) FAIL('T4-queue', `${ratio}× — samples dropped`);
    else FAIL('T4-queue', `${ratio}× — scheduling lag`);
  }

  // ── T5: stop() flushes within 200ms ──────────────────────────────────────
  INFO('T5', 'Interrupt test — 5s queued, stop() at 300ms...');
  const ctx5 = new AudioContext({ sampleRate: 24000 });
  const t5 = await new Promise((resolve) => {
    ctx5.audioWorklet.addModule(workletUrl).then(() => {
      const node = new AudioWorkletNode(ctx5, 'oracle-audio-processor');
      const sil = ctx5.createGain(); sil.gain.value = 0;
      node.connect(sil); sil.connect(ctx5.destination);
      ctx5.resume();
      for (let i = 0; i < 5; i++) node.port.postMessage({ type: 'feed', pcm: sine1s.slice() });
      setTimeout(() => {
        const stopSent = Date.now();
        node.port.postMessage({ type: 'stop' });
        node.port.onmessage = (e) => {
          if (e.data.type === 'ended') resolve(Date.now() - stopSent);
        };
        setTimeout(() => resolve(-1), 3000);
      }, 300);
    }).catch(() => resolve(-1));
  });
  await ctx5.close();
  if (t5 === -1) FAIL('T5-flush', 'stop() did not flush');
  else if (t5 <= 250) PASS('T5-flush', `Flushed in ${t5}ms ✓`);
  else FAIL('T5-flush', `Took ${t5}ms — barge-in will lag`);

  console.log('\n[PCM-TEST] ─── Done ───');
})();
