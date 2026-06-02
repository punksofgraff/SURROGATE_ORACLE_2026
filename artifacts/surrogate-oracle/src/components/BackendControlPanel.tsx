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

// ── Tab definition ────────────────────────────────────────────────────────────
type Tab = 'vault' | 'squad' | 'portraits' | 'gemini' | 'dev' | 'manifest';

const TABS: { id: Tab; label: string; glyph: string }[] = [
  { id: 'vault',    label: 'VAULT',   glyph: '◈' },
  { id: 'squad',    label: 'SQUAD',   glyph: '⬡' },
  { id: 'portraits', label: 'PRINTS', glyph: '◻' },
  { id: 'gemini',   label: 'GEMINI',  glyph: '⬡' },
  { id: 'dev',      label: 'DEV',     glyph: '⌘' },
  { id: 'manifest', label: 'M4NIFST', glyph: '⊞' },
];

// ── RiftGrid — full-panel 3D perspective grid background ─────────────────────
function RiftGrid() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      {/* Primary Sacred Green floor grid — recedes toward top of panel */}
      <motion.div
        animate={{ backgroundPosition: ['0px 0px', '0px 44px'] }}
        transition={{ repeat: Infinity, duration: 2.8, ease: 'linear' }}
        style={{
          position: 'absolute',
          left: '-30%', right: '-30%', top: '15%', bottom: '-10%',
          backgroundImage: `
            linear-gradient(rgba(0,255,136,0.11) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,255,136,0.11) 1px, transparent 1px)
          `,
          backgroundSize: '44px 44px',
          transform: 'perspective(260px) rotateX(58deg)',
          transformOrigin: '50% 100%',
        }}
      />
      {/* Profane Purple secondary grid — offset phase, slower */}
      <motion.div
        animate={{ backgroundPosition: ['0px 0px', '0px 88px'] }}
        transition={{ repeat: Infinity, duration: 5.6, ease: 'linear' }}
        style={{
          position: 'absolute',
          left: '-30%', right: '-30%', top: '30%', bottom: '-10%',
          backgroundImage: `
            linear-gradient(rgba(176,38,255,0.055) 1px, transparent 1px),
            linear-gradient(90deg, rgba(176,38,255,0.04) 1px, transparent 1px)
          `,
          backgroundSize: '88px 88px',
          backgroundPosition: '22px 22px',
          transform: 'perspective(260px) rotateX(58deg)',
          transformOrigin: '50% 100%',
        }}
      />
      {/* Content protection overlay — dark in center, grid bleeds at edges + bottom */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `
          radial-gradient(ellipse 85% 65% at 50% 38%, rgba(0,0,22,0.93) 0%, rgba(0,0,22,0.55) 100%)
        `,
      }} />
      {/* Top horizon fade */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, rgba(0,0,25,0.97) 0%, transparent 28%, transparent 72%, rgba(0,0,25,0.6) 100%)',
      }} />
    </div>
  );
}

// ── HoloCard wrapper — XR corner-bracket framing ──────────────────────────────
function HoloCard({
  children,
  glowColor = '#00ff88',
  style,
}: {
  children: React.ReactNode;
  glowColor?: string;
  style?: React.CSSProperties;
}) {
  const corners = [
    { top: 0,    left: 0,    borderTop: `1.5px solid ${glowColor}`, borderLeft:  `1.5px solid ${glowColor}` },
    { top: 0,    right: 0,   borderTop: `1.5px solid ${glowColor}`, borderRight: `1.5px solid ${glowColor}` },
    { bottom: 0, left: 0,    borderBottom: `1.5px solid ${glowColor}`, borderLeft:  `1.5px solid ${glowColor}` },
    { bottom: 0, right: 0,   borderBottom: `1.5px solid ${glowColor}`, borderRight: `1.5px solid ${glowColor}` },
  ];
  return (
    <motion.div
      whileHover={{ scale: 1.005 }}
      transition={{ duration: 0.2 }}
      style={{
        background: 'rgba(0,4,18,0.78)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: `1px solid ${glowColor}14`,
        borderRadius: 10,
        boxShadow: `0 0 28px ${glowColor}0a, 0 8px 32px rgba(0,0,0,0.55), inset 0 0 14px rgba(0,0,0,0.4)`,
        padding: 16,
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* Corner brackets */}
      {corners.map((c, i) => (
        <div key={i} style={{ position: 'absolute', width: 11, height: 11, ...c, opacity: 0.85 }} />
      ))}
      {/* Scanline overlay */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,136,0.016) 2px, rgba(0,255,136,0.016) 4px)',
        zIndex: 0,
      }} />
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </motion.div>
  );
}

// ── TerminalLog — monospace scrollable log box ────────────────────────────────
function TerminalLog({ lines, label }: { lines: string[]; label: string }) {
  const copyLines = () => {
    navigator.clipboard.writeText(lines.join('\n'));
    // We don't have a toast here, but we can log to console
    console.log(`[ORACLE:AUDIT] Copied ${label} logs`);
  };

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <div style={{ fontSize: '0.58rem', color: '#00ccff', letterSpacing: '0.15em' }}>
          {label}
        </div>
        <button 
          onClick={copyLines}
          style={{ 
            background: 'none', border: 'none', color: '#00ff88', 
            fontSize: '0.5rem', cursor: 'pointer', opacity: 0.5,
            padding: '2px 4px'
          }}
        >
          COPY
        </button>
      </div>
      <div style={{
        background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(0,255,136,0.15)',
        borderRadius: 6, padding: '8px 10px', maxHeight: 120, overflowY: 'auto',
        fontFamily: 'monospace', fontSize: '0.6rem', color: '#00ff88',
        lineHeight: 1.7,
      }}>
        {lines.length === 0 ? (
          <span style={{ color: '#444', fontStyle: 'italic' }}>— no events yet —</span>
        ) : (
          lines.map((l, i) => <div key={i}>{l}</div>)
        )}
      </div>
    </div>
  );
}

// ── StatusBadge ───────────────────────────────────────────────────────────────
function StatusBadge({ label, ok, warn }: { label: string; ok: boolean; warn?: boolean }) {
  const color = warn ? '#b026ff' : ok ? '#00ff88' : '#cc00ff';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 8px', borderRadius: 99,
      background: `${color}18`, border: `1px solid ${color}55`,
      fontSize: '0.58rem', letterSpacing: '0.1em', color,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {label}
    </span>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface BackendControlPanelProps {
  userId?: string;
  sessionId?: string;
  isVisible?: boolean;
  initialTab?: Tab;
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
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const saved = localStorage.getItem('oracle_crate_active_tab');
    if (saved) return saved as Tab;
    return initialTab;
  });
  const [debugPasswordEntered, setDebugPasswordEntered] = useState(false);
  
  // ... rest of the component state ...

  // Sync activeTab to localStorage
  useEffect(() => {
    localStorage.setItem('oracle_crate_active_tab', activeTab);
  }, [activeTab]);

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

  // Sync initialTab changes
  useEffect(() => {
    // Map legacy tab names from parent (coins → vault)
    const mapped: Tab = (initialTab as string) === 'coins' ? 'vault'
      : (initialTab as string) === 'debug' ? 'dev'
      : initialTab;
    setActiveTab(mapped);
    if (mapped !== 'dev') {
      setDebugPasswordEntered(false);
      setDebugPassword('');
    }
  }, [initialTab]);

  // Poll debug info when on debug tabs
  useEffect(() => {
    if (activeTab === 'gemini') {
      pollRef.current = setInterval(() => {
        if (oracleConversationRef?.current) setGeminiInfo(oracleConversationRef.current.getWsDebugInfo());
      }, 600);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeTab, oracleConversationRef]);

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
          background: 'linear-gradient(160deg, rgba(0,0,22,0.97) 0%, rgba(6,0,38,0.98) 100%)',
          borderLeft: '1px solid rgba(176,38,255,0.32)',
          zIndex: 150,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: "'aAnotherTag', 'Orbitron', monospace",
          overflowY: 'hidden',
          boxShadow: '-24px 0 90px rgba(0,0,0,0.8), -2px 0 0 rgba(176,38,255,0.22), -1px 0 40px rgba(0,255,136,0.04)',
          transformOrigin: 'right center',
        }}
        data-testid="backend-panel"
      >
        {/* ── Rift grid — full panel background ──────────────────────────── */}
        <RiftGrid />

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{
          padding: '13px 16px 11px',
          borderBottom: '1px solid rgba(176,38,255,0.2)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          background: 'rgba(0,0,18,0.55)',
          backdropFilter: 'blur(8px)',
          flexShrink: 0,
          position: 'relative',
          zIndex: 2,
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <motion.div
                animate={{ opacity: [1, 0.3, 1], scale: [1, 0.85, 1] }}
                transition={{ repeat: Infinity, duration: 2.1, ease: 'easeInOut' }}
                style={{ width: 6, height: 6, borderRadius: '50%', background: '#00ff88', boxShadow: '0 0 8px #00ff88', flexShrink: 0 }}
              />
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#00ff88', letterSpacing: '0.16em' }}>
                ENCULTURATE CRATE
              </div>
            </div>
            <div style={{ fontSize: '0.49rem', color: '#00ccff66', marginTop: 4, letterSpacing: '0.12em', fontFamily: 'monospace' }}>
              MODULE://ORACLE.RIFT/v2.30
            </div>
          </div>
          {onClose && (
            <motion.button
              onClick={onClose}
              whileHover={{ scale: 1.15, color: '#00ff88' }}
              style={{ background: 'none', border: 'none', color: '#ffffff55', cursor: 'pointer', padding: 6, marginTop: -2 }}
            >
              <X size={14} />
            </motion.button>
          )}
        </div>

        {/* ── Tab strip — swipe-scrollable, XR chip style ────────────────── */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(0,0,10,0.45)',
          backdropFilter: 'blur(6px)',
          flexShrink: 0,
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'],
          scrollbarWidth: 'none',
          position: 'relative',
          zIndex: 2,
        }}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <motion.button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                whileHover={{ backgroundColor: 'rgba(0,255,136,0.07)' }}
                data-testid={`tab-${tab.id}`}
                style={{
                  flex: 1,
                  minWidth: 56,
                  padding: '9px 4px 7px',
                  background: isActive ? 'rgba(0,255,136,0.08)' : 'transparent',
                  border: 'none',
                  borderBottom: `2px solid ${isActive ? '#00ff88' : 'transparent'}`,
                  boxShadow: isActive ? 'inset 0 -1px 12px rgba(0,255,136,0.12)' : 'none',
                  color: isActive ? '#00ff88' : '#ffffff44',
                  fontFamily: "'aAnotherTag', 'Orbitron', monospace",
                  fontSize: '0.48rem',
                  letterSpacing: '0.07em',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'border-color 0.2s, color 0.2s, box-shadow 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                <span style={{ fontSize: '0.75rem', lineHeight: 1, opacity: isActive ? 1 : 0.5 }}>{tab.glyph}</span>
                <span>{tab.label}</span>
              </motion.button>
            );
          })}
        </div>

        {/* ── Tab content ────────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, position: 'relative', zIndex: 2 }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >

              {/* ── VAULT tab ─────────────────────────────────────────── */}
              {activeTab === 'vault' && (
                userId ? (
                  <>
                    <CultureCoinDisplay
                      userId={userId}
                      onLevelUp={(level, title) => console.log(`Level up! ${level}: ${title}`)}
                    />

                    {/* Neural Vault */}
                    <HoloCard glowColor="#00ff88" style={{ position: 'relative' }}>
                      {/* Minting overlay */}
                      {chainFuelz.isMinting && (
                        <div style={{
                          position: 'absolute', inset: 0, zIndex: 10, borderRadius: 12,
                          background: 'rgba(0,255,136,0.08)', backdropFilter: 'blur(6px)',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <div style={{
                            width: 22, height: 22, border: '2px solid #00ff88', borderTopColor: 'transparent',
                            borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: 8,
                          }} />
                          <span style={{ fontSize: '0.6rem', color: '#00ff88', letterSpacing: '0.2em' }}>
                            DECRYPTING YIELD...
                          </span>
                        </div>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <Wallet size={14} color="#00ff88" />
                          <span style={{ fontSize: '0.68rem', color: '#00ff88', letterSpacing: '0.12em', fontWeight: 700 }}>
                            NEURAL VAULT
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <StatusBadge label="MOCK — AWAITING SDK" ok={false} warn />
                          {chainFuelz.isInitialized && (
                            <button
                              onClick={() => setShowRawAddress(!showRawAddress)}
                              style={{ background: 'none', border: 'none', color: '#ffffff55', fontSize: '0.52rem', cursor: 'pointer' }}
                            >
                              {showRawAddress ? 'HIDE' : 'DEV LOG'}
                            </button>
                          )}
                        </div>
                      </div>

                      {chainFuelz.isInitialized ? (
                        <>
                          <div style={{ fontSize: '0.58rem', color: '#00ccff', marginBottom: 4, letterSpacing: '0.1em' }}>VAULT ID</div>
                          <div style={{
                            fontSize: '0.78rem', color: '#fff', fontFamily: 'monospace',
                            background: 'rgba(0,255,136,0.06)', padding: '6px 10px', borderRadius: 6,
                            letterSpacing: '0.05em', border: '1px solid rgba(0,255,136,0.1)',
                          }}>
                            {chainFuelz.vaultHandle}
                          </div>
                          {showRawAddress && (
                            <div style={{ fontSize: '0.52rem', color: '#00ccff', marginTop: 4, wordBreak: 'break-all', fontFamily: 'monospace' }}>
                              RAW: {chainFuelz.walletAddress}
                            </div>
                          )}
                          <motion.div
                            animate={chainFuelz.justClaimed ? { boxShadow: ['0 0 0 rgba(0,255,136,0)', '0 0 20px rgba(0,255,136,0.35)', '0 0 0 rgba(0,255,136,0)'] } : {}}
                            transition={{ duration: 1.2 }}
                            style={{
                              marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '8px 10px',
                              background: chainFuelz.justClaimed ? 'rgba(0,255,136,0.12)' : 'rgba(0,0,0,0.3)',
                              border: `1px solid ${chainFuelz.justClaimed ? 'rgba(0,255,136,0.4)' : 'rgba(255,255,255,0.06)'}`,
                              borderRadius: 6, transition: 'all 0.5s ease',
                            }}
                          >
                            <span style={{ fontSize: '0.62rem', color: '#ffffff99' }}>CULTURE YIELD</span>
                            <span style={{
                              fontSize: '0.9rem', color: '#00ff88', fontWeight: 'bold',
                              textShadow: chainFuelz.justClaimed ? '0 0 12px rgba(0,255,136,0.9)' : 'none',
                            }}>
                              {chainFuelz.balance}
                            </span>
                          </motion.div>
                        </>
                      ) : (
                        <div style={{ fontSize: '0.65rem', color: '#00ccff', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Zap size={12} color="#00ccff" />
                          Initializing Neural Vault...
                        </div>
                      )}
                    </HoloCard>

                    {/* Upgrade CTA */}
                    <motion.button
                      onClick={() => setShowUpgradeModal(true)}
                      whileHover={{ scale: 1.02, boxShadow: '0 0 30px rgba(176,38,255,0.35)' }}
                      whileTap={{ scale: 0.98 }}
                      style={{
                        width: '100%', padding: '11px',
                        background: 'linear-gradient(135deg, rgba(23,5,41,0.9), rgba(176,38,255,0.7))',
                        border: '1px solid rgba(176,38,255,0.5)', borderRadius: 10, color: '#fff',
                        fontFamily: "'PhillySans', 'Orbitron', monospace", fontSize: '0.72rem',
                        letterSpacing: '0.1em', cursor: 'pointer', fontWeight: 700,
                        boxShadow: '0 0 16px rgba(176,38,255,0.18)',
                      }}
                    >
                      UPGRADE CONSCIOUSNESS
                    </motion.button>
                  </>
                ) : (
                  <Learn2EarnInterface
                    userId={sessionId || 'anonymous'}
                    navigateToDebug={() => setActiveTab('dev')}
                  />
                )
              )}

              {/* ── SQUAD tab ─────────────────────────────────────────── */}
              {activeTab === 'squad' && (
                <Learn2EarnInterface
                  userId={userId || sessionId || 'anonymous'}
                  navigateToDebug={() => setActiveTab('dev')}
                />
              )}

              {/* ── NEURAL PRINTS tab ─────────────────────────────────── */}
              {activeTab === 'portraits' && (
                <PortraitGalleryDashboard
                  userId={userId}
                  userEmail={userEmail}
                  sessionId={sessionId}
                  maxPortraits={20}
                  isBackendCabinetTab
                />
              )}

              {/* ── GEMINI LIVE tab ───────────────────────────────────── */}
              {activeTab === 'gemini' && (
                <HoloCard glowColor="#00ccff">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <Cpu size={14} color="#00ccff" />
                    <span style={{ fontSize: '0.7rem', color: '#00ccff', fontWeight: 700, letterSpacing: '0.12em' }}>
                      GEMINI LIVE
                    </span>
                  </div>

                  {geminiInfo ? (
                    <>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                        <StatusBadge
                          label={
                            geminiInfo.wsState === 0 ? 'CONNECTING' :
                            geminiInfo.wsState === 1 ? 'OPEN' :
                            geminiInfo.wsState === 2 ? 'CLOSING' :
                            geminiInfo.wsState === 3 ? 'CLOSED' : 'UNKNOWN'
                          }
                          ok={geminiInfo.wsState === 1}
                          warn={geminiInfo.wsState === 0 || geminiInfo.wsState === 2}
                        />
                        <StatusBadge
                          label="FREE API"
                          ok={false}
                          warn
                        />
                      </div>

                      <div style={{ fontSize: '0.58rem', color: '#ffffff55', marginBottom: 10, fontFamily: 'monospace' }}>
                        {geminiInfo.model}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.62rem' }}>
                        {[
                          ['TURNS', geminiInfo.turnCount],
                          ['AUDIO IN (rx)', geminiInfo.audioChunksReceived],
                          ['AUDIO OUT (tx)', (geminiInfo as any).audioChunksSent ?? '—'],
                          ['CONNECTED', geminiInfo.connectedAt ? new Date(geminiInfo.connectedAt).toLocaleTimeString() : '—'],
                          ['VAD STATE', (geminiInfo as any).lastVadState ?? '—'],
                          ['VAD RMS', (geminiInfo as any).lastVadRms != null ? ((geminiInfo as any).lastVadRms as number).toFixed(4) : '—'],
                          ['ACT START', (geminiInfo as any).activityStartsSent ?? '—'],
                          ['ACT END', (geminiInfo as any).activityEndsSent ?? '—'],
                        ].map(([k, v]) => (
                          <div key={k as string} style={{
                            background: 'rgba(0,0,0,0.4)', borderRadius: 6, padding: '7px 10px',
                            border: '1px solid rgba(0,191,255,0.12)',
                          }}>
                            <div style={{ color: '#00ccff', fontSize: '0.52rem', letterSpacing: '0.12em', marginBottom: 3 }}>{k}</div>
                            <div style={{ color: '#fff', fontFamily: 'monospace' }}>{String(v)}</div>
                          </div>
                        ))}
                      </div>

                      {geminiInfo.lastError && (
                        <div style={{ marginTop: 10, padding: '7px 10px', background: 'rgba(176,38,255,0.1)', border: '1px solid rgba(176,38,255,0.25)', borderRadius: 6 }}>
                          <div style={{ fontSize: '0.55rem', color: '#cc88ff', fontFamily: 'monospace' }}>{geminiInfo.lastError}</div>
                        </div>
                      )}

                      {/* Vertex AI roadmap notice */}
                      <div style={{ marginTop: 12, padding: '8px 10px', background: 'rgba(176,38,255,0.06)', border: '1px solid rgba(176,38,255,0.18)', borderRadius: 6 }}>
                        <div style={{ fontSize: '0.55rem', color: '#00ccff', letterSpacing: '0.1em', marginBottom: 3 }}>
                          VERTEX AI — PENDING
                        </div>
                        <div style={{ fontSize: '0.52rem', color: '#ffffff55', lineHeight: 1.5 }}>
                          Service account OAuth required →<br />
                          Unlocks enterprise open-model playground + BAA/HIPAA tier.
                        </div>
                      </div>

                      <TerminalLog lines={geminiInfo.recentMessages} label="WS MESSAGE LOG" />
                    </>
                  ) : (
                    <div style={{ fontSize: '0.62rem', color: '#ffffff44', fontStyle: 'italic', textAlign: 'center', padding: '20px 0' }}>
                      Gemini Live session not connected yet.<br />Enter the Oracle to begin.
                    </div>
                  )}
                </HoloCard>
              )}

              {/* ── DEV tab ───────────────────────────────────────────── */}
              {activeTab === 'dev' && (
                !debugPasswordEntered ? (
                  <HoloCard glowColor="#b026ff">
                    <div style={{ textAlign: 'center', padding: '10px 0' }}>
                      <div style={{ fontSize: '0.7rem', color: '#00ccff', marginBottom: 16, letterSpacing: '0.1em' }}>
                        🔒 DEVELOPER ACCESS REQUIRED
                      </div>
                      <input
                        type="password"
                        value={debugPassword}
                        onChange={(e) => setDebugPassword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleDebugPasswordSubmit()}
                        placeholder="Enter dev password..."
                        data-testid="debug-password-input"
                        style={{
                          width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(0,255,136,0.3)',
                          borderRadius: 6, padding: '8px 12px', color: '#00ff88', fontFamily: 'monospace',
                          fontSize: '0.82rem', marginBottom: 10, boxSizing: 'border-box',
                          outline: 'none',
                        }}
                      />
                      <motion.button
                        onClick={handleDebugPasswordSubmit}
                        whileHover={{ scale: 1.04 }}
                        data-testid="debug-access-btn"
                        style={{
                          padding: '7px 20px', background: 'rgba(0,255,136,0.12)',
                          border: '1px solid #00ff88', borderRadius: 6, color: '#00ff88',
                          cursor: 'pointer', fontFamily: "'PhillySans', 'Orbitron', monospace", fontSize: '0.68rem',
                          letterSpacing: '0.1em',
                        }}
                      >
                        ACCESS
                      </motion.button>
                    </div>
                  </HoloCard>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontSize: '0.65rem', color: '#00ff88', letterSpacing: '0.1em' }}>
                      ✅ Developer Console Active
                    </div>

                    {/* ── SUPABASE HEALTH ──────────────────────────── */}
                    <div style={{ fontSize: '0.58rem', color: '#ffffff44', letterSpacing: '0.15em', marginBottom: -4 }}>
                      SUPABASE HEALTH
                    </div>
                    {[
                      { name: 'oracle-conversation',  label: 'Oracle Conversation',  payload: { action: 'health_check' } },
                      { name: 'culture-coin-manager', label: 'Culture Coin Manager', payload: { action: 'get_user_metrics', userId: userId || 'test' } },
                    ].map(({ name, label, payload }) => (
                      <HoloCard key={name} glowColor="#b026ff" style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ fontSize: '0.65rem', color: '#fff' }}>{label}</span>
                          <motion.button
                            onClick={() => testEdgeFunction(name, payload)}
                            disabled={isLoading}
                            whileHover={{ scale: 1.05 }}
                            style={{
                              padding: '3px 10px', background: 'rgba(176,38,255,0.12)',
                              border: '1px solid rgba(176,38,255,0.35)', borderRadius: 4,
                              color: '#b026ff', cursor: 'pointer', fontSize: '0.6rem',
                              fontFamily: "'PhillySans', 'Orbitron', monospace",
                            }}
                          >
                            TEST
                          </motion.button>
                        </div>
                        {!!testResults[name] && (
                          <pre style={{
                            margin: 0, fontSize: '0.58rem',
                            color: (testResults[name] as { success?: boolean }).success ? '#00ff88' : '#00ccff',
                            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                          }}>
                            {JSON.stringify(testResults[name], null, 2)}
                          </pre>
                        )}
                      </HoloCard>
                    ))}

                    {/* ── CHAINFUELZ ───────────────────────────────── */}
                    <div style={{ fontSize: '0.58rem', color: '#ffffff44', letterSpacing: '0.15em', marginBottom: -4 }}>
                      CHAINFUELZ
                    </div>
                    {[
                      { name: 'mint-culture-coins', label: 'Mint Culture Coins', payload: { userId: userId || 'test', amount: 1, reason: 'debug_test' } },
                    ].map(({ name, label, payload }) => (
                      <HoloCard key={name} glowColor="#b026ff" style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ fontSize: '0.65rem', color: '#fff' }}>{label}</span>
                          <StatusBadge label="MOCK" ok={false} warn />
                          <motion.button
                            onClick={() => testEdgeFunction(name, payload)}
                            disabled={isLoading}
                            whileHover={{ scale: 1.05 }}
                            style={{
                              padding: '3px 10px', background: 'rgba(176,38,255,0.1)',
                              border: '1px solid rgba(176,38,255,0.35)', borderRadius: 4,
                              color: '#00ccff', cursor: 'pointer', fontSize: '0.6rem',
                              fontFamily: "'PhillySans', 'Orbitron', monospace",
                            }}
                          >
                            TEST
                          </motion.button>
                        </div>
                        {!!testResults[name] && (
                          <pre style={{ margin: 0, fontSize: '0.58rem', color: '#00ccff', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                            {JSON.stringify(testResults[name], null, 2)}
                          </pre>
                        )}
                      </HoloCard>
                    ))}

                    {/* ── VERTEX AI ROADMAP ────────────────────────── */}
                    <div style={{ fontSize: '0.58rem', color: '#ffffff44', letterSpacing: '0.15em', marginBottom: -4 }}>
                      VERTEX AI (ROADMAP)
                    </div>
                    <HoloCard glowColor="#b026ff" style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.65rem', color: '#fff' }}>Vertex AI Open Model Playground</span>
                        <StatusBadge label="PENDING" ok={false} warn />
                      </div>
                      <div style={{ fontSize: '0.55rem', color: '#ffffff44', marginTop: 6, lineHeight: 1.6 }}>
                        Requires: Google service account + OAuth JSON.<br />
                        Unlocks: BAA / HIPAA tier, enterprise model access.
                      </div>
                    </HoloCard>

                    {/* ── SESSION INFO ─────────────────────────────── */}
                    <HoloCard style={{ padding: '10px 12px' }}>
                      <div style={{ fontSize: '0.58rem', color: '#00ccff', marginBottom: 8, letterSpacing: '0.12em' }}>SESSION INFO</div>
                      <div style={{ fontSize: '0.6rem', color: '#fff', fontFamily: 'monospace', lineHeight: 2 }}>
                        <div>Session: {sessionId?.slice(0, 16)}...</div>
                        <div>User: {userId || 'anonymous'}</div>
                        <div>Auth: {isAuthenticated ? '✅' : '❌'}</div>
                        <div>Supabase: {supabaseUrl ? '✅' : '❌ Not configured'}</div>
                      </div>
                    </HoloCard>
                  </div>
                )
              )}

              {/* ── M4NIFEST tab ──────────────────────────────────── */}
              {activeTab === 'manifest' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <HoloCard glowColor="#00ffcc">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                      <span style={{ fontSize: '1rem', lineHeight: 1 }}>⊞</span>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: '#00ffcc', fontWeight: 700, letterSpacing: '0.14em' }}>M4NIFEST</div>
                        <div style={{ fontSize: '0.5rem', color: '#00ffcc55', letterSpacing: '0.1em', fontFamily: 'monospace' }}>ASSET PIPELINE</div>
                      </div>
                      <div style={{ marginLeft: 'auto' }}>
                        <span style={{
                          fontSize: '0.5rem', padding: '2px 8px', borderRadius: 99,
                          background: 'rgba(176,38,255,0.15)', border: '1px solid rgba(176,38,255,0.4)',
                          color: '#b026ff', letterSpacing: '0.1em',
                        }}>PIPELINE OFFLINE</span>
                      </div>
                    </div>

                    {/* Drop zone */}
                    <div style={{
                      border: '1px dashed rgba(0,255,204,0.25)',
                      borderRadius: 8,
                      padding: '28px 16px',
                      textAlign: 'center',
                      background: 'rgba(0,255,204,0.03)',
                      marginBottom: 14,
                    }}>
                      <div style={{ fontSize: '1.4rem', marginBottom: 8, opacity: 0.4 }}>↑</div>
                      <div style={{ fontSize: '0.62rem', color: '#00ffcc66', letterSpacing: '0.1em' }}>DROP .GLB / .FBX</div>
                      <div style={{ fontSize: '0.5rem', color: '#ffffff22', marginTop: 4, fontFamily: 'monospace' }}>pipeline script required</div>
                    </div>

                    {/* Category chips */}
                    <div style={{ fontSize: '0.52rem', color: '#ffffff33', letterSpacing: '0.12em', marginBottom: 8 }}>ROUTE TO CATEGORY</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {['AVATAR', 'ANIMATION', 'ATMOSPHERE', 'ACCESSORY', 'ELEMENT'].map(cat => (
                        <div key={cat} style={{
                          padding: '4px 10px', borderRadius: 99,
                          border: '1px solid rgba(0,255,204,0.15)',
                          background: 'rgba(0,255,204,0.04)',
                          fontSize: '0.5rem', color: '#00ffcc44', letterSpacing: '0.1em',
                        }}>{cat}</div>
                      ))}
                    </div>
                  </HoloCard>

                  <HoloCard glowColor="#b026ff" style={{ padding: '12px 14px' }}>
                    <div style={{ fontSize: '0.58rem', color: '#b026ff', letterSpacing: '0.12em', marginBottom: 8 }}>MANIFEST REGISTRY</div>
                    {(['avatars', 'animations', 'atmospheres', 'accessories', 'elements'] as const).map(cat => (
                      <div key={cat} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                        fontSize: '0.58rem',
                      }}>
                        <span style={{ color: '#ffffff55', fontFamily: 'monospace', letterSpacing: '0.08em' }}>{cat}</span>
                        <span style={{ color: '#ffffff22', fontFamily: 'monospace' }}>0 assets</span>
                      </div>
                    ))}
                  </HoloCard>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>

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
