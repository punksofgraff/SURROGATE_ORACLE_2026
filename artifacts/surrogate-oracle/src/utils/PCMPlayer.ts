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

  private destination: AudioNode | null = null;   // external analyser (legacy)
  private panner: PannerNode | null = null;        // spatial placement for playback
  private masterGain: GainNode | null = null;      // volume control for ducking/fades
  private analyser: AnalyserNode;

  constructor(sampleRate: number = 24000, playbackRate: number = 1.0, existingContext?: AudioContext) {
    this.sampleRate = sampleRate;
    this.playbackRate = playbackRate;
    this.context = existingContext || new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: this.sampleRate
    });

    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 1024;

    // ── Load AudioWorklet ──────────────────────────────────────────────────
    // Load the enterprise-grade audio thread processor. 
    this.workletReady = this.context.audioWorklet.addModule(
      new URL('../workers/oracle-audio.worklet.ts', import.meta.url).href
    ).then(() => {
      this.workletNode = new AudioWorkletNode(this.context, 'oracle-audio-processor');
      this.workletNode.port.onmessage = (e) => {
        if (e.data.type === 'viseme' && this.onViseme) {
          this.onViseme(e.data.state);
        }
      };
      
      // Connect worklet to the analyser side-tap
      this.workletNode.connect(this.analyser);

      // Connect the analyser to the rest of the chain
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

    // ── Master Gain — used for "ducking up" (fading in) and "ducking down"
    try {
      const gain = this.context.createGain();
      gain.gain.setValueAtTime(0, this.context.currentTime); // Start silent
      gain.connect(this.context.destination);
      this.masterGain = gain;
    } catch {
      this.masterGain = null;
    }

    // ── Spatial panner — Oracle voice comes from centre-screen, slightly above.
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

    this.destination = this.context.destination;
  }

  /**
   * Set a callback for viseme updates from the audio thread.
   */
  public setVisemeCallback(callback: (state: any) => void) {
    this.onViseme = callback;
  }

  /**
   * Set the master volume with an exponential ramp.
   */
  public setVolume(target: number, rampMs: number = 200) {
    if (!this.masterGain) return;
    const now = this.context.currentTime;
    const safeTarget = Math.max(0.0001, target);
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.exponentialRampToValueAtTime(safeTarget, now + rampMs / 1000);
  }

  /**
   * Connect the player to an external node (legacy support).
   */
  public connect(node: AudioNode) {
    this.destination = node;
    if (this.workletNode) {
      this.workletNode.connect(node);
    }
  }

  /**
   * Get the internal AnalyserNode for legacy viseme detection or side-taps.
   */
  public getAnalyser(): AnalyserNode {
    return this.analyser;
  }

  /**
   * Feed a chunk of raw PCM data to the player.
   * @param data Int16Array of PCM samples.
   */
  public async feed(data: Int16Array) {
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }

    // Wait for worklet to be ready if it's still loading
    await this.workletReady;

    if (this.workletNode) {
      // Enterprise path: send to AudioWorklet for gapless playback + detection
      this.workletNode.port.postMessage({ type: 'feed', pcm: data });
    } else {
      // Fallback path: use the old AudioBufferSourceNode logic
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

    if (this.destination && this.destination !== this.context.destination) {
      source.connect(this.destination);
    }
    
    // Also connect to side-tap analyser for legacy support
    source.connect(this.analyser);

    if (this.panner) {
      source.connect(this.panner);
    } else if (this.masterGain) {
      source.connect(this.masterGain);
    } else {
      source.connect(this.context.destination);
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
      if (idx > -1) this.sourceNodes.splice(idx, 1);
    };
    this.isPlaying = true;
  }

  /**
   * Stop all current and scheduled playback and clear the queue.
   */
  public stop() {
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

  /**
   * Update Oracle spatial position from device head orientation.
   * normX [-1,1]: left/right tilt  → panner X axis
   * normZ [-1,1]: forward/back tilt → panner Z axis (negative = into screen)
   * Ramps over 80ms to avoid AudioParam clicks.
   */
  public updateHeadOrientation(normX: number, normZ: number) {
    if (!this.panner) return;
    const t = this.context.currentTime + 0.08;
    this.panner.positionX.linearRampToValueAtTime(normX * 0.55, t);
    this.panner.positionZ.linearRampToValueAtTime(-0.8 + normZ * 0.35, t);
  }
}
