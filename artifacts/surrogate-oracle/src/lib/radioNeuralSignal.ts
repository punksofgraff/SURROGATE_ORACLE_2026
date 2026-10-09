export interface RadioNeuralSignalFrame {
  waveform: ArrayLike<number> | null;
  currentEnergy: number;
  deltaSeconds: number;
  liveExchange: boolean;
  radioActive: boolean;
  reducedMotion: boolean;
}

const SILENCE_FLOOR_RMS = 0.012;
const RMS_RESPONSE_GAIN = 4.5;
const RESPONSE_SMOOTHING_PER_SECOND = 9;

/**
 * Advance the radio-driven neural field by one rendered frame.
 *
 * The audible radio signal is analyzed before its volume gain; this function
 * only controls the visual response and never changes audio playback.
 */
export function advanceRadioNeuralSignal({
  waveform,
  currentEnergy,
  deltaSeconds,
  liveExchange,
  radioActive,
  reducedMotion,
}: RadioNeuralSignalFrame): number {
  let targetEnergy = 0;
  if (liveExchange && radioActive && !reducedMotion && waveform?.length) {
    let signalPower = 0;
    for (let i = 0; i < waveform.length; i += 1) {
      const sample = (waveform[i] - 128) / 128;
      signalPower += sample * sample;
    }
    const rms = Math.sqrt(signalPower / waveform.length);
    targetEnergy = Math.max(0, Math.min(1, (rms - SILENCE_FLOOR_RMS) * RMS_RESPONSE_GAIN));
  }

  const blend = Math.min(1, deltaSeconds * RESPONSE_SMOOTHING_PER_SECOND);
  return currentEnergy + (targetEnergy - currentEnergy) * blend;
}
