/**
 * oracle-audio.worklet.ts
 *
 * Enterprise-grade AudioWorklet for SURROGATE:ORACLE.
 * Handles gapless PCM streaming playback and real-time viseme detection
 * on the audio thread, isolated from main-thread GC and UI stutters.
 */

// ── Global Declarations ──────────────────────────────────────────────────────
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}
declare function registerProcessor(name: string, processorCtor: any): void;
declare const currentTime: number;
declare const sampleRate: number;

type Viseme = 'X' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

interface VisemeState {
  viseme: Viseme;
  openness: number;
  rounded: number;
  spread: number;
  amplitude: number;
}

const SILENCE_THRESH = 0.05; // Slightly higher for more robustness

class OracleAudioProcessor extends AudioWorkletProcessor {
  private buffer: Float32Array;
  private head: number = 0;
  private tail: number = 0;
  private size: number = 0;
  private readonly bufferCapacity: number = 240000; // 10 seconds at 24kHz

  private smoothed: VisemeState = { viseme: 'X', openness: 0, rounded: 0, spread: 0, amplitude: 0 };
  
  private lastUpdate: number = 0;
  private readonly UPDATE_INTERVAL: number = 1 / 60; 

  constructor() {
    super();
    this.buffer = new Float32Array(this.bufferCapacity);
    this.port.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'feed') {
        this.enqueue(e.data.pcm);
      } else if (e.data.type === 'stop') {
        this.clear();
      }
    };
  }

  private enqueue(data: Int16Array) {
    const len = data.length;
    
    // If we're about to overflow, we MUST advance the head to drop old data
    // so we don't end up with a huge latency or a corrupted buffer.
    if (this.size + len > this.bufferCapacity) {
      const overflow = (this.size + len) - this.bufferCapacity;
      this.head = (this.head + overflow) % this.bufferCapacity;
      this.size -= overflow;
    }

    for (let i = 0; i < len; i++) {
      this.buffer[this.tail] = data[i] / 32768.0;
      this.tail = (this.tail + 1) % this.bufferCapacity;
    }
    this.size += len;
  }

  private dequeue(len: number, output: Float32Array) {
    const actual = Math.min(len, this.size);
    for (let i = 0; i < actual; i++) {
      output[i] = this.buffer[this.head];
      this.head = (this.head + 1) % this.bufferCapacity;
    }
    this.size -= actual;
    for (let i = actual; i < len; i++) {
      output[i] = 0;
    }
  }

  private clear() {
    this.head = 0;
    this.tail = 0;
    this.size = 0;
    this.buffer.fill(0);
    this.smoothed = { viseme: 'X', openness: 0, rounded: 0, spread: 0, amplitude: 0 };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    const output = outputs[0][0];
    if (!output) return true;

    const prevSize = this.size;
    this.dequeue(output.length, output);

    if (prevSize > 0 && this.size === 0) {
      this.port.postMessage({ type: 'ended' });
    }

    const state = this.analyze(output);
    
    // If analyzed state is silent, force a faster decay or snap to zero
    if (state.amplitude === 0) {
      this.smoothed.amplitude *= 0.70;
      if (this.smoothed.amplitude < 0.001) {
        this.smoothed.amplitude = 0;
        this.smoothed.viseme = 'X';
      }
      this.smoothed.openness *= 0.70;
      this.smoothed.rounded *= 0.70;
      this.smoothed.spread *= 0.70;
    } else {
      // Use faster lerp for decay (when current amplitude is lower than smoothed)
      const lerpFactor = state.amplitude < this.smoothed.amplitude ? 0.15 : 0.45;
      this.smoothed = this.lerpState(this.smoothed, state, lerpFactor);
    }

    const now = currentTime;
    if (now - this.lastUpdate > this.UPDATE_INTERVAL) {
      this.port.postMessage({ type: 'viseme', state: this.smoothed });
      this.lastUpdate = now;
    }

    return true;
  }

  private analyze(frame: Float32Array): VisemeState {
    const sRate = typeof sampleRate !== 'undefined' ? sampleRate : 24000;
    
    let rms = 0;
    for (let i = 0; i < frame.length; i++) rms += frame[i] * frame[i];
    rms = Math.sqrt(rms / (frame.length || 1));
    
    // Explicitly zero-out near-silent signals to allow decay
    const amplitude = rms < 0.005 ? 0 : Math.min(1, rms * 5.5);

    if (amplitude < SILENCE_THRESH) {
      return { viseme: 'X', openness: 0, rounded: 0, spread: 0, amplitude: 0 };
    }

    let lowE = 0, midE = 0, highE = 0, totalE = 0, weightedF = 0;
    const freqs = [150, 400, 700, 1200, 1800, 2600, 3500, 5000, 7000];
    const N = frame.length;

    for (const f of freqs) {
      let re = 0, im = 0;
      const omega = (2 * Math.PI * f) / sRate;
      for (let i = 0; i < N; i++) {
        re += frame[i] * Math.cos(omega * i);
        im += frame[i] * Math.sin(omega * i);
      }
      const mag = Math.sqrt(re * re + im * im) / N;
      totalE += mag;
      weightedF += mag * f;
      if (f < 900)  lowE  += mag;
      if (f >= 900  && f < 2500) midE  += mag;
      if (f >= 2500) highE += mag;
    }

    const T = totalE || 1;
    const centroid = weightedF / (T * sRate / 2);

    let zcr = 0;
    for (let i = 1; i < N; i++) {
      if ((frame[i - 1] > 0) !== (frame[i] > 0)) zcr++;
    }
    const zcrN = zcr / N;

    return this.classify(amplitude, centroid, zcrN, lowE / T, midE / T, highE / T);
  }

  private classify(amp: number, centroid: number, zcrN: number, lr: number, mr: number, hr: number): VisemeState {
    let viseme: Viseme;
    let openness: number;
    let rounded: number;
    let spread: number;

    if (hr > 0.40 && zcrN > 0.14) {
      viseme = 'F'; openness = 0.25; rounded = 0.05; spread = 0.15;
    } else if (lr > 0.52 && centroid < 0.12) {
      viseme = 'A'; openness = 0.65 + amp * 0.30; rounded = 0.08; spread = 0.10;
    } else if (centroid > 0.32 && mr > 0.38) {
      viseme = 'E'; openness = 0.30; rounded = 0.02; spread = 0.72;
    } else if (centroid < 0.10 && lr > 0.30 && mr > 0.30) {
      viseme = 'H'; openness = 0.20; rounded = 0.88; spread = 0.02;
    } else if (mr > 0.46 && centroid > 0.15 && centroid < 0.28) {
      viseme = 'G'; openness = 0.45; rounded = 0.48; spread = 0.08;
    } else if (amp > 0.25 && zcrN < 0.07 && centroid < 0.18) {
      viseme = 'B'; openness = 0.08; rounded = 0.18; spread = 0.10;
    } else if (hr > 0.22 && mr > 0.35) {
      viseme = 'D'; openness = 0.38; rounded = 0.12; spread = 0.22;
    } else {
      viseme = 'C'; openness = 0.28 + amp * 0.22; rounded = 0.20; spread = 0.18;
    }

    return { viseme, openness, rounded, spread, amplitude: amp };
  }

  private lerpState(a: VisemeState, b: VisemeState, t: number): VisemeState {
    const lerp = (x: number, y: number) => x + (y - x) * t;
    return {
      viseme: b.viseme,
      openness: lerp(a.openness, b.openness),
      rounded: lerp(a.rounded, b.rounded),
      spread: lerp(a.spread, b.spread),
      amplitude: lerp(a.amplitude, b.amplitude),
    };
  }
}

registerProcessor('oracle-audio-processor', OracleAudioProcessor);
