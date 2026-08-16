/**
 * TraceViewer — dev-only panel for browsing persisted Oracle session traces.
 *
 * Rendering is gated by the same explicit opt-in as CodeAuditor (?devui or
 * localStorage.oracle_step_log = '1') — but that is only a UI affordance.
 * Authorization is the shared dev token in localStorage.oracle_trace_token,
 * verified server-side by the `oracle-trace` Edge Function on every request.
 * Without the token the panel shows how to enable tracing and can read nothing:
 * the trace table has no client-accessible policies or grants.
 *
 * Lists recent sessions and shows the full chronological trace of a selected
 * session: transcript turns, lifecycle steps, telemetry, score blocks, errors —
 * each with wall-clock timestamps and deltas.
 */

import { useEffect, useState } from 'react';
import { getTraceToken } from '../lib/sessionTrace';

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;

const DEBUG_ENABLED =
  new URLSearchParams(window.location.search).has('devui') ||
  localStorage.getItem('oracle_step_log') === '1';

type SessionSummary = {
  session_id: string;
  event_count: number;
  first_event: string;
  last_event: string;
  turn_count: number;
  error_count: number;
};

type TraceRow = {
  seq: number;
  event_type: string;
  payload: Record<string, unknown>;
  client_ts: number | null;
  created_at: string;
};

const fnUrl = () => {
  const base = SUPA_URL!.startsWith('http') ? SUPA_URL! : `https://${SUPA_URL}`;
  return `${base}/functions/v1/oracle-trace`;
};

async function traceApi<T>(body: Record<string, unknown>): Promise<T> {
  const token = getTraceToken();
  if (!token) throw new Error('no dev token');
  const res = await fetch(fnUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-trace-token': token },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(res.status === 401 ? 'invalid dev token' : `HTTP ${res.status}`);
  return res.json();
}

function eventColor(row: TraceRow): string {
  if (row.event_type === 'turn') {
    return (row.payload.role === 'oracle') ? '#c9a7ff' : '#7fd4ff';
  }
  if (row.event_type === 'step') {
    const s = row.payload.status;
    return s === 'err' ? '#ff3355' : s === 'warn' ? '#ffcc00' : '#00ff88';
  }
  if (row.event_type === 'oracle_barge_in') return '#ff9944';
  if (row.event_type === 'oracle_error') return '#ff3355';
  return '#8899bb';
}

function eventLabel(row: TraceRow): string {
  if (row.event_type === 'turn') {
    const score = row.payload.score as { sessionPhase?: string; alignment?: string } | undefined;
    const scoreTag = score ? `  ⟨${score.sessionPhase ?? '?'}/${score.alignment ?? '?'}⟩` : '';
    return `${String(row.payload.role).toUpperCase()}: ${String(row.payload.content ?? '')}${scoreTag}`;
  }
  if (row.event_type === 'step') {
    return `${String(row.payload.label)}`;
  }
  const { event: _e, ...rest } = row.payload as Record<string, unknown>;
  const detail = Object.entries(rest)
    .filter(([k]) => k !== 'session_id')
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' ');
  return `${row.event_type}${detail ? '  ' + detail : ''}`;
}

function fmtTime(ms: number | null, iso: string): string {
  const d = ms ? new Date(ms) : new Date(iso);
  return d.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

export function TraceViewer() {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [trace, setTrace] = useState<TraceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasToken = !!getTraceToken();
  const enabled = DEBUG_ENABLED && !!SUPA_URL;

  useEffect(() => {
    if (!open || !enabled || !hasToken) return;
    setLoading(true);
    setError(null);
    traceApi<SessionSummary[]>({ action: 'sessions', limit: 25 })
      .then(setSessions)
      .catch((e) => setError(`session list failed: ${e.message}`))
      .finally(() => setLoading(false));
  }, [open, enabled, hasToken]);

  useEffect(() => {
    if (!selected || !enabled || !hasToken) return;
    setLoading(true);
    setError(null);
    traceApi<TraceRow[]>({ action: 'trace', session_id: selected })
      .then(setTrace)
      .catch((e) => setError(`trace fetch failed: ${e.message}`))
      .finally(() => setLoading(false));
  }, [selected, enabled, hasToken]);

  if (!enabled) return null;

  const panelStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: 12,
    left: 12,
    width: open ? 560 : 150,
    maxHeight: open ? 520 : 32,
    background: 'rgba(4,0,12,0.95)',
    border: '1px solid rgba(201,167,255,0.35)',
    borderRadius: 6,
    fontFamily: 'monospace',
    fontSize: 11,
    zIndex: 99998,
    overflow: 'hidden',
    backdropFilter: 'blur(8px)',
    transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
    userSelect: 'text',
    boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
    display: 'flex',
    flexDirection: 'column',
  };

  return (
    <div style={panelStyle} data-testid="trace-viewer">
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          padding: '4px 8px',
          background: 'rgba(201,167,255,0.08)',
          borderBottom: open ? '1px solid rgba(201,167,255,0.15)' : 'none',
          color: '#c9a7ff',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <span>⬢ SESSION TRACES</span>
        <span style={{ opacity: 0.6 }}>{open ? '▼' : '▲'}</span>
      </div>

      {open && (
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {!hasToken && (
            <div style={{ padding: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
              Tracing disabled — no dev token.
              <br />
              To enable, set{' '}
              <code style={{ color: '#c9a7ff' }}>localStorage.oracle_trace_token = '&lt;token&gt;'</code>{' '}
              and reload. The token is verified server-side.
            </div>
          )}
          {error && <div style={{ padding: 8, color: '#ff3355' }}>{error}</div>}
          {loading && <div style={{ padding: 8, color: 'rgba(255,255,255,0.4)' }}>loading…</div>}

          {hasToken && !selected && !loading && (
            <div>
              {sessions.length === 0 && !error && (
                <div style={{ padding: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
                  no traced sessions yet
                </div>
              )}
              {sessions.map((s) => (
                <div
                  key={s.session_id}
                  onClick={() => setSelected(s.session_id)}
                  data-testid={`trace-session-${s.session_id}`}
                  style={{
                    padding: '5px 8px',
                    cursor: 'pointer',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    color: '#e0e8ff',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#c9a7ff' }}>{s.session_id.slice(0, 8)}…</span>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>
                      {new Date(s.last_event).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)' }}>
                    {s.event_count} events · {s.turn_count} turns
                    {s.error_count > 0 && <span style={{ color: '#ff3355' }}> · {s.error_count} errors</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {hasToken && selected && !loading && (
            <div>
              <div
                onClick={() => { setSelected(null); setTrace([]); }}
                style={{ padding: '4px 8px', color: '#c9a7ff', cursor: 'pointer', borderBottom: '1px solid rgba(201,167,255,0.15)' }}
              >
                ← back · {selected.slice(0, 13)}… · {trace.length} events
              </div>
              {trace.map((row, i) => {
                const prev = i > 0 ? trace[i - 1] : null;
                const t = row.client_ts ?? new Date(row.created_at).getTime();
                const pt = prev ? (prev.client_ts ?? new Date(prev.created_at).getTime()) : t;
                const delta = t - pt;
                return (
                  <div
                    key={`${row.seq}-${i}`}
                    style={{
                      padding: '2px 8px',
                      display: 'grid',
                      gridTemplateColumns: '86px 1fr 52px',
                      gap: 6,
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      alignItems: 'start',
                    }}
                  >
                    <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, lineHeight: '15px' }}>
                      {fmtTime(row.client_ts, row.created_at)}
                    </span>
                    <span style={{ color: eventColor(row), lineHeight: '15px', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                      {eventLabel(row)}
                    </span>
                    <span style={{ color: 'rgba(201,167,255,0.4)', textAlign: 'right', fontSize: 9, lineHeight: '15px' }}>
                      {delta > 0 ? `+${delta}ms` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
