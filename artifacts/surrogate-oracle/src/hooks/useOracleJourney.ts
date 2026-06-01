/**
 * useOracleJourney.ts
 *
 * Enterprise-grade hook for managing the Seeker's Journey.
 * Handles phase transitions (dormant -> terminal -> awakened -> oracle)
 * and the ceremonial timings/SFX associated with each step.
 */
import { useState, useCallback, useRef, useMemo } from 'react';
import { logStep } from '../components/CodeAuditor';
import { 
  playActivationSfx, 
  startAlleyAmbience, 
  playExitTone 
} from '../lib/oracleSfx';

export type ScenePhase = 'dormant' | 'terminal' | 'awakened' | 'oracle';

interface UseOracleJourneyProps {
  onStartSession: () => void;
  onCleanup: () => void;
}

export function useOracleJourney({
  onStartSession,
  onCleanup,
}: UseOracleJourneyProps) {
  const [scenePhase, setScenePhase] = useState<ScenePhase>('dormant');
  const [loreComplete, setLoreComplete] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [selectedKnifeQuestion, setSelectedKnifeQuestion] = useState<string | null>(null);
  const [selectedKnifeIndex, setSelectedKnifeIndex] = useState<number | null>(null);

  const alleyAmbienceStopRef = useRef<(() => void) | null>(null);

  const enterTerminal = useCallback(() => {
    if (scenePhase !== 'dormant') return;
    logStep('TAP → TERMINAL', 'ok');
    setScenePhase('terminal');
    playActivationSfx();
    alleyAmbienceStopRef.current = startAlleyAmbience();
  }, [scenePhase]);

  const awakeFromTerminal = useCallback(() => {
    logStep('LORE DONE → AWAKENED', 'ok');
    setScenePhase('awakened');
    
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
    
    // Transition to full Oracle mode after a dramatic pause
    setTimeout(() => {
      setScenePhase('oracle');
      logStep('ORACLE PHASE ENTERED', 'ok');
    }, 1600);
  }, []);

  const resetJourney = useCallback(() => {
    setScenePhase('dormant');
    setLoreComplete(false);
    setIsExiting(false);
    setSelectedKnifeQuestion(null);
    setSelectedKnifeIndex(null);

    alleyAmbienceStopRef.current?.();
    alleyAmbienceStopRef.current = null;

    onCleanup();
    logStep('JOURNEY RESET → DORMANT', 'ok');
  }, [onCleanup]);

  const exitOracleMode = useCallback(() => {
    logStep('EXIT INITIATED', 'ok');
    setIsExiting(true);
    playExitTone();
    if (typeof navigator !== 'undefined') navigator.vibrate?.([80, 60, 80]);

    setTimeout(() => {
      setScenePhase('dormant');
      setLoreComplete(false);
      setSelectedKnifeQuestion(null);
      setSelectedKnifeIndex(null);

      alleyAmbienceStopRef.current?.();
      alleyAmbienceStopRef.current = null;

      onCleanup();
      logStep('DORMANT RESTORED', 'ok');
    }, 2800);

    setTimeout(() => {
      setIsExiting(false);
    }, 3200);
  }, [onCleanup]);

  return useMemo(() => ({
    scenePhase,
    loreComplete,
    isExiting,
    selectedKnifeQuestion,
    selectedKnifeIndex,
    setLoreComplete,
    enterTerminal,
    awakeFromTerminal,
    selectKnifeQuestion,
    exitOracleMode,
    resetJourney,
  }), [
    scenePhase, loreComplete, isExiting, selectedKnifeQuestion, 
    selectedKnifeIndex, enterTerminal, awakeFromTerminal, 
    selectKnifeQuestion, exitOracleMode, resetJourney
  ]);
}
