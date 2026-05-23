/**
 * useVAD — Voice Activity Detection hook
 *
 * Oracle Pulse system: RMS-based client-side VAD that gates audio sending to
 * Gemini Live. Emits speech.boundary signals (activityStart / activityEnd)
 * so Gemini knows exactly when the seeker is speaking — preventing the server's
 * own VAD from cutting mid-sentence or advancing strata prematurely.
 *
 * Architecture (CORA V3 Ear + Pulse layers collapsed into one hook):
 *   ScriptProcessorNode frame (4096 samples @ 16kHz = ~256ms)
 *     → processFrame(float32) → { vadState, isSpeaking, vadScore }
 *     → caller sends audio only during onset|speaking|trailing
 *     → caller sends activityStart on onset, activityEnd on silence
 *
 * VAD State Machine:
 *   SILENCE ──(onsetFrames consecutive speech frames)──► ONSET
 *   ONSET   ──(stable)───────────────────────────────► SPEAKING
 *   SPEAKING──(hangoverFrames consecutive silence)───► TRAILING
 *   TRAILING──(hangoverFrames elapsed)───────────────► SILENCE
 *
 *   (if speech resumes during TRAILING → back to SPEAKING immediately)
 */

export type VADState = 'silence' | 'onset' | 'speaking' | 'trailing';

export interface VADOptions {
  /** RMS level below which a frame is considered silent. ~-42 dBFS. Default: 0.008 */
  rmsThreshold?: number;
  /** Consecutive speech frames required before transitioning silence→onset. Default: 3 (~768ms) */
  onsetFrames?: number;
  /** Consecutive silence frames before speaking→trailing+end of turn. Default: 14 (~3.6s) */
  hangoverFrames?: number;
  /** Frames kept in pre-roll ring buffer (flushed on onset so speech start isn't clipped). Default: 3 */
  preRollFrames?: number;
}

export interface VADFrame {
  /** Encoded audio chunk ready to send to WebSocket */
  data: string; // base64
  mimeType: string;
}

export interface VADResult {
  /** Current VAD state machine state */
  vadState: VADState;
  /** true when in onset|speaking|trailing — tells caller to route audio to WS */
  isSpeaking: boolean;
  /** Normalised RMS energy [0-1] of this frame — drives visual pulse intensity */
  vadScore: number;
  /** true on the frame where onset begins — caller should flush preRoll + send activityStart */
  isOnsetStart: boolean;
  /** true on the frame where trailing→silence transition completes — caller should send activityEnd */
  isTurnEnd: boolean;
}

export interface VADProcessor {
  /**
   * Process one audio frame. Call inside onaudioprocess.
   * Mutates internal state; returns result for this frame only.
   */
  processFrame(float32: Float32Array, encodedChunk: VADFrame): VADResult;
  /**
   * Drain the pre-roll ring buffer.
   * Call when isOnsetStart=true to send captured frames before speech onset.
   */
  flushPreRoll(): VADFrame[];
  /** Reset all state (call on mic stop / session reset). */
  reset(): void;
}

/**
 * Create a VAD processor instance.
 * Not a React hook — instantiate once per mic session in a ref:
 *   vadRef.current = createVADProcessor({ rmsThreshold: 0.008 })
 */
export function createVADProcessor(options: VADOptions = {}): VADProcessor {
  const {
    rmsThreshold = 0.008,   // ~-42 dBFS — tuned for phone mic + quiet room
    onsetFrames = 3,         // 3 × 256ms = ~768ms of speech before we commit
    hangoverFrames = 14,     // 14 × 256ms = ~3.6s of silence before turn ends
    preRollFrames = 3,       // keep 3 frames (~768ms) before onset
  } = options;

  let state: VADState = 'silence';
  let consecutiveSpeech = 0;
  let consecutiveSilence = 0;
  const preRoll: VADFrame[] = [];

  function calcRMS(float32: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < float32.length; i++) sum += float32[i] * float32[i];
    return Math.sqrt(sum / float32.length);
  }

  return {
    processFrame(float32: Float32Array, encodedChunk: VADFrame): VADResult {
      const rms = calcRMS(float32);
      const vadScore = Math.min(1, rms / 0.08); // normalise: 0.08 = loud speech ≈ 1.0
      const isSpeechFrame = rms > rmsThreshold;

      const prevState = state;
      let isOnsetStart = false;
      let isTurnEnd = false;

      if (isSpeechFrame) {
        consecutiveSilence = 0;
        consecutiveSpeech++;

        if (state === 'silence') {
          // Buffer in pre-roll while we wait for onset confirmation
          preRoll.push(encodedChunk);
          if (preRoll.length > preRollFrames) preRoll.shift();

          if (consecutiveSpeech >= onsetFrames) {
            state = 'onset';
            isOnsetStart = true; // caller: flush preRoll + send activityStart
          }
        } else if (state === 'onset') {
          state = 'speaking';
        } else if (state === 'trailing') {
          // Speech resumed during hangover — go back to speaking
          state = 'speaking';
          consecutiveSilence = 0;
        }
        // state === 'speaking': stay in speaking

      } else {
        // Silence frame
        consecutiveSpeech = 0;

        if (state === 'speaking' || state === 'onset') {
          state = 'trailing';
          consecutiveSilence = 1;
        } else if (state === 'trailing') {
          consecutiveSilence++;
          if (consecutiveSilence >= hangoverFrames) {
            state = 'silence';
            isTurnEnd = true; // caller: send activityEnd
            consecutiveSilence = 0;
          }
        }
        // state === 'silence': stay in silence, add to pre-roll ring
        if (state === 'silence') {
          preRoll.push(encodedChunk);
          if (preRoll.length > preRollFrames) preRoll.shift();
        }
      }

      const isSpeaking = state === 'onset' || state === 'speaking' || state === 'trailing';

      return { vadState: state, isSpeaking, vadScore, isOnsetStart, isTurnEnd };
    },

    flushPreRoll(): VADFrame[] {
      const frames = [...preRoll];
      preRoll.length = 0;
      return frames;
    },

    reset(): void {
      state = 'silence';
      consecutiveSpeech = 0;
      consecutiveSilence = 0;
      preRoll.length = 0;
    },
  };
}
