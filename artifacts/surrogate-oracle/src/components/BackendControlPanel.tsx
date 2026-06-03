/**
 * BackendControlPanel — ENCULTURATE CRATE
 * Aesthetic: SURROGATE rift-construct visual language.
 * Frequencies: RESONANCE · SQUAD · PRINTS · CORE_DIAG · SALVAGE · M4NIFST
 */
import { useState, useEffect, useRef, RefObject } from 'react';
import { X, Wallet, Cpu } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { CultureCoinDisplay } from './CultureCoinDisplay';
import { InlineSubscriptionModal } from './InlineSubscriptionModal';
import { PortraitGalleryDashboard } from './PortraitGalleryDashboard';
import { Learn2EarnInterface } from './Learn2EarnInterface';
import { supabaseEdgeFunctionHeaders } from '../lib/supabase';
import { useChainFuelz } from '../hooks/useChainFuelz';
import type { OracleConversationHandle } from './OracleConversation';

type Frequency = 'RESONANCE' | 'SQUAD' | 'PRINTS' | 'CORE_DIAG' | 'SALVAGE' | 'MANIFEST';

const FREQUENCIES: { id: Frequency; label: string; mhz: string; glyph: string }[] = [
  { id: 'RESONANCE', label: 'RESONANCE', mhz: '108.4', glyph: '◈' },
  { id: 'SQUAD',     label: 'SQUAD',     mhz: '112.8', glyph: '⬡' },
  { id: 'PRINTS',    label: 'PRINTS',    mhz: '124.2', glyph: '◻' },
  { id: 'CORE_DIAG', label: 'CORE_DIAG', mhz: '142.0', glyph: '⬢' },
  { id: 'SALVAGE',   label: 'SALVAGE',   mhz: '158.6', glyph: '⌘' },
  { id: 'MANIFEST',  label: 'M4NIFST',   mhz: '188.4', glyph: '⊞' },
];

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  green:      '#00ff88',
  cyan:       '#00ffcc',
  purple:     '#b026ff',
  fontHeader: "'aAnotherTag', sans-serif",
  fontUI:     "'PhillySans', monospace",
  fontData:   "'Share Tech Mono', monospace",
  glass:      'rgba(0,4,14,0.72)',
  glassBg:    'rgba(0,4,14,0.55)',
  panelBg:    'linear-gradient(170deg, rgba(0,0,6,0.97) 0%, rgba(1,0,16,0.99) 100%)',
  border:     (c: string) => `1px solid ${c}28`,
  borderL:    (c: string) => `2px solid ${c}55`,
  insetGlow:  (c: string) => `inset 0 0 18px ${c}08`,
  shadow:     '0 4px 24px rgba(0,0,0,0.7)',
} as const;

// ── SignalFragment ─────────────────────────────────────────────────────────────
function SignalFragment({
  children,
  glowColor = T.green,
  style,
  glitchy = false,
}: {
  children: React.ReactNode;
  glowColor?: string;
  style?: React.CSSProperties;
  glitchy?: boolean;
}) {
  return (
    <motion.div
      animate={glitchy ? { x: [0, -1, 1, 0], opacity: [1, 0.9, 1], filter: ['none', 'hue-rotate(8deg)', 'none'] } : {}}
      transition={glitchy ? { repeat: Infinity, duration: 0.15, repeatDelay: 5 } : {}}
      style={{
        background: T.glassBg,
        backdropFilter: 'blur(8px) saturate(1.8)',
        border: T.border(glowColor),
        borderLeft: T.borderL(glowColor),
        borderRadius: '2px 12px 2px 12px',
        boxShadow: `${T.shadow}, ${T.insetGlow(glowColor)}`,
        padding: 16,
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* Corner bracket marks */}
      <div style={{ position:'absolute', top:5, left:5, width:8, height:2, background:glowColor, opacity:0.55, pointerEvents:'none' }} />
      <div style={{ position:'absolute', top:5, left:5, width:2, height:8, background:glowColor, opacity:0.55, pointerEvents:'none' }} />
      <div style={{ position:'absolute', bottom:5, right:5, width:8, height:2, background:glowColor, opacity:0.35, pointerEvents:'none' }} />
      <div style={{ position:'absolute', bottom:5, right:5, width:2, height:8, background:glowColor, opacity:0.35, pointerEvents:'none' }} />
      <div style={{ position:'relative', zIndex:1 }}>{children}</div>
    </motion.div>
  );
}

// ── SectionTitle — aAnotherTag headers ────────────────────────────────────────
function SectionTitle({ icon, label, color = T.green }: { icon?: React.ReactNode; label: string; color?: string }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
      {icon && <span style={{ color, opacity:0.9 }}>{icon}</span>}
      <span style={{
        fontFamily: T.fontHeader,
        fontSize: '0.95rem',
        fontWeight: 900,
        letterSpacing: '0.06em',
        background: `linear-gradient(90deg, ${color}, ${color === T.purple ? '#d060ff' : T.cyan})`,
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
      }}>{label}</span>
    </div>
  );
}

// ── SignalTag ──────────────────────────────────────────────────────────────────
function SignalTag({ label, ok, warn }: { label: string; ok: boolean; warn?: boolean }) {
  const c = warn ? T.purple : ok ? T.green : T.cyan;
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:5,
      padding:'3px 9px',
      background:'rgba(0,0,0,0.45)',
      border:`1px solid ${c}30`, borderLeft:`2px solid ${c}`,
      fontSize:'0.5rem', letterSpacing:'0.14em', color:c,
      fontFamily: T.fontUI, fontWeight:700,
    }}>{label}</span>
  );
}

// ── DataCell — CORE_DIAG metric blocks ────────────────────────────────────────
function DataCell({ label, value, color = T.cyan }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      background:'rgba(0,0,0,0.5)',
      border:`1px solid ${color}18`,
      borderBottom:`2px solid ${color}30`,
      padding:'10px 12px',
    }}>
      <div style={{ fontFamily:T.fontUI, color, fontSize:'0.48rem', letterSpacing:'0.14em', marginBottom:5, opacity:0.7 }}>{label}</div>
      <div style={{ fontFamily:T.fontData, color:'rgba(255,255,255,0.9)', fontSize:'0.78rem', fontWeight:700 }}>{value}</div>
    </div>
  );
}

// ── Oscilloscope ──────────────────────────────────────────────────────────────
function Oscilloscope({ rms }: { rms: number }) {
  const pts = 14;
  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:2, height:22, padding:'0 2px' }}>
      {Array.from({ length: pts }).map((_, i) => {
        const h = Math.max(2, rms * 100 * (0.4 + Math.random() * 0.6));
        return (
          <motion.div key={i}
            animate={{ height:[h*0.8, h, h*0.85] }}
            transition={{ repeat:Infinity, duration:0.08 + Math.random()*0.25 }}
            style={{ width:3, background: i % 3 === 0 ? T.green : T.cyan, opacity:0.5 + (i/pts)*0.5 }}
          />
        );
      })}
    </div>
  );
}

// ── TerminalLog ───────────────────────────────────────────────────────────────
function TerminalLog({ lines, label }: { lines: string[]; label: string }) {
  return (
    <div style={{ marginTop:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
        <span style={{ fontFamily:T.fontUI, fontSize:'0.48rem', color:T.cyan, letterSpacing:'0.15em', fontWeight:800 }}>{label}</span>
        <button
          onClick={() => navigator.clipboard.writeText(lines.join('\n'))}
          style={{ background:'none', border:'none', color:T.green, fontSize:'0.46rem', cursor:'pointer', opacity:0.45, fontFamily:T.fontUI }}
        >COPY</button>
      </div>
      <div style={{
        background:'rgba(0,0,0,0.55)',
        border:`1px solid rgba(0,255,136,0.12)`,
        borderRadius:'2px 8px 2px 8px',
        padding:'8px 10px', maxHeight:130, overflowY:'auto',
        fontFamily:T.fontData, fontSize:'0.58rem', color:T.green, lineHeight:1.75,
      }}>
        {lines.length === 0
          ? <span style={{ color:'rgba(255,255,255,0.15)', fontStyle:'italic' }}>— NO_SIGNAL —</span>
          : lines.map((l,i) => <div key={i}>{l}</div>)
        }
      </div>
    </div>
  );
}

// ── ArtifactRow ───────────────────────────────────────────────────────────────
function ArtifactRow({ label, value, color = T.cyan }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      display:'flex', justifyContent:'space-between', alignItems:'center',
      padding:'8px 12px', marginBottom:5,
      background:'rgba(0,0,0,0.38)',
      border:`1px solid ${color}14`, borderLeft:`2px solid ${color}44`,
    }}>
      <span style={{ fontFamily:T.fontUI, fontSize:'0.48rem', color:'rgba(255,255,255,0.3)', letterSpacing:'0.16em' }}>{label}</span>
      <span style={{ fontFamily:T.fontData, fontSize:'0.7rem', color, fontWeight:700, letterSpacing:'0.08em' }}>{value}</span>
    </div>
  );
}

// ── ManifestPanel ─────────────────────────────────────────────────────────────
function ManifestPanel({ pendingCoins }: { pendingCoins: number }) {
  const [alignment, setAlignment]   = useState<string | null>(null);
  const [archetype, setArchetype]   = useState<string | null>(null);
  const [totemLevel, setTotemLevel] = useState(0);
  const [sessionPhase, setPhase]    = useState<string | null>(null);
  const [emotionalWeight, setEmo]   = useState<string | null>(null);
  const [coins, setCoins]           = useState(pendingCoins);

  useEffect(() => { setCoins(pendingCoins); }, [pendingCoins]);

  useEffect(() => {
    const onScore = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (d.sessionPhase)          setPhase(d.sessionPhase);
      if (typeof d.totemLevel === 'number') setTotemLevel(d.totemLevel);
      if (d.archetypeTitle)        setArchetype(d.archetypeTitle);
      if (d.emotionalWeight)       setEmo(d.emotionalWeight);
    };
    const onAlign   = (e: Event) => { const d = (e as CustomEvent).detail||{}; if (d.alignment) setAlignment(d.alignment); };
    const onArtifact= (e: Event) => { const d = (e as CustomEvent).detail||{}; if (d.archetypeTitle) setArchetype(d.archetypeTitle); };
    const onTotem   = (e: Event) => { const d = (e as CustomEvent).detail||{}; if (typeof d.totemLevel === 'number') setTotemLevel(d.totemLevel); };
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
  const phaseMap: Record<string,string> = { claim:'CLAIM', evidence:'EVIDENCE', cost:'COST', mirror:'MIRROR' };
  const phases = ['claim','evidence','cost','mirror'] as const;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <SignalFragment glowColor={T.cyan}>
        <SectionTitle label="SESSION MANIFEST" color={T.cyan} icon="⊞" />
        {!hasData ? (
          <div style={{ padding:'28px 0', textAlign:'center' }}>
            <motion.div
              animate={{ opacity:[0.25,0.65,0.25] }}
              transition={{ repeat:Infinity, duration:2.6 }}
              style={{ fontFamily:T.fontData, fontSize:'0.58rem', color:T.cyan, letterSpacing:'0.2em' }}
            >AWAITING_ORACLE_SESSION</motion.div>
            <div style={{ marginTop:10, fontFamily:T.fontUI, fontSize:'0.46rem', color:'rgba(0,255,204,0.25)', letterSpacing:'0.14em' }}>
              ARTIFACTS ACCUMULATE AS THE RITUAL UNFOLDS
            </div>
          </div>
        ) : (
          <>
            {alignment     && <ArtifactRow label="SIGNAL_ALIGNMENT" value={alignment.toUpperCase()} color={alignColor} />}
            {archetype     && <ArtifactRow label="ARCHETYPE_TITLE"  value={archetype.toUpperCase()} color={T.green} />}
            {totemLevel > 0 && <ArtifactRow label="TOTEM_LEVEL"    value={Array(totemLevel).fill('◈').join(' ')} color={T.cyan} />}
            {sessionPhase  && <ArtifactRow label="RITUAL_PHASE"    value={phaseMap[sessionPhase] ?? sessionPhase.toUpperCase()} color={T.cyan} />}
            {emotionalWeight && <ArtifactRow label="EMOTIONAL_REG" value={emotionalWeight.toUpperCase()} color="rgba(255,255,255,0.45)" />}
            {coins > 0     && <ArtifactRow label="CULTURE_COINS"   value={`+${coins}c`} color={T.green} />}
          </>
        )}
      </SignalFragment>

      {sessionPhase && (
        <SignalFragment glowColor={T.cyan} style={{ padding:'12px 14px' }}>
          <div style={{ fontFamily:T.fontUI, fontSize:'0.46rem', color:'rgba(0,255,204,0.4)', letterSpacing:'0.16em', marginBottom:10 }}>
            RITUAL_PROGRESSION
          </div>
          <div style={{ display:'flex', gap:4 }}>
            {phases.map(phase => {
              const cur = phases.indexOf(sessionPhase as typeof phases[number]);
              const idx = phases.indexOf(phase);
              const isActive = phase === sessionPhase;
              const isPast   = idx < cur;
              const c = isActive ? T.cyan : isPast ? T.green : 'transparent';
              return (
                <div key={phase} style={{
                  flex:1, height:26, display:'flex', flexDirection:'column',
                  alignItems:'center', justifyContent:'center', gap:3,
                  background: isActive ? 'rgba(0,255,204,0.1)' : isPast ? 'rgba(0,255,136,0.05)' : 'rgba(0,0,0,0.25)',
                  border:`1px solid ${isActive ? 'rgba(0,255,204,0.3)' : isPast ? 'rgba(0,255,136,0.15)' : 'rgba(255,255,255,0.04)'}`,
                  borderBottom:`2px solid ${c}`,
                }}>
                  <span style={{ fontFamily:T.fontUI, fontSize:'0.36rem', letterSpacing:'0.1em', color: isActive ? T.cyan : isPast ? 'rgba(0,255,136,0.45)' : 'rgba(255,255,255,0.12)' }}>
                    {phaseMap[phase]}
                  </span>
                </div>
              );
            })}
          </div>
        </SignalFragment>
      )}
    </div>
  );
}

// ── Props / Main Component ────────────────────────────────────────────────────
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

export const BackendControlPanel = ({
  userId, sessionId, isVisible = true, initialTab = 'vault',
  onClose, isAuthenticated = false, userEmail, pendingCoins = 0, oracleConversationRef,
}: BackendControlPanelProps) => {
  const [activeFreq, setActiveFreq] = useState<Frequency>(() => {
    const s = localStorage.getItem('oracle_crate_active_freq');
    return (s as Frequency) || 'RESONANCE';
  });
  const [debugPasswordEntered, setDebugPasswordEntered] = useState(false);
  const [debugPassword, setDebugPassword] = useState('');
  const [testResults, setTestResults] = useState<Record<string, unknown>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [geminiInfo, setGeminiInfo] = useState<ReturnType<OracleConversationHandle['getWsDebugInfo']> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const chainFuelz = useChainFuelz(userEmail, pendingCoins);
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  useEffect(() => { localStorage.setItem('oracle_crate_active_freq', activeFreq); }, [activeFreq]);

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

  const activeFreqDef = FREQUENCIES.find(f => f.id === activeFreq);

  return (
    <>
      <motion.div
        initial={{ x:'100%', opacity:0 }}
        animate={{ x:0, opacity:1 }}
        exit={{ x:'100%', opacity:0 }}
        transition={{ type:'spring', damping:30, stiffness:240 }}
        style={{
          position:'fixed', right:0, top:0, bottom:0,
          width:'min(400px, 92vw)',
          background: T.panelBg,
          borderLeft:`2px solid rgba(0,255,136,0.18)`,
          boxShadow:'-32px 0 80px rgba(0,0,0,0.88), inset 0 0 40px rgba(0,255,136,0.025)',
          zIndex:150,
          display:'flex', flexDirection:'column',
          fontFamily: T.fontUI,
          overflowY:'hidden',
          transformOrigin:'right center',
        }}
        data-testid="backend-panel"
      >
        {/* Scanline — matches neural-link-terminal pattern */}
        <div style={{
          position:'absolute', inset:0, pointerEvents:'none', zIndex:0,
          backgroundImage:'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,136,0.014) 2px, rgba(0,255,136,0.014) 4px)',
        }} />

        {/* Radial rift dot field */}
        <motion.div
          animate={{ opacity:[0.06, 0.12, 0.06] }}
          transition={{ repeat:Infinity, duration:5, ease:'easeInOut' }}
          style={{
            position:'absolute', inset:0, pointerEvents:'none', zIndex:0,
            backgroundImage:`radial-gradient(circle at 2px 2px, rgba(0,255,136,0.18) 1px, transparent 0)`,
            backgroundSize:'22px 22px',
          }}
        />

        {/* HUD corner brackets */}
        {[[6,6,'top','left'],[6,6,'top','right'],[6,6,'bottom','left'],[6,6,'bottom','right']].map((_,i) => {
          const t = i < 2 ? {top:6} : {bottom:6};
          const s = i%2===0 ? {left:6} : {right:6};
          const c = i%2===0 ? T.green : T.cyan;
          const o = i < 2 ? 0.45 : 0.28;
          return [
            <div key={`h${i}`} style={{ position:'absolute', ...t as any, ...s as any, width:16, height:2, background:c, opacity:o, zIndex:2, pointerEvents:'none' }} />,
            <div key={`v${i}`} style={{ position:'absolute', ...t as any, ...s as any, width:2, height:16, background:c, opacity:o, zIndex:2, pointerEvents:'none' }} />,
          ];
        })}

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{
          padding:'18px 20px 0', flexShrink:0, zIndex:5, position:'relative',
          background:'rgba(0,0,4,0.6)', backdropFilter:'blur(18px)',
          borderBottom:'1px solid rgba(0,255,136,0.08)',
        }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
            <div>
              <div style={{
                fontFamily: T.fontHeader,
                fontSize:'1.28rem', fontWeight:900, letterSpacing:'0.06em', lineHeight:1.1,
                background:`linear-gradient(90deg, ${T.green}, ${T.cyan})`,
                WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text',
              }}>SURROGATE:ORACLE</div>
              <div style={{ fontFamily:T.fontUI, fontSize:'0.48rem', fontWeight:800, color:'rgba(0,255,204,0.45)', letterSpacing:'0.22em', marginTop:4 }}>
                ENCULTURATE CRATE
              </div>
            </div>

            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                <motion.div
                  animate={{ opacity:[1,0.2,1], scale:[1,1.2,1] }}
                  transition={{ repeat:Infinity, duration:1.5 }}
                  style={{ width:6, height:6, borderRadius:'50%', background:T.green, boxShadow:`0 0 8px ${T.green}` }}
                />
                <span style={{ fontFamily:T.fontUI, fontSize:'0.44rem', color:T.green, letterSpacing:'0.2em', fontWeight:900 }}>LIVE</span>
              </div>
              {onClose && (
                <motion.button
                  onClick={onClose}
                  whileHover={{ scale:1.2, color:T.green }}
                  style={{ background:'none', border:'none', color:'rgba(255,255,255,0.22)', cursor:'pointer', padding:'4px 5px', lineHeight:1 }}
                >
                  <X size={15} />
                </motion.button>
              )}
            </div>
          </div>

          {/* Telemetry band */}
          <div style={{
            display:'flex', gap:10, alignItems:'center',
            padding:'5px 0 10px',
            borderTop:'1px solid rgba(0,255,136,0.06)',
            fontFamily:T.fontData, fontSize:'0.46rem', letterSpacing:'0.12em',
          }}>
            <span style={{ color:'rgba(0,255,136,0.3)' }}>FREQ</span>
            <span style={{ color:T.cyan, fontWeight:700 }}>{activeFreqDef?.mhz}MHz</span>
            <span style={{ color:'rgba(255,255,255,0.1)' }}>·</span>
            <span style={{ color:'rgba(0,255,136,0.3)' }}>BAND</span>
            <span style={{ color:T.green, fontWeight:700 }}>{activeFreqDef?.label}</span>
            {sessionId && <>
              <span style={{ color:'rgba(255,255,255,0.1)' }}>·</span>
              <span style={{ color:'rgba(0,255,204,0.28)' }}>SID:{sessionId.slice(-6).toUpperCase()}</span>
            </>}
            <span style={{ marginLeft:'auto', color:'rgba(0,255,136,0.2)' }}>◈ XR_v2.0</span>
          </div>
        </div>

        {/* ── Frequency Tuner ─────────────────────────────────────────────── */}
        <div style={{
          display:'flex',
          background:'rgba(0,0,2,0.55)',
          borderBottom:'1px solid rgba(0,255,136,0.07)',
          overflowX:'auto', scrollbarWidth:'none',
          padding:'0 4px', zIndex:4, flexShrink:0,
        }}>
          {FREQUENCIES.map(freq => {
            const isActive = activeFreq === freq.id;
            const testId =
                freq.id==='RESONANCE' ? 'tab-vault'
              : freq.id==='SQUAD'     ? 'tab-squad'
              : freq.id==='PRINTS'    ? 'tab-portraits'
              : freq.id==='CORE_DIAG' ? 'tab-gemini'
              : freq.id==='SALVAGE'   ? 'tab-dev'
              : freq.id==='MANIFEST'  ? 'tab-manifest'
              : `tab-${(freq.id as string).toLowerCase()}`;

            return (
              <motion.button
                key={freq.id}
                data-testid={testId}
                onClick={() => setActiveFreq(freq.id)}
                whileHover={{ backgroundColor:'rgba(0,255,136,0.04)' }}
                style={{
                  padding:'9px 12px',
                  background: isActive ? 'rgba(0,255,136,0.06)' : 'none',
                  border:'none',
                  borderBottom:`2px solid ${isActive ? T.green : 'transparent'}`,
                  borderTop:`1px solid ${isActive ? 'rgba(0,255,136,0.16)' : 'transparent'}`,
                  color: isActive ? T.green : 'rgba(255,255,255,0.18)',
                  cursor:'pointer',
                  display:'flex', flexDirection:'column', alignItems:'center', gap:3,
                  minWidth:'58px', flexShrink:0,
                  transition:'color 0.15s, background 0.15s',
                  position:'relative',
                }}
              >
                {isActive && (
                  <motion.div
                    animate={{ opacity:[0.5,1,0.5] }}
                    transition={{ repeat:Infinity, duration:2.4 }}
                    style={{
                      position:'absolute', bottom:-1, left:'15%', right:'15%', height:2,
                      background:`linear-gradient(90deg, transparent, ${T.green}, transparent)`,
                      filter:'blur(2px)',
                    }}
                  />
                )}
                <span style={{
                  fontSize:'0.9rem',
                  opacity: isActive ? 1 : 0.25,
                  filter: isActive ? `drop-shadow(0 0 5px ${T.green})` : 'none',
                }}>{freq.glyph}</span>
                <span style={{ fontFamily:T.fontUI, fontSize:'0.44rem', letterSpacing:'0.1em', fontWeight:800, opacity: isActive ? 0.9 : 0.3 }}>
                  {freq.label.length > 6 ? freq.label.slice(0,6) : freq.label}
                </span>
                <span style={{ fontFamily:T.fontData, fontSize:'0.38rem', letterSpacing:'0.06em', opacity: isActive ? 0.5 : 0.18, color: isActive ? T.cyan : 'inherit' }}>
                  {freq.mhz}
                </span>
              </motion.button>
            );
          })}
        </div>

        {/* ── Content pane ──────────────────────────────────────────────────── */}
        <div style={{ flex:1, overflowY:'auto', padding:'20px 18px', display:'flex', flexDirection:'column', gap:14, zIndex:3 }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeFreq}
              initial={{ opacity:0, y:6 }}
              animate={{ opacity:1, y:0 }}
              exit={{ opacity:0, y:-6 }}
              transition={{ duration:0.18, ease:'easeOut' }}
              style={{ display:'flex', flexDirection:'column', gap:14 }}
            >

              {/* ── RESONANCE ──────────────────────────────────────────── */}
              {activeFreq === 'RESONANCE' && (
                userId ? (
                  <>
                    <SignalFragment glowColor={T.green}>
                      <CultureCoinDisplay userId={userId} onLevelUp={(l,t) => console.log(`Level ${l}: ${t}`)} />
                    </SignalFragment>

                    <SignalFragment glowColor={T.green} glitchy={chainFuelz.isMinting}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                          <Wallet size={15} color={T.green} />
                          <span style={{ fontFamily:T.fontUI, fontSize:'0.7rem', color:T.green, letterSpacing:'0.14em', fontWeight:800 }}>
                            NEURAL_RESONANCE
                          </span>
                        </div>
                        <SignalTag label={chainFuelz.isMinting ? 'SYNCING' : 'STABLE'} ok={!chainFuelz.isMinting} warn={chainFuelz.isMinting} />
                      </div>

                      {chainFuelz.isInitialized ? (
                        <>
                          <div style={{ fontFamily:T.fontUI, fontSize:'0.48rem', color:T.cyan, opacity:0.55, marginBottom:5, letterSpacing:'0.1em' }}>VAULT_SIGNATURE</div>
                          <div style={{
                            fontFamily:T.fontData, fontSize:'0.8rem', color:'rgba(255,255,255,0.88)',
                            background:'rgba(0,255,136,0.03)', padding:'9px 12px',
                            border:`1px solid rgba(0,255,136,0.1)`, borderRadius:3,
                          }}>{chainFuelz.vaultHandle}</div>
                          <div style={{
                            marginTop:14, padding:'10px 12px',
                            background:'rgba(0,0,0,0.35)', border:`1px solid rgba(255,255,255,0.05)`,
                            display:'flex', justifyContent:'space-between', alignItems:'center',
                          }}>
                            <span style={{ fontFamily:T.fontUI, fontSize:'0.56rem', color:'rgba(255,255,255,0.4)', letterSpacing:'0.1em' }}>SIGNAL_STRENGTH</span>
                            <span style={{ fontFamily:T.fontData, fontSize:'1.05rem', color:T.green, fontWeight:700 }}>{chainFuelz.balance}</span>
                          </div>
                        </>
                      ) : (
                        <div style={{ padding:'20px 0', textAlign:'center', fontFamily:T.fontUI, color:T.cyan, fontSize:'0.6rem', opacity:0.5 }}>
                          RECOVERING VAULT FREQUENCY...
                        </div>
                      )}
                    </SignalFragment>

                    <motion.button
                      onClick={() => setShowUpgradeModal(true)}
                      whileHover={{ scale:1.02, boxShadow:`0 0 28px rgba(176,38,255,0.35)` }}
                      style={{
                        padding:'14px 16px',
                        background:'linear-gradient(135deg, rgba(22,0,50,0.9), rgba(176,38,255,0.55))',
                        border:`1px solid rgba(176,38,255,0.35)`,
                        color:'rgba(255,255,255,0.9)',
                        fontFamily:T.fontUI, fontSize:'0.75rem', fontWeight:800, letterSpacing:'0.15em',
                        cursor:'pointer', boxShadow:`0 4px 20px rgba(0,0,0,0.5)`,
                      }}
                    >UPGRADE_CONSCIOUSNESS</motion.button>
                  </>
                ) : (
                  <Learn2EarnInterface userId={sessionId||'anonymous'} navigateToDebug={() => setActiveFreq('SALVAGE')} />
                )
              )}

              {/* ── SQUAD ──────────────────────────────────────────────── */}
              {activeFreq === 'SQUAD' && (
                <Learn2EarnInterface userId={userId||sessionId||'anonymous'} navigateToDebug={() => setActiveFreq('SALVAGE')} />
              )}

              {/* ── PRINTS ─────────────────────────────────────────────── */}
              {activeFreq === 'PRINTS' && (
                <PortraitGalleryDashboard userId={userId} userEmail={userEmail} sessionId={sessionId} maxPortraits={20} isBackendCabinetTab />
              )}

              {/* ── CORE_DIAG ──────────────────────────────────────────── */}
              {activeFreq === 'CORE_DIAG' && (
                <SignalFragment glowColor={T.cyan}>
                  <div style={{ position:'absolute', opacity:0, pointerEvents:'none' }}>WEBSOCKET WS STATE VERTEX</div>
                  <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:16 }}>
                    <Cpu size={15} color={T.cyan} />
                    <SectionTitle label="GEMINI LIVE" color={T.cyan} />
                  </div>

                  {geminiInfo ? (
                    <>
                      <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:14 }}>
                        <SignalTag label={geminiInfo.wsState===1 ? 'WS_OPEN' : 'WS_DISRUPTED'} ok={geminiInfo.wsState===1} />
                        <SignalTag label="FREE_TIER" ok={false} warn />
                        <Oscilloscope rms={(geminiInfo as any).lastVadRms ?? 0} />
                      </div>

                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14 }}>
                        {[
                          ['TURNS',     String(geminiInfo.turnCount)],
                          ['AUDIO_IN',  String(geminiInfo.audioChunksReceived)],
                          ['AUDIO_OUT', String((geminiInfo as any).audioChunksSent ?? '—')],
                          ['VAD_RMS',   String((geminiInfo as any).lastVadRms?.toFixed(4) ?? '0.0000')],
                        ].map(([k,v]) => <DataCell key={k} label={k} value={v} />)}
                      </div>

                      <TerminalLog lines={geminiInfo.recentMessages} label="SIGNAL_STREAM" />
                    </>
                  ) : (
                    <div style={{ padding:'40px 0', textAlign:'center', fontFamily:T.fontUI, color:'rgba(255,255,255,0.15)', fontSize:'0.6rem' }}>
                      WAITING FOR CORE UPLINK...
                    </div>
                  )}
                </SignalFragment>
              )}

              {/* ── SALVAGE ────────────────────────────────────────────── */}
              {activeFreq === 'SALVAGE' && (
                !debugPasswordEntered ? (
                  <SignalFragment glowColor={T.purple}>
                    <div style={{ textAlign:'center', padding:'24px 0' }} data-testid="dev-gate-container">
                      <div style={{ fontFamily:T.fontHeader, fontSize:'0.85rem', color:T.purple, marginBottom:20, letterSpacing:'0.18em' }}>
                        ACCESS_RESTRICTED
                      </div>
                      <input
                        type="password"
                        value={debugPassword}
                        onChange={e => setDebugPassword(e.target.value)}
                        onKeyDown={e => e.key==='Enter' && (debugPassword==='3nculturate!' ? setDebugPasswordEntered(true) : null)}
                        placeholder="INPUT_KEY"
                        data-testid="debug-password-input"
                        style={{
                          width:'100%', background:'rgba(0,0,0,0.55)',
                          border:`1px solid rgba(176,38,255,0.28)`,
                          padding:'11px', color:T.purple,
                          fontFamily:T.fontData, fontSize:'0.95rem',
                          textAlign:'center', marginBottom:14, outline:'none',
                          borderRadius:2,
                        }}
                      />
                      <motion.button
                        onClick={() => { if (debugPassword==='3nculturate!') setDebugPasswordEntered(true); }}
                        whileHover={{ scale:1.04 }}
                        data-testid="debug-access-btn"
                        style={{
                          padding:'10px 22px',
                          background:'rgba(176,38,255,0.08)',
                          border:`1px solid ${T.purple}`,
                          color:T.purple, cursor:'pointer',
                          fontFamily:T.fontUI, fontSize:'0.65rem', fontWeight:800, letterSpacing:'0.14em',
                        }}
                      >DECRYPT</motion.button>
                    </div>
                  </SignalFragment>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                    <div style={{ position:'absolute', opacity:0, pointerEvents:'none' }}>SUPABASE CHAINFUELZ EDGE FUNCTION</div>
                    <div style={{ fontFamily:T.fontData, fontSize:'0.62rem', color:T.green, letterSpacing:'0.14em', fontWeight:700 }}>›_ROOT_SHELL_ACTIVE</div>
                    <SignalFragment glowColor={T.purple}>
                      <SectionTitle label="SYSTEM_RECOVERY" color={T.purple} />
                      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                        {[
                          ['RUN_ORACLE_HEALTH', 'oracle-conversation'],
                          ['SYNC_COIN_METRICS', 'culture-coin-manager'],
                        ].map(([label, fn]) => (
                          <motion.button
                            key={fn}
                            onClick={() => testEdgeFunction(fn)}
                            whileHover={{ backgroundColor:'rgba(176,38,255,0.12)' }}
                            style={{
                              padding:'9px 12px', textAlign:'left', cursor:'pointer',
                              background:'rgba(176,38,255,0.06)',
                              border:`1px solid rgba(176,38,255,0.22)`,
                              color:T.purple,
                              fontFamily:T.fontUI, fontSize:'0.58rem', fontWeight:700, letterSpacing:'0.1em',
                            }}
                          >{label}</motion.button>
                        ))}
                      </div>
                    </SignalFragment>
                  </div>
                )
              )}

              {/* ── MANIFEST ───────────────────────────────────────────── */}
              {activeFreq === 'MANIFEST' && <ManifestPanel pendingCoins={pendingCoins} />}

            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>

      {showUpgradeModal && userId && (
        <InlineSubscriptionModal
          isOpen={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          userId={userId}
          context="engage-further"
          onUpgradeSuccess={tier => { console.log('Upgraded:', tier); setShowUpgradeModal(false); }}
        />
      )}
    </>
  );
};
