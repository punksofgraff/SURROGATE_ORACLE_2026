import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { getAudioContext } from '../lib/oracleSfx';
import { defaultAudioTracks } from '../config/audioTracks';
import { logStep } from '../components/CodeAuditor';

const DEFAULT_STATION = 0; // Graff Punks — sole station

const MUSIC_LANDING_VOLUME  = 0.039375; // Another 25% reduction from 0.0525
const MUSIC_LORE_VOLUME_RATIO = 0.15;
const MUSIC_KNIFE_VOLUME    = 0.01575;  // Another 25% reduction from 0.021
const MUSIC_SESSION_AMBIENT = 0.006;  // Another 25% reduction from 0.008
const MUSIC_OFF_VOLUME      = 0;
// The Law story starts on a hard narrative boundary. Duck quickly enough that
// the radio never competes with its first sentence, while leaving a faint
// spatial bed audible underneath it.
const LORE_DUCK_RAMP_MS     = 140;
const LORE_RESTORE_RAMP_MS  = 1800;

function publishRadioDebug(gain: GainNode | null, target: number) {
  if (!import.meta.env.DEV || typeof window === 'undefined') return;
  const debugWindow = window as Window & {
    __oracle_radio_debug?: {
      baseGain: number;
      scheduledTarget: number;
      timestamp: number;
    };
  };
  debugWindow.__oracle_radio_debug = {
    // AudioParam.value is the base value; scheduled automation is represented
    // separately because reading .value does not return the in-flight ramp.
    baseGain: gain?.gain.value ?? 0,
    scheduledTarget: target,
    timestamp: performance.now(),
  };
}

export interface UseRadioAtmosphereParams {
  scenePhase: string;
  showStage00: boolean;
  isLoreActive: boolean;
  isLoreComplete: boolean;
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
  isLoreActive,
  isLoreComplete,
  isOracleSpeaking,
  isMicActive,
  oracleHasSpokenRef,
}: UseRadioAtmosphereParams) {
  const audioRef      = useRef<HTMLAudioElement | null>(null);
  const radioGainRef  = useRef<GainNode | null>(null);
  const fadeGenerationRef = useRef(0);
  const requestedTargetRef = useRef(0);
  const lastAudibleTargetRef = useRef(MUSIC_LANDING_VOLUME);
  const loreBaseVolumeRef = useRef(MUSIC_LANDING_VOLUME);
  const wasLoreActiveRef = useRef(false);

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
      // Volume effects can run before the first gesture creates the graph.
      // Initialize from the latest queued target, not a stale render value
      // (the pre-gesture mute otherwise leaves the live graph at zero and
      // later DOM target updates do not necessarily move that first node).
      const initialTarget = requestedTargetRef.current > MUSIC_OFF_VOLUME
        ? requestedTargetRef.current
        : targetVol;
      gain.gain.value = initialTarget;
      source.connect(gain);
      gain.connect(ctx.destination);
      radioGainRef.current = gain;
      publishRadioDebug(gain, initialTarget);
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
    fadeGenerationRef.current += 1;
    const fadeGeneration = fadeGenerationRef.current;
    requestedTargetRef.current = target;
    setTargetVol(target);
    publishRadioDebug(radioGainRef.current, target);
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
          if (
            audioRef.current
            && fadeGenerationRef.current === fadeGeneration
            && requestedTargetRef.current === 0
          ) {
            audioRef.current.pause();
          }
        }, ms);
      }
      logStep(`AUDIO HARD MUTE INITIATED (${ms}ms)`, 'ok');
      if (import.meta.env.DEV) {
        window.setTimeout(() => publishRadioDebug(gain, target), ms + 20);
      }
    } else {
      const ms = rampMs ?? 1500;
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.exponentialRampToValueAtTime(safeTarget, now + ms / 1000);

      // Resume element if it was paused
      if (audioRef.current && audioRef.current.paused) {
        audioRef.current.play().catch((err) => console.warn('[Radio] Resume play() failed:', err));
      }
      if (import.meta.env.DEV) {
        window.setTimeout(() => publishRadioDebug(gain, target), ms + 20);
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

    // Preserve the level the seeker was hearing before terminal/lore can
    // request a mute. The lore duck is relative to this active mix, rather
    // than to a hard-coded replacement volume.
    if (!isLoreActive && !isLoreComplete && targetVol > MUSIC_OFF_VOLUME) {
      lastAudibleTargetRef.current = targetVol;
    }
    if (isLoreActive && !wasLoreActiveRef.current) {
      // Capture the radio's last intentional audible target before the terminal
      // phase's mute can overwrite it. The story level is always relative to
      // that captured radio level, never to the Oracle voice or iOS master.
      loreBaseVolumeRef.current = Math.max(
        MUSIC_OFF_VOLUME,
        lastAudibleTargetRef.current || targetVol || MUSIC_LANDING_VOLUME,
      );
      logStep(
        `LORE RADIO DUCK — ${Math.round(MUSIC_LORE_VOLUME_RATIO * 100)}% ` +
        `(${loreBaseVolumeRef.current.toFixed(5)} → ${(loreBaseVolumeRef.current * MUSIC_LORE_VOLUME_RATIO).toFixed(5)})`,
        'ok',
      );
    }

    if (!isAudioPlaying) {
      nextTarget = MUSIC_OFF_VOLUME;
    } else if (isMicActive) {
      // Duck completely when mic is active to avoid acoustic VAD battle
      nextTarget = MUSIC_OFF_VOLUME;
      rampMs = 80;
    } else if (isOracleSpeaking && !isLoreActive) {
      nextTarget = MUSIC_OFF_VOLUME;
    } else if (isLoreActive) {
      // Keep a quiet rhythmic bed under the archive voice. This is the app
      // mix, not the browser/iOS master volume.
      nextTarget = loreBaseVolumeRef.current * MUSIC_LORE_VOLUME_RATIO;
      rampMs = LORE_DUCK_RAMP_MS;
    } else if (isLoreComplete) {
      // Stage 00 is the post-lore release beat. Restore the pre-lore level
      // gradually before later phase-specific targets take over.
      nextTarget = loreBaseVolumeRef.current;
      rampMs = LORE_RESTORE_RAMP_MS;
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
    wasLoreActiveRef.current = isLoreActive;
  }, [scenePhase, showStage00, isLoreActive, isLoreComplete, isOracleSpeaking, isMicActive, isAudioPlaying, targetVol, fadeToVolume]);

  useEffect(() => {
    if (!audioRef.current) return;
    if (isAudioPlaying) audioRef.current.play().catch((err) => console.warn('[Radio] play()/pause sync failed:', err));
    else audioRef.current.pause();
  }, [isAudioPlaying]);

  // iOS Safari may pause the media element as well as suspending the audio
  // context when Safari backgrounds or locks the device. React state does not
  // change in that case, so the normal playback-sync effect above will not run
  // again on foreground. Resume both sides of the graph without changing the
  // element's src (or seeking it), and never revive an intentional hard mute.
  useEffect(() => {
    const handleVisibilityChange = () => {
      const ctx = getAudioContext();
      if (document.hidden) {
        void ctx.suspend()
          .then(() => logStep('TAB BACKGROUNDED', 'warn'))
          .catch((error: unknown) => {
            console.warn('[Radio] Tab-background suspend failed (non-fatal):', error);
          });
        return;
      }
      if (!isAudioPlaying) return;

      const audio = audioRef.current;
      // Start the continuation immediately. Waiting for resume() first can
      // lose the short iOS foreground activation window, and a suspended
      // AudioContext can leave that promise pending during device wake.
      if (
        audio
        && requestedTargetRef.current > MUSIC_OFF_VOLUME
        && audio.paused
      ) {
        audio.play().catch((err) => console.warn('[Radio] Foreground resume failed:', err));
      }
      void ctx.resume()
        .then(() => logStep('TAB FOREGROUNDED', 'ok'))
        .catch((error: unknown) => {
          // iOS can reject resume while the media device is still returning.
          // A later user gesture or visibility event can retry safely.
          console.warn('[Radio] Tab-foreground resume failed (non-fatal):', error);
        });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handleVisibilityChange);
    };
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
