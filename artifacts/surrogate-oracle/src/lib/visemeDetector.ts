/**
 * visemeDetector.ts
 *
 * Real-time Preston Blair viseme detection from Web Audio API frequency analysis.
 * Also exports a WAV-buffer batch analyzer for pre-computing accurate timelines
 * (used by the rhubarb-lipsync edge function result consumer).
 *
 * Preston Blair set: X B C D E F G H A
 *   X — silence / rest
 *   B — bilabial stop (b, m, p) — lips together
 *   C — dental fricative (d, k, n, s, th) — slightly open
 *   D — dental open (th with tongue) — wider open
 *   E — "ee" tense smile (e, i) — wide, flat
 *   F — labiodental (f, v) — top teeth on lower lip
 *   G — mid vowel (oh, u) — rounded mid
 *   H — "oo" puckered (w, q) — tight pucker
 *   A — open vowel (ah, a) — widest open
 */

export type Viseme = 'X' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

export interface VisemeState {
  viseme: Viseme;
  /** 0–1 jaw drop */
  openness: number;
  /** 0–1 lip pucker */
  rounded: number;
  /** 0–1 lip spread (smile-like) */
  spread: number;
  /** 0–1 overall signal amplitude  */
  amplitude: number;
}

export interface RhubarbCue {
  start: number;
  end: number;
  value: Viseme;
}

// ── Silence threshold — below this amplitude → X ────────────────────────────
const SILENCE_THRESH = 0.06;

// ── Spectral band boundaries (Hz) ───────────────────────────────────────────
const BANDS = {
  sub:   [20,   300],
  low:   [300,  900],
  mid:   [900,  2500],
  high:  [2500, 5500],
  air:   [5500, 16000],
} as const;

// ── Real-time detector ───────────────────────────────────────────────────────

export class VisemeDetector {
  private ctx: AudioContext;
  private analyser: AnalyserNode;
  private source: MediaElementAudioSourceNode | null = null;
  private freqBuf: Uint8Array<ArrayBuffer>;
  private timeBuf: Uint8Array<ArrayBuffer>;
  private rafId: number | null = null;
  private smoothed: VisemeState = { viseme: 'X', openness: 0, rounded: 0, spread: 0, amplitude: 0 };
  private readonly onUpdate: (s: VisemeState) => void;
  // Adaptive frame rate — monitor rolling δt; drop to 30fps on slow devices
  private frameTimeBuffer: number[] = [];
  private lastFrameTime: number = 0;
  private halfFrameMode: boolean = false;
  private frameCounter: number = 0;
  // Detect mobile once at construction — halves FFT bin count for CPU relief
  private readonly isMobileFft: boolean = (
    typeof navigator !== 'undefined' &&
    /Mobi|Android|iPhone/i.test(navigator.userAgent)
  );

  constructor(onUpdate: (s: VisemeState) => void, existingCtx?: AudioContext) {
    this.ctx = existingCtx || new AudioContext();
    this.analyser = this.ctx.createAnalyser();
    // 512 bins on mobile (halves per-frame iteration cost), 1024 on desktop
    this.analyser.fftSize = this.isMobileFft ? 512 : 1024;
    this.analyser.smoothingTimeConstant = 0.6;
    this.freqBuf = new Uint8Array(this.analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
    this.timeBuf = new Uint8Array(this.analyser.fftSize) as Uint8Array<ArrayBuffer>;
    // NOTE: do NOT connect analyser → destination here.
    // PCMPlayer routes audio through its HRTF panner → destination.
    // The analyser is a read-only side-tap; connecting it would play audio twice.
    this.onUpdate = onUpdate;
  }

  connect(source: AudioNode | HTMLAudioElement) {
    if (this.source) this.source.disconnect();
    if (source instanceof HTMLAudioElement) {
      this.source = this.ctx.createMediaElementSource(source);
    } else {
      this.source = source as any;
    }
    this.source!.connect(this.analyser);
  }

  getAnalyser() {
    return this.analyser;
  }

  getContext() {
    return this.ctx;
  }

  resume() {
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  start() {
    this.lastFrameTime = performance.now();
    // RAF passes DOMHighResTimeStamp as first argument — use it directly (no extra call)
    const tick = (now: number) => {
      const dt = now - this.lastFrameTime;
      this.lastFrameTime = now;

      // ── Rolling 8-frame δt window for adaptive mode ──────────────────────
      this.frameTimeBuffer.push(dt);
      if (this.frameTimeBuffer.length > 8) this.frameTimeBuffer.shift();
      if (this.frameTimeBuffer.length === 8) {
        const sorted = [...this.frameTimeBuffer].sort((a, b) => a - b);
        const median = sorted[4];
        // Hysteresis: enter 30fps at >25ms median, exit at <18ms (avoid oscillation)
        if (!this.halfFrameMode && median > 25) this.halfFrameMode = true;
        if ( this.halfFrameMode && median < 18) this.halfFrameMode = false;
      }

      // ── Skip alternate frames in half-frame mode (→ 30fps on slow devices) ─
      this.frameCounter++;
      const skip = this.halfFrameMode && (this.frameCounter & 1) === 0;

      if (!skip) {
        this.analyser.getByteFrequencyData(this.freqBuf);
        this.analyser.getByteTimeDomainData(this.timeBuf);
        const raw = this._analyze();
        // Smooth state transitions so the mouth doesn't flicker
        this.smoothed = lerpVisemeState(this.smoothed, raw, 0.35);
        this.onUpdate(this.smoothed);
      }

      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  destroy() {
    this.stop();
    this.source?.disconnect();
    this.ctx.close();
  }

  private _analyze(): VisemeState {
    const bins = this.freqBuf.length;
    const sampleRate = this.ctx.sampleRate;
    const binHz = sampleRate / (2 * bins);

    // Band energies
    let totalE = 0;
    let subE = 0, lowE = 0, midE = 0, highE = 0;
    let weightedF = 0;

    for (let i = 0; i < bins; i++) {
      const v = this.freqBuf[i] / 255;
      const hz = i * binHz;
      totalE += v;
      weightedF += v * hz;
      if (hz >= BANDS.sub[0]  && hz < BANDS.sub[1])  subE  += v;
      if (hz >= BANDS.low[0]  && hz < BANDS.low[1])  lowE  += v;
      if (hz >= BANDS.mid[0]  && hz < BANDS.mid[1])  midE  += v;
      if (hz >= BANDS.high[0] && hz < BANDS.high[1]) highE += v;
    }

    const amplitude = Math.min(1, totalE / (bins * 0.25));
    if (amplitude < SILENCE_THRESH) {
      return { viseme: 'X', openness: 0, rounded: 0, spread: 0, amplitude };
    }

    // Normalise band ratios
    const T = totalE || 1;
    const lr = lowE  / T;
    const mr = midE  / T;
    const hr = highE / T;

    // Spectral centroid 0–1 (normalised to Nyquist)
    const centroid = weightedF / (T * sampleRate / 2);

    // Zero crossing rate — voiced (low ZCR) vs unvoiced (high ZCR)
    let zcr = 0;
    for (let i = 1; i < this.timeBuf.length; i++) {
      const a = (this.timeBuf[i - 1] / 128) - 1;
      const b = (this.timeBuf[i]     / 128) - 1;
      if ((a > 0) !== (b > 0)) zcr++;
    }
    const zcrN = zcr / this.timeBuf.length;

    return classifyViseme(amplitude, centroid, zcrN, lr, mr, hr);
  }
}

// ── Batch WAV analyzer (for pre-computed timelines) ──────────────────────────
// Produces Rhubarb-compatible cue format from raw PCM Float32 samples.

export function analyzeWavPcm(
  samples: Float32Array,
  sampleRate: number,
  windowMs = 20,
  hopMs = 10,
): RhubarbCue[] {
  const windowSamples = Math.round(sampleRate * windowMs / 1000);
  const hopSamples    = Math.round(sampleRate * hopMs / 1000);
  const cues: RhubarbCue[] = [];

  let prevViseme: Viseme = 'X';
  let segStart = 0;
  const totalWindows = Math.floor((samples.length - windowSamples) / hopSamples) + 1;

  for (let w = 0; w < totalWindows; w++) {
    const offset = w * hopSamples;
    const frame  = samples.slice(offset, offset + windowSamples);
    const t      = offset / sampleRate;

    // Amplitude
    let rms = 0;
    for (let i = 0; i < frame.length; i++) rms += frame[i] * frame[i];
    rms = Math.sqrt(rms / frame.length);
    const amplitude = Math.min(1, rms * 4);

    if (amplitude < SILENCE_THRESH) {
      if (prevViseme !== 'X') {
        cues.push({ start: segStart, end: t, value: prevViseme });
        segStart = t;
        prevViseme = 'X';
      }
      continue;
    }

    // Minimal frequency features via autocorrelation-based band energy
    const { centroid, zcrN, lr, mr, hr } = spectralFeaturesFromPcm(frame, sampleRate);
    const state = classifyViseme(amplitude, centroid, zcrN, lr, mr, hr);

    if (state.viseme !== prevViseme) {
      if (w > 0) cues.push({ start: segStart, end: t, value: prevViseme });
      segStart = t;
      prevViseme = state.viseme;
    }
  }

  // Close last segment
  const endT = samples.length / sampleRate;
  cues.push({ start: segStart, end: endT, value: prevViseme });

  return mergeShortCues(cues, 0.04); // merge runs < 40ms to reduce flicker
}

// ── Shared viseme classifier ─────────────────────────────────────────────────

function classifyViseme(
  amplitude: number,
  centroid: number,
  zcrN: number,
  lr: number, mr: number, hr: number,
): VisemeState {
  let viseme: Viseme;
  let openness: number;
  let rounded: number;
  let spread: number;

  if (hr > 0.40 && zcrN > 0.14) {
    // High freq + high ZCR → labiodental / fricative (f, v, s, sh)
    viseme   = 'F';
    openness = 0.25;
    rounded  = 0.05;
    spread   = 0.15;
  } else if (lr > 0.52 && centroid < 0.12) {
    // Sub/low dominant, low centroid → open vowel ah
    viseme   = 'A';
    openness = 0.65 + amplitude * 0.30;
    rounded  = 0.08;
    spread   = 0.10;
  } else if (centroid > 0.32 && mr > 0.38) {
    // High centroid, mid dominant → "ee" / front vowels
    viseme   = 'E';
    openness = 0.30;
    rounded  = 0.02;
    spread   = 0.72;
  } else if (centroid < 0.10 && lr > 0.30 && mr > 0.30) {
    // Low centroid, mixed low/mid → "oo" / "w" pucker
    viseme   = 'H';
    openness = 0.20;
    rounded  = 0.88;
    spread   = 0.02;
  } else if (mr > 0.46 && centroid > 0.15 && centroid < 0.28) {
    // Mid dominant, moderate centroid → "oh"
    viseme   = 'G';
    openness = 0.45;
    rounded  = 0.48;
    spread   = 0.08;
  } else if (amplitude > 0.25 && zcrN < 0.07 && centroid < 0.18) {
    // Voiced, low centroid → bilabial (b, m, p) — lips closed
    viseme   = 'B';
    openness = 0.08;
    rounded  = 0.18;
    spread   = 0.10;
  } else if (hr > 0.22 && mr > 0.35) {
    // Mid-high mix → dental (d, n, t, th)
    viseme   = 'D';
    openness = 0.38;
    rounded  = 0.12;
    spread   = 0.22;
  } else {
    // Default neutral open
    viseme   = 'C';
    openness = 0.28 + amplitude * 0.22;
    rounded  = 0.20;
    spread   = 0.18;
  }

  return { viseme, openness, rounded, spread, amplitude };
}

// ── Spectral features from raw PCM frame ────────────────────────────────────

function spectralFeaturesFromPcm(
  frame: Float32Array,
  sampleRate: number,
): { centroid: number; zcrN: number; lr: number; mr: number; hr: number } {
  // Zero crossing rate
  let zcr = 0;
  for (let i = 1; i < frame.length; i++) {
    if ((frame[i - 1] > 0) !== (frame[i] > 0)) zcr++;
  }
  const zcrN = zcr / frame.length;

  // Rough band energy via windowed autocorrelation proxy
  // (Full FFT not available without Web Audio in edge fn — use band-pass approximations)
  const N = frame.length;
  let lowE = 0, midE = 0, highE = 0, totalE = 0, weightedF = 0;

  // Simple DFT for band energy estimation (sampled at logarithmically-spaced freqs)
  const freqs = [150, 400, 700, 1200, 1800, 2600, 3500, 5000, 7000];
  for (const f of freqs) {
    let re = 0, im = 0;
    const omega = (2 * Math.PI * f) / sampleRate;
    const step = Math.max(1, Math.floor(N / 128)); // downsample for perf
    for (let i = 0; i < N; i += step) {
      re += frame[i] * Math.cos(omega * i);
      im += frame[i] * Math.sin(omega * i);
    }
    const mag = Math.sqrt(re * re + im * im) / (N / step);
    totalE    += mag;
    weightedF += mag * f;
    if (f < 900)  lowE  += mag;
    if (f >= 900  && f < 2500) midE  += mag;
    if (f >= 2500) highE += mag;
  }

  const T = totalE || 1;
  const centroid = weightedF / (T * sampleRate / 2);

  return {
    centroid,
    zcrN,
    lr: lowE  / T,
    mr: midE  / T,
    hr: highE / T,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function lerpVisemeState(a: VisemeState, b: VisemeState, t: number): VisemeState {
  const lerp = (x: number, y: number) => x + (y - x) * t;
  // Hard-switch viseme category but smooth the continuous params
  return {
    viseme:   b.viseme,
    openness: lerp(a.openness,  b.openness),
    rounded:  lerp(a.rounded,   b.rounded),
    spread:   lerp(a.spread,    b.spread),
    amplitude: lerp(a.amplitude, b.amplitude),
  };
}

function mergeShortCues(cues: RhubarbCue[], minDuration: number): RhubarbCue[] {
  const out: RhubarbCue[] = [];
  for (const cue of cues) {
    const dur = cue.end - cue.start;
    if (dur < minDuration && out.length > 0) {
      out[out.length - 1].end = cue.end; // absorb into previous
    } else {
      out.push({ ...cue });
    }
  }
  return out;
}
