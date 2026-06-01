/**
 * PCMPlayer.ts
 * 
 * High-performance, low-latency raw PCM audio player for the Web Audio API.
 * Designed for real-time streaming of audio chunks (e.g. from Gemini Live).
 * 
 * Supports queuing of Int16Array or Float32Array chunks and plays them
 * back with minimal jitter and zero intermediate file creation.
 */

export class PCMPlayer {
  private context: AudioContext;
  private sampleRate: number;
  private playbackRate: number;
  private nextStartTime: number = 0;
  private isPlaying: boolean = false;
  private sourceNodes: AudioBufferSourceNode[] = [];
  private workletNode: AudioWorkletNode | null = null;
  private workletReady: Promise<void>;
  private onViseme: ((state: any) => void) | null = null;
  private onProcessingChange: ((isProcessing: boolean) => void) | null = null;

  private panner: PannerNode | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode;
  private transmissionFilter: BiquadFilterNode | null = null;

  constructor(sampleRate: number = 24000, playbackRate: number = 1.0, existingContext?: AudioContext) {
    this.sampleRate = sampleRate;
    this.playbackRate = playbackRate;
    this.context = existingContext || new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: this.sampleRate
    });

    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 1024;

    // ── Transmission filter — sci-fi tunnel voice for knife phase
    // Starts transparent (Q≈0). setTransmissionQ(12) narrows to radio-tunnel;
    // sweeping Q back to 0.1 opens to full presence as the question lands.
    try {
      const f = this.context.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(1200, this.context.currentTime);
      f.Q.setValueAtTime(0.1, this.context.currentTime); // transparent by default
      this.transmissionFilter = f;
    } catch {
      this.transmissionFilter = null;
    }

    // ── Master Gain — volume control for the Oracle voice
    try {
      const gain = this.context.createGain();
      gain.gain.setValueAtTime(0, this.context.currentTime); // Start silent
      gain.connect(this.context.destination);
      this.masterGain = gain;
    } catch {
      this.masterGain = null;
    }

    // ── Spatial panner — Oracle voice follows head-tracking movement
    try {
      const panner = this.context.createPanner();
      panner.panningModel  = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance   = 1;
      panner.maxDistance   = 10000;
      panner.rolloffFactor = 0.6;
      panner.positionX.setValueAtTime(0,    this.context.currentTime);
      panner.positionY.setValueAtTime(0.3,  this.context.currentTime);
      panner.positionZ.setValueAtTime(-0.8, this.context.currentTime);

      if (this.masterGain) {
        panner.connect(this.masterGain);
      } else {
        panner.connect(this.context.destination);
      }
      this.panner = panner;
    } catch {
      this.panner = null;
    }

    // ── Load AudioWorklet ──────────────────────────────────────────────────
    console.log('[PCMPlayer] Initializing AudioWorklet at sampleRate:', this.context.sampleRate);
    this.workletReady = this.context.audioWorklet.addModule(
      new URL('../workers/oracle-audio.worklet.ts', import.meta.url).href
    ).then(() => {
      console.log('[PCMPlayer] AudioWorklet module loaded');
      this.workletNode = new AudioWorkletNode(this.context, 'oracle-audio-processor');
      this.workletNode.port.onmessage = (e) => {
        if (e.data.type === 'viseme' && this.onViseme) {
          this.onViseme(e.data.state);
        } else if (e.data.type === 'ended') {
          this.onProcessingChange?.(false);
        }
      };

      this.workletNode.onprocessorerror = (err) => {
        console.error('[PCMPlayer] AudioWorklet Processor Error:', err);
      };

      // Chain: worklet → transmissionFilter → analyser → panner/masterGain
      // transmissionFilter Q≈0.1 is transparent; setTransmissionQ(12) narrows
      // to sci-fi tunnel voice for knife-phase question voice-overs.
      if (this.transmissionFilter) {
        this.workletNode.connect(this.transmissionFilter);
        this.transmissionFilter.connect(this.analyser);
      } else {
        this.workletNode.connect(this.analyser);
      }

      if (this.panner) {
        this.analyser.connect(this.panner);
      } else if (this.masterGain) {
        this.analyser.connect(this.masterGain);
      } else {
        this.analyser.connect(this.context.destination);
      }
    }).catch(err => {
      console.error('❌ Failed to load OracleAudioWorklet:', err);
    });
  }

  public setVisemeCallback(callback: (state: any) => void) {
    this.onViseme = callback;
  }

  public setProcessingCallback(callback: (isProcessing: boolean) => void) {
    this.onProcessingChange = callback;
  }

  public setVolume(target: number, rampMs: number = 200) {
    if (!this.masterGain) return;
    const now = this.context.currentTime;
    const safeTarget = Math.max(0.0001, target);
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.exponentialRampToValueAtTime(safeTarget, now + rampMs / 1000);
  }

  public boostVolume(multiplier: number, rampMs: number = 50) {
    if (!this.masterGain) return;
    const now = this.context.currentTime;
    const newTarget = this.masterGain.gain.value * multiplier;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.exponentialRampToValueAtTime(newTarget, now + rampMs / 1000);
  }

  public getAnalyser(): AnalyserNode {
    return this.analyser;
  }

  /** Narrow (Q=12) → sci-fi tunnel; open (Q=0.1) → full presence. rampMs=0 = instant. */
  public setTransmissionQ(q: number, rampMs: number = 0): void {
    if (!this.transmissionFilter) return;
    const now = this.context.currentTime;
    const safeQ = Math.max(0.1, q);
    this.transmissionFilter.Q.cancelScheduledValues(now);
    this.transmissionFilter.Q.setValueAtTime(this.transmissionFilter.Q.value, now);
    if (rampMs <= 0) {
      this.transmissionFilter.Q.setValueAtTime(safeQ, now);
    } else {
      this.transmissionFilter.Q.linearRampToValueAtTime(safeQ, now + rampMs / 1000);
    }
  }

  public async feed(data: Int16Array) {
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }

    await this.workletReady;

    this.onProcessingChange?.(true);

    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'feed', pcm: data });
    } else {
      this._feedLegacy(data);
    }
  }

  private _feedLegacy(data: Int16Array) {
    const float32 = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) {
      float32[i] = data[i] / 32768.0;
    }

    const buffer = this.context.createBuffer(1, float32.length, this.sampleRate);
    buffer.getChannelData(0).set(float32);

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = this.playbackRate;

    source.connect(this.analyser);

    const currentTime = this.context.currentTime;
    if (this.nextStartTime < currentTime) {
      this.nextStartTime = currentTime + 0.05;
    }

    source.start(this.nextStartTime);
    this.nextStartTime += buffer.duration / this.playbackRate;
    this.sourceNodes.push(source);
    
    source.onended = () => {
      const idx = this.sourceNodes.indexOf(source);
      if (idx > -1) this.sourceNodes.splice(idx, 1);
    };
    
    this.isPlaying = true;
  }

  public stop() {
    this.onProcessingChange?.(false);
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'stop' });
    }
    this.sourceNodes.forEach(node => {
      try { node.stop(); } catch (e) { }
    });
    this.sourceNodes = [];
    this.nextStartTime = 0;
    this.isPlaying = false;
  }

  public close() {
    this.stop();
    this.context.close();
  }

  public getContext() {
    return this.context;
  }

  public updateHeadOrientation(normX: number, normZ: number) {
    if (!this.panner) return;
    const t = this.context.currentTime + 0.08;
    this.panner.positionX.linearRampToValueAtTime(normX * 0.55, t);
    this.panner.positionZ.linearRampToValueAtTime(-0.8 + normZ * 0.35, t);
  }
}
