export const MUSIC_LANDING_VOLUME = 0.02953125;
export const MUSIC_LORE_VOLUME_RATIO = 0.15;
export const MUSIC_KNIFE_VOLUME = 0.0118125;
export const MUSIC_SESSION_AMBIENT = 0.0045;
export const MUSIC_OFF_VOLUME = 0;
export const MUSIC_SCENE_RAMP_MS = 1500;
export const LORE_DUCK_RAMP_MS = 140;
export const LORE_RESTORE_RAMP_MS = 1800;

export interface RadioVolumeTargetInput {
  scenePhase: string;
  showStage00: boolean;
  isLoreActive: boolean;
  isLoreComplete: boolean;
  isOracleSpeaking: boolean;
  isAudioPlaying: boolean;
  oracleHasSpoken: boolean;
  loreBaseVolume: number;
}

export interface RadioVolumeTarget {
  target: number;
  rampMs?: number;
}

/** Resolve the established audible radio target without coupling it to visuals. */
export function resolveRadioVolumeTarget({
  scenePhase,
  showStage00,
  isLoreActive,
  isLoreComplete,
  isOracleSpeaking,
  isAudioPlaying,
  oracleHasSpoken,
  loreBaseVolume,
}: RadioVolumeTargetInput): RadioVolumeTarget {
  if (!isAudioPlaying) {
    return { target: MUSIC_OFF_VOLUME };
  }
  if (isOracleSpeaking && !isLoreActive) {
    return { target: MUSIC_OFF_VOLUME };
  }
  if (isLoreActive) {
    return {
      target: loreBaseVolume * MUSIC_LORE_VOLUME_RATIO,
      rampMs: LORE_DUCK_RAMP_MS,
    };
  }
  if (isLoreComplete) {
    return { target: loreBaseVolume, rampMs: LORE_RESTORE_RAMP_MS };
  }
  if (scenePhase === 'dormant') {
    return { target: MUSIC_LANDING_VOLUME };
  }
  if (scenePhase === 'terminal' || scenePhase === 'tour') {
    return { target: MUSIC_OFF_VOLUME, rampMs: 800 };
  }
  if (scenePhase === 'awakened') {
    return {
      target: showStage00 ? MUSIC_OFF_VOLUME : MUSIC_KNIFE_VOLUME,
      rampMs: MUSIC_SCENE_RAMP_MS,
    };
  }
  if (scenePhase === 'oracle') {
    return {
      target: oracleHasSpoken ? MUSIC_SESSION_AMBIENT : MUSIC_KNIFE_VOLUME,
      rampMs: MUSIC_SCENE_RAMP_MS,
    };
  }
  return { target: MUSIC_OFF_VOLUME };
}
