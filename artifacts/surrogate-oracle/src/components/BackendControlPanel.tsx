/**
 * BackendControlPanel — ENCULTURATE CRATE
 *
 * XR-grade holographic side panel for the SURROGATE:ORACLE experience.
 *
 * Tabs:
 *   VAULT        — Culture Coins + Neural Vault (ChainFuelz)
 *   SQUAD        — Learn2Earn interface
 *   NEURAL PRINTS — Portrait gallery
 *   DECART LIVE  — Decart WebRTC stream diagnostics
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
import type { DecartClientHandle } from './DecartClient';
import type { OracleConversationHandle } from './OracleConversation';

// ── Tab definition ────────────────────────────────────────────────────────────
type Tab = 'vault' | 'squad' | 'portraits' | 'decart' | 'gemini' | 'dev';

const TABS: { id: Tab; label: string; icon?: string }[] = [
  { id: 'vault',    label: 'VAULT' },
  { id: 'squad',    label: 'SQUAD' },
  { id: 'portraits', label: 'NEURAL\nPRINTS' },
  { id: 'decart',   label: 'DECART\nLIVE' },
  { id: 'gemini',   label: 'GEMINI\nLIVE' },
  { id: 'dev',      label: 'DEV' },
];

// ── HoloCard wrapper ──────────────────────────────────────────────────────────
function HoloCard({
  children,
  glowColor = '#00ff88',
  style,
}: {
  children: React.ReactNode;
  glowColor?: string;
  style?: React.CSSProperties;
}) {
  return (
    <motion.div
      whileHover={{ scale: 1.005 }}
      transition={{ duration: 0.2 }}
      style={{
        background: 'rgba(0,5,20,0.72)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${glowColor}28`,
        borderRadius: 12,
        boxShadow: `0 0 18px ${glowColor}0e, inset 0 0 14px rgba(0,0,0,0.45)`,
        padding: 16,
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* Scanline overlay */}
      <div
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,136,0.018) 2px, rgba(0,255,136,0.018) 4px)',
          zIndex: 0,
        }}
      />
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </motion.div>
  );
}

// ── TerminalLog — monospace scrollable log box ────────────────────────────────
function TerminalLog({ lines, label }: { lines: string[]; label: string }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: '0.58rem', color: '#00ccff', letterSpacing: '0.15em', marginBottom: 5 }}>
        {label}
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
  decartClientRef?: RefObject<DecartClientHandle | null>;
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
  decartClientRef,
  oracleConversationRef,
}: BackendControlPanelProps) => {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [debugPasswordEntered, setDebugPasswordEntered] = useState(false);
  const [debugPassword, setDebugPassword] = useState('');
  const [testResults, setTestResults] = useState<Record<string, unknown>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showRawAddress, setShowRawAddress] = useState(false);

  // Live debug polling state
  const [decartInfo, setDecartInfo] = useState<ReturnType<DecartClientHandle['getDebugInfo']> | null>(null);
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
    if (activeTab === 'decart' || activeTab === 'gemini') {
      pollRef.current = setInterval(() => {
        if (decartClientRef?.current) setDecartInfo(decartClientRef.current.getDebugInfo());
        if (oracleConversationRef?.current) setGeminiInfo(oracleConversationRef.current.getWsDebugInfo());
      }, 600);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeTab, decartClientRef, oracleConversationRef]);

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
        initial={{ x: '100%', opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 220 }}
        style={{
          position: 'fixed',
          right: 0, top: 0, bottom: 0,
          width: 'min(420px, 92vw)',
          background: 'linear-gradient(160deg, rgba(0,0,25,0.97) 0%, rgba(8,0,42,0.98) 100%)',
          borderLeft: '1px solid rgba(176,38,255,0.28)',
          zIndex: 150,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: "'PhillySans', 'Orbitron', monospace",
          overflowY: 'hidden',
          boxShadow: '-20px 0 80px rgba(0,0,0,0.7), -2px 0 0 rgba(176,38,255,0.18)',
        }}
        data-testid="backend-panel"
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid rgba(176,38,255,0.18)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(176,38,255,0.05)',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#00ff88', letterSpacing: '0.14em' }}>
              ENCULTURATE CRATE
            </div>
            <div style={{ fontSize: '0.55rem', color: '#00ccff', marginTop: 2, letterSpacing: '0.1em' }}>
              LEARN2EARN BACKEND
            </div>
          </div>
          {onClose && (
            <motion.button
              onClick={onClose}
              whileHover={{ scale: 1.15, color: '#00ff88' }}
              style={{ background: 'none', border: 'none', color: '#ffffff88', cursor: 'pointer', padding: 6 }}
            >
              <X size={15} />
            </motion.button>
          )}
        </div>

        {/* ── Tab strip ──────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(0,0,0,0.25)',
          flexShrink: 0,
          overflowX: 'auto',
        }}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <motion.button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                whileHover={{ backgroundColor: 'rgba(0,255,136,0.06)' }}
                data-testid={`tab-${tab.id}`}
                style={{
                  flex: 1,
                  minWidth: 52,
                  padding: '8px 4px',
                  background: isActive ? 'rgba(0,255,136,0.1)' : 'transparent',
                  border: 'none',
                  borderBottom: `2px solid ${isActive ? '#00ff88' : 'transparent'}`,
                  color: isActive ? '#00ff88' : '#ffffff66',
                  fontFamily: "'PhillySans', 'Orbitron', monospace",
                  fontSize: '0.52rem',
                  letterSpacing: '0.06em',
                  cursor: 'pointer',
                  lineHeight: 1.3,
                  whiteSpace: 'pre-line',
                  textAlign: 'center',
                  transition: 'border-color 0.2s, color 0.2s',
                }}
              >
                {tab.label}
              </motion.button>
            );
          })}
        </div>

        {/* ── Tab content ────────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
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

              {/* ── DECART LIVE tab ───────────────────────────────────── */}
              {activeTab === 'decart' && (
                <HoloCard glowColor="#b026ff">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <Activity size={14} color="#b026ff" />
                    <span style={{ fontSize: '0.7rem', color: '#b026ff', fontWeight: 700, letterSpacing: '0.12em' }}>
                      DECART LIVE
                    </span>
                  </div>

                  {decartInfo ? (
                    <>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                        <StatusBadge
                          label={decartInfo.connectionState.toUpperCase()}
                          ok={decartInfo.connectionState === 'connected'}
                          warn={decartInfo.connectionState === 'connecting'}
                        />
                        <StatusBadge label={decartInfo.isActive ? 'STREAM ACTIVE' : 'NO STREAM'} ok={decartInfo.isActive} />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.62rem' }}>
                        {[
                          ['TALK COUNT', decartInfo.talkCount],
                          ['UPTIME', decartInfo.streamUptimeMs != null ? `${Math.round(decartInfo.streamUptimeMs / 1000)}s` : '—'],
                        ].map(([k, v]) => (
                          <div key={k as string} style={{
                            background: 'rgba(0,0,0,0.4)', borderRadius: 6, padding: '7px 10px',
                            border: '1px solid rgba(176,38,255,0.12)',
                          }}>
                            <div style={{ color: '#00ccff', fontSize: '0.52rem', letterSpacing: '0.12em', marginBottom: 3 }}>{k}</div>
                            <div style={{ color: '#fff', fontFamily: 'monospace' }}>{v}</div>
                          </div>
                        ))}
                      </div>

                      {decartInfo.lastError && (
                        <div style={{ marginTop: 10, padding: '7px 10px', background: 'rgba(176,38,255,0.1)', border: '1px solid rgba(176,38,255,0.25)', borderRadius: 6 }}>
                          <div style={{ fontSize: '0.55rem', color: '#cc88ff', fontFamily: 'monospace' }}>{decartInfo.lastError}</div>
                        </div>
                      )}

                      <TerminalLog lines={decartInfo.recentCallbacks} label="CALLBACK LOG" />
                    </>
                  ) : (
                    <div style={{ fontSize: '0.62rem', color: '#ffffff44', fontStyle: 'italic', textAlign: 'center', padding: '20px 0' }}>
                      Decart stream not initialized yet.<br />Enter the Oracle to begin.
                    </div>
                  )}
                </HoloCard>
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
                          ['AUDIO CHUNKS', geminiInfo.audioChunksReceived],
                          ['CONNECTED', geminiInfo.connectedAt ? new Date(geminiInfo.connectedAt).toLocaleTimeString() : '—'],
                          ['ENDPOINT', geminiInfo.endpoint],
                        ].map(([k, v]) => (
                          <div key={k as string} style={{
                            background: 'rgba(0,0,0,0.4)', borderRadius: 6, padding: '7px 10px',
                            border: '1px solid rgba(0,191,255,0.12)',
                          }}>
                            <div style={{ color: '#00ccff', fontSize: '0.52rem', letterSpacing: '0.12em', marginBottom: 3 }}>{k}</div>
                            <div style={{ color: '#fff', fontFamily: 'monospace' }}>{v}</div>
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
                        <div>Decart: {import.meta.env.VITE_DECART_API_KEY ? '✅' : '⚠️ (via edge fn)'}</div>
                      </div>
                    </HoloCard>
                  </div>
                )
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
