/**
 * visemeDetector.ts
 *
 * Real-time Preston Blair viseme detection from Web Audio API frequency analysis.
 * Preston Blair set: X B C D E F G H A
 */

export type Viseme = 'X' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

export interface VisemeState {
  viseme: Viseme;
  openness: number;
  rounded: number;
  spread: number;
  amplitude: number;
}

const SILENCE_THRESH = 0.05;

const BANDS = {
  low:   [300,  900],
  mid:   [900,  2500],
  high:  [2500, 5500],
} as const;

export class VisemeDetector {
  private ctx: AudioContext;
  private analyser: AnalyserNode;
  private freqBuf: Uint8Array;
  private timeBuf: Uint8Array;
  private rafId: number | null = null;
  private smoothed: VisemeState = { viseme: 'X', openness: 0, rounded: 0, spread: 0, amplitude: 0 };
  private readonly onUpdate: (s: VisemeState) => void;

  constructor(onUpdate: (s: VisemeState) => void, existingContext?: AudioContext) {
    this.ctx = existingContext || new (window.AudioContext || (window as any).webkitAudioContext)();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.5;
    this.freqBuf = new Uint8Array(this.analyser.frequencyBinCount);
    this.timeBuf = new Uint8Array(this.analyser.fftSize);
    this.onUpdate = onUpdate;
  }

  public getAnalyser(): AnalyserNode {
    return this.analyser;
  }

  public start() {
    if (this.rafId !== null) return;
    const tick = () => {
      this.analyser.getByteFrequencyData(this.freqBuf);
      this.analyser.getByteTimeDomainData(this.timeBuf);
      const raw = this._analyze();
      this.smoothed = this._lerpState(this.smoothed, raw, 0.4);
      this.onUpdate(this.smoothed);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  public stop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private _analyze(): VisemeState {
    const bins = this.freqBuf.length;
    const sampleRate = this.ctx.sampleRate;
    const binHz = sampleRate / (2 * bins);

    let totalE = 0;
    let lowE = 0, midE = 0, highE = 0;
    let weightedF = 0;

    for (let i = 0; i < bins; i++) {
      const v = this.freqBuf[i] / 255;
      const hz = i * binHz;
      totalE += v;
      weightedF += v * hz;
      if (hz >= BANDS.low[0]  && hz < BANDS.low[1])  lowE  += v;
      if (hz >= BANDS.mid[0]  && hz < BANDS.mid[1])  midE  += v;
      if (hz >= BANDS.high[0] && hz < BANDS.high[1]) highE += v;
    }

    const amplitude = Math.min(1, totalE / (bins * 0.2));
    if (amplitude < SILENCE_THRESH) {
      return { viseme: 'X', openness: 0, rounded: 0, spread: 0, amplitude: 0 };
    }

    const T = totalE || 1;
    const centroid = weightedF / (T * sampleRate / 2);

    let zcr = 0;
    for (let i = 1; i < this.timeBuf.length; i++) {
      const a = (this.timeBuf[i - 1] / 128) - 1;
      const b = (this.timeBuf[i]     / 128) - 1;
      if ((a > 0) !== (b > 0)) zcr++;
    }
    const zcrN = zcr / this.timeBuf.length;

    return this._classify(amplitude, centroid, zcrN, lowE / T, midE / T, highE / T);
  }

  private _classify(amp: number, centroid: number, zcrN: number, lr: number, mr: number, hr: number): VisemeState {
    let viseme: Viseme;
    let openness: number;
    let rounded: number;
    let spread: number;

    if (hr > 0.40 && zcrN > 0.15) {
      viseme = 'F'; openness = 0.2; rounded = 0; spread = 0.1;
    } else if (lr > 0.50 && centroid < 0.15) {
      viseme = 'A'; openness = 0.8; rounded = 0.1; spread = 0.1;
    } else if (centroid > 0.30 && mr > 0.40) {
      viseme = 'E'; openness = 0.3; rounded = 0; spread = 0.8;
    } else if (centroid < 0.10 && lr > 0.40) {
      viseme = 'H'; openness = 0.2; rounded = 0.9; spread = 0;
    } else {
      viseme = 'C'; openness = 0.4; rounded = 0.2; spread = 0.3;
    }

    return { viseme, openness, rounded, spread, amplitude: amp };
  }

  private _lerpState(a: VisemeState, b: VisemeState, t: number): VisemeState {
    const lerp = (x: number, y: number) => x + (y - x) * t;
    return {
      viseme: b.amplitude > a.amplitude ? b.viseme : a.viseme,
      openness: lerp(a.openness, b.openness),
      rounded: lerp(a.rounded, b.rounded),
      spread: lerp(a.spread, b.spread),
      amplitude: lerp(a.amplitude, b.amplitude),
    };
  }
}
