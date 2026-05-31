import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { logStep } from '../components/CodeAuditor';

/**
 * SeekerEcho — the persisted memory of a returning Seeker (design §I.5, §I.3).
 *
 * Mirrors the `seeker_echo` table (build contract §E). Keyed by `seeker_key`
 * (wallet_address or ip). Read on entry to change the Dormant→Terminal handoff;
 * written on session end with the latest archetype/cost/alignment/totem.
 */
export interface SeekerEcho {
  id: string;
  seeker_key: string;
  name: string | null;
  last_archetype: string | null;
  totem_level: number;
  last_cost: string | null;
  alignment: string | null;
  irl_context: string | null;
  session_summary: string | null;
  last_session_themes: string[] | null;
  session_count: number;
  visit_count: number;
  last_seen_at: string;
  created_at: string;
}

/** Fields the client may write on session end. `seekerKey` identifies the row. */
export interface SeekerEchoUpsert {
  seekerKey: string;
  name?: string | null;
  lastArchetype?: string | null;
  totemLevel?: number | null;
  lastCost?: string | null;
  alignment?: string | null;
  irlContext?: string | null;
}

const FUNCTION_NAME = 'seeker-echo';

export function useSeekerEcho() {
  const [echo, setEcho] = useState<SeekerEcho | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  /** Read the echo for a seeker key (wallet/ip). Returns null for first-timers. */
  const loadEcho = useCallback(async (key: string): Promise<SeekerEcho | null> => {
    if (!key) return null;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
        body: { op: 'read', seekerKey: key },
      });

      if (error) throw error;

      const next: SeekerEcho | null = data?.echo ?? null;
      setEcho(next);

      if (next) {
        logStep('SEEKER ECHO LOADED (returning)', 'ok');
      } else {
        logStep('SEEKER ECHO: none (first visit)', 'ok');
      }
      return next;
    } catch (err) {
      logStep('SEEKER ECHO LOAD FAILED', 'warn');
      console.warn('Seeker Echo load error:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Upsert the echo on session end. Only supplied fields are written;
   * omitted fields keep their prior value. visit_count is incremented and
   * last_seen_at bumped server-side.
   */
  const saveEcho = useCallback(async (partial: SeekerEchoUpsert): Promise<SeekerEcho | null> => {
    if (!partial?.seekerKey) {
      console.warn('Seeker Echo save skipped: missing seekerKey');
      return null;
    }
    try {
      const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
        body: partial,
      });

      if (error) throw error;

      const next: SeekerEcho | null = data?.echo ?? null;
      if (next) setEcho(next);
      logStep('SEEKER ECHO SAVED', 'ok');
      return next;
    } catch (err) {
      logStep('SEEKER ECHO SAVE FAILED', 'warn');
      console.warn('Seeker Echo save error:', err);
      return null;
    }
  }, []);

  return { echo, isLoading, loadEcho, saveEcho };
}
