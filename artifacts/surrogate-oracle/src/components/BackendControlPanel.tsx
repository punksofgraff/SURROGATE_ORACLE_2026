/**
 * BackendControlPanel — ENCULTURATE CRATE
 * Redesigned: mobile-first · glassmorphism · domino cards · glide transitions
 */
import { useState, useEffect, useRef, RefObject, useCallback } from 'react';
import { X, Wallet, Cpu, RefreshCw, Radio, Image, Zap, Database, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { CultureCoinDisplay } from './CultureCoinDisplay';
import { InlineSubscriptionModal } from './InlineSubscriptionModal';
import { PortraitGalleryDashboard } from './PortraitGalleryDashboard';
import { Learn2EarnInterface } from './Learn2EarnInterface';
import { supabase, supabaseEdgeFunctionHeaders } from '../lib/supabase';
import { useChainFuelz } from '../hooks/useChainFuelz';
import type { OracleConversationHandle } from './OracleConversation';

// ── Types ──────────────────────────────────────────────────────────────────────
type Frequency = 'RESONANCE' | 'SQUAD' | 'PRINTS' | 'CORE_DIAG' | 'SALVAGE' | 'MANIFEST';

const FREQUENCIES: { id: Frequency; label: string; mhz: string; Icon: React.ComponentType<{size?:number}> }[] = [
  { id: 'RESONANCE', label: 'VAULT',    mhz: '108.4', Icon: Wallet  },
  { id: 'SQUAD',     label: 'SQUAD',    mhz: '112.8', Icon: Radio   },
  { id: 'PRINTS',    label: 'PRINTS',   mhz: '124.2', Icon: Image   },
  { id: 'CORE_DIAG', label: 'DIAG',     mhz: '142.0', Icon: Cpu     },
  { id: 'SALVAGE',   label: 'SALVAGE',  mhz: '158.6', Icon: Database},
  { id: 'MANIFEST',  label: 'SIGNAL',   mhz: '188.4', Icon: Layers  },
];

// ── Design tokens ──────────────────────────────────────────────────────────────
const T = {
  green:      '#00ff88',
  cyan:       '#00ffcc',
  purple:     '#b026ff',
  red:        '#ff4466',
  fontHeader: "'aAnotherTag', sans-serif",
  fontUI:     "'PhillySans', monospace",
  fontData:   "'Share Tech Mono', monospace",
  glass:      'rgba(0,3,18,0.68)',
  glassDark:  'rgba(0,1,10,0.82)',
  panelBg:    'rgba(0,2,14,0.96)',
  glassCard:  (c: string) => `rgba(0,3,18,0.65)`,
  border:     (c: string) => `1px solid ${c}20`,
  borderL:    (c: string) => `3px solid ${c}`,
  glow:       (c: string) => `0 8px 56px rgba(0,0,0,0.85), 0 0 40px ${c}14, inset 0 0 48px ${c}05`,
  glowStrong: (c: string) => `0 0 60px ${c}28, 0 0 16px ${c}22`,
} as const;

// ── GlassCard — domino-style card, knife aesthetic ─────────────────────────────
function GlassCard({
  children, color = T.green, style, glitchy = false, noPad = false,
}: {
  children: React.ReactNode; color?: string; style?: React.CSSProperties;
  glitchy?: boolean; noPad?: boolean;
}) {
  return (
    <motion.div
      animate={glitchy ? {
        x: [0, -2, 2, -1, 0],
        filter: ['none', 'hue-rotate(12deg) brightness(1.1)', 'none'],
      } : {}}
      transition={glitchy ? { repeat: Infinity, duration: 0.18, repeatDelay: 4.2 } : {}}
      style={{
        position: 'relative',
        background: T.glass,
        backdropFilter: 'blur(28px) saturate(2.2)',
        WebkitBackdropFilter: 'blur(28px) saturate(2.2)',
        border: T.border(color),
        borderLeft: T.borderL(color),
        borderRadius: '3px 18px 3px 18px',
        boxShadow: T.glow(color),
        padding: noPad ? 0 : '20px 18px',
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* Scanline overlay */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, borderRadius: 'inherit',
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.008) 3px, rgba(255,255,255,0.008) 4px)',
      }} />
      {/* Corner ticks */}
      <div style={{ position:'absolute', top:7, left:7, width:12, height:2, background:color, opacity:0.6, pointerEvents:'none', zIndex:1 }} />
      <div style={{ position:'absolute', top:7, left:7, width:2, height:12, background:color, opacity:0.6, pointerEvents:'none', zIndex:1 }} />
      <div style={{ position:'absolute', bottom:7, right:7, width:10, height:2, background:color, opacity:0.3, pointerEvents:'none', zIndex:1 }} />
      <div style={{ position:'absolute', bottom:7, right:7, width:2, height:10, background:color, opacity:0.3, pointerEvents:'none', zIndex:1 }} />
      {/* Content */}
      <div style={{ position: 'relative', zIndex: 2 }}>{children}</div>
    </motion.div>
  );
}

// ── CardTitle ──────────────────────────────────────────────────────────────────
function CardTitle({ label, color = T.green, sub }: { label: string; color?: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontFamily: T.fontHeader,
        fontSize: '1.35rem',
        fontWeight: 900,
        letterSpacing: '0.05em',
        lineHeight: 1.05,
        background: `linear-gradient(110deg, ${color} 0%, ${color === T.purple ? '#d060ff' : T.cyan} 100%)`,
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
      }}>{label}</div>
      {sub && (
        <div style={{
          fontFamily: T.fontUI,
          fontSize: '0.58rem',
          letterSpacing: '0.2em',
          color: `${color}55`,
          marginTop: 4,
          fontWeight: 800,
        }}>{sub}</div>
      )}
    </div>
  );
}

// ── StatBadge ──────────────────────────────────────────────────────────────────
function StatBadge({ label, ok, warn }: { label: string; ok: boolean; warn?: boolean }) {
  const c = warn ? T.purple : ok ? T.green : T.cyan;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '5px 11px',
      background: `${c}10`,
      border: `1px solid ${c}35`,
      borderLeft: `3px solid ${c}`,
      fontSize: '0.55rem', letterSpacing: '0.16em', color: c,
      fontFamily: T.fontUI, fontWeight: 800,
      borderRadius: '1px 8px 1px 8px',
    }}>
      <motion.span
        animate={{ opacity: [1, 0.4, 1] }}
        transition={{ repeat: Infinity, duration: 1.6 }}
        style={{ width: 5, height: 5, borderRadius: '50%', background: c, display: 'inline-block', flexShrink: 0, boxShadow: `0 0 6px ${c}` }}
      />
      {label}
    </span>
  );
}

// ── MetricBlock ────────────────────────────────────────────────────────────────
function MetricBlock({ label, value, color = T.cyan }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      background: T.glassDark,
      border: `1px solid ${color}15`,
      borderBottom: `3px solid ${color}40`,
      padding: '14px 14px 12px',
      borderRadius: '2px 10px 2px 10px',
    }}>
      <div style={{ fontFamily:T.fontUI, color:`${color}80`, fontSize:'0.5rem', letterSpacing:'0.18em', marginBottom:6, fontWeight:800, textTransform:'uppercase' }}>{label}</div>
      <div style={{ fontFamily:T.fontData, color:'rgba(255,255,255,0.95)', fontSize:'1.05rem', fontWeight:700, letterSpacing:'0.04em' }}>{value}</div>
    </div>
  );
}

// ── DataRow ────────────────────────────────────────────────────────────────────
function DataRow({ label, value, color = T.cyan }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      display:'flex', justifyContent:'space-between', alignItems:'center',
      padding: '11px 14px', marginBottom: 6,
      background: T.glassDark,
      border: `1px solid ${color}12`,
      borderLeft: `3px solid ${color}50`,
      borderRadius: '2px 10px 2px 10px',
    }}>
      <span style={{ fontFamily:T.fontUI, fontSize:'0.52rem', color:'rgba(255,255,255,0.35)', letterSpacing:'0.15em', fontWeight:700 }}>{label}</span>
      <span style={{ fontFamily:T.fontData, fontSize:'0.82rem', color, fontWeight:700, letterSpacing:'0.06em' }}>{value}</span>
    </div>
  );
}

// ── Oscilloscope ───────────────────────────────────────────────────────────────
function Oscilloscope({ rms }: { rms: number }) {
  const pts = 18;
  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:2, height:28, padding:'0 2px' }}>
      {Array.from({ length: pts }).map((_, i) => {
        const h = Math.max(3, rms * 100 * (0.35 + Math.random() * 0.65));
        return (
          <motion.div key={i}
            animate={{ height:[h*0.75, h, h*0.8] }}
            transition={{ repeat:Infinity, duration:0.07 + Math.random()*0.22 }}
            style={{ width: 4, background: i % 3 === 0 ? T.green : T.cyan, opacity: 0.45 + (i/pts)*0.55, borderRadius: 1 }}
          />
        );
      })}
    </div>
  );
}

// ── TerminalStream ─────────────────────────────────────────────────────────────
function TerminalStream({ lines, label }: { lines: string[]; label: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lines]);
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <span style={{ fontFamily:T.fontUI, fontSize:'0.52rem', color:T.cyan, letterSpacing:'0.18em', fontWeight:800 }}>{label}</span>
        <button
          onClick={() => navigator.clipboard.writeText(lines.join('\n'))}
          style={{ background:`${T.green}12`, border:`1px solid ${T.green}30`, borderRadius:3, color:T.green, fontSize:'0.48rem', cursor:'pointer', padding:'3px 8px', fontFamily:T.fontUI, letterSpacing:'0.1em', fontWeight:800 }}
        >COPY</button>
      </div>
      <div ref={scrollRef} style={{
        background: T.glassDark,
        border: `1px solid rgba(0,255,136,0.1)`,
        borderRadius: '3px 10px 3px 10px',
        padding: '10px 12px', maxHeight: 150, overflowY: 'auto',
        fontFamily: T.fontData, fontSize: '0.62rem', color: T.green, lineHeight: 1.9,
      }}>
        {lines.length === 0
          ? <span style={{ color:'rgba(255,255,255,0.12)', letterSpacing:'0.15em' }}>— NO_SIGNAL —</span>
          : lines.map((l,i) => <div key={i} style={{ opacity: 0.7 + (i/lines.length)*0.3 }}>{l}</div>)
        }
      </div>
    </div>
  );
}

// ── ProdLogViewer ──────────────────────────────────────────────────────────────
type ProdLogRow = { id: number; ts: string; session_id: string | null; event: string; data: Record<string,unknown>; env: string };

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
    if (autoRefresh) {
      timerRef.current = setInterval(fetchLogs, 4000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoRefresh, fetchLogs]);

  const filtered = filter
    ? logs.filter(l => l.event.includes(filter) || l.session_id?.includes(filter) || JSON.stringify(l.data).includes(filter))
    : logs;

  const levelColor = (ev: string) => {
    if (ev.includes('error')) return T.red;
    if (ev.includes('exit') || ev.includes('barge')) return T.purple;
    if (ev.includes('portrait') || ev.includes('claim')) return T.cyan;
    return T.green;
  };

  const fmtTime = (ts: string) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`;
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {/* toolbar */}
      <div style={{ display:'flex', gap:8 }}>
        <input
          value={filter} onChange={e => setFilter(e.target.value)}
          placeholder="FILTER_SIGNAL..."
          style={{
            flex:1, background:T.glassDark, border:`1px solid ${T.green}25`,
            borderLeft:`3px solid ${T.green}60`, borderRadius:'2px 8px 2px 8px',
            padding:'10px 12px', color:T.green, fontFamily:T.fontData, fontSize:'0.62rem',
            letterSpacing:'0.1em', outline:'none',
          }}
        />
        <motion.button onClick={fetchLogs} whileTap={{ scale:0.88, rotate:180 }}
          style={{ background:`${T.green}10`, border:`1px solid ${T.green}30`, borderRadius:'2px 8px 2px 8px', color:T.green, cursor:'pointer', padding:'10px 12px' }}
        >
          <RefreshCw size={13} />
        </motion.button>
        <motion.button onClick={() => setAuto(a => !a)}
          style={{
            background: autoRefresh ? `${T.green}15` : T.glassDark,
            border:`1px solid ${autoRefresh ? T.green : 'rgba(255,255,255,0.08)'}`,
            borderRadius:'2px 8px 2px 8px',
            color: autoRefresh ? T.green : 'rgba(255,255,255,0.2)',
            fontFamily:T.fontUI, fontSize:'0.5rem', letterSpacing:'0.12em', fontWeight:800,
            cursor:'pointer', padding:'10px 11px',
          }}
        >
          {autoRefresh ? '● LIVE' : '○ PAUSE'}
        </motion.button>
      </div>

      {/* count strip */}
      <div style={{ display:'flex', gap:8, fontFamily:T.fontData, fontSize:'0.52rem', color:'rgba(255,255,255,0.25)', letterSpacing:'0.1em', alignItems:'center' }}>
        <span style={{ color:T.cyan, fontWeight:700, fontSize:'0.72rem' }}>{filtered.length}</span>
        <span>events</span>
        {filter && <span style={{ color:'rgba(255,255,255,0.15)' }}>/ {logs.length} total</span>}
      </div>

      {/* log rows */}
      <div style={{
        background:T.glassDark, border:`1px solid rgba(0,255,136,0.1)`,
        borderRadius:'3px 14px 3px 14px', maxHeight:360, overflowY:'auto',
      }}>
        {filtered.length === 0 ? (
          <div style={{ padding:36, textAlign:'center', fontFamily:T.fontData, fontSize:'0.58rem', color:'rgba(255,255,255,0.1)', letterSpacing:'0.2em' }}>
            {loading ? 'SCANNING...' : '— NO_SIGNAL —'}
          </div>
        ) : filtered.map(row => (
          <div key={row.id}>
            <motion.div
              onClick={() => setExpanded(expanded === row.id ? null : row.id)}
              whileHover={{ backgroundColor:'rgba(0,255,136,0.04)' }}
              style={{
                display:'flex', alignItems:'center', gap:10, padding:'9px 12px',
                borderBottom:`1px solid rgba(0,255,136,0.04)`, cursor:'pointer',
              }}
            >
              <span style={{ fontFamily:T.fontData, fontSize:'0.5rem', color:'rgba(255,255,255,0.2)', flexShrink:0, minWidth:46 }}>
                {fmtTime(row.ts)}
              </span>
              <div style={{
                width: 3, height: 14, background:levelColor(row.event),
                flexShrink:0, borderRadius:2, boxShadow:`0 0 6px ${levelColor(row.event)}`,
              }} />
              <span style={{ fontFamily:T.fontUI, fontSize:'0.56rem', fontWeight:800, letterSpacing:'0.1em', color:levelColor(row.event), flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {row.event.replace('oracle_','').toUpperCase()}
              </span>
              {row.session_id && (
                <span style={{ fontFamily:T.fontData, fontSize:'0.44rem', color:'rgba(255,255,255,0.15)', letterSpacing:'0.06em', flexShrink:0 }}>
                  {row.session_id.slice(-8)}
                </span>
              )}
            </motion.div>
            <AnimatePresence>
              {expanded === row.id && (
                <motion.pre
                  initial={{ height:0, opacity:0 }}
                  animate={{ height:'auto', opacity:1 }}
                  exit={{ height:0, opacity:0 }}
                  transition={{ duration:0.16 }}
                  style={{
                    margin:0, padding:'10px 14px',
                    background:'rgba(0,0,0,0.5)',
                    borderBottom:`1px solid rgba(0,255,136,0.06)`,
                    fontFamily:T.fontData, fontSize:'0.52rem',
                    color:'rgba(0,255,204,0.75)', lineHeight:1.7,
                    whiteSpace:'pre-wrap', wordBreak:'break-all', overflow:'hidden',
                  }}
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
  const [alignment, setAlignment]     = useState<string | null>(null);
  const [archetype, setArchetype]     = useState<string | null>(null);
  const [totemLevel, setTotemLevel]   = useState(0);
  const [sessionPhase, setPhase]      = useState<string | null>(null);
  const [emotionalWeight, setEmo]     = useState<string | null>(null);
  const [coins, setCoins]             = useState(pendingCoins);

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

  const alignColor = alignment === 'sacred' ? T.green : alignment === 'profane' ? T.purple : T.cyan;
  const hasData = alignment || archetype || totemLevel > 0 || sessionPhase;
  const phases = ['claim','evidence','cost','mirror'] as const;
  const phaseMap: Record<string,string> = { claim:'CLAIM', evidence:'EVIDENCE', cost:'COST', mirror:'MIRROR' };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <GlassCard color={T.cyan}>
        <CardTitle label="SESSION MANIFEST" color={T.cyan} sub="REAL-TIME SIGNAL ARTIFACTS" />
        {!hasData ? (
          <div style={{ padding:'32px 0', textAlign:'center' }}>
            <motion.div animate={{ opacity:[0.2,0.7,0.2] }} transition={{ repeat:Infinity, duration:2.8 }}
              style={{ fontFamily:T.fontData, fontSize:'0.65rem', color:T.cyan, letterSpacing:'0.22em' }}>
              AWAITING_ORACLE_SESSION
            </motion.div>
            <div style={{ marginTop:10, fontFamily:T.fontUI, fontSize:'0.5rem', color:`${T.cyan}25`, letterSpacing:'0.16em' }}>
              ARTIFACTS ACCUMULATE AS THE RITUAL UNFOLDS
            </div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {alignment     && <DataRow label="SIGNAL_ALIGNMENT" value={alignment.toUpperCase()} color={alignColor} />}
            {archetype     && <DataRow label="ARCHETYPE_TITLE"  value={archetype.toUpperCase()} color={T.green} />}
            {totemLevel > 0 && <DataRow label="TOTEM_LEVEL"    value={Array(totemLevel).fill('◈').join(' ')} color={T.cyan} />}
            {sessionPhase  && <DataRow label="RITUAL_PHASE"    value={phaseMap[sessionPhase] ?? sessionPhase.toUpperCase()} color={T.cyan} />}
            {emotionalWeight && <DataRow label="EMOTIONAL_REG" value={emotionalWeight.toUpperCase()} color="rgba(255,255,255,0.4)" />}
            {coins > 0     && <DataRow label="CULTURE_COINS"   value={`+${coins}c`} color={T.green} />}
          </div>
        )}
      </GlassCard>

      {sessionPhase && (
        <GlassCard color={T.cyan} noPad>
          <div style={{ padding:'14px 16px 12px' }}>
            <div style={{ fontFamily:T.fontUI, fontSize:'0.5rem', color:`${T.cyan}50`, letterSpacing:'0.18em', marginBottom:12, fontWeight:800 }}>RITUAL_PROGRESSION</div>
            <div style={{ display:'flex', gap:4 }}>
              {phases.map(phase => {
                const cur = phases.indexOf(sessionPhase as typeof phases[number]);
                const idx = phases.indexOf(phase);
                const isActive = phase === sessionPhase;
                const isPast   = idx < cur;
                const c = isActive ? T.cyan : isPast ? T.green : 'transparent';
                return (
                  <div key={phase} style={{
                    flex:1, height:36, display:'flex', flexDirection:'column',
                    alignItems:'center', justifyContent:'center', gap:3,
                    background: isActive ? `${T.cyan}12` : isPast ? `${T.green}06` : 'rgba(0,0,0,0.2)',
                    border:`1px solid ${isActive ? `${T.cyan}35` : isPast ? `${T.green}18` : 'rgba(255,255,255,0.04)'}`,
                    borderBottom:`3px solid ${c}`,
                  }}>
                    <span style={{ fontFamily:T.fontUI, fontSize:'0.44rem', letterSpacing:'0.1em', color: isActive ? T.cyan : isPast ? `${T.green}60` : 'rgba(255,255,255,0.1)', fontWeight:800 }}>
                      {phaseMap[phase]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </GlassCard>
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
  onClose, isAuthenticated = false, userEmail, pendingCoins = 0, oracleConversationRef,
}: BackendControlPanelProps) => {
  const [activeFreq, setActiveFreq] = useState<Frequency>(() => {
    const s = localStorage.getItem('oracle_crate_active_freq');
    return (s as Frequency) || 'RESONANCE';
  });
  const [prevFreqIdx, setPrevFreqIdx]         = useState(0);
  const [debugPasswordEntered, setDebugPassed]= useState(false);
  const [debugPassword, setDebugPw]           = useState('');
  const [testResults, setTestResults]         = useState<Record<string, unknown>>({});
  const [isLoading, setIsLoading]             = useState(false);
  const [showUpgradeModal, setShowUpgrade]    = useState(false);
  const [geminiInfo, setGeminiInfo]           = useState<ReturnType<OracleConversationHandle['getWsDebugInfo']> | null>(null);
  const pollRef                               = useRef<ReturnType<typeof setInterval> | null>(null);
  const supabaseUrl                           = import.meta.env.VITE_SUPABASE_URL;
  const chainFuelz                            = useChainFuelz(userEmail, pendingCoins);

  const switchFreq = (freq: Frequency) => {
    const prevIdx = FREQUENCIES.findIndex(f => f.id === activeFreq);
    setPrevFreqIdx(prevIdx);
    setActiveFreq(freq);
    localStorage.setItem('oracle_crate_active_freq', freq);
  };

  useEffect(() => {
    const m: Record<string,Frequency> = { vault:'RESONANCE', coins:'RESONANCE', gemini:'CORE_DIAG', debug:'SALVAGE', dev:'SALVAGE' };
    setActiveFreq(m[initialTab as string] ?? 'RESONANCE');
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
      const res  = await fetch(`${supabaseUrl}/functions/v1/${fn}`, { method:'POST', headers:supabaseEdgeFunctionHeaders, body:JSON.stringify(payload) });
      const data = await res.json();
      setTestResults(p => ({ ...p, [fn]: { success:res.ok, data, status:res.status, timestamp:new Date().toISOString() } }));
    } catch (err: unknown) {
      setTestResults(p => ({ ...p, [fn]: { success:false, error:(err as Error).message, timestamp:new Date().toISOString() } }));
    }
    setIsLoading(false);
  };

  if (!isVisible) return null;

  const activeIdx   = FREQUENCIES.findIndex(f => f.id === activeFreq);
  const slideDir    = activeIdx > prevFreqIdx ? 1 : -1;
  const activeColor = activeFreq === 'CORE_DIAG' ? T.cyan : activeFreq === 'SALVAGE' ? T.purple : activeFreq === 'MANIFEST' ? T.cyan : T.green;

  return (
    <>
      <motion.div
        key="enculturate-panel"
        initial={{ x: '100%', opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 26, stiffness: 220, mass: 0.9 }}
        style={{
          position: 'fixed',
          right: 0,
          top: 0,
          bottom: 0,
          width: 'min(440px, 100vw)',
          background: T.panelBg,
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          borderLeft: `1px solid rgba(0,255,136,0.14)`,
          boxShadow: '-40px 0 100px rgba(0,0,0,0.92), inset 1px 0 0 rgba(0,255,136,0.06)',
          zIndex: 150,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: T.fontUI,
          overflow: 'hidden',
        }}
        data-testid="backend-panel"
      >
        {/* Background dot field */}
        <motion.div
          animate={{ opacity:[0.05,0.11,0.05] }}
          transition={{ repeat:Infinity, duration:6, ease:'easeInOut' }}
          style={{
            position:'absolute', inset:0, pointerEvents:'none', zIndex:0,
            backgroundImage:`radial-gradient(circle at 2px 2px, rgba(0,255,136,0.2) 1px, transparent 0)`,
            backgroundSize:'24px 24px',
          }}
        />

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{
          padding: '20px 20px 0',
          flexShrink: 0, zIndex: 5, position: 'relative',
          background: 'rgba(0,1,10,0.55)',
          backdropFilter: 'blur(20px)',
        }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
            <div>
              <div style={{
                fontFamily: T.fontHeader, fontSize:'1.7rem', fontWeight:900,
                letterSpacing:'0.04em', lineHeight:1.0,
                background:`linear-gradient(100deg, ${T.green} 0%, ${T.cyan} 100%)`,
                WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text',
              }}>SURROGATE:ORACLE</div>
              <div style={{
                fontFamily:T.fontUI, fontSize:'0.52rem', fontWeight:800,
                color:'rgba(0,255,204,0.38)', letterSpacing:'0.24em', marginTop:5,
              }}>ENCULTURATE CRATE · {FREQUENCIES.find(f=>f.id===activeFreq)?.mhz}MHz</div>
            </div>

            <div style={{ display:'flex', alignItems:'center', gap:10, paddingTop:4 }}>
              {sessionId && (
                <div style={{ fontFamily:T.fontData, fontSize:'0.46rem', color:'rgba(0,255,204,0.25)', letterSpacing:'0.12em' }}>
                  SID:{sessionId.slice(-6).toUpperCase()}
                </div>
              )}
              <motion.div
                animate={{ opacity:[1,0.2,1], scale:[1,1.3,1] }}
                transition={{ repeat:Infinity, duration:1.6 }}
                style={{ width:8, height:8, borderRadius:'50%', background:T.green, boxShadow:`0 0 10px ${T.green}` }}
              />
              {onClose && (
                <motion.button
                  onClick={onClose}
                  whileHover={{ scale:1.2 }} whileTap={{ scale:0.9 }}
                  style={{
                    background:`rgba(255,255,255,0.04)`, border:`1px solid rgba(255,255,255,0.1)`,
                    borderRadius:'50%', color:'rgba(255,255,255,0.4)', cursor:'pointer',
                    padding:'7px', display:'flex', alignItems:'center', justifyContent:'center',
                  }}
                >
                  <X size={14} />
                </motion.button>
              )}
            </div>
          </div>

          {/* Active freq glow bar */}
          <motion.div
            key={activeFreq}
            initial={{ scaleX:0 }}
            animate={{ scaleX:1 }}
            style={{
              height:2, background:`linear-gradient(90deg, transparent, ${activeColor}, transparent)`,
              marginBottom:0, transformOrigin:'left',
            }}
            transition={{ duration:0.4, ease:'easeOut' }}
          />
        </div>

        {/* ── Frequency Nav (bottom of header) ────────────────────────────── */}
        <div style={{
          display:'flex',
          background:'rgba(0,0,6,0.6)',
          backdropFilter:'blur(16px)',
          borderBottom:`1px solid rgba(0,255,136,0.07)`,
          overflowX:'auto', scrollbarWidth:'none',
          zIndex:4, flexShrink:0,
          padding:'0 4px',
        }}>
          {FREQUENCIES.map((freq) => {
            const isActive = activeFreq === freq.id;
            const c = freq.id === 'CORE_DIAG' ? T.cyan : freq.id === 'SALVAGE' ? T.purple : freq.id === 'MANIFEST' ? T.cyan : T.green;
            const testId =
                freq.id==='RESONANCE' ? 'tab-vault'
              : freq.id==='SQUAD'     ? 'tab-squad'
              : freq.id==='PRINTS'    ? 'tab-portraits'
              : freq.id==='CORE_DIAG' ? 'tab-gemini'
              : freq.id==='SALVAGE'   ? 'tab-dev'
              : 'tab-manifest';
            return (
              <motion.button
                key={freq.id}
                data-testid={testId}
                onClick={() => switchFreq(freq.id)}
                whileHover={{ backgroundColor:`${c}06` }}
                whileTap={{ scale:0.94 }}
                style={{
                  padding: '12px 10px 10px',
                  background: isActive ? `${c}08` : 'none',
                  border: 'none',
                  borderBottom: `3px solid ${isActive ? c : 'transparent'}`,
                  color: isActive ? c : 'rgba(255,255,255,0.18)',
                  cursor: 'pointer',
                  display: 'flex', flexDirection:'column', alignItems:'center', gap:4,
                  minWidth: '62px', flexShrink: 0,
                  transition: 'color 0.15s, background 0.15s',
                  position: 'relative',
                }}
              >
                {isActive && (
                  <motion.div
                    layoutId="freq-glow"
                    style={{
                      position:'absolute', bottom:-1, left:'10%', right:'10%', height:3,
                      background:`linear-gradient(90deg, transparent, ${c}, transparent)`,
                      filter:`blur(3px)`,
                    }}
                    transition={{ type:'spring', damping:30, stiffness:300 }}
                  />
                )}
                <freq.Icon size={16} style={{ opacity: isActive ? 1 : 0.22, filter: isActive ? `drop-shadow(0 0 6px ${c})` : 'none' }} />
                <span style={{ fontFamily:T.fontUI, fontSize:'0.44rem', letterSpacing:'0.1em', fontWeight:800, opacity: isActive ? 0.9 : 0.28 }}>
                  {freq.label}
                </span>
              </motion.button>
            );
          })}
        </div>

        {/* ── Content pane ────────────────────────────────────────────────── */}
        <div style={{ flex:1, overflowY:'auto', overflowX:'hidden', position:'relative', zIndex:3 }}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeFreq}
              initial={{ x: slideDir * 48, opacity: 0, filter:'blur(4px)' }}
              animate={{ x: 0, opacity: 1, filter:'blur(0px)' }}
              exit={{ x: -slideDir * 40, opacity: 0, filter:'blur(6px)' }}
              transition={{ type:'spring', damping:28, stiffness:280, mass:0.8 }}
              style={{ padding:'18px 16px', display:'flex', flexDirection:'column', gap:14 }}
            >

              {/* ── RESONANCE ─────────────────────────────────────────── */}
              {activeFreq === 'RESONANCE' && (
                userId ? (
                  <>
                    <GlassCard color={T.green}>
                      <CultureCoinDisplay userId={userId} onLevelUp={(l,t) => console.log(`Level ${l}: ${t}`)} />
                    </GlassCard>

                    <GlassCard color={T.green} glitchy={chainFuelz.isMinting}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
                        <CardTitle label="NEURAL RESONANCE" color={T.green} sub="VAULT FREQUENCY" />
                        <StatBadge label={chainFuelz.isMinting ? 'SYNCING' : 'STABLE'} ok={!chainFuelz.isMinting} warn={chainFuelz.isMinting} />
                      </div>

                      {chainFuelz.isInitialized ? (
                        <>
                          <div style={{ fontFamily:T.fontUI, fontSize:'0.52rem', color:`${T.cyan}60`, marginBottom:8, letterSpacing:'0.14em', fontWeight:700 }}>VAULT_SIGNATURE</div>
                          <div style={{
                            fontFamily:T.fontData, fontSize:'0.88rem', color:'rgba(255,255,255,0.9)',
                            background:`${T.green}06`, padding:'12px 14px',
                            border:`1px solid ${T.green}15`, borderLeft:`3px solid ${T.green}50`,
                            borderRadius:'2px 10px 2px 10px',
                            letterSpacing:'0.04em',
                          }}>{chainFuelz.vaultHandle}</div>
                          <div style={{
                            marginTop:16, padding:'14px 16px',
                            background:T.glassDark,
                            border:`1px solid rgba(255,255,255,0.04)`,
                            borderRadius:'2px 10px 2px 10px',
                            display:'flex', justifyContent:'space-between', alignItems:'center',
                          }}>
                            <span style={{ fontFamily:T.fontUI, fontSize:'0.55rem', color:'rgba(255,255,255,0.35)', letterSpacing:'0.12em', fontWeight:700 }}>SIGNAL_STRENGTH</span>
                            <span style={{ fontFamily:T.fontData, fontSize:'1.4rem', color:T.green, fontWeight:700, textShadow:`0 0 20px ${T.green}` }}>{chainFuelz.balance}</span>
                          </div>
                        </>
                      ) : (
                        <div style={{ padding:'28px 0', textAlign:'center', fontFamily:T.fontUI, color:T.cyan, fontSize:'0.65rem', opacity:0.4 }}>
                          RECOVERING VAULT FREQUENCY...
                        </div>
                      )}
                    </GlassCard>

                    <motion.button
                      onClick={() => setShowUpgrade(true)}
                      whileHover={{ scale:1.02, boxShadow:`0 0 40px ${T.purple}40` }}
                      whileTap={{ scale:0.98 }}
                      style={{
                        padding:'16px 18px',
                        background:`linear-gradient(135deg, rgba(22,0,50,0.92), rgba(176,38,255,0.6))`,
                        border:`1px solid ${T.purple}40`,
                        borderLeft:`3px solid ${T.purple}`,
                        borderRadius:'3px 18px 3px 18px',
                        color:'rgba(255,255,255,0.92)',
                        fontFamily:T.fontHeader, fontSize:'1rem', fontWeight:900, letterSpacing:'0.1em',
                        cursor:'pointer',
                        boxShadow:`0 4px 28px rgba(0,0,0,0.6), 0 0 30px ${T.purple}18`,
                        backdropFilter:'blur(12px)',
                      }}
                    >UPGRADE_CONSCIOUSNESS</motion.button>
                  </>
                ) : (
                  <GlassCard color={T.green}>
                    <Learn2EarnInterface userId={sessionId||'anonymous'} navigateToDebug={() => switchFreq('SALVAGE')} />
                  </GlassCard>
                )
              )}

              {/* ── SQUAD ─────────────────────────────────────────────── */}
              {activeFreq === 'SQUAD' && (
                <GlassCard color={T.green}>
                  <Learn2EarnInterface userId={userId||sessionId||'anonymous'} navigateToDebug={() => switchFreq('SALVAGE')} />
                </GlassCard>
              )}

              {/* ── PRINTS ────────────────────────────────────────────── */}
              {activeFreq === 'PRINTS' && (
                <GlassCard color={T.cyan} noPad>
                  <div style={{ padding:'18px 16px' }}>
                    <PortraitGalleryDashboard userId={userId} userEmail={userEmail} sessionId={sessionId} maxPortraits={20} isBackendCabinetTab />
                  </div>
                </GlassCard>
              )}

              {/* ── CORE_DIAG ─────────────────────────────────────────── */}
              {activeFreq === 'CORE_DIAG' && (
                <GlassCard color={T.cyan}>
                  <div style={{ position:'absolute', opacity:0, pointerEvents:'none' }}>WEBSOCKET WS STATE VERTEX</div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
                    <CardTitle label="GEMINI LIVE" color={T.cyan} sub="CORE DIAGNOSTICS" />
                    {geminiInfo && <Oscilloscope rms={(geminiInfo as Record<string,number>).lastVadRms ?? 0} />}
                  </div>

                  {geminiInfo ? (
                    <>
                      <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginBottom:16 }}>
                        <StatBadge label={geminiInfo.wsState===1 ? 'WS_OPEN' : 'WS_DISRUPTED'} ok={geminiInfo.wsState===1} />
                        <StatBadge label="FREE_TIER" ok={false} warn />
                      </div>

                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
                        {([
                          ['TURNS',     String(geminiInfo.turnCount)],
                          ['AUDIO_IN',  String(geminiInfo.audioChunksReceived)],
                          ['AUDIO_OUT', String((geminiInfo as Record<string,unknown>).audioChunksSent ?? '—')],
                          ['VAD_RMS',   String((geminiInfo as Record<string,number>).lastVadRms?.toFixed(4) ?? '0.0000')],
                        ] as [string,string][]).map(([k,v]) => <MetricBlock key={k} label={k} value={v} />)}
                      </div>

                      <TerminalStream lines={geminiInfo.recentMessages} label="SIGNAL_STREAM" />
                    </>
                  ) : (
                    <div style={{ padding:'50px 0', textAlign:'center', fontFamily:T.fontUI, color:'rgba(255,255,255,0.12)', fontSize:'0.68rem', letterSpacing:'0.2em' }}>
                      WAITING FOR CORE UPLINK...
                    </div>
                  )}
                </GlassCard>
              )}

              {/* ── SALVAGE ───────────────────────────────────────────── */}
              {activeFreq === 'SALVAGE' && (
                !debugPasswordEntered ? (
                  <GlassCard color={T.purple}>
                    <div style={{ textAlign:'center', padding:'32px 0' }} data-testid="dev-gate-container">
                      <div style={{
                        fontFamily:T.fontHeader, fontSize:'1.2rem', color:T.purple,
                        marginBottom:8, letterSpacing:'0.16em',
                        textShadow:`0 0 30px ${T.purple}`,
                      }}>ACCESS_RESTRICTED</div>
                      <div style={{ fontFamily:T.fontUI, fontSize:'0.52rem', color:`${T.purple}50`, letterSpacing:'0.18em', marginBottom:24 }}>
                        SALVAGE BAY CLEARANCE REQUIRED
                      </div>
                      <input
                        type="password"
                        value={debugPassword}
                        onChange={e => setDebugPw(e.target.value)}
                        onKeyDown={e => e.key==='Enter' && (debugPassword==='3nculturate!' ? setDebugPassed(true) : null)}
                        placeholder="INPUT_DECRYPTION_KEY"
                        data-testid="debug-password-input"
                        style={{
                          width:'100%', background:T.glassDark, boxSizing:'border-box',
                          border:`1px solid ${T.purple}30`, borderLeft:`3px solid ${T.purple}60`,
                          borderRadius:'2px 10px 2px 10px',
                          padding:'13px 14px', color:T.purple,
                          fontFamily:T.fontData, fontSize:'0.9rem',
                          textAlign:'center', marginBottom:16, outline:'none',
                          letterSpacing:'0.18em',
                        }}
                      />
                      <motion.button
                        onClick={() => { if (debugPassword==='3nculturate!') setDebugPassed(true); }}
                        whileHover={{ scale:1.04, boxShadow:`0 0 30px ${T.purple}40` }}
                        whileTap={{ scale:0.97 }}
                        data-testid="debug-access-btn"
                        style={{
                          padding:'13px 28px',
                          background:`${T.purple}12`,
                          border:`2px solid ${T.purple}`,
                          borderRadius:'3px 14px 3px 14px',
                          color:T.purple, cursor:'pointer',
                          fontFamily:T.fontHeader, fontSize:'1rem', fontWeight:900, letterSpacing:'0.12em',
                          boxShadow:`0 0 20px ${T.purple}20`,
                        }}
                      >DECRYPT</motion.button>
                    </div>
                  </GlassCard>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                    <div style={{ position:'absolute', opacity:0, pointerEvents:'none' }}>SUPABASE CHAINFUELZ EDGE FUNCTION</div>

                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <motion.div animate={{ opacity:[0.5,1,0.5] }} transition={{ repeat:Infinity, duration:1.2 }}
                        style={{ width:7, height:7, borderRadius:'50%', background:T.green, boxShadow:`0 0 8px ${T.green}` }} />
                      <span style={{ fontFamily:T.fontData, fontSize:'0.68rem', color:T.green, letterSpacing:'0.14em', fontWeight:700 }}>›_ROOT_SHELL_ACTIVE</span>
                    </div>

                    {/* Prod Log Bridge */}
                    <GlassCard color={T.cyan}>
                      <CardTitle label="PROD LOG BRIDGE" color={T.cyan} sub="LIVE PRODUCTION TELEMETRY" />
                      <ProdLogViewer />
                    </GlassCard>

                    {/* System recovery */}
                    <GlassCard color={T.purple}>
                      <CardTitle label="SYSTEM RECOVERY" color={T.purple} sub="EDGE FUNCTION DIAGNOSTICS" />
                      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                        {[
                          ['RUN_ORACLE_HEALTH', 'oracle-conversation'],
                          ['SYNC_COIN_METRICS', 'culture-coin-manager'],
                        ].map(([label, fn]) => {
                          const res = testResults[fn] as { success?: boolean; status?: number; timestamp?: string } | undefined;
                          return (
                            <div key={fn}>
                              <motion.button
                                onClick={() => testEdgeFunction(fn)}
                                whileHover={{ backgroundColor:`${T.purple}14`, scale:1.01 }}
                                whileTap={{ scale:0.98 }}
                                style={{
                                  width:'100%', padding:'13px 14px', textAlign:'left', cursor:'pointer',
                                  background:`${T.purple}08`,
                                  border:`1px solid ${T.purple}25`, borderLeft:`3px solid ${T.purple}60`,
                                  borderRadius:'2px 10px 2px 10px',
                                  color: T.purple,
                                  fontFamily:T.fontUI, fontSize:'0.62rem', fontWeight:800, letterSpacing:'0.1em',
                                  display:'flex', alignItems:'center', justifyContent:'space-between',
                                }}
                              >
                                <span>{label}</span>
                                {isLoading && <motion.div animate={{ rotate:360 }} transition={{ repeat:Infinity, duration:0.8, ease:'linear' }}><RefreshCw size={11} /></motion.div>}
                              </motion.button>
                              {res && (
                                <div style={{
                                  marginTop:5, padding:'8px 12px',
                                  background:`${res.success ? T.green : T.red}08`,
                                  border:`1px solid ${res.success ? T.green : T.red}20`,
                                  borderRadius:'2px 8px 2px 8px',
                                  fontFamily:T.fontData, fontSize:'0.54rem',
                                  color: res.success ? T.green : T.red,
                                  letterSpacing:'0.08em',
                                }}>
                                  {res.success ? '✓ ' : '✗ '}STATUS:{res.status} · {res.timestamp?.slice(11,19)}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </GlassCard>
                  </div>
                )
              )}

              {/* ── MANIFEST ──────────────────────────────────────────── */}
              {activeFreq === 'MANIFEST' && <ManifestPanel pendingCoins={pendingCoins} />}

            </motion.div>
          </AnimatePresence>
        </div>

        {/* Bottom safe area */}
        <div style={{ height:'env(safe-area-inset-bottom, 0px)', background:'rgba(0,1,10,0.4)', flexShrink:0 }} />
      </motion.div>

      {showUpgradeModal && userId && (
        <InlineSubscriptionModal
          isOpen={showUpgradeModal}
          onClose={() => setShowUpgrade(false)}
          userId={userId}
          context="engage-further"
          onUpgradeSuccess={tier => { console.log('Upgraded:', tier); setShowUpgrade(false); }}
        />
      )}
    </>
  );
};
