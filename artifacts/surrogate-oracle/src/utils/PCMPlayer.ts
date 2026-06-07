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

  // Per-question playback tracking — drives word-sync typewriter in KnifeSelection.
  // qFirstFeedTime: context.currentTime when first chunk of the current question starts playing.
  // qSamplesBuffered: total Int16 samples received since startQuestionTracking().
  private qTrackingActive: boolean = false;
  private qFirstFeedTime: number = 0;
  private qSamplesBuffered: number = 0;

  // Per-lore playback tracking — drives audio-sync typewriter in useLoreSequence (Act 1).
  // Parallel to q-tracker; both can be active simultaneously without conflict.
  private lTrackingActive: boolean = false;
  private lFirstFeedTime: number = 0;
  private lSamplesBuffered: number = 0;

  private panner: PannerNode | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode;
  private compressor: DynamicsCompressorNode | null = null;
  private transmissionFilter: BiquadFilterNode | null = null;

  constructor(sampleRate: number = 24000, playbackRate: number = 1.0, existingContext?: AudioContext) {
    this.sampleRate = sampleRate;
    this.playbackRate = playbackRate;
    this.context = existingContext || new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: this.sampleRate
    });

    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 1024;

    // ── Dynamics Compressor — Normalizes Gemini PCM amplitude
    try {
      const comp = this.context.createDynamicsCompressor();
      comp.threshold.setValueAtTime(-22, this.context.currentTime);
      comp.knee.setValueAtTime(30,      this.context.currentTime);
      comp.ratio.setValueAtTime(10,      this.context.currentTime);
      comp.attack.setValueAtTime(0.003,  this.context.currentTime);
      comp.release.setValueAtTime(0.200, this.context.currentTime);
      this.compressor = comp;
    } catch {
      this.compressor = null;
    }

    // ── Transmission filter — sci-fi tunnel voice for knife phase
    // Starts transparent (Q≈0). setTransmissionQ(12) narrows to radio-tunnel;
    // sweeping Q back to 0.1 opens to full presence as the question lands.
    try {
      const f = this.context.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.setValueAtTime(1000, this.context.currentTime);
      f.Q.setValueAtTime(0.1, this.context.currentTime); // transparent by default
      this.transmissionFilter = f;
    } catch {
      this.transmissionFilter = null;
    }

    // ── Master Gain — volume control for the Oracle voice
    try {
      const gain = this.context.createGain();
      gain.gain.setValueAtTime(1.0, this.context.currentTime); // Start audible; setVolume ramps to target
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

    // ── Build the processing chain (Filter → Compressor → Analyser → Output)
    // We connect these statically in the constructor so the signal path is ready 
    // for both AudioWorklet and legacy fallback.
    
    // Start with the nodes that are always present or optional but early in chain
    if (this.transmissionFilter && this.compressor) {
      this.transmissionFilter.connect(this.compressor);
      this.compressor.connect(this.analyser);
    } else if (this.transmissionFilter) {
      this.transmissionFilter.connect(this.analyser);
    } else if (this.compressor) {
      this.compressor.connect(this.analyser);
    }

    // Connect Analyser to the output stage
    if (this.panner) {
      this.analyser.connect(this.panner);
    } else if (this.masterGain) {
      this.analyser.connect(this.masterGain);
    } else {
      this.analyser.connect(this.context.destination);
    }

    // ── Load AudioWorklet ──────────────────────────────────────────────────
    console.log('[PCMPlayer] Initializing AudioWorklet at sampleRate:', this.context.sampleRate);
    
    if (this.context.audioWorklet) {
      this.workletReady = this.context.audioWorklet.addModule(
        new URL('../workers/oracle-audio.worklet.ts', import.meta.url).href
      ).then(() => {
        console.log('[PCMPlayer] AudioWorklet module loaded');
        this.workletNode = new AudioWorkletNode(this.context, 'oracle-audio-processor');
        this.workletNode.port.onmessage = (e) => {
          if (e.data.type === 'viseme' && this.onViseme) {
            this.onViseme(e.data.state);
          } else if (e.data.type === 'ended') {
            this.isPlaying = false;
            this.onProcessingChange?.(false);
          } else if (e.data.type === 'buffer-full') {
            // Should never fire with 60s buffer — if it does, a response is truly enormous
            console.warn('[PCMPlayer] Worklet buffer full — dropped', e.data.dropped, 'samples');
          }
        };

        this.workletNode.onprocessorerror = (err) => {
          console.error('[PCMPlayer] AudioWorklet Processor Error:', err);
        };

        // Connect worklet to the start of our chain
        if (this.transmissionFilter) {
          this.workletNode.connect(this.transmissionFilter);
        } else if (this.compressor) {
          this.workletNode.connect(this.compressor);
        } else {
          this.workletNode.connect(this.analyser);
        }
      }).catch(err => {
        console.error('❌ Failed to load OracleAudioWorklet (falling back to legacy):', err);
      });
    } else {
      console.warn('⚠️ AudioWorklet NOT supported in this browser (falling back to legacy)');
      this.workletReady = Promise.resolve();
    }
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
    
    // Ensure current value is non-zero before exponential ramp
    const startVal = Math.max(0.0001, this.masterGain.gain.value);
    this.masterGain.gain.setValueAtTime(startVal, now);
    this.masterGain.gain.exponentialRampToValueAtTime(safeTarget, now + rampMs / 1000);
  }

  public boostVolume(multiplier: number, rampMs: number = 50) {
    if (!this.masterGain) return;
    const now = this.context.currentTime;
    // Ensure current value is non-zero before multiplication/ramp
    const startVal = Math.max(0.0001, this.masterGain.gain.value);
    const newTarget = startVal * multiplier;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(startVal, now);
    this.masterGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, newTarget), now + rampMs / 1000);
  }

  public getAnalyser(): AnalyserNode {
    return this.analyser;
  }

  /** Narrow (Q=12) → sci-fi tunnel; open (Q≈0) → full presence. rampMs=0 = instant. */
  public setTransmissionQ(q: number, rampMs: number = 0): void {
    if (!this.transmissionFilter) return;
    const now = this.context.currentTime;
    const safeQ = Math.max(0.0001, q);
    this.transmissionFilter.Q.cancelScheduledValues(now);
    this.transmissionFilter.Q.setValueAtTime(Math.max(0.0001, this.transmissionFilter.Q.value), now);
    if (rampMs <= 0) {
      this.transmissionFilter.Q.setValueAtTime(safeQ, now);
    } else {
      this.transmissionFilter.Q.linearRampToValueAtTime(safeQ, now + rampMs / 1000);
    }
  }

  /** Call this right before asking Oracle to speak a question. Resets per-question counters. */
  public startQuestionTracking(): void {
    this.qTrackingActive = true;
    this.qFirstFeedTime = 0;
    this.qSamplesBuffered = 0;
  }

  /**
   * Milliseconds of audio played for the current question.
   * Returns 0 until the first PCM chunk arrives.
   */
  public getQuestionPlaybackMs(): number {
    if (!this.qTrackingActive || this.qFirstFeedTime === 0) return 0;
    return Math.max(0, (this.context.currentTime - this.qFirstFeedTime) * 1000);
  }

  /**
   * Total milliseconds of audio received (buffered) for the current question.
   * Grows as Gemini streams chunks; plateaus when the turn completes.
   */
  public getQuestionBufferedMs(): number {
    return (this.qSamplesBuffered / this.sampleRate) * 1000;
  }

  /** Call this right before asking Oracle to narrate the lore story. Resets per-lore counters. */
  public startLoreTracking(): void {
    this.lTrackingActive = true;
    this.lFirstFeedTime = 0;
    this.lSamplesBuffered = 0;
  }

  /** Milliseconds of lore audio played. Returns 0 until first PCM chunk arrives. */
  public getLorePlaybackMs(): number {
    if (!this.lTrackingActive || this.lFirstFeedTime === 0) return 0;
    return Math.max(0, (this.context.currentTime - this.lFirstFeedTime) * 1000);
  }

  /** Total milliseconds of lore audio received. Grows as Gemini streams; plateaus at turn end. */
  public getLoreBufferedMs(): number {
    return (this.lSamplesBuffered / this.sampleRate) * 1000;
  }

  public async feed(data: Int16Array) {
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }

    await this.workletReady;

    this.onProcessingChange?.(true);
    this.isPlaying = true;

    // Capture when this question's audio actually starts playing.
    // For legacy mode: nextStartTime is the scheduled play time of this chunk.
    // For worklet mode: approximate with currentTime + 50ms (worklet buffer latency).
    if (this.qTrackingActive) {
      if (this.qFirstFeedTime === 0) {
        const ct = this.context.currentTime;
        this.qFirstFeedTime = this.workletNode
          ? ct + 0.05
          : (this.nextStartTime > ct ? this.nextStartTime : ct + 0.05);
      }
      this.qSamplesBuffered += data.length;
    }

    if (this.lTrackingActive) {
      if (this.lFirstFeedTime === 0) {
        const ct = this.context.currentTime;
        this.lFirstFeedTime = this.workletNode
          ? ct + 0.05
          : (this.nextStartTime > ct ? this.nextStartTime : ct + 0.05);
      }
      this.lSamplesBuffered += data.length;
    }

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

    // Connect source to the start of our pre-connected chain
    if (this.transmissionFilter) {
      source.connect(this.transmissionFilter);
    } else if (this.compressor) {
      source.connect(this.compressor);
    } else {
      source.connect(this.analyser);
    }

    const currentTime = this.context.currentTime;
    if (this.nextStartTime < currentTime) {
      this.nextStartTime = currentTime + 0.05;
    }

    source.start(this.nextStartTime);
    this.nextStartTime += buffer.duration / this.playbackRate;
    this.sourceNodes.push(source);
    
    source.onended = () => {
      const idx = this.sourceNodes.indexOf(source);
      if (idx > -1) {
        this.sourceNodes.splice(idx, 1);
        if (this.sourceNodes.length === 0) {
          this.isPlaying = false;
          this.onProcessingChange?.(false);
        }
      }
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
    this.lTrackingActive = false;
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
