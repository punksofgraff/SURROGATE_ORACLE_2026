/**
 * useOracleJourney.ts
 *
 * Enterprise-grade hook for managing the Seeker's Journey.
 * Handles phase transitions (dormant -> terminal -> awakened -> oracle)
 * and the ceremonial timings/SFX associated with each step.
 */
import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { logStep } from '../components/CodeAuditor';
import { 
  playActivationSfx, 
  startAlleyAmbience, 
  playExitTone 
} from '../lib/oracleSfx';

export type ScenePhase = 'dormant' | 'terminal' | 'tour' | 'awakened' | 'oracle';

interface UseOracleJourneyProps {
  onStartSession: () => void;
  onCleanup: () => void;
  /** Optional: reset the Vertex Gemini session boot state so Oracle re-greets on next journey. */
  onResetSessionBoot?: () => void;
  /** Optional: returns a promise that resolves when post-session writes are
   *  settled (or times out). exitOracleMode awaits this before calling onCleanup
   *  so background writes land before the session is fully torn down. */
  onWritesSettled?: () => Promise<void>;
}

export function useOracleJourney({
  onStartSession,
  onCleanup,
  onWritesSettled,
}: UseOracleJourneyProps) {
  const [scenePhase, setScenePhase] = useState<ScenePhase>(() => {
    // DEV-only: boot straight into a phase for visual debugging, e.g. ?phase=oracle
    if (typeof window !== 'undefined') {
      // DEV shortcut: ?phase=oracle boots straight into a phase for visual debugging.
      if (import.meta.env.DEV) {
        const p = new URLSearchParams(window.location.search).get('phase');
        if (p === 'oracle' || p === 'awakened' || p === 'terminal' || p === 'tour') {
          return p as ScenePhase;
        }
      }
      // sessionStorage — survives HMR/hot-reload in the same tab but dies on new
      // tab open or fresh preview load. No more jumping into oracle on cold load.
      const saved = sessionStorage.getItem('oracle_scene_phase');
      if (saved === 'oracle' || saved === 'awakened' || saved === 'terminal' || saved === 'tour') {
        return saved as ScenePhase;
      }
    }
    return 'dormant';
  });
  
  const [loreComplete, setLoreComplete] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [selectedKnifeQuestion, setSelectedKnifeQuestion] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('oracle_selected_knife_question');
    }
    return null;
  });
  const [selectedKnifeIndex, setSelectedKnifeIndex] = useState<number | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('oracle_selected_knife_index');
      return saved ? parseInt(saved, 10) : null;
    }
    return null;
  });

  const alleyAmbienceStopRef = useRef<(() => void) | null>(null);
  // Ref holding the pending knife→oracle transition timer so resetJourney can cancel it.
  // Without this, a reset mid-knife-selection re-enters oracle phase ~1.5s later, leaving
  // the mic open into a dead session.
  const knifeTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Authoritative mirror of scenePhase for closure-safe transition guards. Synced from
  // state, and set immediately on a transition so a same-tick double-call can't slip through.
  const scenePhaseRef = useRef<ScenePhase>(scenePhase);
  useEffect(() => { 
    scenePhaseRef.current = scenePhase; 
    sessionStorage.setItem('oracle_scene_phase', scenePhase);
  }, [scenePhase]);

  const enterTerminal = useCallback(() => {
    if (scenePhase !== 'dormant') return;
    logStep('TAP → TERMINAL', 'ok');
    scenePhaseRef.current = 'terminal';
    setScenePhase('terminal');
    playActivationSfx();
    alleyAmbienceStopRef.current = startAlleyAmbience();
  }, [scenePhase]);

  const enterTour = useCallback(() => {
    if (scenePhaseRef.current !== 'dormant' && scenePhaseRef.current !== 'terminal' && scenePhaseRef.current !== 'awakened') return;
    logStep('STAGE_00 → TOUR PHASE ENTERED', 'ok');
    scenePhaseRef.current = 'tour';
    setScenePhase('tour');
    playActivationSfx();
  }, []);

  const awakeFromTerminal = useCallback((opts?: { bypassLore?: boolean }) => {
    // Guard: only terminal→awakened or tour→awakened.
    if (scenePhaseRef.current !== 'terminal' && scenePhaseRef.current !== 'tour') return;
    scenePhaseRef.current = 'awakened';
    logStep(opts?.bypassLore ? 'LORE SKIPPED (RETURNING SEEKER)' : 'LORE DONE → AWAKENED', 'ok');
    setScenePhase('awakened');
    // Mark that the seeker has passed through awakened at least once this session.
    // Used by the Canvas warmup to skip the Suspense fallback on re-entry.
    sessionStorage.setItem('oracle_canvas_warmed', '1');
    
    // Stop the low-frequency alley hum once lore is finished
    alleyAmbienceStopRef.current?.();
    alleyAmbienceStopRef.current = null;
    
    // NOTE: do NOT auto-start the Gemini session here.
    // Oracle greets AFTER knife selection, triggered by handleKnifeClick → selectKnifeQuestion.
    // Awakened phase shows the territory announcement + knife cards — no greeting yet.
  }, []);

  const selectKnifeQuestion = useCallback((question: string, index: number) => {
    logStep(`KNIFE[${index}] SELECTED`, 'ok');
    setSelectedKnifeQuestion(question);
    setSelectedKnifeIndex(index);
    sessionStorage.setItem('oracle_selected_knife_question', question);
    sessionStorage.setItem('oracle_selected_knife_index', String(index));
    
    // Transition to full Oracle mode after a dramatic pause.
    // 1500ms: prewarm() is called well before knife selection (at rift-open or
    // wallet-seeker entry), giving Gemini ample time to establish the WS.
    // The previous 3800ms was a conservative cold-start buffer that caused a
    // 4+ second blank canvas after knife tap — now the avatar arrives promptly.
    if (knifeTransitionTimerRef.current !== null) {
      clearTimeout(knifeTransitionTimerRef.current);
    }
    knifeTransitionTimerRef.current = setTimeout(() => {
      knifeTransitionTimerRef.current = null;
      setScenePhase('oracle');
      logStep('ORACLE PHASE ENTERED', 'ok');
    }, 1500);
  }, []);

  const resetJourney = useCallback(() => {
    // Cancel any pending knife→oracle transition so the mic can't re-open
    // into a dead session after a mid-selection reset.
    if (knifeTransitionTimerRef.current !== null) {
      clearTimeout(knifeTransitionTimerRef.current);
      knifeTransitionTimerRef.current = null;
    }

    setScenePhase('dormant');
    setLoreComplete(false);
    setIsExiting(false);
    setSelectedKnifeQuestion(null);
    setSelectedKnifeIndex(null);
    sessionStorage.removeItem('oracle_scene_phase');
    sessionStorage.removeItem('oracle_selected_knife_question');
    sessionStorage.removeItem('oracle_selected_knife_index');

    alleyAmbienceStopRef.current?.();
    alleyAmbienceStopRef.current = null;

    onCleanup();
    onResetSessionBoot?.();
    logStep('JOURNEY RESET → DORMANT', 'ok');
  }, [onCleanup, onResetSessionBoot]);

  const exitOracleMode = useCallback((alignment?: string | null) => {
    logStep('EXIT INITIATED', 'ok');
    setIsExiting(true);
    playExitTone();
    const haptic = alignment === 'sacred'
      ? [40, 20, 40, 20, 60]
      : alignment === 'profane'
      ? [80, 30, 80]
      : [60, 30, 60];
    if (typeof navigator !== 'undefined') navigator.vibrate?.(haptic);

    // ── Alignment verdict: paint the environment with the Oracle's judgment ──
    // Sets body[data-exit-alignment] so CSS keyframes can animate the alley,
    // cabinet, and scanlines to reflect sacred/profane for ~3 seconds.
    // Null/missing alignment = neutral exit, no environmental effect.
    if (typeof document !== 'undefined' && (alignment === 'sacred' || alignment === 'profane')) {
      document.body.dataset.exitAlignment = alignment;
      setTimeout(() => { delete document.body.dataset.exitAlignment; }, 3200);
    }

    // ── Background writes settle window ─────────────────────────────────────
    // onWritesSettled (supplied by the parent) resolves when the echo upsert
    // and oracle-memory-distill calls have either landed or timed out. We race
    // it against a 2.8s hard floor so the Talisman never lingers past its
    // designed duration. The 2.8s floor is kept even when writes finish early
    // so the alignment CSS animation always completes.
    const floorMs = 2800;
    // Never let a rejected/hung write block the dormant transition: swallow
    // rejections here (the parent already logs failures) and cap the total
    // wait at 6s even if the parent's settlement promise misbehaves.
    const writesPromise = (onWritesSettled ? onWritesSettled() : Promise.resolve())
      .catch(() => undefined);
    const writesCapped  = Promise.race([
      writesPromise,
      new Promise<void>(r => setTimeout(r, 6000)),
    ]);
    const floorPromise  = new Promise<void>(r => setTimeout(r, floorMs));

    Promise.all([writesCapped, floorPromise]).then(() => {
      setScenePhase('dormant');
      setLoreComplete(false);
      setSelectedKnifeQuestion(null);
      setSelectedKnifeIndex(null);
      sessionStorage.removeItem('oracle_scene_phase');
      sessionStorage.removeItem('oracle_selected_knife_question');
      sessionStorage.removeItem('oracle_selected_knife_index');

      alleyAmbienceStopRef.current?.();
      alleyAmbienceStopRef.current = null;

      onCleanup();
      logStep('DORMANT RESTORED', 'ok');
    });

    setTimeout(() => {
      setIsExiting(false);
    }, 3200);
  }, [onCleanup, onWritesSettled]);

  return useMemo(() => ({
    scenePhase,
    loreComplete,
    isExiting,
    selectedKnifeQuestion,
    selectedKnifeIndex,
    setLoreComplete,
    enterTerminal,
    enterTour,
    awakeFromTerminal,
    selectKnifeQuestion,
    exitOracleMode,
    resetJourney,
  }), [
    scenePhase, loreComplete, isExiting, selectedKnifeQuestion,
    selectedKnifeIndex, enterTerminal, enterTour, awakeFromTerminal,
    selectKnifeQuestion, exitOracleMode, resetJourney
  ]);
}
