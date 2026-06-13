/**
 * BackendControlPanel — ENCULTURATE CRATE
 * Full-screen overlay · knife-card borders · floating nav · unbroken alley
 */
import './BackendControlPanel.css';
import { useState, useEffect, useRef, RefObject, useCallback } from 'react';
import { X, Wallet, Radio, Image, Cpu, Database, Layers, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { CultureCoinDisplay } from './CultureCoinDisplay';
import { InlineSubscriptionModal } from './InlineSubscriptionModal';
import { PortraitGalleryDashboard } from './PortraitGalleryDashboard';
import { Learn2EarnInterface } from './Learn2EarnInterface';
import { supabase, supabaseEdgeFunctionHeaders } from '../lib/supabase';
import { useChainFuelz } from '../hooks/useChainFuelz';
import type { OracleConversationHandle } from './OracleConversation';

// ── Frequencies ────────────────────────────────────────────────────────────────
type Frequency = 'RESONANCE' | 'SQUAD' | 'PRINTS' | 'CORE_DIAG' | 'SALVAGE' | 'MANIFEST';

const FREQUENCIES: {
  id: Frequency; label: string; mhz: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  accent: 'green' | 'cyan' | 'purple';
}[] = [
  { id: 'RESONANCE', label: 'VAULT',   mhz: '108.4', Icon: Wallet,   accent: 'green'  },
  { id: 'SQUAD',     label: 'SQUAD',   mhz: '112.8', Icon: Radio,    accent: 'green'  },
  { id: 'PRINTS',    label: 'PRINTS',  mhz: '124.2', Icon: Image,    accent: 'green'  },
  { id: 'CORE_DIAG', label: 'DIAG',    mhz: '142.0', Icon: Cpu,      accent: 'cyan'   },
  { id: 'SALVAGE',   label: 'SALVAGE', mhz: '158.6', Icon: Database, accent: 'purple' },
  { id: 'MANIFEST',  label: 'SIGNAL',  mhz: '188.4', Icon: Layers,   accent: 'cyan'   },
];

const ACCENT_COLORS = { green: '#00ff88', cyan: '#00ffcc', purple: '#b026ff' };

// ── Oscilloscope ───────────────────────────────────────────────────────────────
function Oscilloscope({ rms }: { rms: number }) {
  const pts = 20;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 30 }}>
      {Array.from({ length: pts }).map((_, i) => {
        const h = Math.max(3, rms * 100 * (0.3 + Math.random() * 0.7));
        return (
          <motion.div key={i}
            animate={{ height: [h * 0.7, h, h * 0.8] }}
            transition={{ repeat: Infinity, duration: 0.07 + Math.random() * 0.22 }}
            style={{
              width: 3, borderRadius: 1,
              background: i % 3 === 0 ? '#00ff88' : '#00ffcc',
              opacity: 0.4 + (i / pts) * 0.6,
            }}
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
    if (autoRefresh) { timerRef.current = setInterval(fetchLogs, 4000); }
    else { if (timerRef.current) clearInterval(timerRef.current); }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoRefresh, fetchLogs]);

  const filtered = filter
    ? logs.filter(l => l.event.includes(filter) || l.session_id?.includes(filter) || JSON.stringify(l.data).includes(filter))
    : logs;

  const levelColor = (ev: string) => {
    if (ev.includes('error')) return '#ff4466';
    if (ev.includes('exit') || ev.includes('barge')) return '#b026ff';
    if (ev.includes('portrait') || ev.includes('claim')) return '#00ffcc';
    return '#00ff88';
  };
  const fmtTime = (ts: string) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={filter} onChange={e => setFilter(e.target.value)}
          placeholder="FILTER_SIGNAL..."
          style={{
            flex: 1, background: 'rgba(0,0,0,0.55)',
            border: '1px solid rgba(0,255,136,0.18)', borderLeft: '3px solid rgba(0,255,136,0.45)',
            borderRadius: '2px 8px 2px 8px', padding: '10px 12px',
            color: '#00ff88', fontFamily: "'Share Tech Mono', monospace", fontSize: '0.62rem',
            letterSpacing: '0.1em', outline: 'none',
          }}
        />
        <motion.button onClick={fetchLogs} whileTap={{ rotate: 180, scale: 0.88 }}
          style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.25)', borderRadius: '2px 8px 2px 8px', color: '#00ff88', cursor: 'pointer', padding: '10px 12px' }}
        ><RefreshCw size={13} /></motion.button>
        <motion.button onClick={() => setAuto(a => !a)}
          style={{
            background: autoRefresh ? 'rgba(0,255,136,0.1)' : 'rgba(0,0,0,0.4)',
            border: `1px solid ${autoRefresh ? 'rgba(0,255,136,0.4)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: '2px 8px 2px 8px',
            color: autoRefresh ? '#00ff88' : 'rgba(255,255,255,0.2)',
            fontFamily: "'PhillySans', monospace", fontSize: '0.5rem', letterSpacing: '0.12em', fontWeight: 800,
            cursor: 'pointer', padding: '10px 11px', whiteSpace: 'nowrap',
          }}
        >{autoRefresh ? '● LIVE' : '○ PAUSE'}</motion.button>
      </div>

      <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '0.52rem', color: 'rgba(255,255,255,0.22)', letterSpacing: '0.1em', display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ color: '#00ffcc', fontWeight: 700, fontSize: '0.78rem' }}>{filtered.length}</span>
        <span>events</span>
        {filter && <span style={{ color: 'rgba(255,255,255,0.12)' }}>/ {logs.length} total</span>}
      </div>

      <div style={{
        background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(0,255,136,0.08)',
        borderRadius: '3px 14px 3px 14px', maxHeight: 340, overflowY: 'auto',
      }}>
        {filtered.length === 0 ? (
          <div className="ec-await">{loading ? 'SCANNING...' : '— NO_SIGNAL —'}</div>
        ) : filtered.map(row => (
          <div key={row.id}>
            <motion.div className="ec-log-row" onClick={() => setExpanded(expanded === row.id ? null : row.id)}>
              <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '0.48rem', color: 'rgba(255,255,255,0.18)', flexShrink: 0, minWidth: 44 }}>{fmtTime(row.ts)}</span>
              <div style={{ width: 3, height: 14, background: levelColor(row.event), flexShrink: 0, borderRadius: 2, boxShadow: `0 0 6px ${levelColor(row.event)}` }} />
              <span style={{ fontFamily: "'PhillySans', monospace", fontSize: '0.56rem', fontWeight: 800, letterSpacing: '0.1em', color: levelColor(row.event), flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.event.replace('oracle_', '').toUpperCase()}
              </span>
              {row.session_id && <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '0.44rem', color: 'rgba(255,255,255,0.14)', flexShrink: 0 }}>{row.session_id.slice(-8)}</span>}
            </motion.div>
            <AnimatePresence>
              {expanded === row.id && (
                <motion.pre initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.16 }}
                  style={{ margin: 0, padding: '10px 14px', background: 'rgba(0,0,0,0.5)', borderBottom: '1px solid rgba(0,255,136,0.05)', fontFamily: "'Share Tech Mono', monospace", fontSize: '0.5rem', color: 'rgba(0,255,204,0.72)', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-all', overflow: 'hidden' }}
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
    const onScore    = (e: Event) => { const d = (e as CustomEvent).detail||{}; if (d.sessionPhase) setPhase(d.sessionPhase); if (typeof d.totemLevel==='number') setTotemLevel(d.totemLevel); if (d.archetypeTitle) setArchetype(d.archetypeTitle); if (d.emotionalWeight) setEmo(d.emotionalWeight); };
    const onAlign    = (e: Event) => { const d = (e as CustomEvent).detail||{}; if (d.alignment) setAlignment(d.alignment); };
    const onArtifact = (e: Event) => { const d = (e as CustomEvent).detail||{}; if (d.archetypeTitle) setArchetype(d.archetypeTitle); };
    const onTotem    = (e: Event) => { const d = (e as CustomEvent).detail||{}; if (typeof d.totemLevel==='number') setTotemLevel(d.totemLevel); };
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="ec-card ec-card--cyan">
        <div className="ec-title ec-title--cyan">SESSION MANIFEST</div>
        <div className="ec-subtitle" style={{ color: '#00ffcc' }}>REAL-TIME SIGNAL ARTIFACTS</div>
        <div className="ec-divider" />
        {!hasData ? (
          <div className="ec-await">AWAITING_ORACLE_SESSION</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {alignment      && <div className="ec-row"><span className="ec-row__label">SIGNAL_ALIGNMENT</span><span className="ec-row__value" style={{ color: alignColor }}>{alignment.toUpperCase()}</span></div>}
            {archetype      && <div className="ec-row"><span className="ec-row__label">ARCHETYPE_TITLE</span><span className="ec-row__value" style={{ color: '#00ff88' }}>{archetype.toUpperCase()}</span></div>}
            {totemLevel > 0 && <div className="ec-row"><span className="ec-row__label">TOTEM_LEVEL</span><span className="ec-row__value">{Array(totemLevel).fill('◈').join(' ')}</span></div>}
            {sessionPhase   && <div className="ec-row"><span className="ec-row__label">RITUAL_PHASE</span><span className="ec-row__value">{(phaseMap[sessionPhase] ?? sessionPhase).toUpperCase()}</span></div>}
            {emotionalWeight && <div className="ec-row"><span className="ec-row__label">EMOTIONAL_REG</span><span className="ec-row__value" style={{ color: 'rgba(255,255,255,0.5)' }}>{emotionalWeight.toUpperCase()}</span></div>}
            {coins > 0      && <div className="ec-row"><span className="ec-row__label">CULTURE_COINS</span><span className="ec-row__value" style={{ color: '#00ff88' }}>{`+${coins}c`}</span></div>}
          </div>
        )}
      </div>

      {sessionPhase && (
        <div className="ec-card ec-card--cyan" style={{ padding: '14px 16px' }}>
          <div style={{ fontFamily: "'PhillySans', monospace", fontSize: '0.5rem', color: 'rgba(0,255,204,0.45)', letterSpacing: '0.2em', marginBottom: 12, fontWeight: 800 }}>RITUAL_PROGRESSION</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {phases.map(phase => {
              const cur = phases.indexOf(sessionPhase as typeof phases[number]);
              const idx = phases.indexOf(phase);
              const isActive = phase === sessionPhase;
              const isPast   = idx < cur;
              const c = isActive ? '#00ffcc' : isPast ? '#00ff88' : 'transparent';
              return (
                <div key={phase} style={{
                  flex: 1, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isActive ? 'rgba(0,255,204,0.1)' : isPast ? 'rgba(0,255,136,0.05)' : 'rgba(0,0,0,0.2)',
                  border: `1px solid ${isActive ? 'rgba(0,255,204,0.3)' : isPast ? 'rgba(0,255,136,0.14)' : 'rgba(255,255,255,0.04)'}`,
                  borderBottom: `3px solid ${c}`, borderRadius: '2px 8px 2px 8px',
                }}>
                  <span style={{ fontFamily: "'PhillySans', monospace", fontSize: '0.44rem', letterSpacing: '0.1em', fontWeight: 800, color: isActive ? '#00ffcc' : isPast ? 'rgba(0,255,136,0.5)' : 'rgba(255,255,255,0.1)' }}>
                    {phaseMap[phase]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
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

// ── Main Component ─────────────────────────────────────────────────────────────
export const BackendControlPanel = ({
  userId, sessionId, isVisible = true, initialTab = 'vault',
  onClose, userEmail, pendingCoins = 0, oracleConversationRef,
}: BackendControlPanelProps) => {
  const [activeFreq, setActiveFreq]           = useState<Frequency>(() => (localStorage.getItem('oracle_crate_active_freq') as Frequency) || 'RESONANCE');
  const [prevIdx, setPrevIdx]                 = useState(0);
  const [debugPassed, setDebugPassed]         = useState(false);
  const [debugPw, setDebugPw]                 = useState('');
  const [testResults, setTestResults]         = useState<Record<string, unknown>>({});
  const [isLoading, setIsLoading]             = useState(false);
  const [showUpgrade, setShowUpgrade]         = useState(false);
  const [geminiInfo, setGeminiInfo]           = useState<ReturnType<OracleConversationHandle['getWsDebugInfo']> | null>(null);
  const pollRef                               = useRef<ReturnType<typeof setInterval> | null>(null);
  const supabaseUrl                           = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const chainFuelz                            = useChainFuelz(userEmail, pendingCoins);

  const switchFreq = (freq: Frequency) => {
    setPrevIdx(FREQUENCIES.findIndex(f => f.id === activeFreq));
    setActiveFreq(freq);
    localStorage.setItem('oracle_crate_active_freq', freq);
  };

  useEffect(() => {
    const m: Record<string, Frequency> = { vault: 'RESONANCE', coins: 'RESONANCE', gemini: 'CORE_DIAG', debug: 'SALVAGE', dev: 'SALVAGE' };
    setActiveFreq(m[initialTab] ?? 'RESONANCE');
  }, [initialTab]);

  useEffect(() => {
    if (activeFreq === 'CORE_DIAG') {
      pollRef.current = setInterval(() => {
        if (oracleConversationRef?.current) setGeminiInfo(oracleConversationRef.current.getWsDebugInfo());
      }, 600);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeFreq, oracleConversationRef]);

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

  const activeIdx   = FREQUENCIES.findIndex(f => f.id === activeFreq);
  const slideDir    = activeIdx > prevIdx ? 1 : -1;
  const activeFreqDef = FREQUENCIES[activeIdx];
  const accentHex   = ACCENT_COLORS[activeFreqDef.accent];

  return (
    <>
      {/* ── Full-screen alley overlay ── */}
      <motion.div
        className="ec-overlay"
        initial={{ opacity: 0, scale: 0.97, filter: 'blur(8px)' }}
        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
        exit={{ opacity: 0, scale: 0.97, filter: 'blur(8px)' }}
        transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
        data-testid="backend-panel"
      >
        {/* Alley atmosphere glow layers */}
        <div className="ec-atmosphere" />
        <div className="ec-scanlines" />

        {/* ── HEADER ──────────────────────────────────────────────────────── */}
        <div className="ec-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div className="ec-header__brand">ENCULTURATE CRATE</div>
              <div className="ec-header__sub">
                SURROGATE:ORACLE · {activeFreqDef.mhz}MHz · {activeFreqDef.label}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 6 }}>
              {sessionId && (
                <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '0.46rem', color: 'rgba(0,255,204,0.22)', letterSpacing: '0.12em' }}>
                  SID:{sessionId.slice(-6).toUpperCase()}
                </span>
              )}
              <motion.div
                animate={{ opacity: [1, 0.15, 1], scale: [1, 1.4, 1] }}
                transition={{ repeat: Infinity, duration: 1.7 }}
                style={{ width: 9, height: 9, borderRadius: '50%', background: accentHex, boxShadow: `0 0 12px ${accentHex}` }}
              />
              {onClose && (
                <button className="ec-close" onClick={onClose} aria-label="Close">
                  <X size={15} />
                </button>
              )}
            </div>
          </div>

          {/* Animated accent bar */}
          <motion.div
            key={activeFreq}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            style={{
              height: 2, marginTop: 10,
              background: `linear-gradient(90deg, transparent, ${accentHex}, transparent)`,
              filter: `blur(1px)`,
              transformOrigin: 'left',
            }}
          />
        </div>

        {/* ── NAV — floating oracle-bottom-btn style ───────────────────────── */}
        <nav className="ec-nav" role="tablist">
          {FREQUENCIES.map(freq => {
            const isActive = activeFreq === freq.id;
            const isPurple = freq.accent === 'purple';
            const testId   =
              freq.id === 'RESONANCE' ? 'tab-vault'
            : freq.id === 'SQUAD'     ? 'tab-squad'
            : freq.id === 'PRINTS'    ? 'tab-portraits'
            : freq.id === 'CORE_DIAG' ? 'tab-gemini'
            : freq.id === 'SALVAGE'   ? 'tab-dev'
            : 'tab-manifest';
            return (
              <button
                key={freq.id}
                role="tab"
                aria-selected={isActive}
                data-testid={testId}
                onClick={() => switchFreq(freq.id)}
                className={`ec-nav__btn${isActive ? (isPurple ? ' ec-nav__btn--active-purple' : ' ec-nav__btn--active') : ''}`}
              >
                <freq.Icon size={17} className="ec-nav__icon" />
                <span className="ec-nav__label">{freq.label}</span>
              </button>
            );
          })}
        </nav>

        {/* ── CONTENT ─────────────────────────────────────────────────────── */}
        <div className="ec-content">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeFreq}
              initial={{ x: slideDir * 56, opacity: 0, filter: 'blur(6px)' }}
              animate={{ x: 0, opacity: 1, filter: 'blur(0px)' }}
              exit={{ x: -slideDir * 44, opacity: 0, filter: 'blur(8px)' }}
              transition={{ type: 'spring', damping: 26, stiffness: 260, mass: 0.85 }}
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            >

              {/* ── RESONANCE ─────────────────────────────────────────── */}
              {activeFreq === 'RESONANCE' && (
                userId ? (
                  <>
                    <div className="ec-card">
                      <CultureCoinDisplay userId={userId} onLevelUp={(l, t) => console.log(`Level ${l}: ${t}`)} />
                    </div>

                    <div className="ec-card" style={{ filter: chainFuelz.isMinting ? 'hue-rotate(8deg)' : 'none', transition: 'filter 0.15s' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div className="ec-title">NEURAL RESONANCE</div>
                        <span className={`ec-badge${chainFuelz.isMinting ? '' : ''}`} style={{ borderLeftColor: chainFuelz.isMinting ? '#b026ff' : '#00ff88', color: chainFuelz.isMinting ? '#b026ff' : '#00ff88', background: chainFuelz.isMinting ? 'rgba(176,38,255,0.08)' : 'rgba(0,255,136,0.08)' }}>
                          <span className="ec-badge__dot" style={{ background: chainFuelz.isMinting ? '#b026ff' : '#00ff88', '--dot-c': chainFuelz.isMinting ? '#b026ff' : '#00ff88' } as React.CSSProperties} />
                          {chainFuelz.isMinting ? 'SYNCING' : 'STABLE'}
                        </span>
                      </div>
                      <div className="ec-subtitle" style={{ color: '#00ff88' }}>VAULT FREQUENCY</div>
                      <div className="ec-divider" />

                      {chainFuelz.isInitialized ? (
                        <>
                          <div style={{ fontFamily: "'PhillySans', monospace", fontSize: '0.54rem', color: 'rgba(0,255,204,0.5)', letterSpacing: '0.16em', fontWeight: 700, marginBottom: 8 }}>VAULT_SIGNATURE</div>
                          <div style={{
                            fontFamily: "'Share Tech Mono', monospace", fontSize: '0.9rem',
                            color: 'rgba(255,255,255,0.9)', letterSpacing: '0.04em',
                            background: 'rgba(0,255,136,0.05)', padding: '12px 14px',
                            border: '1px solid rgba(0,255,136,0.12)', borderLeft: '3px solid rgba(0,255,136,0.45)',
                            borderRadius: '2px 10px 2px 10px',
                          }}>{chainFuelz.vaultHandle}</div>

                          <div style={{
                            marginTop: 16, padding: '14px 16px',
                            background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.04)',
                            borderRadius: '2px 10px 2px 10px',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          }}>
                            <span style={{ fontFamily: "'PhillySans', monospace", fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.14em', fontWeight: 700 }}>SIGNAL_STRENGTH</span>
                            <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '1.6rem', color: '#00ff88', fontWeight: 700, textShadow: '0 0 24px rgba(0,255,136,0.8)' }}>
                              {chainFuelz.balance}
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="ec-await">RECOVERING VAULT FREQUENCY...</div>
                      )}
                    </div>

                    <button className="ec-upgrade-btn" onClick={() => setShowUpgrade(true)}>
                      UPGRADE_CONSCIOUSNESS
                    </button>
                  </>
                ) : (
                  <div className="ec-card">
                    <Learn2EarnInterface userId={sessionId || 'anonymous'} navigateToDebug={() => switchFreq('SALVAGE')} />
                  </div>
                )
              )}

              {/* ── SQUAD ─────────────────────────────────────────────── */}
              {activeFreq === 'SQUAD' && (
                <div className="ec-card">
                  <Learn2EarnInterface userId={userId || sessionId || 'anonymous'} navigateToDebug={() => switchFreq('SALVAGE')} />
                </div>
              )}

              {/* ── PRINTS ────────────────────────────────────────────── */}
              {activeFreq === 'PRINTS' && (
                <div className="ec-card" style={{ padding: '18px 16px' }}>
                  <PortraitGalleryDashboard userId={userId} userEmail={userEmail} sessionId={sessionId} maxPortraits={20} isBackendCabinetTab />
                </div>
              )}

              {/* ── CORE_DIAG ─────────────────────────────────────────── */}
              {activeFreq === 'CORE_DIAG' && (
                <div className="ec-card ec-card--cyan">
                  <div style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}>WEBSOCKET WS STATE VERTEX</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <div className="ec-title ec-title--cyan">GEMINI LIVE</div>
                      <div className="ec-subtitle" style={{ color: '#00ffcc' }}>CORE DIAGNOSTICS</div>
                    </div>
                    {geminiInfo && <Oscilloscope rms={(geminiInfo as Record<string, number>).lastVadRms ?? 0} />}
                  </div>
                  <div className="ec-divider" />

                  {geminiInfo ? (
                    <>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                        <span className="ec-badge" style={{ borderLeftColor: geminiInfo.wsState === 1 ? '#00ff88' : '#ff4466', color: geminiInfo.wsState === 1 ? '#00ff88' : '#ff4466', background: geminiInfo.wsState === 1 ? 'rgba(0,255,136,0.08)' : 'rgba(255,68,102,0.08)' }}>
                          <span className="ec-badge__dot" style={{ background: geminiInfo.wsState === 1 ? '#00ff88' : '#ff4466', '--dot-c': geminiInfo.wsState === 1 ? '#00ff88' : '#ff4466' } as React.CSSProperties} />
                          {geminiInfo.wsState === 1 ? 'WS_OPEN' : 'WS_DISRUPTED'}
                        </span>
                        <span className="ec-badge" style={{ borderLeftColor: '#b026ff', color: '#b026ff', background: 'rgba(176,38,255,0.08)' }}>
                          <span className="ec-badge__dot" style={{ background: '#b026ff', '--dot-c': '#b026ff' } as React.CSSProperties} />
                          FREE_TIER
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                        {([
                          ['TURNS',     String(geminiInfo.turnCount)],
                          ['AUDIO_IN',  String(geminiInfo.audioChunksReceived)],
                          ['AUDIO_OUT', String((geminiInfo as Record<string, unknown>).audioChunksSent ?? '—')],
                          ['VAD_RMS',   String((geminiInfo as Record<string, number>).lastVadRms?.toFixed(4) ?? '0.0000')],
                        ] as [string, string][]).map(([k, v]) => (
                          <div className="ec-metric" key={k}>
                            <div className="ec-metric__label">{k}</div>
                            <div className="ec-metric__value">{v}</div>
                          </div>
                        ))}
                      </div>

                      <div style={{ marginTop: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{ fontFamily: "'PhillySans', monospace", fontSize: '0.52rem', color: '#00ffcc', letterSpacing: '0.18em', fontWeight: 800 }}>SIGNAL_STREAM</span>
                          <button onClick={() => navigator.clipboard.writeText(geminiInfo.recentMessages.join('\n'))} style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.22)', borderRadius: 3, color: '#00ff88', fontSize: '0.48rem', cursor: 'pointer', padding: '3px 8px', fontFamily: "'PhillySans', monospace", letterSpacing: '0.1em', fontWeight: 800 }}>COPY</button>
                        </div>
                        <div className="ec-terminal">
                          {geminiInfo.recentMessages.length === 0
                            ? <span style={{ color: 'rgba(255,255,255,0.12)', letterSpacing: '0.16em' }}>— NO_SIGNAL —</span>
                            : geminiInfo.recentMessages.map((l, i) => <div key={i}>{l}</div>)
                          }
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="ec-await">WAITING FOR CORE UPLINK...</div>
                  )}
                </div>
              )}

              {/* ── SALVAGE ───────────────────────────────────────────── */}
              {activeFreq === 'SALVAGE' && (
                !debugPassed ? (
                  <div className="ec-card ec-card--purple">
                    <div style={{ textAlign: 'center', padding: '36px 8px' }} data-testid="dev-gate-container">
                      <div className="ec-title ec-title--purple" style={{ textAlign: 'center', fontSize: 'clamp(1.6rem, 6vw, 2.2rem)', marginBottom: 6, filter: 'drop-shadow(0 0 30px rgba(176,38,255,0.5))' }}>
                        ACCESS_RESTRICTED
                      </div>
                      <div className="ec-subtitle" style={{ color: '#b026ff', textAlign: 'center', marginBottom: 28 }}>SALVAGE BAY CLEARANCE REQUIRED</div>
                      <div className="ec-divider" />
                      <input
                        type="password"
                        value={debugPw}
                        onChange={e => setDebugPw(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && debugPw === '3nculturate!' && setDebugPassed(true)}
                        placeholder="INPUT_DECRYPTION_KEY"
                        data-testid="debug-password-input"
                        className="ec-gate__input"
                      />
                      <motion.button
                        onClick={() => { if (debugPw === '3nculturate!') setDebugPassed(true); }}
                        whileHover={{ scale: 1.04, boxShadow: '0 0 36px rgba(176,38,255,0.45)' }}
                        whileTap={{ scale: 0.97 }}
                        data-testid="debug-access-btn"
                        style={{
                          padding: '13px 30px',
                          background: 'rgba(176,38,255,0.1)',
                          border: '2px solid #b026ff',
                          borderRadius: '3px 14px 3px 14px',
                          color: '#b026ff', cursor: 'pointer',
                          fontFamily: "'aAnotherTag', sans-serif",
                          fontSize: '1.1rem', fontWeight: 900, letterSpacing: '0.12em',
                          boxShadow: '0 0 18px rgba(176,38,255,0.2)',
                        }}
                      >DECRYPT</motion.button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}>SUPABASE CHAINFUELZ EDGE FUNCTION</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.3 }}
                        style={{ width: 8, height: 8, borderRadius: '50%', background: '#00ff88', boxShadow: '0 0 10px #00ff88' }} />
                      <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '0.7rem', color: '#00ff88', letterSpacing: '0.14em', fontWeight: 700 }}>›_ROOT_SHELL_ACTIVE</span>
                    </div>

                    <div className="ec-card ec-card--cyan">
                      <div className="ec-title ec-title--cyan">PROD LOG BRIDGE</div>
                      <div className="ec-subtitle" style={{ color: '#00ffcc' }}>LIVE PRODUCTION TELEMETRY</div>
                      <div className="ec-divider" />
                      <ProdLogViewer />
                    </div>

                    <div className="ec-card ec-card--purple">
                      <div className="ec-title ec-title--purple">SYSTEM RECOVERY</div>
                      <div className="ec-subtitle" style={{ color: '#b026ff' }}>EDGE FUNCTION DIAGNOSTICS</div>
                      <div className="ec-divider" />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {[
                          ['RUN_ORACLE_HEALTH', 'oracle-conversation'],
                          ['SYNC_COIN_METRICS', 'culture-coin-manager'],
                        ].map(([label, fn]) => {
                          const res = testResults[fn] as { success?: boolean; status?: number; timestamp?: string } | undefined;
                          return (
                            <div key={fn}>
                              <motion.button
                                onClick={() => testEdgeFunction(fn)}
                                whileHover={{ scale: 1.01 }}
                                whileTap={{ scale: 0.98 }}
                                style={{
                                  width: '100%', padding: '13px 14px', textAlign: 'left', cursor: 'pointer',
                                  background: 'rgba(176,38,255,0.07)',
                                  border: '1px solid rgba(176,38,255,0.22)', borderLeft: '3px solid rgba(176,38,255,0.55)',
                                  borderRadius: '2px 10px 2px 10px',
                                  color: '#b026ff', fontFamily: "'PhillySans', monospace",
                                  fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.1em',
                                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                }}
                              >
                                <span>{label}</span>
                                {isLoading && <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}><RefreshCw size={12} /></motion.span>}
                              </motion.button>
                              {res && (
                                <div style={{
                                  marginTop: 5, padding: '8px 12px',
                                  background: (res.success ? 'rgba(0,255,136,0.06)' : 'rgba(255,68,102,0.06)'),
                                  border: `1px solid ${res.success ? 'rgba(0,255,136,0.18)' : 'rgba(255,68,102,0.18)'}`,
                                  borderRadius: '2px 8px 2px 8px',
                                  fontFamily: "'Share Tech Mono', monospace", fontSize: '0.54rem',
                                  color: res.success ? '#00ff88' : '#ff4466', letterSpacing: '0.08em',
                                }}>
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

              {/* ── MANIFEST ──────────────────────────────────────────── */}
              {activeFreq === 'MANIFEST' && <ManifestPanel pendingCoins={pendingCoins} />}

            </motion.div>
          </AnimatePresence>
        </div>

        <div className="ec-safe-area" />
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
