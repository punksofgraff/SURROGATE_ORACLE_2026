/**
 * SURROGATE: ORACLE — Telemetry & Signal Tracking
 *
 * This service tracks the Seeker's journey without breaking immersion.
 * Every event is a cultural frequency, not a product metric.
 */

export type OracleAnalyticsEvent =
  | { event: 'oracle_phase_entered';       phase: string; is_returning: boolean; session_id: string }
  | { event: 'oracle_ghost_text_shown';    phrase_id: string; duration_ms: number }
  | { event: 'oracle_terminal_slide';      slide_number: number; cumulative_ms: number }
  | { event: 'oracle_terminal_skipped';    at_slide: number; ms_elapsed: number }
  | { event: 'oracle_terminal_completed';  total_ms: number }
  | { event: 'oracle_knife_selected';     territory: string; card_index: number; color: string }
  | { event: 'oracle_audio_start';        turn_number: number; chunk_count: number }
  | { event: 'oracle_turn_completed';     turn_number: number; duration_ms: number }
  | { event: 'oracle_barge_in';           turn_number: number; oracle_speaking_ms: number }
  | { event: 'oracle_exit';               phase_at_exit: string; turns: number; total_ms: number }
  | { event: 'oracle_error';              type: string; phase: string; recoverable: boolean }
  | { event: 'oracle_performance_guard';  avg_fps: number; degraded: boolean; counts_reduced: boolean }
  | { event: 'oracle_ab_variant';         test_name: string; variant: string }
  | { event: 'oracle_seeker_reflection';  prompt_id: string; char_count: number };

export const trackOracleEvent = (event: OracleAnalyticsEvent) => {
  // In a real production environment, this would post to Posthog, Segment, or Amplitude.
  // For the ritual, we log to the console with a specific signature for the Code Auditor.
  console.log(`[SIGNAL:TELEMETRY] ${event.event.toUpperCase()}`, event);
  
  // Also dispatch as a window event for any internal listeners (like the Auditor)
  window.dispatchEvent(new CustomEvent('oracle:telemetry', { detail: event }));
};
