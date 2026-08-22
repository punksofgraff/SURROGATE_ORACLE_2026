import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { getAudioContext } from '../lib/oracleSfx';
import { defaultAudioTracks } from '../config/audioTracks';
import { logStep } from '../components/CodeAuditor';

const DEFAULT_STATION = 0; // Graff Punks — sole station

const MUSIC_LANDING_VOLUME  = 0.039375; // Another 25% reduction from 0.0525
const MUSIC_LORE_VOLUME     = 0;      // ABSOLUTE SILENCE (Proof Test)
const MUSIC_KNIFE_VOLUME    = 0.01575;  // Another 25% reduction from 0.021
const MUSIC_SESSION_AMBIENT = 0.006;  // Another 25% reduction from 0.008
const MUSIC_OFF_VOLUME      = 0;

export interface UseRadioAtmosphereParams {
  scenePhase: string;
  showStage00: boolean;
  isOracleSpeaking: boolean;
  isMicActive: boolean;
  oracleHasSpokenRef: RefObject<boolean>;
}

/**
 * Radio/ambient-music atmosphere spine — extracted verbatim from SurrogateOracleImmersion.tsx
 * (Task #23, step 6). Owns the audio element ref, the Web Audio gain node, the volume-matrix
 * effect (which target volume applies for the current scene phase / mic / Oracle-speaking
 * state), and the fade/station-switch mechanics.
 *
 * IMPORTANT: preserved verbatim from the original component —
 *  - `setupAudioSpine` remains fully synchronous (no await/setTimeout before graph wiring +
 *    `play()`) — iOS Safari drops the gesture-activation token across any macrotask boundary.
 *  - `fadeToVolume`'s `cancelScheduledValues` → ramp → hard-cut-at-target sequence.
 *  - The `Math.abs(nextTarget - targetVol) > 0.0001` guard and its exact dependency array in
 *    the volume-matrix effect.
 */
export function useRadioAtmosphere({
  scenePhase,
  showStage00,
  isOracleSpeaking,
  isMicActive,
  oracleHasSpokenRef,
}: UseRadioAtmosphereParams) {
  const audioRef      = useRef<HTMLAudioElement | null>(null);
  const radioGainRef  = useRef<GainNode | null>(null);

  const [targetVol, setTargetVol]           = useState(0.021);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [currentStation, setCurrentStation] = useState(DEFAULT_STATION);

  const setupAudioSpine = useCallback(() => {
    // Fully synchronous — no await, no setTimeout. iOS Safari requires ALL audio
    // operations (context creation, play(), graph wiring) to happen synchronously
    // within the gesture event handler. Any macrotask boundary (setTimeout/await)
    // after the first tap drops iOS's gesture activation token, leaving the context
    // suspended. getAudioContext() creates the context (starts running on iOS when
    // created inside a gesture) and fires a fire-and-forget resume as a fallback.
    const ctx = getAudioContext();
    if (radioGainRef.current || !audioRef.current) return;
    try {
      logStep(`AUDIO CONTEXT STATE: ${ctx.state}`, ctx.state === 'running' ? 'ok' : 'pending');
      const source = ctx.createMediaElementSource(audioRef.current);
      const gain   = ctx.createGain();
      gain.gain.value = targetVol;
      source.connect(gain);
      gain.connect(ctx.destination);
      radioGainRef.current = gain;
      // iOS Safari requires audio element play() to be called synchronously inside the
      // gesture handler — the useEffect path (setIsAudioPlaying → play()) fires after
      // paint and is outside iOS's gesture window, so the element stays silent.
      audioRef.current.play().catch((err) => console.warn('[Radio] Initial play() failed:', err));
      setIsAudioPlaying(true);
      logStep('AUDIO SPINE INITIALIZED', 'ok');
    } catch (e) {
      console.warn('[Audio] Spine setup failed:', e);
    }
  }, [targetVol]);

  const fadeToVolume = useCallback((target: number, rampMs?: number) => {
    setTargetVol(target);
    const safeTarget = Math.max(0, target);
    if (!radioGainRef.current) return;
    const gain = radioGainRef.current;
    const ctx  = getAudioContext();
    const now  = ctx.currentTime;

    // ABSOLUTE MUTE HARDENING
    gain.gain.cancelScheduledValues(now);

    if (target === 0) {
      // Linear ramp to a tiny value then hard cut to zero to avoid hum
      const ms = rampMs ?? 400; // Aggressive proof-test ramp
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0.0001, now + (ms / 1000) * 0.8);
      gain.gain.setValueAtTime(0, now + ms / 1000);

      // Secondary defense: Pause the source element
      if (audioRef.current) {
        setTimeout(() => {
          if (audioRef.current && target === 0) audioRef.current.pause();
        }, ms);
      }
      logStep(`AUDIO HARD MUTE INITIATED (${ms}ms)`, 'ok');
    } else {
      const ms = rampMs ?? 1500;
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.exponentialRampToValueAtTime(safeTarget, now + ms / 1000);

      // Resume element if it was paused
      if (audioRef.current && audioRef.current.paused) {
        audioRef.current.play().catch((err) => console.warn('[Radio] Resume play() failed:', err));
      }
    }
  }, []);

  const switchStation = useCallback((idx: number) => {
    if (!audioRef.current || idx === currentStation) return;
    const wasPlaying = !audioRef.current.paused;
    audioRef.current.src = defaultAudioTracks[idx].url;
    audioRef.current.load();
    if (wasPlaying) audioRef.current.play().catch((err) => console.warn('[Radio] Station-switch play() failed:', err));
    setCurrentStation(idx);
  }, [currentStation]);

  useEffect(() => {
    let nextTarget: number;
    let rampMs: number | undefined;

    // Track if Oracle has spoken during this session
    if (isOracleSpeaking) {
      oracleHasSpokenRef.current = true;
    }

    if (!isAudioPlaying) {
      nextTarget = MUSIC_OFF_VOLUME;
    } else if (isOracleSpeaking) {
      nextTarget = MUSIC_OFF_VOLUME;
    } else if (isMicActive) {
      // Duck completely when mic is active to avoid acoustic VAD battle
      nextTarget = MUSIC_OFF_VOLUME;
      rampMs = 80;
    } else if (scenePhase === 'dormant') {
      nextTarget = MUSIC_LANDING_VOLUME;
    } else if (scenePhase === 'terminal' || scenePhase === 'tour') {
      nextTarget = MUSIC_OFF_VOLUME;
      rampMs = 800;
    } else if (scenePhase === 'awakened') {
      // Keep silent while the Stage00 ACK card is up — fade in only once knife cards are visible
      nextTarget = showStage00 ? MUSIC_OFF_VOLUME : MUSIC_KNIFE_VOLUME;
      rampMs = 1500;
    } else if (scenePhase === 'oracle') {
      // Restore music volume when in oracle mode and mic is NOT active!
      // If Oracle has already spoken, lock to the low ambient state (0.008) to avoid voice clashes
      nextTarget = oracleHasSpokenRef.current ? MUSIC_SESSION_AMBIENT : MUSIC_KNIFE_VOLUME;
      rampMs = 1500;
    } else {
      nextTarget = MUSIC_OFF_VOLUME;
    }

    if (Math.abs(nextTarget - targetVol) > 0.0001) {
      fadeToVolume(nextTarget, rampMs);
    }
  }, [scenePhase, showStage00, isOracleSpeaking, isMicActive, isAudioPlaying, targetVol, fadeToVolume]);

  useEffect(() => {
    if (!audioRef.current) return;
    if (isAudioPlaying) audioRef.current.play().catch((err) => console.warn('[Radio] play()/pause sync failed:', err));
    else audioRef.current.pause();
  }, [isAudioPlaying]);

  return {
    audioRef,
    targetVol,
    isAudioPlaying,
    setIsAudioPlaying,
    currentStation,
    setupAudioSpine,
    fadeToVolume,
    switchStation,
  };
}
