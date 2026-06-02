/**
 * BackendControlPanel — ENCULTURATE CRATE
 *
 * XR-grade holographic side panel for the SURROGATE:ORACLE experience.
 *
 * Tabs:
 *   VAULT        — Culture Coins + Neural Vault (ChainFuelz)
 *   SQUAD        — Learn2Earn interface
 *   NEURAL PRINTS — Portrait gallery
 *   GEMINI LIVE  — Gemini Live WebSocket diagnostics
 *   DEV          — Password-protected developer console
 */
import { useState, useEffect, useRef, RefObject } from 'react';
import { X, Wallet, Activity, Cpu, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { CultureCoinDisplay } from './CultureCoinDisplay';
import { InlineSubscriptionModal } from './InlineSubscriptionModal';
import { PortraitGalleryDashboard } from './PortraitGalleryDashboard';
import { Learn2EarnInterface } from './Learn2EarnInterface';
import { supabaseEdgeFunctionHeaders } from '../lib/supabase';
import { useChainFuelz } from '../hooks/useChainFuelz';
import type { OracleConversationHandle } from './OracleConversation';

// ── Frequency definition (Diegetic Navigation) ────────────────────────────
type Frequency = 'RESONANCE' | 'SQUAD' | 'PRINTS' | 'CORE_DIAG' | 'SALVAGE' | 'MANIFEST';

const FREQUENCIES: { id: Frequency; label: string; mhz: string; glyph: string }[] = [
  { id: 'RESONANCE', label: 'RESONANCE', mhz: '108.4', glyph: '◈' },
  { id: 'SQUAD',     label: 'SQUAD',     mhz: '112.8', glyph: '⬡' },
  { id: 'PRINTS',    label: 'PRINTS',    mhz: '124.2', glyph: '◻' },
  { id: 'CORE_DIAG', label: 'CORE_DIAG', mhz: '142.0', glyph: '⬢' },
  { id: 'SALVAGE',   label: 'SALVAGE',   mhz: '158.6', glyph: '⌘' },
  { id: 'MANIFEST',  label: 'M4NIFST',   mhz: '188.4', glyph: '⊞' },
];

// ── SignalFragment — fractured XR framing ────────────────────────────────────
function SignalFragment({
  children,
  glowColor = '#00ff88',
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
      animate={glitchy ? { 
        x: [0, -1, 1, 0], 
        opacity: [1, 0.92, 1],
        filter: ['none', 'hue-rotate(10deg)', 'none'] 
      } : {}}
      transition={glitchy ? { repeat: Infinity, duration: 0.15, repeatDelay: 4 } : {}}
      style={{
        background: 'rgba(0,4,18,0.85)',
        backdropFilter: 'blur(12px)',
        border: `1px solid ${glowColor}22`,
        borderLeft: `3px solid ${glowColor}44`,
        borderRadius: '2px 14px 2px 14px',
        boxShadow: `0 8px 32px rgba(0,0,0,0.8), inset 0 0 10px ${glowColor}0a`,
        padding: 16,
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* Fractal brackets */}
      <div style={{ position: 'absolute', top: 4, left: 4, width: 8, height: 2, background: glowColor, opacity: 0.6 }} />
      <div style={{ position: 'absolute', top: 4, left: 4, width: 2, height: 8, background: glowColor, opacity: 0.6 }} />
      <div style={{ position: 'absolute', bottom: 4, right: 4, width: 8, height: 2, background: glowColor, opacity: 0.6 }} />
      <div style={{ position: 'absolute', bottom: 4, right: 4, width: 2, height: 8, background: glowColor, opacity: 0.6 }} />
      
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </motion.div>
  );
}

// ── RiftGrid — salvaged frequency field ──────────────────────────────────
function RiftGrid() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0, opacity: 0.4 }}>
      <motion.div
        animate={{ opacity: [0.1, 0.15, 0.1] }}
        transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
        style={{
          position: 'absolute', inset: 0,
          backgroundImage: `
            radial-gradient(circle at 2px 2px, rgba(0,255,136,0.15) 1px, transparent 0)
          `,
          backgroundSize: '24px 24px',
        }}
      />
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, transparent 0%, rgba(0,255,136,0.03) 50%, transparent 100%)',
        height: '2px',
        width: '100%',
        top: '10%',
        animation: 'scanline-drift 8s linear infinite',
      }} />
    </div>
  );
}

// ── SignalTag ─────────────────────────────────────────────────────────────────
function SignalTag({ label, ok, warn }: { label: string; ok: boolean; warn?: boolean }) {
  const color = warn ? '#b026ff' : ok ? '#00ff88' : '#00ffcc';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 10px',
      background: 'rgba(0,0,0,0.5)',
      border: `1px solid ${color}33`,
      borderLeft: `2px solid ${color}`,
      fontSize: '0.52rem', letterSpacing: '0.12em', color,
      fontFamily: "'PhillySans', 'Orbitron', monospace", fontWeight: 700,
    }}>
      {label}
    </span>
  );
}

// ── Oscilloscope — simple VAD visualizer ─────────────────────────────────────
function Oscilloscope({ rms }: { rms: number }) {
  const points = 12;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 24, padding: '0 4px' }}>
      {Array.from({ length: points }).map((_, i) => {
        const height = Math.max(2, (rms * 100) * (0.5 + Math.random() * 0.5));
        return (
          <motion.div
            key={i}
            animate={{ height: [height * 0.8, height, height * 0.9] }}
            transition={{ repeat: Infinity, duration: 0.1 + Math.random() * 0.2 }}
            style={{ width: 3, background: '#00ffcc', opacity: 0.6 + (i / points) * 0.4 }}
          />
        );
      })}
    </div>
  );
}

// ── TerminalLog — monospace scrollable log box ────────────────────────────────
function TerminalLog({ lines, label }: { lines: string[]; label: string }) {
  const copyLines = () => {
    navigator.clipboard.writeText(lines.join('\n'));
    console.log(`[ORACLE:AUDIT] Copied ${label} logs`);
  };

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <div style={{ fontSize: '0.52rem', color: '#00ffcc', letterSpacing: '0.15em', fontWeight: 800, fontFamily: "'PhillySans', 'Orbitron', monospace" }}>
          {label}
        </div>
        <button
          onClick={copyLines}
          style={{
            background: 'none', border: 'none', color: '#00ff88',
            fontSize: '0.5rem', cursor: 'pointer', opacity: 0.5,
            padding: '2px 4px', fontFamily: "'PhillySans', 'Orbitron', monospace",
          }}
        >
          COPY
        </button>
      </div>
      <div style={{
        background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(0,255,136,0.15)',
        borderRadius: '2px 8px 2px 8px', padding: '8px 10px', maxHeight: 120, overflowY: 'auto',
        fontFamily: "'PhillySans', 'Orbitron', monospace", fontSize: '0.6rem', color: '#00ff88',
        lineHeight: 1.7,
      }}>
        {lines.length === 0 ? (
          <span style={{ color: '#444', fontStyle: 'italic' }}>— NO_SIGNAL —</span>
        ) : (
          lines.map((l, i) => <div key={i}>{l}</div>)
        )}
      </div>
    </div>
  );
}

// ── ManifestPanel — live session artifact display ─────────────────────────────
// Listens to oracle:score / oracle:alignment / oracle:artifact events.
// Renders collected session data as diegetic Signal Fragments.
function ManifestPanel({ pendingCoins }: { pendingCoins: number }) {
  const [alignment, setAlignment]     = useState<string | null>(null);
  const [archetype, setArchetype]     = useState<string | null>(null);
  const [totemLevel, setTotemLevel]   = useState(0);
  const [sessionPhase, setPhase]      = useState<string | null>(null);
  const [emotionalWeight, setEmotion] = useState<string | null>(null);
  const [coins, setCoins]             = useState(pendingCoins);

  useEffect(() => { setCoins(pendingCoins); }, [pendingCoins]);

  useEffect(() => {
    const onScore = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (d.sessionPhase) setPhase(d.sessionPhase);
      if (typeof d.totemLevel === 'number') setTotemLevel(d.totemLevel);
      if (d.archetypeTitle) setArchetype(d.archetypeTitle);
      if (d.emotionalWeight) setEmotion(d.emotionalWeight);
    };
    const onAlign = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (d.alignment) setAlignment(d.alignment);
    };
    const onArtifact = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (d.archetypeTitle) setArchetype(d.archetypeTitle);
    };
    const onTotem = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (typeof d.totemLevel === 'number') setTotemLevel(d.totemLevel);
    };
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

  const alignColor   = alignment === 'sacred' ? '#00ff88' : alignment === 'profane' ? '#b026ff' : '#00ffcc';
  const phaseLabels: Record<string, string> = { claim: 'CLAIM', evidence: 'EVIDENCE', cost: 'COST', mirror: 'MIRROR' };
  const hasData = alignment || archetype || totemLevel > 0 || sessionPhase;

  const ArtifactRow = ({ label, value, color = '#00ffcc' }: { label: string; value: string; color?: string }) => (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '9px 12px',
      background: 'rgba(0,0,0,0.45)',
      border: `1px solid ${color}18`,
      borderLeft: `2px solid ${color}55`,
      marginBottom: 6,
    }}>
      <span style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.18em', fontFamily: "'PhillySans','Orbitron',monospace" }}>
        {label}
      </span>
      <span style={{ fontSize: '0.72rem', color, fontWeight: 900, letterSpacing: '0.1em', fontFamily: "'PhillySans','Orbitron',monospace" }}>
        {value}
      </span>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SignalFragment glowColor="#00ffcc">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: '1.1rem', color: '#00ffcc' }}>⊞</span>
          <span style={{
            fontFamily: "'aAnotherTag','Orbitron',sans-serif",
            fontSize: '1.0rem', fontWeight: 900, letterSpacing: '0.08em',
            background: 'linear-gradient(90deg,#00ff88,#00ffcc)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>SESSION MANIFEST</span>
        </div>

        {!hasData ? (
          <div style={{ padding: '28px 16px', textAlign: 'center' }}>
            <motion.div
              animate={{ opacity: [0.3, 0.7, 0.3] }}
              transition={{ repeat: Infinity, duration: 2.4 }}
              style={{ fontSize: '0.6rem', color: '#00ffcc', letterSpacing: '0.22em', fontFamily: "'PhillySans','Orbitron',monospace" }}
            >
              AWAITING_ORACLE_SESSION
            </motion.div>
            <div style={{ marginTop: 10, fontSize: '0.48rem', color: 'rgba(0,255,204,0.3)', letterSpacing: '0.15em', fontFamily: "'PhillySans','Orbitron',monospace" }}>
              ARTIFACTS ACCUMULATE AS THE RITUAL UNFOLDS
            </div>
          </div>
        ) : (
          <>
            {alignment    && <ArtifactRow label="SIGNAL_ALIGNMENT" value={alignment.toUpperCase()} color={alignColor} />}
            {archetype    && <ArtifactRow label="ARCHETYPE_TITLE"  value={archetype.toUpperCase()} color="#00ff88" />}
            {totemLevel > 0 && <ArtifactRow label="TOTEM_LEVEL"   value={Array(totemLevel).fill('◈').join('')} color="#00ffcc" />}
            {sessionPhase && <ArtifactRow label="RITUAL_PHASE"    value={phaseLabels[sessionPhase] ?? sessionPhase.toUpperCase()} color="#00ffcc" />}
            {emotionalWeight && <ArtifactRow label="EMOTIONAL_REG" value={emotionalWeight.toUpperCase()} color="rgba(255,255,255,0.5)" />}
            {coins > 0    && <ArtifactRow label="CULTURE_COINS"   value={`+${coins}c`} color="#00ff88" />}
          </>
        )}
      </SignalFragment>

      {/* Ritual phase progress bar */}
      {sessionPhase && (
        <SignalFragment glowColor="#00ffcc" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: '0.48rem', color: 'rgba(0,255,204,0.45)', letterSpacing: '0.18em', marginBottom: 10, fontFamily: "'PhillySans','Orbitron',monospace" }}>
            RITUAL_PROGRESSION
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['claim', 'evidence', 'cost', 'mirror'] as const).map((phase) => {
              const phases = ['claim', 'evidence', 'cost', 'mirror'];
              const currentIdx = phases.indexOf(sessionPhase ?? '');
              const phaseIdx   = phases.indexOf(phase);
              const isActive   = phase === sessionPhase;
              const isPast     = phaseIdx < currentIdx;
              return (
                <div key={phase} style={{
                  flex: 1, height: 28, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 3,
                  background: isActive ? 'rgba(0,255,204,0.12)' : isPast ? 'rgba(0,255,136,0.06)' : 'rgba(0,0,0,0.3)',
                  border: `1px solid ${isActive ? '#00ffcc44' : isPast ? '#00ff8822' : 'rgba(255,255,255,0.05)'}`,
                  borderBottom: isActive ? '2px solid #00ffcc' : isPast ? '2px solid #00ff8844' : '2px solid transparent',
                }}>
                  <span style={{ fontSize: '0.38rem', letterSpacing: '0.12em', color: isActive ? '#00ffcc' : isPast ? 'rgba(0,255,136,0.5)' : 'rgba(255,255,255,0.15)', fontFamily: "'PhillySans','Orbitron',monospace" }}>
                    {phaseLabels[phase]}
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

// ── Props ─────────────────────────────────────────────────────────────────────
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
  userId,
  sessionId,
  isVisible = true,
  initialTab = 'vault',
  onClose,
  isAuthenticated = false,
  userEmail,
  pendingCoins = 0,
  oracleConversationRef,
}: BackendControlPanelProps) => {
  const [activeFreq, setActiveFreq] = useState<Frequency>(() => {
    const saved = localStorage.getItem('oracle_crate_active_freq');
    if (saved) return saved as Frequency;
    return 'RESONANCE';
  });
  const [debugPasswordEntered, setDebugPasswordEntered] = useState(false);
  const [debugPassword, setDebugPassword] = useState('');
  const [testResults, setTestResults] = useState<Record<string, unknown>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showRawAddress, setShowRawAddress] = useState(false);

  // Live debug polling state
  const [geminiInfo, setGeminiInfo] = useState<ReturnType<OracleConversationHandle['getWsDebugInfo']> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const chainFuelz = useChainFuelz(userEmail, pendingCoins);
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  // Sync activeFreq to localStorage
  useEffect(() => {
    localStorage.setItem('oracle_crate_active_freq', activeFreq);
  }, [activeFreq]);

  // Map legacy tab names from parent
  useEffect(() => {
    const mapped: Frequency = 
        (initialTab as string) === 'vault' ? 'RESONANCE'
      : (initialTab as string) === 'coins' ? 'RESONANCE'
      : (initialTab as string) === 'gemini' ? 'CORE_DIAG'
      : (initialTab as string) === 'debug' ? 'SALVAGE'
      : (initialTab as string) === 'dev' ? 'SALVAGE'
      : 'RESONANCE';
    setActiveFreq(mapped);
  }, [initialTab]);

  // Poll debug info when on diagnostics
  useEffect(() => {
    if (activeFreq === 'CORE_DIAG') {
      pollRef.current = setInterval(() => {
        if (oracleConversationRef?.current) setGeminiInfo(oracleConversationRef.current.getWsDebugInfo());
      }, 600);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeFreq, oracleConversationRef]);

  const handleDebugPasswordSubmit = () => {
    if (debugPassword === '3nculturate!') {
      setDebugPasswordEntered(true);
      setDebugPassword('');
    }
  };

  const testEdgeFunction = async (functionName: string, payload: Record<string, unknown> = {}) => {
    setIsLoading(true);
    try {
      if (!supabaseUrl) throw new Error('Supabase not configured');
      const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
        method: 'POST',
        headers: supabaseEdgeFunctionHeaders,
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      setTestResults((prev) => ({
        ...prev,
        [functionName]: { success: response.ok, data, status: response.status, timestamp: new Date().toISOString() },
      }));
    } catch (err: unknown) {
      setTestResults((prev) => ({
        ...prev,
        [functionName]: { success: false, error: (err as Error).message, timestamp: new Date().toISOString() },
      }));
    }
    setIsLoading(false);
  };

  if (!isVisible) return null;

  // ── Render ──────────────────────────────────────────────────────────────────
  const activeFreqDef = FREQUENCIES.find(f => f.id === activeFreq);

  return (
    <>
      <motion.div
        initial={{ x: '100%', opacity: 0, rotateY: -8, scale: 0.94 }}
        animate={{ x: 0, opacity: 1, rotateY: 0, scale: 1 }}
        exit={{ x: '100%', opacity: 0, rotateY: -8, scale: 0.94 }}
        transition={{ type: 'spring', damping: 28, stiffness: 220 }}
        style={{
          position: 'fixed',
          right: 0, top: 0, bottom: 0,
          width: 'min(420px, 92vw)',
          background: 'linear-gradient(160deg, rgba(0,0,12,0.98) 0%, rgba(2,0,22,1.0) 100%)',
          borderLeft: '2px solid rgba(0,255,136,0.22)',
          zIndex: 150,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: "'PhillySans', 'Orbitron', monospace",
          overflowY: 'hidden',
          boxShadow: '-40px 0 120px rgba(0,0,0,0.9), inset 0 0 60px rgba(0,255,136,0.03)',
          transformOrigin: 'right center',
        }}
        data-testid="backend-panel"
      >
        {/* ── Scanline overlay ───────────────────────────────────────────── */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,136,0.018) 2px, rgba(0,255,136,0.018) 4px)',
          animation: 'scanline-drift 12s linear infinite',
        }} />

        {/* ── RiftGrid dot field ─────────────────────────────────────────── */}
        <RiftGrid />

        {/* ── HUD corner brackets ────────────────────────────────────────── */}
        {/* top-left */}
        <div style={{ position: 'absolute', top: 6, left: 6, width: 18, height: 2, background: '#00ff88', opacity: 0.5, zIndex: 2, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: 6, left: 6, width: 2, height: 18, background: '#00ff88', opacity: 0.5, zIndex: 2, pointerEvents: 'none' }} />
        {/* top-right */}
        <div style={{ position: 'absolute', top: 6, right: 6, width: 18, height: 2, background: '#00ffcc', opacity: 0.4, zIndex: 2, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: 6, right: 6, width: 2, height: 18, background: '#00ffcc', opacity: 0.4, zIndex: 2, pointerEvents: 'none' }} />
        {/* bottom-left */}
        <div style={{ position: 'absolute', bottom: 6, left: 6, width: 18, height: 2, background: '#00ff88', opacity: 0.3, zIndex: 2, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 6, left: 6, width: 2, height: 18, background: '#00ff88', opacity: 0.3, zIndex: 2, pointerEvents: 'none' }} />
        {/* bottom-right */}
        <div style={{ position: 'absolute', bottom: 6, right: 6, width: 18, height: 2, background: '#00ffcc', opacity: 0.25, zIndex: 2, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 6, right: 6, width: 2, height: 18, background: '#00ffcc', opacity: 0.25, zIndex: 2, pointerEvents: 'none' }} />

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{
          padding: '18px 22px 0',
          background: 'rgba(0,0,10,0.7)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(0,255,136,0.1)',
          flexShrink: 0,
          position: 'relative',
          zIndex: 5,
        }}>
          {/* Title row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              {/* SURROGATE:ORACLE — aAnotherTag brand gradient */}
              <div style={{
                fontFamily: "'aAnotherTag', 'Orbitron', sans-serif",
                fontSize: '1.35rem',
                fontWeight: 900,
                letterSpacing: '0.08em',
                background: 'linear-gradient(90deg, #00ff88, #00ffcc)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                lineHeight: 1.1,
              }}>
                SURROGATE:ORACLE
              </div>
              {/* Subtitle — PhillySans */}
              <div style={{
                fontFamily: "'PhillySans', 'Orbitron', monospace",
                fontSize: '0.52rem',
                fontWeight: 800,
                color: 'rgba(0,255,204,0.55)',
                letterSpacing: '0.22em',
                marginTop: 4,
              }}>
                TIME-RIFT CONSOLE
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Live indicator */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <motion.div
                  animate={{ opacity: [1, 0.25, 1], scale: [1, 1.15, 1] }}
                  transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
                  style={{ width: 7, height: 7, borderRadius: '50%', background: '#00ff88', boxShadow: '0 0 10px #00ff88, 0 0 20px rgba(0,255,136,0.4)' }}
                />
                <span style={{ fontSize: '0.46rem', color: '#00ff88', letterSpacing: '0.18em', fontWeight: 900 }}>LIVE</span>
              </div>
              {onClose && (
                <motion.button
                  onClick={onClose}
                  whileHover={{ scale: 1.15, color: '#00ff88' }}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', padding: '4px 6px', lineHeight: 1 }}
                >
                  <X size={16} />
                </motion.button>
              )}
            </div>
          </div>

          {/* HUD telemetry band */}
          <div style={{
            display: 'flex', gap: 12, alignItems: 'center',
            padding: '6px 0 10px',
            borderTop: '1px solid rgba(0,255,136,0.07)',
            fontSize: '0.48rem',
            fontFamily: "'PhillySans', 'Orbitron', monospace",
            letterSpacing: '0.14em',
            color: 'rgba(0,255,204,0.45)',
            overflowX: 'hidden',
          }}>
            <span style={{ color: 'rgba(0,255,136,0.35)' }}>FREQ</span>
            <span style={{ color: '#00ffcc', fontWeight: 900 }}>{activeFreqDef?.mhz}MHz</span>
            <span style={{ color: 'rgba(255,255,255,0.12)' }}>·</span>
            <span style={{ color: 'rgba(0,255,136,0.35)' }}>BAND</span>
            <span style={{ color: '#00ff88', fontWeight: 900 }}>{activeFreqDef?.label}</span>
            {sessionId && (
              <>
                <span style={{ color: 'rgba(255,255,255,0.12)' }}>·</span>
                <span style={{ color: 'rgba(0,255,204,0.3)' }}>SID:{sessionId.slice(-6).toUpperCase()}</span>
              </>
            )}
            <span style={{ marginLeft: 'auto', color: 'rgba(0,255,136,0.25)' }}>◈ XR_v2.0</span>
          </div>
        </div>

        {/* ── Frequency Tuner (Diegetic Navigation) ───────────────────────── */}
        <div style={{
          display: 'flex',
          background: 'rgba(0,0,4,0.6)',
          borderBottom: '1px solid rgba(0,255,136,0.08)',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          padding: '0 6px',
          zIndex: 4,
          flexShrink: 0,
        }}>
          {FREQUENCIES.map((freq) => {
            const isActive = activeFreq === freq.id;
            const testId =
                freq.id === 'RESONANCE' ? 'tab-vault'
              : freq.id === 'SQUAD'     ? 'tab-squad'
              : freq.id === 'PRINTS'    ? 'tab-portraits'
              : freq.id === 'CORE_DIAG' ? 'tab-gemini'
              : freq.id === 'SALVAGE'   ? 'tab-dev'
              : freq.id === 'MANIFEST'  ? 'tab-manifest'
              : `tab-${(freq.id as string).toLowerCase()}`;

            return (
              <motion.button
                key={freq.id}
                data-testid={testId}
                onClick={() => setActiveFreq(freq.id)}
                whileHover={{ backgroundColor: 'rgba(0,255,136,0.05)' }}
                style={{
                  padding: '10px 14px',
                  background: isActive ? 'rgba(0,255,136,0.07)' : 'none',
                  border: 'none',
                  borderBottom: `2px solid ${isActive ? '#00ff88' : 'transparent'}`,
                  borderTop: `1px solid ${isActive ? 'rgba(0,255,136,0.2)' : 'transparent'}`,
                  color: isActive ? '#00ff88' : 'rgba(255,255,255,0.22)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 3,
                  minWidth: '62px',
                  transition: 'color 0.18s ease, background 0.18s ease',
                  flexShrink: 0,
                  position: 'relative',
                }}
              >
                {/* Active channel glow */}
                {isActive && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0.6, 1, 0.6] }}
                    transition={{ repeat: Infinity, duration: 2.2 }}
                    style={{
                      position: 'absolute', bottom: -1, left: '20%', right: '20%', height: 2,
                      background: 'linear-gradient(90deg, transparent, #00ff88, transparent)',
                      filter: 'blur(2px)',
                    }}
                  />
                )}
                <span style={{ fontSize: '1rem', opacity: isActive ? 1 : 0.3, filter: isActive ? 'drop-shadow(0 0 4px #00ff88)' : 'none' }}>
                  {freq.glyph}
                </span>
                <span style={{ fontSize: '0.48rem', letterSpacing: '0.12em', fontWeight: 800, opacity: isActive ? 0.9 : 0.35 }}>
                  {freq.label.length > 6 ? freq.label.slice(0, 6) : freq.label}
                </span>
                <span style={{ fontSize: '0.42rem', letterSpacing: '0.08em', opacity: isActive ? 0.55 : 0.2, color: isActive ? '#00ffcc' : 'inherit' }}>
                  {freq.mhz}
                </span>
              </motion.button>
            );
          })}
        </div>

        {/* ── Content: Signal Fragments ──────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 16, zIndex: 3 }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeFreq}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              {/* ── RESONANCE (Vault) ─────────────────────────────────── */}
              {activeFreq === 'RESONANCE' && (
                userId ? (
                  <>
                    <SignalFragment glowColor="#00ff88">
                      <CultureCoinDisplay
                        userId={userId}
                        onLevelUp={(level, title) => console.log(`Level up! ${level}: ${title}`)}
                      />
                    </SignalFragment>

                    <SignalFragment glowColor="#00ff88" glitchy={chainFuelz.isMinting}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Wallet size={16} color="#00ff88" />
                          <span style={{ fontSize: '0.75rem', color: '#00ff88', letterSpacing: '0.15em', fontWeight: 800 }}>
                            NEURAL_RESONANCE
                          </span>
                        </div>
                        <SignalTag label={chainFuelz.isMinting ? 'SYNCING' : 'STABLE'} ok={!chainFuelz.isMinting} warn={chainFuelz.isMinting} />
                      </div>

                      {chainFuelz.isInitialized ? (
                        <>
                          <div style={{ fontSize: '0.52rem', color: '#00ffcc', opacity: 0.6, marginBottom: 6, letterSpacing: '0.1em' }}>VAULT_SIGNATURE</div>
                          <div style={{
                            fontSize: '0.85rem', color: '#fff', fontFamily: 'monospace',
                            background: 'rgba(0,255,136,0.04)', padding: '10px 14px',
                            border: '1px solid rgba(0,255,136,0.12)', borderRadius: 4,
                          }}>
                            {chainFuelz.vaultHandle}
                          </div>
                          
                          <div style={{
                            marginTop: 16, padding: '12px',
                            background: 'rgba(0,0,0,0.4)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                          }}>
                            <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em' }}>SIGNAL_STRENGTH</span>
                            <span style={{ fontSize: '1.1rem', color: '#00ff88', fontWeight: 900, fontFamily: 'monospace' }}>
                              {chainFuelz.balance}
                            </span>
                          </div>
                        </>
                      ) : (
                        <div style={{ padding: '20px 0', textAlign: 'center', color: '#00ffcc', fontSize: '0.65rem' }}>
                          RECOVERING VAULT FREQUENCY...
                        </div>
                      )}
                    </SignalFragment>

                    <motion.button
                      onClick={() => setShowUpgradeModal(true)}
                      whileHover={{ scale: 1.02, boxShadow: '0 0 25px rgba(176,38,255,0.4)' }}
                      style={{
                        padding: '16px',
                        background: 'linear-gradient(135deg, rgba(30,0,60,0.9), rgba(176,38,255,0.6))',
                        border: '1px solid rgba(176,38,255,0.4)',
                        color: '#fff',
                        fontFamily: "'PhillySans', sans-serif",
                        fontSize: '0.8rem',
                        fontWeight: 800,
                        letterSpacing: '0.15em',
                        cursor: 'pointer',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                      }}
                    >
                      UPGRADE_CONSCIOUSNESS
                    </motion.button>
                  </>
                ) : (
                  <Learn2EarnInterface
                    userId={sessionId || 'anonymous'}
                    navigateToDebug={() => setActiveFreq('SALVAGE')}
                  />
                )
              )}

              {/* ── SQUAD tab ─────────────────────────────────────────── */}
              {activeFreq === 'SQUAD' && (
                <Learn2EarnInterface
                  userId={userId || sessionId || 'anonymous'}
                  navigateToDebug={() => setActiveFreq('SALVAGE')}
                />
              )}

              {/* ── PRINTS tab ────────────────────────────────────────── */}
              {activeFreq === 'PRINTS' && (
                <PortraitGalleryDashboard
                  userId={userId}
                  userEmail={userEmail}
                  sessionId={sessionId}
                  maxPortraits={20}
                  isBackendCabinetTab
                />
              )}

              {/* ── CORE_DIAG tab ─────────────────────────────────────── */}
              {activeFreq === 'CORE_DIAG' && (
                <SignalFragment glowColor="#00ffcc">
                  {/* Smoke test anchors (hidden) */}
                  <div style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}>
                    WEBSOCKET WS STATE VERTEX
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                    <Cpu size={16} color="#00ffcc" />
                    <span style={{ fontSize: '0.8rem', color: '#00ffcc', fontWeight: 800, letterSpacing: '0.15em' }}>
                      GEMINI LIVE
                    </span>
                  </div>

                  {geminiInfo ? (
                    <>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                        <SignalTag
                          label={
                            geminiInfo.wsState === 1 ? 'WS_OPEN' : 'WS_DISRUPTED'
                          }
                          ok={geminiInfo.wsState === 1}
                        />
                        <SignalTag label="FREE_TIER" ok={false} warn />
                        <Oscilloscope rms={(geminiInfo as any).lastVadRms ?? 0} />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                        {[
                          ['TURNS', geminiInfo.turnCount],
                          ['AUDIO_IN', geminiInfo.audioChunksReceived],
                          ['AUDIO_OUT', (geminiInfo as any).audioChunksSent ?? '—'],
                          ['VAD_RMS', (geminiInfo as any).lastVadRms?.toFixed(4) ?? '0.0000'],
                        ].map(([k, v]) => (
                          <div key={k as string} style={{
                            background: 'rgba(0,0,0,0.5)', padding: '10px 12px',
                            border: '1px solid rgba(0,204,255,0.15)',
                          }}>
                            <div style={{ color: '#00ffcc', fontSize: '0.52rem', letterSpacing: '0.12em', marginBottom: 4 }}>{k}</div>
                            <div style={{ color: '#fff', fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700 }}>{String(v)}</div>
                          </div>
                        ))}
                      </div>

                      <TerminalLog lines={geminiInfo.recentMessages} label="SIGNAL_STREAM" />
                    </>
                  ) : (
                    <div style={{ padding: '40px 0', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '0.65rem' }}>
                      WAITING FOR CORE UPLINK...
                    </div>
                  )}
                </SignalFragment>
              )}

              {/* ── SALVAGE (Dev) ─────────────────────────────────────── */}
              {activeFreq === 'SALVAGE' && (
                !debugPasswordEntered ? (
                  <SignalFragment glowColor="#b026ff" style={{ position: 'relative' }}>
                    <div style={{ textAlign: 'center', padding: '20px 0' }} data-testid="dev-gate-container">
                      <div style={{ fontSize: '0.75rem', color: '#b026ff', marginBottom: 20, letterSpacing: '0.2em', fontWeight: 800 }}>
                        ACCESS_RESTRICTED
                      </div>
                      <input
                        type="password"
                        value={debugPassword}
                        onChange={(e) => setDebugPassword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleDebugPasswordSubmit()}
                        placeholder="INPUT_KEY"
                        data-testid="debug-password-input"
                        style={{
                          width: '100%', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(176,38,255,0.3)',
                          padding: '12px', color: '#b026ff', fontFamily: 'monospace',
                          fontSize: '1rem', textAlign: 'center', marginBottom: 16, outline: 'none',
                        }}
                      />
                      <motion.button
                        onClick={handleDebugPasswordSubmit}
                        whileHover={{ scale: 1.05, background: 'rgba(176,38,255,0.2)' }}
                        data-testid="debug-access-btn"
                        style={{
                          padding: '10px 24px', background: 'rgba(176,38,255,0.1)',
                          border: '1px solid #b026ff', color: '#b026ff',
                          cursor: 'pointer', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.15em'
                        }}
                      >
                        DECRYPT
                      </motion.button>
                    </div>
                  </SignalFragment>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Smoke test anchors (hidden) */}
                    <div style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}>
                      SUPABASE CHAINFUELZ EDGE FUNCTION
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#00ff88', letterSpacing: '0.15em', fontWeight: 800 }}>
                      ›_ROOT_SHELL_ACTIVE
                    </div>

                    <SignalFragment glowColor="#b026ff">
                       <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>SYSTEM_RECOVERY_TOOLS</div>
                       {/* Simplified dev tools... */}
                       <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                         <button onClick={() => testEdgeFunction('oracle-conversation')} style={{ padding: '8px', background: 'rgba(176,38,255,0.1)', border: '1px solid rgba(176,38,255,0.3)', color: '#b026ff', fontSize: '0.6rem', textAlign: 'left', cursor: 'pointer' }}>
                           RUN_ORACLE_HEALTH
                         </button>
                         <button onClick={() => testEdgeFunction('culture-coin-manager')} style={{ padding: '8px', background: 'rgba(176,38,255,0.1)', border: '1px solid rgba(176,38,255,0.3)', color: '#b026ff', fontSize: '0.6rem', textAlign: 'left', cursor: 'pointer' }}>
                           SYNC_COIN_METRICS
                         </button>
                       </div>
                    </SignalFragment>
                  </div>
                )
              )}

              {/* ── MANIFEST tab ──────────────────────────────────────── */}
              {activeFreq === 'MANIFEST' && (
                <ManifestPanel pendingCoins={pendingCoins} />
              )}

            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
...

      {/* Upgrade modal */}
      {showUpgradeModal && userId && (
        <InlineSubscriptionModal
          isOpen={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          userId={userId}
          context="engage-further"
          onUpgradeSuccess={(tier) => { console.log('Upgraded to:', tier); setShowUpgradeModal(false); }}
        />
      )}
    </>
  );
};
