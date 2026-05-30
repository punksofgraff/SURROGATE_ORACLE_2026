import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { logStep } from '../components/CodeAuditor';

/**
 * useSeekerDefine — out-of-band web-grounded identity resolution.
 *
 * Calls the `seeker-define` edge function (Gemini generateContent + googleSearch)
 * with the name + handles a Seeker volunteers. The live Oracle voice stays tool-free
 * (no uplink, signal ends 2027); this is the backend-only "who are they IRL" path.
 * The result is meant for persistence (seeker_echo.irl_context), NOT to be spoken
 * back by the Oracle.
 */
export interface SeekerSource {
  title: string;
  uri: string;
}

export interface SeekerDefinition {
  definition: string;
  confident: boolean;
  sources: SeekerSource[];
}

export interface SeekerDefineInput {
  name?: string;
  handles?: string[];
  territory?: string;
  themes?: string[];
}

const FUNCTION_NAME = 'seeker-define';

export function useSeekerDefine() {
  const [definition, setDefinition] = useState<SeekerDefinition | null>(null);
  const [isDefining, setIsDefining] = useState(false);

  const defineSeeker = useCallback(async (input: SeekerDefineInput): Promise<SeekerDefinition | null> => {
    const hasSignal = (input.name && input.name.trim()) || (input.handles && input.handles.length > 0);
    if (!hasSignal) {
      console.warn('Seeker define skipped: no name or handles');
      return null;
    }
    setIsDefining(true);
    logStep('SEEKER DEFINE: web grounding…', 'pending');
    try {
      const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body: input });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? 'define failed');

      const next: SeekerDefinition = {
        definition: data.definition ?? '',
        confident: !!data.confident,
        sources: Array.isArray(data.sources) ? data.sources : [],
      };
      setDefinition(next);
      logStep(
        next.confident
          ? `SEEKER DEFINED IRL (${next.sources.length} sources)`
          : 'SEEKER DEFINE: unresolved',
        next.confident ? 'ok' : 'warn',
      );
      return next;
    } catch (err) {
      logStep('SEEKER DEFINE FAILED', 'warn');
      console.warn('Seeker define error:', err);
      return null;
    } finally {
      setIsDefining(false);
    }
  }, []);

  return { definition, isDefining, defineSeeker };
}
