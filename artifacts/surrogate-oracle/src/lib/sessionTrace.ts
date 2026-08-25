/**
 * sessionTrace.ts — persistent dev trace of Oracle sessions (opt-in only).
 *
 * Writes typed, timestamped events through the `oracle-trace` Edge Function so
 * a complete session trace (turns + lifecycle + errors) survives page
 * refreshes and is queryable after the fact — unlike console logs (drowned by
 * WebGL noise, lost on refresh) or `conversation_turns` (text only, no events).
 *
 * AUTHORIZATION MODEL — capture is OFF by default for every real seeker:
 *   - The tracer only activates when a developer has pasted the shared dev
 *     token into `localStorage.oracle_trace_token`. No token → traceEvent is
 *     a no-op and nothing is ever uploaded.
 *   - The token is NOT in the app bundle; it lives as the Supabase secret
 *     ORACLE_TRACE_DEV_TOKEN and is verified server-side on every request
 *     (ingest and read). `?devui` is a UI affordance, not authorization.
 *   - The trace table itself has RLS with no client policies — the Edge
 *     Function (service role) is the only path in or out.
 *
 * Sources — reuses existing signal buses instead of duplicating instrumentation:
 *   - `oracle:step` CustomEvents (every logStep call: WS lifecycle, reconnects,
 *     GOAWAY, boot paths, errors — all already emitted app-wide)
 *   - `oracle:telemetry` CustomEvents (trackOracleEvent: barge-in, turn timing,
 *     phase entry, errors)
 *   - explicit `traceEvent()` calls for transcript turns + score blocks
 *
 * Failure policy: absolutely silent. Batched + fire-and-forget so the audio
 * path is never blocked; a logging failure can never break a session.
 */

type TraceRow = {
  session_id: string;
  seq: number;
  event_type: string;
  payload: Record<string, unknown>;
  client_ts: number;
};

/** Stable vocabulary used by the dev tour reviewer. Keep this small and
 * semantic so the viewer does not need to parse presentation labels. */
export type TourCheckpoint =
  | 'card_flush'
  | 'preview_request'
  | 'first_playable_audio'
  | 'first_letter_landing'
  | 'preview_timeout'
  | 'preview_interrupted'
  | 'manual_advance';

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;

const FLUSH_INTERVAL_MS = 2500;
const MAX_BATCH = 25;
const MAX_PAYLOAD_CHARS = 4000;

/** The dev token that both enables capture and authorizes uploads.
 *  Read once at module load; enabling tracing requires a reload (same
 *  contract as the CodeAuditor's oracle_step_log flag). */
export function getTraceToken(): string | null {
  try {
    return localStorage.getItem('oracle_trace_token');
  } catch {
    return null;
  }
}

const TRACE_TOKEN = typeof window !== 'undefined' ? getTraceToken() : null;

export const isTracingEnabled = (): boolean => !!TRACE_TOKEN && !!SUPA_URL;

/** Current trace session id (null until setTraceSession fires). Used by
 *  tracedFetch to stamp the x-oracle-session-id correlation header. */
export const getTraceSessionId = (): string | null => sessionId;

let sessionId: string | null = null;
let seq = 0;
let buffer: TraceRow[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let initialized = false;

// Events fired before the session id is known (early boot steps, intro-phase
// telemetry) are held here and stamped onto the session once it's set.
type PendingEvent = { eventType: string; payload: Record<string, unknown>; ts: number };
let preSession: PendingEvent[] = [];
const MAX_PRE_SESSION = 100;

function endpoint(): string | null {
  if (!SUPA_URL) return null;
  const base = SUPA_URL.startsWith('http') ? SUPA_URL : `https://${SUPA_URL}`;
  return `${base}/functions/v1/oracle-trace`;
}

function flush(useKeepalive = false): void {
  if (buffer.length === 0) return;
  const url = endpoint();
  if (!url || !TRACE_TOKEN) { buffer = []; return; }
  const rows = buffer;
  buffer = [];
  if (flushTimer !== null) { clearTimeout(flushTimer); flushTimer = null; }
  try {
    fetch(url, {
      method: 'POST',
      // keepalive lets the final batch survive tab close/refresh (~64KB cap,
      // far above our batch size). Never throws synchronously.
      keepalive: useKeepalive,
      headers: {
        'Content-Type': 'application/json',
        'x-trace-token': TRACE_TOKEN,
      },
      body: JSON.stringify({ action: 'ingest', rows }),
    }).catch(() => { /* silent — tracing must never surface */ });
  } catch { /* silent */ }
}

function scheduleFlush(): void {
  if (buffer.length >= MAX_BATCH) { flush(); return; }
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => { flushTimer = null; flush(); }, FLUSH_INTERVAL_MS);
}

/** Record one trace event for the current session. No-op (silently) unless
 *  dev tracing is enabled via localStorage.oracle_trace_token. */
export function traceEvent(eventType: string, payload: Record<string, unknown> = {}): void {
  if (!isTracingEnabled()) return;
  try {
    // Cap payload size defensively so a pathological transcript can't bloat rows.
    let safePayload = payload;
    const asStr = JSON.stringify(payload);
    if (asStr.length > MAX_PAYLOAD_CHARS) {
      safePayload = { truncated: true, preview: asStr.slice(0, MAX_PAYLOAD_CHARS) };
    }
    if (!sessionId) {
      if (preSession.length < MAX_PRE_SESSION) {
        preSession.push({ eventType, payload: safePayload, ts: Date.now() });
      }
      return;
    }
    buffer.push({
      session_id: sessionId,
      seq: seq++,
      event_type: eventType,
      payload: safePayload,
      client_ts: Date.now(),
    });
    scheduleFlush();
  } catch { /* silent */ }
}

/** Point the tracer at the active session. Flushes any pending rows for the
 *  previous session first. Also lazily installs the global listeners. */
export function setTraceSession(sid: string | null | undefined): void {
  if (!isTracingEnabled()) return;
  if (!sid || sid === sessionId) return;
  flush();
  sessionId = sid;
  // seq deliberately NOT reset on refresh-resume of the same session id —
  // ordering across page loads is by (client_ts, seq), seq only tie-breaks.
  initSessionTraceListeners();
  traceEvent('trace_start', { page_load: performance.now() < 30_000, url: location.pathname + location.search });
  // Replay anything that fired before the session id was known, preserving
  // original timestamps so the chronology stays truthful.
  const pending = preSession;
  preSession = [];
  for (const p of pending) {
    buffer.push({
      session_id: sessionId!,
      seq: seq++,
      event_type: p.eventType,
      payload: p.payload,
      client_ts: p.ts,
    });
  }
  if (pending.length > 0) scheduleFlush();
}

/** Install global listeners on the existing signal buses (idempotent).
 *  Does nothing unless dev tracing is enabled. */
export function initSessionTraceListeners(): void {
  if (initialized || typeof window === 'undefined' || !isTracingEnabled()) return;
  initialized = true;

  // Tap capture — dynamic import defers the (harmless) module cycle
  // sessionTrace ⇄ tapTrace and keeps the tap code out of the bundle path
  // for real seekers (tracing disabled → this line never runs).
  import('./tapTrace').then(m => m.installTapTrace()).catch(() => { /* silent */ });

  // Every logStep() call app-wide: WS lifecycle, session.created, reconnect
  // attempts, GOAWAY, boot paths, env checks, errors.
  window.addEventListener('oracle:step', (e: Event) => {
    const d = (e as CustomEvent).detail as { label?: string; status?: string } | undefined;
    if (!d?.label) return;
    traceEvent('step', { label: d.label, status: d.status ?? 'ok' });
  });

  // Every trackOracleEvent() call: barge-in, turn timing, phase entry,
  // portrait generation, errors.
  window.addEventListener('oracle:telemetry', (e: Event) => {
    const d = (e as CustomEvent).detail as { event?: string } | undefined;
    if (!d?.event) return;
    traceEvent(d.event, d as Record<string, unknown>);
  });

  // Flush the tail of the trace when the tab hides or unloads.
  const finalFlush = () => flush(true);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') finalFlush();
  });
  window.addEventListener('pagehide', finalFlush);
}
