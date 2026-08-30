/**
 * usePortraitPipeline.ts
 *
 * Enterprise-grade hook for managing the neural portrait generation pipeline.
 * Coordinates Gemini prompt enrichment, DALL-E/Replicate generation, and Supabase storage.
 *
 * Context accumulation: themes are tallied with WEIGHTS (recurrence across scored
 * turns), and the latest scoring signals (emotional weight, alignment, archetype,
 * session phase) ride along — so the generated portrait mirrors THIS seeker's
 * session instead of a fixed theme lookup.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { logStep } from '../components/CodeAuditor';
import { traceEvent } from '../lib/sessionTrace';

interface UsePortraitPipelineProps {
  currentUserId?: string | null;
  userEmail?: string | null;
  currentSessionId?: string | null;
  onPortraitGenerated?: (url: string) => void;
}

/** Scoring signals mirrored from OracleScore — kept structurally (not imported)
 *  so the hook stays decoupled from the conversation component. */
export interface PortraitScoreSignals {
  emotionalWeight?: string | null;
  alignment?: string | null;
  archetypeTitle?: string | null;
  sessionPhase?: string | null;
}

export interface PortraitContext {
  /** Themes ranked by session recurrence, heaviest first. */
  weightedThemes: Array<{ theme: string; weight: number }>;
  emotionalWeight?: string;
  alignment?: string;
  archetypeTitle?: string;
  sessionPhase?: string;
  /** Compact essence of what the seeker actually said (their own words,
   *  trimmed). Distilled server-side before any third-party provider sees it. */
  seekerLines?: string[];
}

const MAX_SEEKER_LINES = 6;
const MAX_LINE_CHARS = 220;

export type PortraitPipelineState = 'ready' | 'generating' | 'success' | 'failed';

export function usePortraitPipeline({
  currentUserId,
  userEmail,
  currentSessionId,
  onPortraitGenerated,
}: UsePortraitPipelineProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [pipelineState, setPipelineState] = useState<PortraitPipelineState>('ready');
  const [latestPortraitUrl, setLatestPortraitUrl] = useState<string | null>(null);
  const [portraitError, setPortraitError] = useState<string | null>(null);
  const [lastRequestId, setLastRequestId] = useState<string | null>(null);
  // React state is intentionally not used as the request lock: two taps in the
  // same event loop can otherwise both observe isGenerating === false.
  const generationInFlightRef = useRef(false);
  const retryContextRef = useRef<{ themes: string[]; seekerLines?: string[] } | null>(null);
  const attemptRef = useRef(0);
  // Weighted tally — a theme that surfaces across many scored turns outweighs
  // one mentioned once. Replaces the old Set (which flattened all recurrence).
  const themeWeightsRef = useRef<Map<string, number>>(new Map());
  const scoreSignalsRef = useRef<PortraitScoreSignals>({});

  // Returns true on success, false on failure — callers use this to reset any
  // "already triggered" session guard so a single failed provider call never
  // silently disables portraits for the rest of the session.
  const generatePortrait = useCallback(async (
    themes: string[],
    seekerLines?: string[],
  ): Promise<boolean> => {
    if (generationInFlightRef.current) {
      logStep('PORTRAIT REQUEST ALREADY IN FLIGHT — SKIPPED', 'warn');
      return false;
    }

    generationInFlightRef.current = true;
    const requestId = crypto.randomUUID();
    const attempt = attemptRef.current + 1;
    attemptRef.current = attempt;
    retryContextRef.current = { themes: [...themes], seekerLines: seekerLines ? [...seekerLines] : undefined };
    setLastRequestId(requestId);
    setPortraitError(null);
    setPipelineState('generating');
    setIsGenerating(true);
    logStep('GENERATING PORTRAIT...', 'pending');
    traceEvent('portrait_generation_started', {
      request_id: requestId,
      session_id: currentSessionId ?? null,
      attempt,
    });

    try {
      const { supabase } = await import('../lib/supabase');
      const safeThemes = themes.length > 0 ? themes : ['oracle', 'cyberpunk', 'graffiti'];

      // Assemble the fluid context block. themes param stays the authoritative
      // list (callers may pass score-block themes directly); weights come from
      // the session tally, defaulting to 1 for themes we never saw scored.
      const weightedThemes = safeThemes
        .map(theme => ({ theme, weight: themeWeightsRef.current.get(theme) ?? 1 }))
        .sort((a, b) => b.weight - a.weight);
      const signals = scoreSignalsRef.current;
      const context: PortraitContext = {
        weightedThemes,
        ...(signals.emotionalWeight && { emotionalWeight: signals.emotionalWeight }),
        ...(signals.alignment && { alignment: signals.alignment }),
        ...(signals.archetypeTitle && { archetypeTitle: signals.archetypeTitle }),
        ...(signals.sessionPhase && { sessionPhase: signals.sessionPhase }),
        ...(seekerLines?.length && {
          seekerLines: seekerLines
            .filter(l => l.trim().length > 8)
            .slice(-MAX_SEEKER_LINES)
            .map(l => l.trim().slice(0, MAX_LINE_CHARS)),
        }),
      };
      logStep(
        `PORTRAIT CONTEXT — themes: ${weightedThemes.map(t => `${t.theme}×${t.weight}`).join(', ')}` +
        `${signals.emotionalWeight ? ` | weight: ${signals.emotionalWeight}` : ''}` +
        `${signals.archetypeTitle ? ` | archetype: ${signals.archetypeTitle}` : ''}`,
        'ok',
      );

      logStep('INVOKING PORTRAIT EFA', 'pending');
      const { data, error } = await supabase.functions.invoke('gemini-portrait-generator', {
        body: {
          themes: safeThemes, // backward-compat fallback field
          context,
          email: userEmail || undefined,
          sessionId: currentSessionId || undefined,
          enhancePrompt: true,
        },
        headers: {
          'x-oracle-request-id': requestId,
          'x-oracle-session-id': currentSessionId ?? '',
        },
      });

      if (error) throw error;
      if (!data?.portraitUrl) throw new Error('No portraitUrl returned from generator');

      if (data.promptUsed) {
        // Surface the distilled prompt in the step log so headless verification
        // can diff prompts across contrasting sessions (no raw transcript here).
        logStep(`PORTRAIT PROMPT [fluid=${!!data.fluidContext}]: ${String(data.promptUsed).slice(0, 300)}`, 'ok');
      }
      logStep('NEURAL PORTRAIT SYNTHESIZED ✓', 'ok');
      setLatestPortraitUrl(data.portraitUrl);
      setPipelineState('success');
      onPortraitGenerated?.(data.portraitUrl);
      return true;
    } catch (err) {
      console.error('Portrait generation failed:', err);
      logStep('PORTRAIT GENERATION FAILED', 'err');
      setPipelineState('failed');
      setPortraitError('SIGNAL LOST — PORTRAIT SYNTHESIS FAILED. SAFE RETRY AVAILABLE.');
      traceEvent('portrait_generation_failed', {
        request_id: requestId,
        session_id: currentSessionId ?? null,
        attempt,
        error: err instanceof Error ? err.name : 'unknown_error',
      });
      return false;
    } finally {
      generationInFlightRef.current = false;
      setIsGenerating(false);
    }
  }, [userEmail, currentSessionId, onPortraitGenerated]);

  const retryPortrait = useCallback((): Promise<boolean> => {
    const previous = retryContextRef.current;
    if (!previous) {
      logStep('PORTRAIT RETRY UNAVAILABLE — NO REQUEST CONTEXT', 'warn');
      return Promise.resolve(false);
    }
    return generatePortrait(previous.themes, previous.seekerLines);
  }, [generatePortrait]);

  const addThemes = useCallback((themes: string[]) => {
    themes.forEach(t => {
      themeWeightsRef.current.set(t, (themeWeightsRef.current.get(t) ?? 0) + 1);
    });
  }, []);

  /** Capture the latest scoring signals so the portrait reflects the session's
   *  emotional register, not just its topic list. Latest wins — the portrait
   *  should mirror where the seeker ENDED UP, not where they started. */
  const recordScoreSignals = useCallback((signals: PortraitScoreSignals) => {
    const cur = scoreSignalsRef.current;
    scoreSignalsRef.current = {
      emotionalWeight: signals.emotionalWeight ?? cur.emotionalWeight,
      alignment: signals.alignment ?? cur.alignment,
      // Archetype is the mirror-phase payoff — never let a later null erase it.
      archetypeTitle: signals.archetypeTitle ?? cur.archetypeTitle,
      sessionPhase: signals.sessionPhase ?? cur.sessionPhase,
    };
  }, []);

  const getThemes = useCallback(() => {
    // Heaviest first, so length-capped consumers keep the dominant themes.
    return Array.from(themeWeightsRef.current.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([theme]) => theme);
  }, []);

  const clearPortraitError = useCallback(() => setPortraitError(null), []);

  // A new session starts with a clean access state. The request lock is kept
  // separate so an old network response cannot make a new session duplicate it.
  useEffect(() => {
    setPipelineState('ready');
    setLatestPortraitUrl(null);
    setPortraitError(null);
    setLastRequestId(null);
    retryContextRef.current = null;
    attemptRef.current = 0;
  }, [currentSessionId]);

  return {
    isGenerating,
    pipelineState,
    latestPortraitUrl,
    portraitError,
    lastRequestId,
    clearPortraitError,
    generatePortrait,
    retryPortrait,
    addThemes,
    recordScoreSignals,
    getThemes,
  };
}
