/**
 * PCMPlayer.ts
 * 
 * High-performance, low-latency raw PCM audio player for the Web Audio API.
 * Designed for real-time streaming of audio chunks (e.g. from Gemini Live).
 * 
 * Supports queuing of Int16Array or Float32Array chunks and plays them
 * back with minimal jitter and zero intermediate file creation.
 */

import { createAudioContext, isQuestHeadset, isTouchPrimaryDevice } from '../lib/browserCapabilities';

// The Oracle's baseline loudness. Applied as post-compression makeup gain
// (mid-graph), NOT master gain. Previously this was a 2.5x master-gain boost
// set from the first-audio path — but master gain also gets probed by
// reassertPlayback() around mic toggles, and on iOS the voice-processing
// session flip changes effective loudness *below* Web Audio, so a master-gain
// boost read as "one volume muted, another unmuted". Living mid-graph, this is
// a fixed graph param the mic gesture never touches.
const DEFAULT_MAKEUP_GAIN = 2.5;

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
  // Post-compression makeup gain — owns the Oracle's baseline loudness.
  // Mid-graph, fixed, never touched by mic open/close or reassertPlayback().
  private makeupGain: GainNode | null = null;
  // Last explicitly-requested output level. Re-applied by reassertPlayback()
  // after OS audio-session changes (mobile mic toggle) so playback loudness
  // never drifts from what the app last asked for.
  private lastVolumeTarget: number = 1.0;
  private analyser: AnalyserNode;
  private compressor: DynamicsCompressorNode | null = null;
  private transmissionFilter: BiquadFilterNode | null = null;
  // Pre-selection taunt bus. It stays in the graph permanently so switching
  // between taunt and clean voice never rebuilds the mobile playback chain.
  private tauntInput: GainNode | null = null;
  private tauntDryGain: GainNode | null = null;
  private tauntDelay: DelayNode | null = null;
  private tauntEchoGain: GainNode | null = null;
  private tauntFeedbackGain: GainNode | null = null;
  private tauntActive = false;

  // ── Viseme watchdog / analyser fallback ────────────────────────────────────
  // When the AudioWorklet fails to load (flaky mobile network, Safari quirk),
  // workletNode stays null and _feedLegacy() plays audio with no viseme output.
  // When the worklet loads but its processor fails silently, messages stop.
  // In both cases, analyserFallbackActive drives a rAF loop that derives amplitude
  // from the AnalyserNode so the avatar animates every session without exception.
  private analyserFallbackActive = false;
  private analyserRafId: number | null = null;
  private lastVisemeTime = 0;           // performance.now() of last worklet viseme msg
  private watchdogTimerId: ReturnType<typeof setTimeout> | null = null;

  constructor(sampleRate: number = 24000, playbackRate: number = 1.0, existingContext?: AudioContext) {
    this.sampleRate = sampleRate;
    this.playbackRate = playbackRate;
    this.context = existingContext || createAudioContext({
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
    } catch (err) {
      console.warn('[PCMPlayer] DynamicsCompressor unavailable, skipping:', err);
      this.compressor = null;
    }

    // ── Makeup gain — the Oracle's loudness lives HERE, not in masterGain.
    // Sits mid-graph (compressor → makeupGain → analyser), so it is never
    // touched by the mic-tap gesture and never re-ramped on mic open/close.
    // masterGain stays at unity (1.0) exactly like our other Vertex live-voice
    // apps, so muting/unmuting the mic can never produce two different output
    // levels. Boosting perceived loudness is the compressor's job (post-
    // compression makeup), which is stable across the iOS voice-processing
    // session flip because it is a fixed AudioParam in the graph, not the OS DSP.
    try {
      const mk = this.context.createGain();
      mk.gain.setValueAtTime(DEFAULT_MAKEUP_GAIN, this.context.currentTime);
      this.makeupGain = mk;
    } catch (err) {
      console.warn('[PCMPlayer] Makeup GainNode unavailable, skipping:', err);
      this.makeupGain = null;
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
    } catch (err) {
      console.warn('[PCMPlayer] Transmission BiquadFilter unavailable, skipping:', err);
      this.transmissionFilter = null;
    }

    // ── Master Gain — volume control for the Oracle voice
    try {
      const gain = this.context.createGain();
      gain.gain.setValueAtTime(1.0, this.context.currentTime); // Start audible; setVolume ramps to target
      gain.connect(this.context.destination);
      this.masterGain = gain;
    } catch (err) {
      console.warn('[PCMPlayer] Master GainNode unavailable, skipping:', err);
      this.masterGain = null;
    }

    // ── Spatial panner — Oracle voice follows head-tracking movement
    // Phones/tablets stay fixed because their OS audio session can change
    // during mic activation. Quest is the deliberate exception: its browser
    // is touch-like but its output is a headset, so HRTF is initialized before
    // the first PCM chunk and never switches on mid-session.
    try {
      if (isTouchPrimaryDevice() && !isQuestHeadset()) {
        console.log('[PCMPlayer] Phone/tablet — HRTF disabled (fixed playback chain)');
        throw new Error('skip-panner-on-touch');
      }
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
      console.log(`[PCMPlayer] HRTF spatial audio active${isQuestHeadset() ? ' (Quest headset)' : ''}`);
    } catch (err) {
      if ((err as Error).message !== 'skip-panner-on-touch') {
        console.warn('[PCMPlayer] PannerNode (HRTF) unavailable, skipping:', err);
      }
      this.panner = null;
    }

    // ── Build the processing chain (Taunt bus → Filter → Compressor → Makeup → Analyser → Output)
    // We connect these statically in the constructor so the signal path is ready 
    // for both AudioWorklet and legacy fallback.
    
    // The node feeding the analyser: makeup gain when available, else direct.
    const preAnalyser: AudioNode = this.makeupGain ?? this.analyser;
    if (this.makeupGain) this.makeupGain.connect(this.analyser);

    // The taunt bus is always present. In clean mode its echo gain is zero and
    // the dry gain is unity, so the selected-knife voice takes the same path.
    try {
      const input = this.context.createGain();
      const dry = this.context.createGain();
      const delay = this.context.createDelay(1.0);
      const echo = this.context.createGain();
      const feedback = this.context.createGain();
      input.gain.setValueAtTime(1, this.context.currentTime);
      dry.gain.setValueAtTime(1, this.context.currentTime);
      delay.delayTime.setValueAtTime(0.17, this.context.currentTime);
      echo.gain.setValueAtTime(0, this.context.currentTime);
      feedback.gain.setValueAtTime(0.18, this.context.currentTime);
      input.connect(dry);
      input.connect(delay);
      delay.connect(echo);
      delay.connect(feedback);
      feedback.connect(delay);
      this.tauntInput = input;
      this.tauntDryGain = dry;
      this.tauntDelay = delay;
      this.tauntEchoGain = echo;
      this.tauntFeedbackGain = feedback;
    } catch (err) {
      console.warn('[PCMPlayer] Taunt bus unavailable, using clean voice:', err);
    }

    const voiceInput: AudioNode = this.transmissionFilter ?? this.compressor ?? this.makeupGain ?? this.analyser;
    if (this.tauntInput && this.tauntDryGain && this.tauntDelay && this.tauntEchoGain) {
      this.tauntDryGain.connect(voiceInput);
      this.tauntEchoGain.connect(voiceInput);
    } else {
      // The fallback source connection below will feed the normal chain.
    }

    // Start with the nodes that are always present or optional but early in chain
    if (this.transmissionFilter && this.compressor) {
      this.transmissionFilter.connect(this.compressor);
      this.compressor.connect(preAnalyser);
    } else if (this.transmissionFilter) {
      this.transmissionFilter.connect(preAnalyser);
    } else if (this.compressor) {
      this.compressor.connect(preAnalyser);
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
            this.lastVisemeTime = performance.now();
            // Worklet is delivering — cancel any pending watchdog and stop fallback if active.
            if (this.watchdogTimerId !== null) {
              clearTimeout(this.watchdogTimerId);
              this.watchdogTimerId = null;
            }
            if (this.analyserFallbackActive) this.stopAnalyserFallback();
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

        // Connect worklet to the taunt bus, which is transparent in clean mode.
        if (this.tauntInput) {
          this.workletNode.connect(this.tauntInput);
        } else if (this.transmissionFilter) {
          this.workletNode.connect(this.transmissionFilter);
        } else if (this.compressor) {
          this.workletNode.connect(this.compressor);
        } else {
          this.workletNode.connect(this.makeupGain ?? this.analyser);
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
    this.lastVolumeTarget = safeTarget;
    this.masterGain.gain.cancelScheduledValues(now);
    
    const startVal = Math.max(0.0001, this.masterGain.gain.value);
    this.masterGain.gain.setValueAtTime(startVal, now);
    this.masterGain.gain.linearRampToValueAtTime(safeTarget, now + rampMs / 1000);
  }

  public boostVolume(multiplier: number, rampMs: number = 50) {
    if (!this.masterGain) return;
    const now = this.context.currentTime;
    // Ensure current value is non-zero before multiplication/ramp
    const startVal = Math.max(0.0001, this.masterGain.gain.value);
    const newTarget = startVal * multiplier;
    this.lastVolumeTarget = Math.max(0.0001, newTarget);
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(startVal, now);
    this.masterGain.gain.linearRampToValueAtTime(Math.max(0.0001, newTarget), now + rampMs / 1000);
  }

  /**
   * Re-assert the playback path after an OS audio-session change (mobile mic
   * open/close flips iOS into/out of voice-processing mode, which re-routes
   * output and can leave the context suspended or the gain at a shifted
   * effective level). Resumes the context if needed and snaps the master gain
   * back to the last explicitly-requested target. Idempotent and cheap —
   * safe to call multiple times while the session settles.
   * Returns true when a correction was actually applied (for instrumentation).
   */
  public reassertPlayback(rampMs: number = 120): boolean {
    let corrected = false;
    if (this.context.state === 'suspended') {
      corrected = true;
      this.context.resume().catch((err) => {
        console.warn('[PCMPlayer] reassertPlayback resume() failed:', err);
      });
    }
    if (!this.masterGain) return corrected;
    const now = this.context.currentTime;
    const current = Math.max(0.0001, this.masterGain.gain.value);
    // Only touch the ramp when the effective value has actually drifted —
    // avoids clicks from redundant cancel/ramp cycles on healthy sessions.
    if (Math.abs(current - this.lastVolumeTarget) < 0.001) return corrected;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(current, now);
    this.masterGain.gain.linearRampToValueAtTime(this.lastVolumeTarget, now + rampMs / 1000);
    return true;
  }

  /** Effective master-gain value right now (instrumentation only). */
  public getCurrentGain(): number {
    return this.masterGain ? this.masterGain.gain.value : -1;
  }

  /** Fixed mid-graph makeup gain (instrumentation only). -1 when unavailable. */
  public getMakeupGain(): number {
    return this.makeupGain ? this.makeupGain.gain.value : -1;
  }

  /** True when the HRTF spatial panner is in the chain (desktop only). */
  public hasSpatialPanner(): boolean {
    return this.panner !== null;
  }

  public getAnalyser(): AnalyserNode {
    return this.analyser;
  }

  /** Narrow (Q=12) → sci-fi tunnel; open (Q≈0) → full presence. rampMs=0 = instant. */
  public setTransmissionQ(q: number, rampMs: number = 0): void {
    if (!this.transmissionFilter) return;
    const now = this.context.currentTime;
    // During the taunt, occasionally make the existing tunnel filter catch
    // and release the voice. The normal progress sweep remains the baseline;
    // this only adds sparse, restrained interruptions.
    const tauntQ = this.tauntActive && Math.random() < 0.22
      ? (Math.random() < 0.5 ? 0.12 : 7.5)
      : q;
    const safeQ = Math.max(0.0001, tauntQ);
    this.transmissionFilter.Q.cancelScheduledValues(now);
    this.transmissionFilter.Q.setValueAtTime(Math.max(0.0001, this.transmissionFilter.Q.value), now);
    if (rampMs <= 0) {
      this.transmissionFilter.Q.setValueAtTime(safeQ, now);
    } else {
      this.transmissionFilter.Q.linearRampToValueAtTime(safeQ, now + rampMs / 1000);
    }
  }

  /** Turn the pre-selection echo taunt on/off without rebuilding audio nodes. */
  public setTauntMode(enabled: boolean): void {
    if (!this.tauntInput || !this.tauntDryGain || !this.tauntEchoGain || !this.tauntFeedbackGain || !this.tauntDelay) return;
    const now = this.context.currentTime;
    this.tauntActive = enabled;
    this.tauntInput.gain.cancelScheduledValues(now);
    this.tauntDryGain.gain.cancelScheduledValues(now);
    this.tauntEchoGain.gain.cancelScheduledValues(now);
    this.tauntFeedbackGain.gain.cancelScheduledValues(now);
    this.tauntDelay.delayTime.cancelScheduledValues(now);

    if (enabled) {
      // Attack is intentionally quiet, then the dry voice blooms; the echo
      // remains below the dry path so the words stay intelligible.
      this.tauntInput.gain.setValueAtTime(0.5, now);
      this.tauntInput.gain.linearRampToValueAtTime(1.0, now + 0.42);
      this.tauntInput.gain.linearRampToValueAtTime(0.68, now + 1.35);
      this.tauntDryGain.gain.setValueAtTime(1.0, now);
      this.tauntEchoGain.gain.setValueAtTime(0.22, now);
      this.tauntFeedbackGain.gain.setValueAtTime(0.16, now);
      this.tauntDelay.delayTime.setValueAtTime(0.17, now);
    } else {
      this.tauntInput.gain.setValueAtTime(Math.max(0.0001, this.tauntInput.gain.value), now);
      this.tauntInput.gain.linearRampToValueAtTime(1.0, now + 0.08);
      this.tauntEchoGain.gain.setValueAtTime(Math.max(0.0001, this.tauntEchoGain.gain.value), now);
      this.tauntEchoGain.gain.linearRampToValueAtTime(0.0001, now + 0.06);
      this.tauntFeedbackGain.gain.setValueAtTime(0.0001, now);
      this.tauntActive = false;
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
    // feed() is called from Gemini audio callbacks (never a gesture handler), so it
    // is safe to await here. If the context is suspended (e.g. iOS tab switch or
    // background), we must wait for it to resume before feeding the worklet ring
    // buffer — otherwise chunks accumulate while the context clock is frozen, the
    // ring buffer floods, and audio plays with a fast-forward artifact on resume.
    if (this.context.state === 'suspended') {
      try { await this.context.resume(); } catch (err) {
        console.warn('[PCMPlayer] AudioContext.resume() failed during feed():', err);
      }
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
      // Arm a one-shot 500ms watchdog on the first chunk of each utterance.
      // If no viseme message arrives within that window the worklet is silent
      // (bad addModule race, AudioWorkletProcessor crash, iOS quirk) — engage
      // the analyser fallback so the avatar is never static for a full session.
      if (this.lastVisemeTime === 0 && this.watchdogTimerId === null && !this.analyserFallbackActive) {
        this.watchdogTimerId = setTimeout(() => {
          this.watchdogTimerId = null;
          if (this.isPlaying && this.lastVisemeTime === 0) {
            console.warn('[PCMPlayer] Worklet silent for 500ms — engaging analyser amplitude fallback');
            this.startAnalyserFallback();
          }
        }, 500);
      }
    } else {
      this._feedLegacy(data);
    }
  }

  // ── Analyser amplitude fallback ──────────────────────────────────────────────
  // Runs a rAF loop that reads the AnalyserNode's time-domain data and derives a
  // synthetic VisemeState. Engages automatically in two scenarios:
  //   1. workletNode is null (legacy fallback) — starts on first _feedLegacy() call
  //   2. workletNode exists but emits no visemes for 500ms (watchdog fires)
  // In both cases the avatar receives amplitude/openness data every frame, so
  // lip-sync, emotes, and head physics work the same as the normal worklet path.
  private startAnalyserFallback(): void {
    if (this.analyserFallbackActive) return;
    this.analyserFallbackActive = true;

    const timeBuf  = new Uint8Array(this.analyser.fftSize);           // 1024 — RMS
    const freqBuf  = new Uint8Array(this.analyser.frequencyBinCount); // 512  — spectral

    // Bin boundaries for 24 kHz / fftSize-1024 (≈23.4 Hz per bin).
    // Recalculated each time the fallback starts so Safari/iOS rate changes are safe.
    const sr  = this.context.sampleRate || 24000;
    const bw  = sr / this.analyser.fftSize;
    const bAt = (hz: number) => Math.max(0, Math.min(freqBuf.length - 1, Math.round(hz / bw)));

    // Low F1 vowel zone (100–600 Hz) — open/back vowels, A/O
    const bLoLo = bAt(100),  bLoHi = bAt(600);
    // Core speech formants (600–2000 Hz) — mid vowels, E/I
    const bMidLo = bAt(600), bMidHi = bAt(2000);
    // Front / upper-mid (2000–4500 Hz) — bright front vowels, fricative body
    const bUpLo  = bAt(2000), bUpHi = bAt(4500);
    // Sibilant / hiss band (4500–8000 Hz) — S, Z, SH, F
    const bHiLo  = bAt(4500), bHiHi = bAt(8000);

    const bandAvg = (lo: number, hi: number): number => {
      const len = Math.max(1, hi - lo);
      let s = 0;
      for (let i = lo; i < hi; i++) s += freqBuf[i];
      return (s / len) / 255; // normalised 0–1
    };

    const tick = () => {
      if (!this.analyserFallbackActive) return;
      this.analyserRafId = requestAnimationFrame(tick);
      if (!this.onViseme) return;

      // ── Amplitude from time-domain RMS ──────────────────────────────────
      this.analyser.getByteTimeDomainData(timeBuf);
      let sumSq = 0;
      for (let i = 0; i < timeBuf.length; i++) {
        const s = (timeBuf[i] - 128) / 128;
        sumSq += s * s;
      }
      const rms = Math.sqrt(sumSq / timeBuf.length);
      const amplitude = Math.min(1, rms * 4);

      if (amplitude < 0.025) {
        this.onViseme({ viseme: 'X', amplitude: 0, openness: 0, rounded: 0, spread: 0, intensity: 0 });
        return;
      }

      // ── Spectral band energies ───────────────────────────────────────────
      this.analyser.getByteFrequencyData(freqBuf);
      const eLow  = bandAvg(bLoLo,  bLoHi);   // F1 low — open/back vowels
      const eMid  = bandAvg(bMidLo, bMidHi);  // F1+F2 core
      const eUp   = bandAvg(bUpLo,  bUpHi);   // F2 front / fricative body
      const eHigh = bandAvg(bHiLo,  bHiHi);   // sibilant / hiss

      // ── Classify primary viseme from spectral balance ────────────────────
      // Viseme tokens must match ORACLE_TO_OVR keys in OracleAvatar3D.tsx:
      //   X=sil  A=aa  E=E+ih  I=ih  O=oh+ou  U=ou  C=SS+CH  F=FF
      let viseme: string;
      let rounded = 0;
      let spread  = 0;

      if (eHigh > 0.10 && eHigh > eLow * 1.4) {
        // Fricative-dominant (s, z, sh, f, th)
        viseme = eUp > eMid ? 'C' : 'F';        // C = SS/CH sibilant, F = FF labiodental
        spread = Math.min(1, eHigh * 6);
      } else if (eUp > eMid * 1.35) {
        // High-F2: front vowels (E, I)
        viseme  = amplitude > 0.45 ? 'E' : 'I';
        spread  = Math.min(1, (eUp - eMid) * 5);
      } else if (eLow > eMid * 0.75 && amplitude > 0.30) {
        // Low-F1: open/back vowels (A, O)
        viseme  = amplitude > 0.50 ? 'A' : 'O';
        rounded = viseme === 'O' ? Math.min(1, eLow * 3.5) : 0;
      } else {
        // Balanced / mid — generic vowel; let CO_ARTIC drive expressiveness
        viseme = 'A';
        spread = Math.min(0.5, eMid * 2.5);
      }

      const openness = Math.min(1, amplitude * 1.2);
      this.onViseme({ viseme, amplitude, openness, rounded, spread, intensity: amplitude });
    };
    this.analyserRafId = requestAnimationFrame(tick);
  }

  private stopAnalyserFallback(): void {
    this.analyserFallbackActive = false;
    if (this.analyserRafId !== null) {
      cancelAnimationFrame(this.analyserRafId);
      this.analyserRafId = null;
    }
  }

  private _feedLegacy(data: Int16Array) {
    // Worklet unavailable — ensure the analyser fallback is running so the avatar
    // receives amplitude data and can animate (lip-sync, emotes, head physics).
    this.startAnalyserFallback();
    const float32 = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) {
      float32[i] = data[i] / 32768.0;
    }

    const buffer = this.context.createBuffer(1, float32.length, this.sampleRate);
    buffer.getChannelData(0).set(float32);

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = this.playbackRate;

    // Connect source to the taunt bus, transparent in clean mode.
    if (this.tauntInput) {
      source.connect(this.tauntInput);
    } else if (this.transmissionFilter) {
      source.connect(this.transmissionFilter);
    } else if (this.compressor) {
      source.connect(this.compressor);
    } else {
      source.connect(this.makeupGain ?? this.analyser);
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
    // Clear watchdog and stop analyser fallback loop; reset viseme timer so the
    // watchdog can re-arm on the next Oracle utterance after a journey reset.
    if (this.watchdogTimerId !== null) {
      clearTimeout(this.watchdogTimerId);
      this.watchdogTimerId = null;
    }
    this.lastVisemeTime = 0;
    this.stopAnalyserFallback();
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'stop' });
    }
    this.sourceNodes.forEach(node => {
      try { node.stop(); } catch (err) {
        console.warn('[PCMPlayer] sourceNode.stop() failed (already stopped?):', err);
      }
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
