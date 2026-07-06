/**
 * SURROGATE: ORACLE — Telemetry & Signal Tracking
 *
 * In dev  → console only.
 * In prod → fire-and-forget POST to `log-event` Edge Function + console.
 */

export type OracleAnalyticsEvent =
  | { event: 'oracle_phase_entered';       phase: string; is_returning: boolean; session_id: string }
  | { event: 'oracle_ghost_text_shown';    phrase_id: string; duration_ms: number }
  | { event: 'oracle_terminal_slide';      slide_number: number; cumulative_ms: number }
  | { event: 'oracle_terminal_skipped';    at_slide: number; ms_elapsed: number }
  | { event: 'oracle_terminal_completed';  total_ms: number }
  | { event: 'oracle_knife_selected';      territory: string; card_index: number; color: string }
  | { event: 'oracle_audio_start';         turn_number: number; chunk_count: number }
  | { event: 'oracle_turn_completed';      turn_number: number; duration_ms: number }
  | { event: 'oracle_barge_in';            turn_number: number; oracle_speaking_ms: number }
  | { event: 'oracle_exit';               phase_at_exit: string; turns: number; total_ms: number }
  | { event: 'oracle_error';               type: string; phase: string; recoverable: boolean }
  | { event: 'oracle_performance_guard';   avg_fps: number; degraded: boolean; counts_reduced: boolean }
  | { event: 'oracle_ab_variant';          test_name: string; variant: string }
  | { event: 'oracle_seeker_reflection';   prompt_id: string; char_count: number }
  | { event: 'oracle_portrait_generated';  session_id: string; turn_number: number }
  | { event: 'oracle_claim_initiated';     session_id: string }
  | { event: 'oracle_claim_error';         session_id: string; error: string };

const SUPABASE_URL     = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const IS_PROD          = import.meta.env.PROD === true;

let _sessionId: string | null = null;
export const setAnalyticsSession = (sid: string) => { _sessionId = sid; };

export const trackOracleEvent = (event: OracleAnalyticsEvent) => {
  console.log(`[SIGNAL:TELEMETRY] ${event.event.toUpperCase()}`, event);
  window.dispatchEvent(new CustomEvent('oracle:telemetry', { detail: event }));

  if (IS_PROD && SUPABASE_URL) {
    const sessionId = _sessionId ?? ('session_id' in event ? (event as Record<string,string>).session_id : undefined);
    fetch(`${SUPABASE_URL}/functions/v1/log-event`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event:      event.event,
        session_id: sessionId ?? null,
        data:       event,
        ts:         Date.now(),
        env:        'prod',
      }),
    }).catch((err) => console.warn('[analytics] log-event POST failed:', err));
  }
};
