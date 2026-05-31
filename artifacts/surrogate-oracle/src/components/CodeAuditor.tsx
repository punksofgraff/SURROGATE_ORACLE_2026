/**
 * CodeAuditor — enterprise-grade handshake & execution auditor
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

  // Dev relay — streams every logStep to .oracle-dev-log.jsonl on the server
  // so external observers (Claude Code) can tail the live session.
  if (import.meta.env.DEV) {
    fetch('/api/oracle-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, status }),
    }).catch(() => {});
  }
}

export function CodeAuditor() {
  // Opt-in only — never auto-enables in DEV builds.
  // To open: add ?devui to the URL, or localStorage.setItem('oracle_step_log','1') + reload.
  const enabled = DEBUG_ENABLED;
  const [steps, setSteps] = useState<OracleStep[]>(() => {
    if (!enabled) return [];
    try {
      const saved = localStorage.getItem('oracle_steps_sticky');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [minimized, setMinimized] = useState(() => {
    return localStorage.getItem('oracle_step_minimized') === '1';
  });
  const startRef = useRef<number | null>(null);
  const prevRef  = useRef<number | null>(null);
  const counterRef = useRef(steps.length > 0 ? Math.max(...steps.map(s => s.id)) + 1 : 0);
  const listRef  = useRef<HTMLDivElement | null>(null);

  // Sync minimized state
  useEffect(() => {
    localStorage.setItem('oracle_step_minimized', minimized ? '1' : '0');
  }, [minimized]);

  // Sync steps to localStorage for "stickiness"
  useEffect(() => {
    if (!enabled) return;
    localStorage.setItem('oracle_steps_sticky', JSON.stringify(steps));
  }, [steps, enabled]);

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: Event) => {
      const { label, status = 'ok' } = (e as CustomEvent).detail as { label: string; status: StepStatus };
      const now = Date.now();
      
      // If we have existing steps, we should probably try to maintain a continuous timeline
      // but for a fresh session after reload, resetting the startRef is cleaner.
      if (startRef.current === null) {
        if (steps.length > 0) {
          // Continue from last step's wall time if it was recent, else reset
          const lastStep = steps[steps.length - 1];
          if (now - lastStep.wall < 30000) {
             startRef.current = lastStep.wall - lastStep.ts;
             prevRef.current = lastStep.wall;
          } else {
             startRef.current = now;
          }
        } else {
          startRef.current = now;
        }
      }

      const ts    = now - startRef.current!;
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

      setSteps(prev => [...prev.slice(-59), step]); // keep last 60 for sticky mode
    };

    window.addEventListener('oracle:step', handler);
    return () => window.removeEventListener('oracle:step', handler);
  }, [enabled, steps.length]);

  const copyLogs = () => {
    const text = steps.map(s => `[${ICON[s.status]}] T+${(s.ts/1000).toFixed(2)}s (+${s.delta}ms) ${s.label}`).join('\n');
    navigator.clipboard.writeText(text);
    logStep('LOGS COPIED TO CLIPBOARD', 'ok');
  };

  if (!enabled) return null;

  return (
    <div style={{
      position:     'fixed',
      bottom:       12,
      right:        12,
      width:        minimized ? 140 : 340,
      maxHeight:    minimized ? 32  : 460,
      background:   'rgba(0,4,12,0.94)',
      border:       '1px solid rgba(0,255,136,0.35)',
      borderRadius: 6,
      fontFamily:   'monospace',
      fontSize:     11,
      zIndex:       99999,
      overflow:     'hidden',
      backdropFilter: 'blur(8px)',
      transition:   'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      userSelect:   'none',
      boxShadow:    '0 8px 32px rgba(0,0,0,0.8)',
    }}>
      {/* Header */}
      <div
        style={{
          padding:        '4px 8px',
          background:     'rgba(0,255,136,0.08)',
          borderBottom:   minimized ? 'none' : '1px solid rgba(0,255,136,0.15)',
          color:          '#00ff88',
          display:        'flex',
          justifyContent: 'space-between',
          alignItems:     'center',
        }}
      >
        <span onClick={() => setMinimized(m => !m)} style={{ cursor: 'pointer', flex: 1 }}>
          ⬡ CODE AUDITOR ({steps.length})
        </span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {!minimized && (
            <button 
              onClick={copyLogs}
              style={{ 
                background: 'none', border: 'none', color: '#00ff88', 
                fontSize: 9, cursor: 'pointer', padding: '2px 4px',
                opacity: 0.6,
              }}
              title="Copy Logs"
            >
              COPY
            </button>
          )}
          <span 
            onClick={() => setMinimized(m => !m)} 
            style={{ opacity: 0.6, cursor: 'pointer', padding: '0 4px' }}
          >
            {minimized ? '▲' : '▼'}
          </span>
        </div>
      </div>

      {!minimized && (
        <>
          {/* Steps list */}
          <div ref={listRef} style={{ maxHeight: 380, overflowY: 'auto', padding: '4px 0', scrollBehavior: 'smooth' }}>
            {steps.length === 0 && (
              <div style={{ padding: '12px 10px', color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
                waiting for signal…
              </div>
            )}
            {steps.map((s, i) => (
              <div key={s.id} style={{
                padding:         '3px 8px',
                display:         'grid',
                gridTemplateColumns: '14px 1fr 58px',
                gap:             6,
                borderLeft:      i === steps.length - 1 ? `2px solid ${COLOR[s.status]}` : '2px solid transparent',
                background:      i === steps.length - 1 ? 'rgba(0,255,136,0.06)' : 'transparent',
                borderBottom:    '1px solid rgba(255,255,255,0.03)',
              }}>
                <span style={{ color: COLOR[s.status], fontWeight: 'bold' }}>{ICON[s.status]}</span>
                <span style={{ color: '#e0e8ff', lineHeight: '16px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.label}
                </span>
                <span style={{ color: 'rgba(0,255,136,0.4)', textAlign: 'right', fontSize: 9, lineHeight: '16px' }}>
                  {s.delta > 0 ? `+${s.delta}ms` : `t=0`}
                </span>
              </div>
            ))}
          </div>

          {/* Footer — reset */}
          <div
            onClick={() => {
              setSteps([]);
              localStorage.removeItem('oracle_steps_sticky');
              startRef.current = null;
              prevRef.current  = null;
              counterRef.current = 0;
            }}
            style={{
              padding:      '4px 8px',
              borderTop:    '1px solid rgba(0,255,136,0.1)',
              color:        'rgba(0,255,136,0.4)',
              cursor:       'pointer',
              textAlign:    'center',
              fontSize:     9,
              letterSpacing: '0.1em',
            }}
          >
            CLEAR AUDIT TRAIL
          </div>
        </>
      )}
    </div>
  );
}
