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

  private destination: AudioNode | null = null;   // external analyser (lip-sync)
  private panner: PannerNode | null = null;        // spatial placement for playback
  private masterGain: GainNode | null = null;      // volume control for ducking/fades

  /**
   * @param sampleRate  Input PCM sample rate (Gemini Live = 24000 Hz)
   * @param playbackRate  Playback speed multiplier. 1.0 = normal, 1.3 = 30% faster.
   *                      Values > 1 also raise pitch proportionally — acceptable for
   *                      the Charon voice which sits in the deep bass register.
   */
  constructor(sampleRate: number = 24000, playbackRate: number = 1.0) {
    this.sampleRate = sampleRate;
    this.playbackRate = playbackRate;
    this.context = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: this.sampleRate
    });

    // ── Master Gain — used for "ducking up" (fading in) and "ducking down"
    try {
      const gain = this.context.createGain();
      gain.gain.setValueAtTime(0.001, this.context.currentTime); // Start near-silent
      gain.connect(this.context.destination);
      this.masterGain = gain;
    } catch {
      this.masterGain = null;
    }

    // ── Spatial panner — Oracle voice comes from centre-screen, slightly above.
    // HRTF model creates genuine 3D depth on headphones (position cues via ear
    // transfer functions); on speakers it adds a subtle presence lift.
    // Position: x=0 (centre), y=0.3 (above ear level), z=-0.8 (into the screen).
    // refDistance 1 at these coords keeps volume natural — no attenuation.
    try {
      const panner = this.context.createPanner();
      panner.panningModel  = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance   = 1;
      panner.maxDistance   = 10000;
      panner.rolloffFactor = 0.6; // gentle roll-off so voice stays present
      panner.positionX.setValueAtTime(0,    this.context.currentTime); // centre
      panner.positionY.setValueAtTime(0.3,  this.context.currentTime); // slightly above
      panner.positionZ.setValueAtTime(-0.8, this.context.currentTime); // inside screen
      
      if (this.masterGain) {
        panner.connect(this.masterGain);
      } else {
        panner.connect(this.context.destination);
      }
      this.panner = panner;
    } catch {
      // Fallback: no spatial panning (unsupported environment)
      this.panner = null;
    }

    this.destination = this.context.destination;
  }

  /**
   * Set the master volume with an exponential ramp.
   * Used for "ducking up" (fade in) and "ducking down" (fade out).
   * Exponential ramps feel more natural/accurate to human ears.
   */
  public setVolume(target: number, rampMs: number = 200) {
    if (!this.masterGain) return;
    const now = this.context.currentTime;
    // exponentialRampToValueAtTime requires a positive value
    const safeTarget = Math.max(0.0001, target);
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.exponentialRampToValueAtTime(safeTarget, now + rampMs / 1000);
  }

  /**
   * Connect the player to an external node (e.g. an AnalyserNode for lip-sync).
   */
  public connect(node: AudioNode) {
    this.destination = node;
  }

  /**
   * Feed a chunk of raw PCM data to the player.
   * @param data Int16Array of PCM samples.
   */
  public feed(data: Int16Array) {
    if (this.context.state === 'suspended') {
      this.context.resume();
    }

    // Convert Int16 to Float32 [-1.0, 1.0]
    const float32 = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) {
      float32[i] = data[i] / 32768.0;
    }

    const buffer = this.context.createBuffer(1, float32.length, this.sampleRate);
    buffer.getChannelData(0).set(float32);

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = this.playbackRate;

    // Route 1 — External analyser (VisemeDetector for lip-sync). Side branch:
    // the analyser reads the signal but does not route audio to speakers itself.
    if (this.destination && this.destination !== this.context.destination) {
      source.connect(this.destination);
    }

    // Route 2 — Playback through spatial panner → speakers.
    // Oracle voice materialises from centre-above (cabinet position).
    if (this.panner) {
      source.connect(this.panner);
    } else if (this.masterGain) {
      source.connect(this.masterGain);
    } else {
      source.connect(this.context.destination);
    }

    // Schedule playback to ensure no gaps between chunks
    const currentTime = this.context.currentTime;
    if (this.nextStartTime < currentTime) {
      this.nextStartTime = currentTime + 0.05; // small buffer to avoid clicks
    }

    source.start(this.nextStartTime);
    // Advance by actual playback duration (buffer.duration / playbackRate) so
    // back-to-back chunks stay gapless. Using buffer.duration alone would
    // over-shoot by (rate-1) seconds per chunk, leaving audible stutters.
    this.nextStartTime += buffer.duration / this.playbackRate;
    
    this.sourceNodes.push(source);
    
    // Clean up finished nodes
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
    this.sourceNodes.forEach(node => {
      try { node.stop(); } catch (e) { /* ignore already stopped */ }
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
