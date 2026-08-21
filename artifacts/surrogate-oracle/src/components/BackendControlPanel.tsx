/**
 * BackendControlPanel — ENCULTURATE CRATE
 * Domino-card scroll layout. Exact knife/tour-card DNA.
 * One concept per card. Vertical scroll. No swipe fighting scroll.
 */
import './BackendControlPanel.css';
import { useState, useEffect, useRef, RefObject, useCallback } from 'react';
import { X, Wallet, Radio, Image, Cpu, Database, Layers, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { CultureCoinDisplay } from './CultureCoinDisplay';
import { InlineSubscriptionModal } from './InlineSubscriptionModal';
import { PortraitGalleryDashboard } from './PortraitGalleryDashboard';
import { Learn2EarnInterface } from './Learn2EarnInterface';
import { supabase, supabaseEdgeFunctionHeaders } from '../lib/supabase';
import { useChainFuelz } from '../hooks/useChainFuelz';
import { checkDevUnlock } from '../lib/devAccess';
import type { OracleConversationHandle } from './OracleConversation';

// ── Frequencies ────────────────────────────────────────────────────────────────
type Frequency = 'RESONANCE' | 'SQUAD' | 'PRINTS' | 'CORE_DIAG' | 'SALVAGE' | 'MANIFEST';

const FREQUENCIES: {
  id: Frequency; label: string; mhz: string;
  Icon: React.ComponentType<{ size?: number }>;
  accent: 'green' | 'cyan' | 'purple';
}[] = [
  { id: 'RESONANCE', label: 'VAULT',   mhz: '108.4', Icon: Wallet,   accent: 'green'  },
  { id: 'SQUAD',     label: 'SQUAD',   mhz: '112.8', Icon: Radio,    accent: 'green'  },
  { id: 'PRINTS',    label: 'PRINTS',  mhz: '124.2', Icon: Image,    accent: 'green'  },
  { id: 'CORE_DIAG', label: 'DIAG',    mhz: '142.0', Icon: Cpu,      accent: 'cyan'   },
  { id: 'SALVAGE',   label: 'SALVAGE', mhz: '158.6', Icon: Database, accent: 'purple' },
  { id: 'MANIFEST',  label: 'SIGNAL',  mhz: '188.4', Icon: Layers,   accent: 'cyan'   },
];

const ACCENT: Record<string, string> = { green: '#00ff88', cyan: '#00ffcc', purple: '#b026ff' };

// ── Oscilloscope ───────────────────────────────────────────────────────────────
// Bar heights and animation durations are deterministic (index + sine distribution)
// so they don't reset on every parent re-render. Height envelope is driven by live rms.
function Oscilloscope({ rms }: { rms: number }) {
  const NUM_BARS = 24;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 44 }}>
      {Array.from({ length: NUM_BARS }).map((_, i) => {
        // Deterministic envelope — each bar has a fixed shape in the frequency spectrum
        const envelope = 0.28 + 0.72 * Math.abs(Math.sin(i * 0.72 + 0.5));
        // When rms is present, bars reflect signal level; when idle, show gentle ambient motion
        const peak = rms > 0.004 ? Math.max(4, rms * 110 * envelope) : 3 + envelope * 5;
        // Duration varies by index only — no random, no reshuffle on re-render
        const dur = 0.055 + (i % 6) * 0.028;
        return (
          <motion.div key={i}
            animate={{ height: [peak * 0.55, peak, peak * 0.72, peak * 0.88] }}
            transition={{ repeat: Infinity, duration: dur, ease: 'easeInOut', repeatType: 'mirror' }}
            style={{ width: 4, borderRadius: 2, background: i % 3 === 0 ? '#00ff88' : '#00ffcc', opacity: 0.38 + (i / NUM_BARS) * 0.62 }}
          />
        );
      })}
    </div>
  );
}

// ── ProdLogViewer ──────────────────────────────────────────────────────────────
type ProdLogRow = { id: number; ts: string; session_id: string | null; event: string; data: Record<string, unknown>; env: string };

function ProdLogViewer() {
  const [logs, setLogs]         = useState<ProdLogRow[]>([]);
  const [loading, setLoading]   = useState(false);
  const [filter, setFilter]     = useState('');
  const [autoRefresh, setAuto]  = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const timerRef                = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('oracle_prod_logs')
      .select('id,ts,session_id,event,data,env')
      .order('ts', { ascending: false })
      .limit(120);
    if (!error && data) setLogs(data as ProdLogRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  useEffect(() => {
    if (autoRefresh) timerRef.current = setInterval(fetchLogs, 4000);
    else if (timerRef.current) clearInterval(timerRef.current);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoRefresh, fetchLogs]);

  const filtered = filter
    ? logs.filter(l => l.event.includes(filter) || l.session_id?.includes(filter) || JSON.stringify(l.data).includes(filter))
    : logs;

  const levelColor = (ev: string) => {
    if (ev.includes('error'))                       return '#ff4466';
    if (ev.includes('exit') || ev.includes('barge')) return '#b026ff';
    if (ev.includes('portrait') || ev.includes('claim')) return '#00ffcc';
    return '#00ff88';
  };
  const fmtTime = (ts: string) => {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10 }}>
        <input className="ec-filter" value={filter} onChange={e => setFilter(e.target.value)} placeholder="FILTER_SIGNAL..." style={{ flex: 1 }} />
        <motion.button
          onClick={fetchLogs}
          whileTap={{ rotate: 180, scale: 0.88 }}
          style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.25)', borderRadius: '3px 10px 3px 10px', color: '#00ff88', cursor: 'pointer', padding: '0 18px', minHeight: 52 }}
        >
          <RefreshCw size={18} />
        </motion.button>
        <motion.button
          onClick={() => setAuto(a => !a)}
          whileTap={{ scale: 0.96 }}
          style={{ background: autoRefresh ? 'rgba(0,255,136,0.1)' : 'rgba(0,0,0,0.4)', border: `1px solid ${autoRefresh ? 'rgba(0,255,136,0.4)' : 'rgba(255,255,255,0.08)'}`, borderRadius: '3px 10px 3px 10px', color: autoRefresh ? '#00ff88' : 'rgba(255,255,255,0.2)', fontFamily: "'PhillySans', monospace", fontSize: '0.82rem', letterSpacing: '0.12em', fontWeight: 800, cursor: 'pointer', padding: '0 16px', minHeight: 52, whiteSpace: 'nowrap' }}
        >
          {autoRefresh ? '● LIVE' : '○ PAUSE'}
        </motion.button>
      </div>

      {/* Count */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
        <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '1.8rem', color: '#00ffcc', fontWeight: 700 }}>{filtered.length}</span>
        <span style={{ fontFamily: "'PhillySans', monospace", fontSize: '0.84rem', color: 'rgba(255,255,255,0.28)', letterSpacing: '0.14em', fontWeight: 700 }}>EVENTS</span>
        {filter && <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '0.84rem', color: 'rgba(255,255,255,0.18)' }}>/ {logs.length} total</span>}
      </div>

      {/* Log list */}
      <div className="ec-log-list">
        {filtered.length === 0 ? (
          <div className="ec-await">{loading ? 'SCANNING...' : '— NO_SIGNAL —'}</div>
        ) : filtered.map(row => (
          <div key={row.id}>
            <motion.div className="ec-log-row" onClick={() => setExpanded(expanded === row.id ? null : row.id)}>
              <span className="ec-log__time">{fmtTime(row.ts)}</span>
              <div style={{ width: 4, height: 20, background: levelColor(row.event), flexShrink: 0, borderRadius: 2, boxShadow: `0 0 8px ${levelColor(row.event)}` }} />
              <span className="ec-log__event" style={{ color: levelColor(row.event) }}>
                {row.event.replace('oracle_', '').toUpperCase()}
              </span>
              {row.session_id && <span className="ec-log__sid">{row.session_id.slice(-8)}</span>}
            </motion.div>
            <AnimatePresence>
              {expanded === row.id && (
                <motion.pre
                  initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  style={{ margin: 0, padding: '14px 18px', background: 'rgba(0,0,0,0.55)', borderBottom: '1px solid rgba(0,255,136,0.06)', fontFamily: "'Share Tech Mono', monospace", fontSize: '0.8rem', color: 'rgba(0,255,204,0.8)', lineHeight: 1.9, whiteSpace: 'pre-wrap', wordBreak: 'break-all', overflow: 'hidden' }}
                >{JSON.stringify(row.data, null, 2)}</motion.pre>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ManifestPanel ──────────────────────────────────────────────────────────────
function ManifestPanel({ pendingCoins }: { pendingCoins: number }) {
  const [alignment, setAlignment]   = useState<string | null>(null);
  const [archetype, setArchetype]   = useState<string | null>(null);
  const [totemLevel, setTotemLevel] = useState(0);
  const [sessionPhase, setPhase]    = useState<string | null>(null);
  const [emotionalWeight, setEmo]   = useState<string | null>(null);
  const [coins, setCoins]           = useState(pendingCoins);
  useEffect(() => { setCoins(pendingCoins); }, [pendingCoins]);
  useEffect(() => {
    const onScore    = (e: Event) => { const d = (e as CustomEvent).detail || {}; if (d.sessionPhase) setPhase(d.sessionPhase); if (typeof d.totemLevel === 'number') setTotemLevel(d.totemLevel); if (d.archetypeTitle) setArchetype(d.archetypeTitle); if (d.emotionalWeight) setEmo(d.emotionalWeight); };
    const onAlign    = (e: Event) => { const d = (e as CustomEvent).detail || {}; if (d.alignment) setAlignment(d.alignment); };
    const onArtifact = (e: Event) => { const d = (e as CustomEvent).detail || {}; if (d.archetypeTitle) setArchetype(d.archetypeTitle); };
    const onTotem    = (e: Event) => { const d = (e as CustomEvent).detail || {}; if (typeof d.totemLevel === 'number') setTotemLevel(d.totemLevel); };
    window.addEventListener('oracle:score',        onScore);
    window.addEventListener('oracle:alignment',    onAlign);
    window.addEventListener('oracle:artifact',     onArtifact);
    window.addEventListener('oracle:totem:ascend', onTotem);
    return () => {
      window.removeEventListener('oracle:score',        onScore);
      window.removeEventListener('oracle:alignment',    onAlign);
      window.removeEventListener('oracle:artifact',     onArtifact);
      window.removeEventListener('oracle:totem:ascend', onTotem);
    };
  }, []);

  const alignColor = alignment === 'sacred' ? '#00ff88' : alignment === 'profane' ? '#b026ff' : '#00ffcc';
  const hasData    = alignment || archetype || totemLevel > 0 || sessionPhase;
  const phases     = ['claim', 'evidence', 'cost', 'mirror'] as const;
  const phaseMap: Record<string, string> = { claim: 'CLAIM', evidence: 'EVIDENCE', cost: 'COST', mirror: 'MIRROR' };

  return (
    <>
      {/* Card 1 — session manifest */}
      <div className="ec-card ec-card--cyan">
        <div className="ec-territory ec-territory--cyan">SESSION<br />MANIFEST</div>
        <div className="ec-sub" style={{ color: '#00ffcc' }}>REAL-TIME SIGNAL ARTIFACTS</div>
        <div className="ec-divider" />
        {!hasData ? (
          <div className="ec-await">AWAITING_ORACLE_SESSION</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {alignment      && <div className="ec-row"><span className="ec-row__label">ALIGNMENT</span><span className="ec-row__value" style={{ color: alignColor }}>{alignment.toUpperCase()}</span></div>}
            {archetype      && <div className="ec-row"><span className="ec-row__label">ARCHETYPE</span><span className="ec-row__value" style={{ color: '#00ff88' }}>{archetype.toUpperCase()}</span></div>}
            {totemLevel > 0 && <div className="ec-row"><span className="ec-row__label">TOTEM</span><span className="ec-row__value">{Array(totemLevel).fill('◈').join(' ')}</span></div>}
            {sessionPhase   && <div className="ec-row"><span className="ec-row__label">PHASE</span><span className="ec-row__value">{(phaseMap[sessionPhase] ?? sessionPhase).toUpperCase()}</span></div>}
            {emotionalWeight && <div className="ec-row"><span className="ec-row__label">AFFECT</span><span className="ec-row__value" style={{ color: 'rgba(255,255,255,0.55)' }}>{emotionalWeight.toUpperCase()}</span></div>}
            {coins > 0      && <div className="ec-row"><span className="ec-row__label">COINS</span><span className="ec-row__value" style={{ color: '#00ff88' }}>{`+${coins}c`}</span></div>}
          </div>
        )}
      </div>

      {/* Card 2 — ritual progression (only when phase exists) */}
      {sessionPhase && (
        <div className="ec-card ec-card--cyan">
          <div className="ec-territory ec-territory--cyan">RITUAL</div>
          <div className="ec-sub" style={{ color: '#00ffcc' }}>PROGRESSION TRACK</div>
          <div className="ec-divider" />
          <div style={{ display: 'flex', gap: 8 }}>
            {phases.map(phase => {
              const cur      = phases.indexOf(sessionPhase as typeof phases[number]);
              const idx      = phases.indexOf(phase);
              const isActive = phase === sessionPhase;
              const isPast   = idx < cur;
              const c = isActive ? '#00ffcc' : isPast ? '#00ff88' : 'transparent';
              return (
                <div key={phase} className="ec-phase-pill" style={{ background: isActive ? 'rgba(0,255,204,0.1)' : isPast ? 'rgba(0,255,136,0.05)' : 'rgba(0,0,0,0.2)', border: `1px solid ${isActive ? 'rgba(0,255,204,0.3)' : isPast ? 'rgba(0,255,136,0.14)' : 'rgba(255,255,255,0.04)'}`, borderBottom: `3px solid ${c}` }}>
                  <span className="ec-phase-pill__label" style={{ color: isActive ? '#00ffcc' : isPast ? 'rgba(0,255,136,0.5)' : 'rgba(255,255,255,0.12)' }}>{phaseMap[phase]}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────────
interface BackendControlPanelProps {
  userId?: string;
  sessionId?: string;
  isVisible?: boolean;
  initialTab?: string;
  onClose?: () => void;
  isAuthenticated?: boolean;
  userEmail?: string;
  pendingCoins?: number;
  oracleConversationRef?: RefObject<OracleConversationHandle | null>;
}

// ── Main ───────────────────────────────────────────────────────────────────────
export const BackendControlPanel = ({
  userId, sessionId, isVisible = true, initialTab = 'vault',
  onClose, userEmail, pendingCoins = 0, oracleConversationRef,
}: BackendControlPanelProps) => {
  const [activeIdx, setActiveIdx]     = useState<number>(() => {
    const saved = localStorage.getItem('oracle_crate_active_freq') as Frequency | null;
    return Math.max(0, FREQUENCIES.findIndex(f => f.id === saved));
  });
  const [prevIdx, setPrevIdx]         = useState(0);
  const [debugPassed, setDebugPassed] = useState(false);
  const [debugPw, setDebugPw]         = useState('');
  const [testResults, setTestResults] = useState<Record<string, unknown>>({});
  const [isLoading, setIsLoading]     = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [geminiInfo, setGeminiInfo]   = useState<ReturnType<OracleConversationHandle['getWsDebugInfo']> | null>(null);
  const pollRef                       = useRef<ReturnType<typeof setInterval> | null>(null);
  const dragStartRef                  = useRef<{ x: number; y: number } | null>(null);
  const supabaseUrl                   = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const chainFuelz                    = useChainFuelz(userEmail, pendingCoins);

  const goTo = (idx: number) => {
    const clamped = Math.max(0, Math.min(FREQUENCIES.length - 1, idx));
    setPrevIdx(activeIdx);
    setActiveIdx(clamped);
    localStorage.setItem('oracle_crate_active_freq', FREQUENCIES[clamped].id);
  };

  // ── Horizontal swipe to change frequency tab ────────────────────────────
  // Only fires when horizontal movement is dominant (dx > dy × 1.5, dx > 60px).
  // Vertical scrolling inside ec-page is unaffected.
  const handlePagePointerDown = useCallback((e: React.PointerEvent) => {
    dragStartRef.current = { x: e.clientX, y: e.clientY };
  }, []);
  const handlePagePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    dragStartRef.current = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      goTo(activeIdx + (dx < 0 ? 1 : -1));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx]);
  // Cancel handler — browser cancels pointer events during native vertical scroll on mobile.
  // Without this, dragStartRef stays non-null and the next tap could mis-fire a tab switch.
  const handlePagePointerCancel = useCallback(() => { dragStartRef.current = null; }, []);

  useEffect(() => {
    const m: Record<string, Frequency> = { vault: 'RESONANCE', coins: 'RESONANCE', gemini: 'CORE_DIAG', debug: 'SALVAGE', dev: 'SALVAGE' };
    const target = m[initialTab] ?? 'RESONANCE';
    const idx = FREQUENCIES.findIndex(f => f.id === target);
    if (idx >= 0) setActiveIdx(idx);
  }, [initialTab]);

  useEffect(() => {
    const activeFreq = FREQUENCIES[activeIdx].id;
    if (activeFreq === 'CORE_DIAG') {
      pollRef.current = setInterval(() => {
        if (oracleConversationRef?.current) setGeminiInfo(oracleConversationRef.current.getWsDebugInfo());
      }, 600);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeIdx, oracleConversationRef]);

  const testEdgeFunction = async (fn: string, payload: Record<string, unknown> = {}) => {
    setIsLoading(true);
    try {
      if (!supabaseUrl) throw new Error('Supabase not configured');
      const res  = await fetch(`${supabaseUrl}/functions/v1/${fn}`, { method: 'POST', headers: supabaseEdgeFunctionHeaders, body: JSON.stringify(payload) });
      const data = await res.json();
      setTestResults(p => ({ ...p, [fn]: { success: res.ok, data, status: res.status, timestamp: new Date().toISOString() } }));
    } catch (err: unknown) {
      setTestResults(p => ({ ...p, [fn]: { success: false, error: (err as Error).message, timestamp: new Date().toISOString() } }));
    }
    setIsLoading(false);
  };

  if (!isVisible) return null;

  const activeFreq = FREQUENCIES[activeIdx];
  const accentHex  = ACCENT[activeFreq.accent];
  const slideDir   = activeIdx > prevIdx ? 1 : -1;

  return (
    <>
      <motion.div
        className="ec-overlay"
        initial={{ opacity: 0, scale: 0.97, filter: 'blur(10px)' }}
        animate={{ opacity: 1, scale: 1,    filter: 'blur(0px)'  }}
        exit={   { opacity: 0, scale: 0.97, filter: 'blur(10px)' }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        data-testid="backend-panel"
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="ec-hdr">
          <div>
            <div className="ec-hdr__brand">ENCULTURATE CRATE</div>
            <div className="ec-hdr__meta">{activeFreq.mhz}MHz · {activeFreq.label} · SURROGATE:ORACLE</div>
          </div>
          <div className="ec-hdr__right">
            {sessionId && (
              <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '0.72rem', color: 'rgba(0,255,204,0.25)', letterSpacing: '0.1em' }}>
                SID:{sessionId.slice(-6).toUpperCase()}
              </span>
            )}
            <motion.div
              className="ec-hdr__dot"
              animate={{ scale: [1, 1.5, 1] }}
              transition={{ repeat: Infinity, duration: 1.7 }}
              style={{ background: accentHex, boxShadow: `0 0 14px ${accentHex}` }}
            />
            {onClose && (
              <button className="ec-close" onClick={onClose} aria-label="Close">
                <X size={17} />
              </button>
            )}
          </div>
        </div>

        {/* Freq accent bar */}
        <motion.div
          key={activeFreq.id}
          initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          style={{ height: 2, background: `linear-gradient(90deg, transparent, ${accentHex}, transparent)`, filter: 'blur(1px)', transformOrigin: 'left', flexShrink: 0 }}
        />

        {/* ── Tab nav — sliding pill indicator via framer-motion layoutId ──── */}
        <LayoutGroup id="ec-tab-nav">
          <nav className="ec-nav" role="tablist">
            {FREQUENCIES.map((freq, i) => {
              const isOn = i === activeIdx;
              let cls = 'ec-nav__btn';
              if (isOn) cls += freq.accent === 'purple' ? ' ec-nav__btn--on-purple' : freq.accent === 'cyan' ? ' ec-nav__btn--on-cyan' : ' ec-nav__btn--on';
              const testId = freq.id==='RESONANCE' ? 'tab-vault' : freq.id==='SQUAD' ? 'tab-squad' : freq.id==='PRINTS' ? 'tab-portraits' : freq.id==='CORE_DIAG' ? 'tab-gemini' : freq.id==='SALVAGE' ? 'tab-dev' : 'tab-manifest';
              const pillColor = ACCENT[freq.accent];
              return (
                <button key={freq.id} role="tab" aria-selected={isOn} data-testid={testId} className={cls} onClick={() => goTo(i)}>
                  {/* Sliding pill — framer-motion FLIP-animates it between tab buttons */}
                  {isOn && (
                    <motion.div
                      layoutId="ec-tab-pill"
                      className="ec-nav__pill"
                      style={{ background: `${pillColor}18`, boxShadow: `0 0 16px ${pillColor}22, inset 0 1px 0 ${pillColor}22` }}
                      transition={{ type: 'spring', damping: 30, stiffness: 420, mass: 0.7 }}
                    />
                  )}
                  <span className="ec-nav__icon"><freq.Icon size={20} /></span>
                  <span className="ec-nav__label">{freq.label}</span>
                </button>
              );
            })}
          </nav>
        </LayoutGroup>

        {/* ── Page content — domino card scroll ───────────────────────────── */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeFreq.id}
            className="ec-page"
            initial={{ x: slideDir * 60, opacity: 0, filter: 'blur(6px)' }}
            animate={{ x: 0,             opacity: 1, filter: 'blur(0px)' }}
            exit={{   x: -slideDir * 48, opacity: 0, filter: 'blur(8px)' }}
            transition={{ type: 'spring', damping: 26, stiffness: 260, mass: 0.85 }}
            onPointerDown={handlePagePointerDown}
            onPointerUp={handlePagePointerUp}
            onPointerCancel={handlePagePointerCancel}
          >

            {/* ════════════════════════════════════════════════════════════
                RESONANCE — VAULT
                Card 1: Balance hero
                Card 2: Vault handle/address
                Card 3: Tier status + upgrade
            ════════════════════════════════════════════════════════════ */}
            {activeFreq.id === 'RESONANCE' && (
              userId ? (
                <>
                  {/* Card 1 — balance hero */}
                  <div className="ec-card">
                    <div className="ec-territory">NEURAL<br />RESONANCE</div>
                    <div className="ec-sub" style={{ color: '#00ff88' }}>VAULT FREQUENCY · {activeFreq.mhz}MHz</div>
                    <div className="ec-divider" />
                    {chainFuelz.isInitialized ? (
                      <div className="ec-hero-stat">
                        <span className="ec-hero-stat__label">SIGNAL STRENGTH</span>
                        <span className="ec-hero-stat__value">{chainFuelz.balance}</span>
                      </div>
                    ) : (
                      <div className="ec-await">RECOVERING VAULT FREQUENCY...</div>
                    )}
                  </div>

                  {/* Card 2 — vault handle */}
                  {chainFuelz.isInitialized && (
                    <div className="ec-card">
                      <div className="ec-territory">VAULT<br />SIGNATURE</div>
                      <div className="ec-sub" style={{ color: '#00ff88' }}>YOUR ON-CHAIN HANDLE</div>
                      <div className="ec-divider" />
                      <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 'clamp(0.9rem, 3vw, 1.1rem)', color: 'rgba(255,255,255,0.88)', background: 'rgba(0,255,136,0.05)', padding: '18px 20px', border: '1px solid rgba(0,255,136,0.12)', borderLeft: '4px solid rgba(0,255,136,0.5)', borderRadius: '3px 14px 3px 14px', letterSpacing: '0.04em', wordBreak: 'break-all', lineHeight: 1.6 }}>
                        {chainFuelz.vaultHandle}
                      </div>
                      <div style={{ marginTop: 18 }}>
                        <span className="ec-badge" style={{ borderLeftColor: chainFuelz.isMinting ? '#b026ff' : '#00ff88', color: chainFuelz.isMinting ? '#b026ff' : '#00ff88', background: chainFuelz.isMinting ? 'rgba(176,38,255,0.08)' : 'rgba(0,255,136,0.08)' }}>
                          <span className="ec-badge__dot" style={{ background: chainFuelz.isMinting ? '#b026ff' : '#00ff88', '--pc': chainFuelz.isMinting ? '#b026ff' : '#00ff88' } as React.CSSProperties} />
                          {chainFuelz.isMinting ? 'SYNCING' : 'STABLE'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Card 3 — culture coin display */}
                  <div className="ec-card">
                    <div className="ec-territory">CULTURE<br />COINS</div>
                    <div className="ec-sub" style={{ color: '#00ff88' }}>EARNED FREQUENCY</div>
                    <div className="ec-divider" />
                    <CultureCoinDisplay userId={userId} onLevelUp={(l, t) => console.log(`Level ${l}: ${t}`)} />
                  </div>

                  {/* Card 4 — upgrade */}
                  <div className="ec-card" style={{ background: 'linear-gradient(158deg, rgba(176,38,255,0.08) 0%, rgba(0,0,0,0.03) 48%, rgba(0,255,136,0.06) 100%)' }}>
                    <div className="ec-territory ec-territory--purple">UPGRADE<br />CONSCIOUSNESS</div>
                    <div className="ec-sub" style={{ color: '#b026ff' }}>EXPAND YOUR ACCESS</div>
                    <div className="ec-divider" />
                    <button className="ec-upgrade-btn" onClick={() => setShowUpgrade(true)}>
                      UPGRADE_CONSCIOUSNESS
                    </button>
                  </div>
                </>
              ) : (
                <div className="ec-card">
                  <div className="ec-territory">CONNECT<br />WALLET</div>
                  <div className="ec-sub" style={{ color: '#00ff88' }}>VAULT ACCESS REQUIRED</div>
                  <div className="ec-divider" />
                  <Learn2EarnInterface userId={sessionId || 'anonymous'} navigateToDebug={() => goTo(FREQUENCIES.findIndex(f => f.id === 'SALVAGE'))} />
                </div>
              )
            )}

            {/* ════════════════════════════════════════════════════════════
                SQUAD — network + learn2earn
            ════════════════════════════════════════════════════════════ */}
            {activeFreq.id === 'SQUAD' && (
              <>
                <div className="ec-card">
                  <div className="ec-territory">SQUAD</div>
                  <div className="ec-sub" style={{ color: '#00ff88' }}>NETWORK FREQUENCY · {activeFreq.mhz}MHz</div>
                  <div className="ec-divider" />
                  <Learn2EarnInterface
                    userId={userId || sessionId || 'anonymous'}
                    navigateToDebug={() => goTo(FREQUENCIES.findIndex(f => f.id === 'SALVAGE'))}
                  />
                </div>
              </>
            )}

            {/* ════════════════════════════════════════════════════════════
                PRINTS — portrait archive (full-bleed, no nested wrapper)
            ════════════════════════════════════════════════════════════ */}
            {activeFreq.id === 'PRINTS' && (
              <>
                <div className="ec-card">
                  <div className="ec-territory">PRINTS</div>
                  <div className="ec-sub" style={{ color: '#00ff88' }}>PORTRAIT ARCHIVE · {activeFreq.mhz}MHz</div>
                  <div className="ec-divider" />
                  <PortraitGalleryDashboard
                    userId={userId}
                    userEmail={userEmail}
                    sessionId={sessionId}
                    maxPortraits={20}
                    isBackendCabinetTab
                  />
                </div>
              </>
            )}

            {/* ════════════════════════════════════════════════════════════
                CORE_DIAG — Gemini live diagnostics
                Card 1: Status + badges
                Card 2: Metric 2×2 grid
                Card 3: Signal stream terminal
            ════════════════════════════════════════════════════════════ */}
            {activeFreq.id === 'CORE_DIAG' && (
              <>
                {/* invisible test hook */}
                <div style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}>WEBSOCKET WS STATE VERTEX</div>

                {/* Card 1 — status */}
                <div className="ec-card ec-card--cyan">
                  <div className="ec-territory ec-territory--cyan">GEMINI<br />LIVE</div>
                  <div className="ec-sub" style={{ color: '#00ffcc' }}>CORE DIAGNOSTICS · {activeFreq.mhz}MHz</div>
                  <div className="ec-divider" />

                  {geminiInfo ? (
                    <>
                      <div style={{ marginBottom: 22 }}>
                        <Oscilloscope rms={((geminiInfo as unknown as Record<string, unknown>).lastVadRms as number) ?? 0} />
                      </div>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {[
                          { label: geminiInfo.wsState === 1 ? 'WS_OPEN' : 'WS_DISRUPTED', c: geminiInfo.wsState === 1 ? '#00ff88' : '#ff4466' },
                          { label: 'FREE_TIER', c: '#b026ff' },
                        ].map(({ label, c }) => (
                          <span key={label} className="ec-badge" style={{ borderLeftColor: c, color: c, background: `${c}10` }}>
                            <span className="ec-badge__dot" style={{ background: c, '--pc': c } as React.CSSProperties} />
                            {label}
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="ec-await">WAITING FOR CORE UPLINK...</div>
                  )}
                </div>

                {/* Card 2 — metrics grid */}
                {geminiInfo && (
                  <div className="ec-card ec-card--cyan">
                    <div className="ec-territory ec-territory--cyan">SIGNAL<br />METRICS</div>
                    <div className="ec-sub" style={{ color: '#00ffcc' }}>LIVE COUNTERS</div>
                    <div className="ec-divider" />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      {([
                        ['TURNS',     String(geminiInfo.turnCount)],
                        ['AUDIO IN',  String(geminiInfo.audioChunksReceived)],
                        ['AUDIO OUT', String((geminiInfo as Record<string, unknown>).audioChunksSent ?? '—')],
                        ['VAD RMS',   String(((geminiInfo as unknown as Record<string, unknown>).lastVadRms as number | undefined)?.toFixed(4) ?? '0.0000')],
                      ] as [string, string][]).map(([k, v]) => (
                        <div className="ec-metric" key={k}>
                          <div className="ec-metric__label">{k}</div>
                          <div className="ec-metric__value">{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Card 3 — signal stream */}
                {geminiInfo && (
                  <div className="ec-card ec-card--cyan">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                      <div>
                        <div className="ec-territory ec-territory--cyan">SIGNAL<br />STREAM</div>
                        <div className="ec-sub" style={{ color: '#00ffcc', marginBottom: 0 }}>RECENT MESSAGES</div>
                      </div>
                      <button
                        onClick={() => navigator.clipboard.writeText(geminiInfo.recentMessages.join('\n'))}
                        style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.22)', borderRadius: '3px 10px 3px 10px', color: '#00ff88', fontSize: '0.82rem', cursor: 'pointer', padding: '8px 16px', fontFamily: "'PhillySans', monospace", letterSpacing: '0.1em', fontWeight: 800, flexShrink: 0 }}
                      >
                        COPY
                      </button>
                    </div>
                    <div className="ec-terminal">
                      {geminiInfo.recentMessages.length === 0
                        ? <span style={{ color: 'rgba(255,255,255,0.12)', letterSpacing: '0.18em' }}>— NO_SIGNAL —</span>
                        : geminiInfo.recentMessages.map((l, i) => <div key={i}>{l}</div>)
                      }
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ════════════════════════════════════════════════════════════
                SALVAGE — prod logs + edge fn diagnostics
                Gated behind password.
            ════════════════════════════════════════════════════════════ */}
            {activeFreq.id === 'SALVAGE' && (
              !debugPassed ? (
                /* Gate card */
                <div className="ec-card ec-card--purple">
                  <div className="ec-gate" data-testid="dev-gate-container">
                    <div className="ec-territory ec-territory--purple" style={{ textAlign: 'center', fontSize: 'clamp(2rem, 8vw, 3rem)', filter: 'drop-shadow(0 0 30px rgba(176,38,255,0.5))' }}>
                      ACCESS<br />RESTRICTED
                    </div>
                    <div className="ec-sub" style={{ color: '#b026ff', textAlign: 'center', marginBottom: 0 }}>SALVAGE BAY CLEARANCE REQUIRED</div>
                    <div className="ec-divider" style={{ width: '60%', marginBottom: 0 }} />
                    <input
                      type="password"
                      value={debugPw}
                      onChange={e => setDebugPw(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && checkDevUnlock(debugPw) && setDebugPassed(true)}
                      placeholder="DECRYPTION KEY"
                      data-testid="debug-password-input"
                      className="ec-gate__input"
                    />
                    <motion.button
                      onClick={() => { if (checkDevUnlock(debugPw)) setDebugPassed(true); }}
                      whileHover={{ scale: 1.04, boxShadow: '0 0 44px rgba(176,38,255,0.5)' }}
                      whileTap={{ scale: 0.97 }}
                      data-testid="debug-access-btn"
                      style={{ padding: '18px 40px', background: 'rgba(176,38,255,0.12)', border: '2px solid #b026ff', borderRadius: '4px 18px 4px 18px', color: '#b026ff', cursor: 'pointer', fontFamily: "'adrip1', sans-serif", fontSize: 'clamp(1.2rem, 4vw, 1.6rem)', fontWeight: 900, letterSpacing: '0.12em', boxShadow: '0 0 22px rgba(176,38,255,0.24)' }}
                    >
                      DECRYPT
                    </motion.button>
                  </div>
                </div>
              ) : (
                <>
                  {/* invisible test hook */}
                  <div style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}>SUPABASE CHAINFUELZ EDGE FUNCTION</div>

                  {/* Card 1 — shell active status */}
                  <div className="ec-card">
                    <div className="ec-territory ec-territory--purple">ROOT<br />SHELL</div>
                    <div className="ec-sub" style={{ color: '#b026ff' }}>SALVAGE BAY · {activeFreq.mhz}MHz</div>
                    <div className="ec-divider" />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', background: 'rgba(0,0,0,0.45)', borderLeft: '4px solid #00ff88', borderRadius: '3px 14px 3px 14px' }}>
                      <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.3 }} style={{ width: 10, height: 10, borderRadius: '50%', background: '#00ff88', boxShadow: '0 0 14px #00ff88', flexShrink: 0 }} />
                      <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '1.0rem', color: '#00ff88', letterSpacing: '0.14em', fontWeight: 700 }}>›_ROOT_SHELL_ACTIVE</span>
                    </div>
                  </div>

                  {/* Card 2 — prod log bridge */}
                  <div className="ec-card ec-card--cyan">
                    <div className="ec-territory ec-territory--cyan">PROD LOG<br />BRIDGE</div>
                    <div className="ec-sub" style={{ color: '#00ffcc' }}>LIVE PRODUCTION TELEMETRY</div>
                    <div className="ec-divider" />
                    <ProdLogViewer />
                  </div>

                  {/* Card 3 — edge fn diagnostics */}
                  <div className="ec-card ec-card--purple">
                    <div className="ec-territory ec-territory--purple">SYSTEM<br />RECOVERY</div>
                    <div className="ec-sub" style={{ color: '#b026ff' }}>EDGE FUNCTION DIAGNOSTICS</div>
                    <div className="ec-divider" />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {([
                        ['RUN_ORACLE_HEALTH', 'oracle-conversation'],
                        ['SYNC_COIN_METRICS', 'culture-coin-manager'],
                      ] as [string, string][]).map(([label, fn]) => {
                        const res = testResults[fn] as { success?: boolean; status?: number; timestamp?: string } | undefined;
                        return (
                          <div key={fn}>
                            <motion.button
                              className="ec-fn-btn"
                              onClick={() => testEdgeFunction(fn)}
                              whileHover={{ scale: 1.01 }}
                              whileTap={{ scale: 0.98 }}
                            >
                              <span>{label}</span>
                              {isLoading && (
                                <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}>
                                  <RefreshCw size={16} />
                                </motion.span>
                              )}
                            </motion.button>
                            {res && (
                              <div style={{ marginTop: 8, padding: '12px 16px', background: (res.success ? 'rgba(0,255,136,0.06)' : 'rgba(255,68,102,0.06)'), border: `1px solid ${res.success ? 'rgba(0,255,136,0.18)' : 'rgba(255,68,102,0.18)'}`, borderRadius: '2px 12px 2px 12px', fontFamily: "'Share Tech Mono', monospace", fontSize: '0.84rem', color: res.success ? '#00ff88' : '#ff4466', letterSpacing: '0.08em' }}>
                                {res.success ? '✓ ' : '✗ '}STATUS:{res.status} · {res.timestamp?.slice(11, 19)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )
            )}

            {/* ════════════════════════════════════════════════════════════
                MANIFEST — session signal + ritual progression
            ════════════════════════════════════════════════════════════ */}
            {activeFreq.id === 'MANIFEST' && <ManifestPanel pendingCoins={pendingCoins} />}

          </motion.div>
        </AnimatePresence>

        <div className="ec-safe" />
      </motion.div>

      {showUpgrade && userId && (
        <InlineSubscriptionModal
          isOpen={showUpgrade}
          onClose={() => setShowUpgrade(false)}
          userId={userId}
          context="engage-further"
          onUpgradeSuccess={tier => { console.log('Upgraded:', tier); setShowUpgrade(false); }}
        />
      )}
    </>
  );
};
