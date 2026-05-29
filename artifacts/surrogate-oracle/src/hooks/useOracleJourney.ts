/**
 * useOracleJourney.ts
 *
 * Enterprise-grade hook for managing the Seeker's Journey.
 * Handles phase transitions (dormant -> terminal -> awakened -> oracle)
 * and the ceremonial timings/SFX associated with each step.
 */
import { useState, useCallback, useRef, useMemo } from 'react';
import { logStep } from '../components/OracleStepLogger';
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
    
    // Auto-start Gemini session after a brief breath
    logStep('startSession() CALLED', 'ok');
    setTimeout(() => {
      onStartSession();
    }, 300);
  }, [onStartSession]);

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

  const exitOracleMode = useCallback(() => {
    logStep('EXIT INITIATED', 'ok');
    setIsExiting(true);
    playExitTone();

    // 2.5s exit ceremony
    setTimeout(() => {
      setScenePhase('dormant');
      setLoreComplete(false);
      setSelectedKnifeQuestion(null);
      setSelectedKnifeIndex(null);
      setIsExiting(false);
      
      alleyAmbienceStopRef.current?.();
      alleyAmbienceStopRef.current = null;
      
      onCleanup();
      logStep('DORMANT RESTORED', 'ok');
    }, 2500);
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
  }), [
    scenePhase, loreComplete, isExiting, selectedKnifeQuestion, 
    selectedKnifeIndex, enterTerminal, awakeFromTerminal, 
    selectKnifeQuestion, exitOracleMode
  ]);
}
