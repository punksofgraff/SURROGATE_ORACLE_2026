/**
 * oracleSfx.ts — Synthesized sound design for SURROGATE:ORACLE
 *
 * All sounds generated via Web Audio API oscillators + noise buffers.
 * No external audio files. No CORS. No preloading.
 *
 * Design character: cyberpunk oracle — electric, resonant, alive.
 * Gain levels calibrated to layer under the GraffPunks radio at 0.28 volume.
 *
 * ⚠️  Must only be called inside a user-gesture handler (tap/click).
 *     Web Audio API requires user interaction before AudioContext can run.
 */

let _ctx: AudioContext | null = null;

/**
 * Returns the unified AudioContext for the entire application (the 'Audio Spine').
 * Must be called inside a user gesture handler to ensure it starts in 'running' state.
 */
export function getAudioContext(): AudioContext {
  if (!_ctx || _ctx.state === 'closed') {
    _ctx = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 24000 // Match Gemini PCM stream exactly
    });
    // Expose for testing
    if (typeof window !== 'undefined') {
      (window as any).__audioContext = _ctx;
    }
  }
  if (_ctx.state === 'suspended') {
    _ctx.resume().catch(() => {});
  }
  return _ctx;
}

function ctx(): AudioContext {
  return getAudioContext();
}

/** Soft distortion waveshaper — adds edge without harshness */
function makeDistortionCurve(amount = 80): Float32Array<ArrayBuffer> {
  const k = amount;
  const buf = new ArrayBuffer(256 * 4);
  const curve = new Float32Array(buf);
  for (let i = 0; i < 256; i++) {
    const x = (i * 2) / 256 - 1;
    curve[i] = ((Math.PI + k) * x) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

/** White noise buffer — reusable across sfx calls */
function makeNoiseBuffer(c: AudioContext, durationSec: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * durationSec);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

// ── 1. ACTIVATION SFX ────────────────────────────────────────────────────────
// Fired when the user taps to enter (enterTerminal).
// Character: sharp electric discharge — a portal cracking open.
// Duration: ~550ms.

  export function playActivationSfx(): void {
    try {
      const c = ctx();
      const t = c.currentTime;

      // Filtered noise burst — wide-to-narrow sweep
      const noise = c.createBufferSource();
      noise.buffer = makeNoiseBuffer(c, 0.35);

      const noiseFilter = c.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(4000, t);
      noiseFilter.frequency.exponentialRampToValueAtTime(120, t + 0.3);
      noiseFilter.Q.value = 2.5;

      const noiseGain = c.createGain();
      noiseGain.gain.setValueAtTime(0.10, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(c.destination);
      noise.start(t);
      noise.stop(t + 0.38);

      // Soft presence chime — replaced the hard knife-stab thud
      const chime = c.createOscillator();
      chime.type = 'sine';
      chime.frequency.setValueAtTime(1200, t);
      chime.frequency.exponentialRampToValueAtTime(180, t + 0.55);

      const chimeGain = c.createGain();
      chimeGain.gain.setValueAtTime(0.06, t);
      chimeGain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);

      chime.connect(chimeGain);
      chimeGain.connect(c.destination);
      chime.start(t);
      chime.stop(t + 0.56);

    } catch { /* silently fail on restricted contexts */ }
  }

// ── 2. ALLEY AMBIENCE ─────────────────────────────────────────────────────────
// Low-frequency drone during the lore terminal phase.
// Character: the alley itself has a heartbeat — felt more than heard.
// Returns a stop() function. Call stop() when lore ends.

export function startAlleyAmbience(): () => void {
  try {
    const c = ctx();
    const t = c.currentTime;

    // Sub-bass fundamental (42Hz — felt on speakers/headphones)
    const sub = c.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 42;

    // Mid harmonic (126Hz — audible on phone speakers)
    const mid = c.createOscillator();
    mid.type = 'triangle';
    mid.frequency.value = 126;

    // High shimmer (294Hz — texture)
    const shimmer = c.createOscillator();
    shimmer.type = 'sine';
    shimmer.frequency.value = 294;

    // Individual level controls
    const subGain = c.createGain();
    subGain.gain.value = 0.55;
    const midGain = c.createGain();
    midGain.gain.value = 0.30;
    const shimmerGain = c.createGain();
    shimmerGain.gain.value = 0.15;

    const masterGain = c.createGain();
    masterGain.gain.setValueAtTime(0, t);
    masterGain.gain.linearRampToValueAtTime(0.042, t + 2.2); // slow fade in

    sub.connect(subGain);
    mid.connect(midGain);
    shimmer.connect(shimmerGain);
    subGain.connect(masterGain);
    midGain.connect(masterGain);
    shimmerGain.connect(masterGain);
    masterGain.connect(c.destination);

    sub.start(t);
    mid.start(t);
    shimmer.start(t);

    return () => {
      try {
        const stopAt = c.currentTime + 1.0;
        masterGain.gain.cancelScheduledValues(c.currentTime);
        masterGain.gain.linearRampToValueAtTime(0, stopAt);
        sub.stop(stopAt);
        mid.stop(stopAt);
        shimmer.stop(stopAt);
      } catch { /* already stopped */ }
    };
  } catch {
    return () => {};
  }
}

// ── 3. ORACLE PRESENCE ───────────────────────────────────────────────────────
// Fired just before the Oracle's audio begins playing.
// Character: a consciousness arriving before its words — ascending shimmer
// that primes the ear for the Oracle's voice.
// Duration: ~320ms.

export function playOraclePresence(): void {
  try {
    const c = ctx();
    const t = c.currentTime;

    // Rising shimmer — filtered noise sweeping upward
    const noise = c.createBufferSource();
    noise.buffer = makeNoiseBuffer(c, 0.32);

    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(300, t);
    filter.frequency.exponentialRampToValueAtTime(3200, t + 0.26);
    filter.Q.value = 3.5;

    const shimmerGain = c.createGain();
    shimmerGain.gain.setValueAtTime(0, t);
    shimmerGain.gain.linearRampToValueAtTime(0.07, t + 0.06);
    shimmerGain.gain.linearRampToValueAtTime(0, t + 0.30);

    noise.connect(filter);
    filter.connect(shimmerGain);
    shimmerGain.connect(c.destination);
    noise.start(t);
    noise.stop(t + 0.33);

    // Resonant tone — the Oracle's fundamental frequency (220Hz, its register)
    const tone = c.createOscillator();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(220, t);
    tone.frequency.linearRampToValueAtTime(330, t + 0.22);

    const toneGain = c.createGain();
    toneGain.gain.setValueAtTime(0, t);
    toneGain.gain.linearRampToValueAtTime(0.055, t + 0.07);
    toneGain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

    tone.connect(toneGain);
    toneGain.connect(c.destination);
    tone.start(t);
    tone.stop(t + 0.32);

  } catch { /* silently fail */ }
}

// ── 4. EXIT TONE ──────────────────────────────────────────────────────────────
// Fired when the Oracle session closes.
// Character: the channel collapsing — energy dissipating, portal sealing.
// Duration: ~1.2s.

export function playExitTone(): void {
  try {
    const c = ctx();
    const t = c.currentTime;

    // Descending sine — the Oracle's voice frequency falling away
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(330, t);
    osc.frequency.exponentialRampToValueAtTime(36, t + 1.1);

    const oscGain = c.createGain();
    oscGain.gain.setValueAtTime(0.11, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 1.1);

    osc.connect(oscGain);
    oscGain.connect(c.destination);
    osc.start(t);
    osc.stop(t + 1.15);

    // Noise tail — static dissipating to silence
    const noise = c.createBufferSource();
    noise.buffer = makeNoiseBuffer(c, 1.0);

    const noiseFilter = c.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(3000, t);
    noiseFilter.frequency.exponentialRampToValueAtTime(80, t + 0.9);

    const noiseGain = c.createGain();
    noiseGain.gain.setValueAtTime(0.05, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.95);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(c.destination);
    noise.start(t);
    noise.stop(t + 1.0);

  } catch { /* silently fail */ }
}
