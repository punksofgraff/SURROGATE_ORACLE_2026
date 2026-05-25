/**
 * OracleStepLogger — dev overlay for watching the sleep→wake handshake
 *
 * Listens to window CustomEvent 'oracle:step':
 *   window.dispatchEvent(new CustomEvent('oracle:step', {
 *     detail: { label: string, status: 'ok' | 'warn' | 'err' | 'pending' }
 *   }))
 *
 * Only renders when localStorage.getItem('oracle_step_log') === '1'
 * Toggle in console: localStorage.setItem('oracle_step_log','1') then reload.
 */

import { useEffect, useRef, useState } from 'react';

export type StepStatus = 'ok' | 'warn' | 'err' | 'pending';

export interface OracleStep {
  id: number;
  label: string;
  status: StepStatus;
  ts: number;       // ms since first step
  wall: number;     // Date.now()
  delta: number;    // ms since previous step
}

const ICON: Record<StepStatus, string> = {
  ok:      '✓',
  warn:    '⚠',
  err:     '✗',
  pending: '…',
};

const COLOR: Record<StepStatus, string> = {
  ok:      '#00ff88',
  warn:    '#ffcc00',
  err:     '#ff3355',
  pending: '#88aaff',
};

// Emit a step from anywhere in the app
const STEP_ICONS: Record<StepStatus, string> = { ok: '✓', warn: '⚠', err: '✗', pending: '…' };

// Detect explicit debug opt-in — evaluated once at module load.
// DEV build alone is NOT enough: the overlay must be explicitly requested
// so it never appears during a real user session, even in local dev.
const DEBUG_ENABLED =
  new URLSearchParams(window.location.search).has('devui') ||
  localStorage.getItem('oracle_step_log') === '1';

export function logStep(label: string, status: StepStatus = 'ok') {
  // Only log to console when debug mode is explicitly on — never expose
  // internal state machine details to a casual DevTools user.
  if (DEBUG_ENABLED) {
    const icon  = STEP_ICONS[status];
    const style = status === 'ok'      ? 'color:#00ff88;font-weight:bold'
                : status === 'warn'    ? 'color:#ffcc00;font-weight:bold'
                : status === 'err'     ? 'color:#ff3355;font-weight:bold'
                :                        'color:#88aaff;font-weight:bold';
    console.log(`%c[ORACLE:STEP] ${icon} ${label}`, style);
  }

  window.dispatchEvent(
    new CustomEvent('oracle:step', { detail: { label, status } })
  );
}

export function OracleStepLogger() {
  // Opt-in only — never auto-enables in DEV builds.
  // To open: add ?devui to the URL, or localStorage.setItem('oracle_step_log','1') + reload.
  const enabled = DEBUG_ENABLED;
  const [steps, setSteps] = useState<OracleStep[]>([]);
  const [minimized, setMinimized] = useState(false);
  const startRef = useRef<number | null>(null);
  const prevRef  = useRef<number | null>(null);
  const counterRef = useRef(0);
  const listRef  = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: Event) => {
      const { label, status = 'ok' } = (e as CustomEvent).detail as { label: string; status: StepStatus };
      const now = Date.now();
      if (startRef.current === null) startRef.current = now;
      const ts    = now - startRef.current;
      const delta = prevRef.current !== null ? now - prevRef.current : 0;
      prevRef.current = now;

      const step: OracleStep = {
        id: counterRef.current++,
        label,
        status,
        ts,
        wall: now,
        delta,
      };

      setSteps(prev => [...prev.slice(-40), step]); // keep last 40
    };

    window.addEventListener('oracle:step', handler);
    return () => window.removeEventListener('oracle:step', handler);
  }, [enabled]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [steps]);

  if (!enabled) return null;

  return (
    <div style={{
      position:     'fixed',
      bottom:       12,
      right:        12,
      width:        minimized ? 120 : 320,
      maxHeight:    minimized ? 32  : 420,
      background:   'rgba(0,4,12,0.92)',
      border:       '1px solid rgba(0,255,136,0.35)',
      borderRadius: 6,
      fontFamily:   'monospace',
      fontSize:     11,
      zIndex:       99999,
      overflow:     'hidden',
      backdropFilter: 'blur(4px)',
      transition:   'all 0.2s ease',
      userSelect:   'none',
    }}>
      {/* Header */}
      <div
        onClick={() => setMinimized(m => !m)}
        style={{
          padding:        '4px 8px',
          background:     'rgba(0,255,136,0.08)',
          borderBottom:   minimized ? 'none' : '1px solid rgba(0,255,136,0.15)',
          color:          '#00ff88',
          cursor:         'pointer',
          display:        'flex',
          justifyContent: 'space-between',
          alignItems:     'center',
        }}
      >
        <span>⬡ STEP LOG ({steps.length})</span>
        <span style={{ opacity: 0.6 }}>{minimized ? '▲' : '▼'}</span>
      </div>

      {!minimized && (
        <>
          {/* Steps list */}
          <div ref={listRef} style={{ maxHeight: 360, overflowY: 'auto', padding: '4px 0' }}>
            {steps.length === 0 && (
              <div style={{ padding: '8px 10px', color: 'rgba(255,255,255,0.3)' }}>
                waiting for steps…
              </div>
            )}
            {steps.map((s, i) => (
              <div key={s.id} style={{
                padding:         '2px 8px',
                display:         'grid',
                gridTemplateColumns: '14px 1fr 52px',
                gap:             4,
                borderLeft:      i === steps.length - 1 ? `2px solid ${COLOR[s.status]}` : '2px solid transparent',
                background:      i === steps.length - 1 ? 'rgba(0,255,136,0.04)' : 'transparent',
              }}>
                <span style={{ color: COLOR[s.status] }}>{ICON[s.status]}</span>
                <span style={{ color: '#e0e8ff', lineHeight: '16px' }}>{s.label}</span>
                <span style={{ color: 'rgba(255,255,255,0.35)', textAlign: 'right', lineHeight: '16px' }}>
                  {s.delta > 0 ? `+${s.delta}ms` : `t=0`}
                </span>
              </div>
            ))}
          </div>

          {/* Footer — reset */}
          <div
            onClick={() => {
              setSteps([]);
              startRef.current = null;
              prevRef.current  = null;
              counterRef.current = 0;
            }}
            style={{
              padding:      '3px 8px',
              borderTop:    '1px solid rgba(0,255,136,0.1)',
              color:        'rgba(0,255,136,0.4)',
              cursor:       'pointer',
              textAlign:    'center',
            }}
          >
            RESET
          </div>
        </>
      )}
    </div>
  );
}
