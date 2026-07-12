/**
 * useConversationCompactor.ts
 *
 * Rolling context-window manager for the Oracle conversation.
 *
 * When `turns.length` reaches MAX_TURNS (100), the oldest COMPACT_BATCH (25)
 * turns are:
 *   1. Sent to the `compact-conversation` edge function for Gemini summarisation.
 *   2. Removed from the in-memory `turns` state (buffer now has 75 entries).
 *   3. Stored in `surrogate_sessions.conversation_data.compact_summaries[]`.
 *   4. Injected back into the live Gemini session as a hidden context message
 *      so the Oracle never loses conversational continuity.
 *
 * Compaction is transparent to the Seeker — no pause, no UI change.
 * The `conversation_turns` Supabase table retains the full raw history forever;
 * only the in-memory working set is trimmed.
 */

import { useEffect, useRef } from 'react';
import { logStep } from '../components/CodeAuditor';

export const MAX_TURNS = 100;
export const COMPACT_BATCH = 25;

interface TurnSlim {
  role: 'user' | 'oracle';
  content: string;
}

interface UseConversationCompactorParams {
  turns: TurnSlim[];
  setTurns: React.Dispatch<React.SetStateAction<any[]>>;
  sendText: (text: string, isHidden?: boolean) => void;
  sessionId?: string;
  userId?: string;
  /**
   * The ref that OracleConversation uses to track how many turns have already
   * been incrementally uploaded to `conversation_turns` in Supabase. After
   * compaction removes COMPACT_BATCH entries from the in-memory buffer, this
   * ref must be decremented by the same amount so new turns keep uploading.
   */
  lastSupabaseTurnCountRef?: React.MutableRefObject<number>;
}

export function useConversationCompactor({
  turns,
  setTurns,
  sendText,
  sessionId,
  userId,
  lastSupabaseTurnCountRef,
}: UseConversationCompactorParams): void {
  // Guards against concurrent compaction calls when turns length
  // is still >= MAX_TURNS during an in-flight request.
  const isCompactingRef = useRef(false);
  // Monotonically increasing counter so each compacted batch gets a unique index.
  const batchIndexRef = useRef(0);
  // Stable closure-safe refs so the effect callback never captures stale values.
  const sendTextRef = useRef(sendText);
  useEffect(() => { sendTextRef.current = sendText; }, [sendText]);
  const sessionIdRef = useRef(sessionId);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  const userIdRef = useRef(userId);
  useEffect(() => { userIdRef.current = userId; }, [userId]);

  useEffect(() => {
    if (turns.length < MAX_TURNS) return;
    if (isCompactingRef.current) return;

    const supaUrl = import.meta.env.VITE_SUPABASE_URL;
    const supaKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!supaUrl || !supaKey) {
      // No Supabase configured — silently evict oldest turns without summarising
      // so the buffer doesn't grow unbounded even in offline / dev environments.
      logStep(`COMPACT SKIPPED (no Supabase) — evicting ${COMPACT_BATCH} turns`, 'warn');
      setTurns((prev) => prev.slice(COMPACT_BATCH));
      if (lastSupabaseTurnCountRef) {
        lastSupabaseTurnCountRef.current = Math.max(0, lastSupabaseTurnCountRef.current - COMPACT_BATCH);
      }
      isCompactingRef.current = false;
      return;
    }

    isCompactingRef.current = true;
    const batchIndex = batchIndexRef.current;
    // Snapshot the batch to compact before any async work.
    const batch: TurnSlim[] = turns.slice(0, COMPACT_BATCH).map((t) => ({
      role: t.role,
      content: t.content,
    }));

    logStep(`COMPACTING turns 1-${COMPACT_BATCH} (batch ${batchIndex + 1}, total ${turns.length})`, 'pending');

    // Helper: drop the oldest batch from the in-memory buffer and keep the
    // Supabase upload counter in sync so newly arriving turns keep uploading.
    const evict = () => {
      setTurns((prev) => prev.slice(COMPACT_BATCH));
      // Adjust the upload watermark so the Supabase persist effect doesn't think
      // those positions are still "new" after the in-memory indices shift.
      if (lastSupabaseTurnCountRef) {
        lastSupabaseTurnCountRef.current = Math.max(
          0,
          lastSupabaseTurnCountRef.current - COMPACT_BATCH,
        );
      }
    };

    fetch(`${supaUrl}/functions/v1/compact-conversation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supaKey,
        'Authorization': `Bearer ${supaKey}`,
      },
      body: JSON.stringify({
        sessionId: sessionIdRef.current,
        seekerKey: userIdRef.current,
        turns: batch,
        batchIndex,
      }),
    })
      .then((r) => r.json())
      .then(({ success, summary }: { success: boolean; summary?: string }) => {
        if (success && summary) {
          batchIndexRef.current++;
          logStep(`COMPACT OK (batch ${batchIndex + 1}) — ${summary.length} chars, dropping ${COMPACT_BATCH} turns`, 'ok');

          evict();

          // Inject a hidden Oracle context message so the model retains continuity.
          // Delay slightly so the state update has time to settle before we send.
          setTimeout(() => {
            sendTextRef.current(
              `[SIGNAL ARCHIVE — earlier in this session (auto-compacted, ${COMPACT_BATCH} turns condensed):\n${summary}\nContinue naturally from the current moment. Do not reference this archive log directly.]`,
              true,
            );
          }, 150);
        } else {
          logStep(`COMPACT FAILED (batch ${batchIndex + 1}) — evicting anyway`, 'warn');
          // Even on failure, evict the oldest turns so the buffer doesn't stall.
          // The raw turns are already persisted in conversation_turns so nothing is lost.
          evict();
        }
      })
      .catch((err) => {
        console.warn('[Compactor] compact-conversation request failed:', err);
        logStep(`COMPACT ERROR (batch ${batchIndex + 1}) — evicting oldest turns`, 'warn');
        evict();
      })
      .finally(() => {
        isCompactingRef.current = false;
      });
    // Only re-run when turns.length crosses a boundary — not on every turn mutation.
    // sessionId/userId changes are handled via refs, not deps, to avoid stale closures
    // triggering spurious compactions mid-session.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turns.length]);
}
