import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LORE_DUCK_RAMP_MS,
  LORE_RESTORE_RAMP_MS,
  MUSIC_KNIFE_VOLUME,
  MUSIC_LANDING_VOLUME,
  MUSIC_LORE_VOLUME_RATIO,
  MUSIC_OFF_VOLUME,
  MUSIC_SCENE_RAMP_MS,
  MUSIC_SESSION_AMBIENT,
  resolveRadioVolumeTarget,
} from '../src/lib/radioAtmospherePolicy.ts';
import { advanceRadioNeuralSignal } from '../src/lib/radioNeuralSignal.ts';

const here = dirname(fileURLToPath(import.meta.url));
const atmosphereSource = readFileSync(
  join(here, '../src/hooks/useRadioAtmosphere.ts'),
  'utf8',
);

const loudWaveform = Uint8Array.from(
  { length: 128 },
  (_, index) => (index % 2 === 0 ? 96 : 160),
);
const silentWaveform = new Uint8Array(128).fill(128);

const stepSignal = (
  overrides: Partial<Parameters<typeof advanceRadioNeuralSignal>[0]> = {},
) => advanceRadioNeuralSignal({
  waveform: loudWaveform,
  currentEnergy: 0,
  deltaSeconds: 1 / 60,
  liveExchange: true,
  radioActive: true,
  reducedMotion: false,
  ...overrides,
});

let activeEnergy = 0;
for (let frame = 0; frame < 12; frame += 1) {
  activeEnergy = advanceRadioNeuralSignal({
    waveform: loudWaveform,
    currentEnergy: activeEnergy,
    deltaSeconds: 1 / 60,
    liveExchange: true,
    radioActive: true,
    reducedMotion: false,
  });
}
assert.ok(activeEnergy > 0.8, 'a live, active radio signal should energize the neural field');

assert.equal(
  stepSignal({ waveform: silentWaveform }),
  0,
  'a silent analyzer buffer must not create a neural pulse',
);
assert.equal(stepSignal({ liveExchange: false }), 0, 'no live exchange must disable the response');
assert.equal(stepSignal({ radioActive: false }), 0, 'a manually disabled radio must disable the response');
assert.equal(stepSignal({ reducedMotion: true }), 0, 'Reduced Motion must suppress the audio-reactive pulse');

for (const disabledState of [
  { liveExchange: false, radioActive: true, reducedMotion: false, name: 'ended exchange' },
  { liveExchange: true, radioActive: false, reducedMotion: false, name: 'radio off' },
  { liveExchange: true, radioActive: true, reducedMotion: true, name: 'Reduced Motion' },
]) {
  let energy = 0.8;
  for (let frame = 0; frame < 60; frame += 1) {
    energy = advanceRadioNeuralSignal({
      waveform: loudWaveform,
      currentEnergy: energy,
      deltaSeconds: 1 / 60,
      ...disabledState,
    });
  }
  assert.ok(energy < 0.001, `${disabledState.name} should decay the existing pulse cleanly`);
}

const volumeDefaults = {
  scenePhase: 'dormant',
  showStage00: false,
  isLoreActive: false,
  isLoreComplete: false,
  isOracleSpeaking: false,
  isAudioPlaying: true,
  oracleHasSpoken: false,
  loreBaseVolume: MUSIC_LANDING_VOLUME,
};
const volumeTarget = (overrides: Partial<typeof volumeDefaults> = {}) =>
  resolveRadioVolumeTarget({ ...volumeDefaults, ...overrides });

assert.equal(MUSIC_LANDING_VOLUME, 0.02953125);
assert.equal(MUSIC_LORE_VOLUME_RATIO, 0.15);
assert.equal(MUSIC_KNIFE_VOLUME, 0.0118125);
assert.equal(MUSIC_SESSION_AMBIENT, 0.0045);
assert.equal(MUSIC_OFF_VOLUME, 0);
assert.deepEqual(volumeTarget(), { target: 0.02953125 });
assert.deepEqual(volumeTarget({ isAudioPlaying: false }), { target: 0 });
assert.deepEqual(volumeTarget({ isOracleSpeaking: true }), { target: 0 });
assert.deepEqual(volumeTarget({ scenePhase: 'terminal' }), { target: 0, rampMs: 800 });
assert.deepEqual(volumeTarget({ scenePhase: 'tour' }), { target: 0, rampMs: 800 });
assert.deepEqual(volumeTarget({ scenePhase: 'awakened' }), {
  target: 0.0118125,
  rampMs: MUSIC_SCENE_RAMP_MS,
});
assert.deepEqual(volumeTarget({ scenePhase: 'awakened', showStage00: true }), {
  target: 0,
  rampMs: MUSIC_SCENE_RAMP_MS,
});
assert.deepEqual(volumeTarget({ scenePhase: 'oracle' }), {
  target: 0.0118125,
  rampMs: MUSIC_SCENE_RAMP_MS,
});
assert.deepEqual(volumeTarget({ scenePhase: 'oracle', oracleHasSpoken: true }), {
  target: 0.0045,
  rampMs: MUSIC_SCENE_RAMP_MS,
});
assert.deepEqual(
  volumeTarget({ isLoreActive: true, loreBaseVolume: 0.03 }),
  { target: 0.0045, rampMs: LORE_DUCK_RAMP_MS },
);
assert.deepEqual(
  volumeTarget({ isLoreComplete: true, loreBaseVolume: 0.03 }),
  { target: 0.03, rampMs: LORE_RESTORE_RAMP_MS },
);

assert.match(
  atmosphereSource,
  /source\.connect\(analyser\);\s*analyser\.connect\(gain\);\s*gain\.connect\(ctx\.destination\);/,
  'the analyzer must remain upstream of the radio gain so the visual signal survives ducking',
);

console.log('radio-to-neural signal and radio-volume policy fixtures passed');
