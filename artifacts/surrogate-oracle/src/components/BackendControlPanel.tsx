import { useState, useEffect } from 'react';
import { X, Wallet } from 'lucide-react';
import { CultureCoinDisplay } from './CultureCoinDisplay';
import { InlineSubscriptionModal } from './InlineSubscriptionModal';
import { PortraitGalleryDashboard } from './PortraitGalleryDashboard';
import { Learn2EarnInterface } from './Learn2EarnInterface';
import { supabaseEdgeFunctionHeaders } from '../lib/supabase';
import { useChainFuelz } from '../hooks/useChainFuelz';

interface BackendControlPanelProps {
  userId?: string;
  sessionId?: string;
  isVisible?: boolean;
  initialTab?: 'coins' | 'squad' | 'portraits' | 'debug';
  onClose?: () => void;
  isAuthenticated?: boolean;
  userEmail?: string;
  pendingCoins?: number; // Added to trigger auto-claim
}

export const BackendControlPanel = ({
  userId,
  sessionId,
  isVisible = true,
  initialTab = 'coins',
  onClose,
  isAuthenticated = false,
  userEmail,
  pendingCoins = 0,
}: BackendControlPanelProps) => {
  const [activeTab, setActiveTab] = useState<'coins' | 'squad' | 'portraits' | 'debug'>(initialTab);
  const [debugPasswordEntered, setDebugPasswordEntered] = useState(false);
  const [debugPassword, setDebugPassword] = useState('');
  const [testResults, setTestResults] = useState<Record<string, unknown>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showRawAddress, setShowRawAddress] = useState(false);

  // Pass pendingCoins so the wallet can auto-mint them on initialization
  const chainFuelz = useChainFuelz(userEmail, pendingCoins);

  useEffect(() => {
    setActiveTab(initialTab);
    if (initialTab !== 'debug') {
      setDebugPasswordEntered(false);
      setDebugPassword('');
    }
  }, [initialTab]);

  const handleDebugPasswordSubmit = () => {
    if (debugPassword === '3nculturate!') {
      setDebugPasswordEntered(true);
      setDebugPassword('');
    }
  };

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

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

  const panelStyle: React.CSSProperties = {
    position: 'fixed',
    right: 0,
    top: 0,
    bottom: 0,
    width: '380px',
    background: 'linear-gradient(180deg, rgba(0,0,20,0.97) 0%, rgba(5,0,30,0.97) 100%)',
    border: '1px solid rgba(176,38,255,0.2)',
    borderRight: 'none',
    zIndex: 150,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: "'PhillySans', 'Orbitron', monospace",
    overflowY: 'auto',
    boxShadow: '-10px 0 40px rgba(0,0,0,0.5)',
  };

  const tabStyle = (tab: string): React.CSSProperties => ({
    flex: 1,
    padding: '10px 6px',
    background: activeTab === tab ? 'rgba(0,255,136,0.1)' : 'transparent',
    border: 'none',
    borderBottom: `2px solid ${activeTab === tab ? '#00ff88' : 'transparent'}`,
    color: activeTab === tab ? '#00ff88' : '#ffffff',
    fontFamily: "'PhillySans', 'Orbitron', monospace",
    fontSize: '0.6rem',
    letterSpacing: '0.08em',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  });

  if (!isVisible) return null;

  return (
    <>
      <div style={panelStyle}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#00ff88', letterSpacing: '0.1em' }}>ENCULTURATE CRATE</div>
            <div style={{ fontSize: '0.6rem', color: '#eab308', marginTop: 2 }}>LEARN2EARN BACKEND</div>
          </div>
          {onClose && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#ffffff', cursor: 'pointer', padding: 4 }}>
              <X size={16} />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {(['coins', 'squad', 'portraits', 'debug'] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={tabStyle(tab)}>
              {tab.toUpperCase()}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {activeTab === 'coins' && (
            userId ? (
              <>
                <CultureCoinDisplay
                  userId={userId}
                  onLevelUp={(level, title) => console.log(`Level up! ${level}: ${title}`)}
                />

                <div style={{ padding: '0 20px 20px' }}>
                  <div style={{ 
                    background: 'rgba(0, 0, 0, 0.4)', 
                    border: '1px solid rgba(176,38,255,0.25)', 
                    borderRadius: 8, 
                    padding: 16,
                    marginBottom: 20,
                    position: 'relative',
                    overflow: 'hidden'
                  }}>
                    {/* Minting Overlay */}
                    {chainFuelz.isMinting && (
                      <div style={{
                        position: 'absolute', inset: 0, background: 'rgba(0,255,136,0.1)', backdropFilter: 'blur(4px)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10
                      }}>
                        <div style={{ width: 24, height: 24, border: '2px solid #00ff88', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: 8 }} />
                        <span style={{ fontSize: '0.65rem', color: '#00ff88', letterSpacing: '0.2em' }}>DECRYPTING YIELD...</span>
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Wallet size={16} color="#00ff88" />
                        <div style={{ fontSize: '0.7rem', color: '#00ff88', letterSpacing: '0.1em' }}>NEURAL VAULT</div>
                      </div>
                      {chainFuelz.isInitialized && (
                         <button onClick={() => setShowRawAddress(!showRawAddress)} style={{ background: 'none', border: 'none', color: '#ffffff', fontSize: '0.55rem', cursor: 'pointer' }}>
                           {showRawAddress ? 'HIDE SECRETS' : 'DEV LOG'}
                         </button>
                      )}
                    </div>

                    {chainFuelz.isInitialized ? (
                      <>
                        <div style={{ fontSize: '0.65rem', color: '#eab308', marginBottom: 4 }}>VAULT ID</div>
                        <div style={{ fontSize: '0.8rem', color: '#fff', fontFamily: 'monospace', background: 'rgba(255,255,255,0.05)', padding: '6px 10px', borderRadius: 4, letterSpacing: '0.05em' }}>
                          {chainFuelz.vaultHandle}
                        </div>
                        
                        {showRawAddress && (
                           <div style={{ fontSize: '0.55rem', color: '#eab308', marginTop: 4, wordBreak: 'break-all', fontFamily: 'monospace' }}>
                             RAW: {chainFuelz.walletAddress}
                           </div>
                        )}

                        <div style={{ 
                          marginTop: 12, 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          padding: '8px 10px',
                          background: chainFuelz.justClaimed ? 'rgba(0,255,136,0.15)' : 'rgba(0,0,0,0.3)',
                          border: `1px solid ${chainFuelz.justClaimed ? 'rgba(0,255,136,0.5)' : 'transparent'}`,
                          borderRadius: 4,
                          transition: 'all 0.5s ease'
                        }}>
                          <span style={{ fontSize: '0.65rem', color: '#ffffff' }}>CULTURE YIELD</span>
                          <span style={{ fontSize: '0.85rem', color: '#00ff88', fontWeight: 'bold', textShadow: chainFuelz.justClaimed ? '0 0 10px rgba(0,255,136,0.8)' : 'none' }}>
                            {chainFuelz.balance}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: '0.7rem', color: '#eab308', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#eab308', animation: 'pulse 2s infinite' }} />
                        Initializing Neural Vault...
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => setShowUpgradeModal(true)}
                    style={{
                      width: '100%', padding: '12px',
                      background: 'linear-gradient(135deg, #170529, #b026ff)',
                      border: '1px solid rgba(176,38,255,0.5)', borderRadius: 8, color: '#fff',
                      fontFamily: "'PhillySans', 'Orbitron', monospace", fontSize: '0.75rem',
                      letterSpacing: '0.08em', cursor: 'pointer', fontWeight: 700,
                    }}
                  >
                    UPGRADE CONSCIOUSNESS
                  </button>
                </div>
              </>
            ) : (
              <Learn2EarnInterface
                userId={sessionId || 'anonymous'}
                navigateToDebug={() => setActiveTab('debug')}
              />
            )
          )}

          {activeTab === 'squad' && (
            <div style={{ padding: 20 }}>
              <Learn2EarnInterface
                userId={userId || sessionId || 'anonymous'}
                navigateToDebug={() => setActiveTab('debug')}
              />
            </div>
          )}

          {activeTab === 'portraits' && (
            <PortraitGalleryDashboard
              userId={userId}
              maxPortraits={20}
              isBackendCabinetTab
            />
          )}

          {activeTab === 'debug' && (
            <div style={{ padding: 20 }}>
              {!debugPasswordEntered ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: '#eab308', marginBottom: 16 }}>🔒 Developer Access Required</div>
                  <input
                    type="password"
                    value={debugPassword}
                    onChange={(e) => setDebugPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleDebugPasswordSubmit()}
                    placeholder="Enter dev password..."
                    style={{
                      width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(0,255,136,0.3)',
                      borderRadius: 6, padding: '8px 12px', color: '#00ff88', fontFamily: 'monospace',
                      fontSize: '0.85rem', marginBottom: 10, boxSizing: 'border-box',
                    }}
                  />
                  <button onClick={handleDebugPasswordSubmit} style={{ padding: '8px 20px', background: 'rgba(0,255,136,0.15)', border: '1px solid #00ff88', borderRadius: 6, color: '#00ff88', cursor: 'pointer', fontFamily: "'PhillySans', 'Orbitron', monospace", fontSize: '0.7rem' }}>
                    ACCESS
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontSize: '0.7rem', color: '#00ff88', marginBottom: 8 }}>✅ Developer Console Active</div>

                  {
                    [
                      { name: 'oracle-conversation', label: 'Oracle Conversation', payload: { action: 'health_check' } },
                      { name: 'culture-coin-manager', label: 'Culture Coin Manager', payload: { action: 'get_user_metrics', userId: userId || 'test' } },
                      { name: 'd-id-api-handler', label: 'D-ID API Handler', payload: {} },
                    ].map(({ name, label, payload }) => (
                      <div key={name} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(176,38,255,0.2)', borderRadius: 8, padding: '12px 14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <div style={{ fontSize: '0.7rem', color: '#ffffff' }}>{label}</div>
                          <button
                            onClick={() => testEdgeFunction(name, payload)}
                            disabled={isLoading}
                            style={{ padding: '4px 10px', background: 'rgba(176,38,255,0.1)', border: '1px solid rgba(176,38,255,0.3)', borderRadius: 4, color: '#b026ff', cursor: 'pointer', fontSize: '0.65rem', fontFamily: "'PhillySans', 'Orbitron', monospace" }}
                          >
                            TEST
                          </button>
                        </div>
                        {!!testResults[name] && (
                          <pre style={{ margin: 0, fontSize: '0.65rem', color: (testResults[name] as { success?: boolean }).success ? '#00ff88' : '#eab308', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                            {JSON.stringify(testResults[name], null, 2)}
                          </pre>
                        )}
                      </div>
                    ))
                  }

                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(176,38,255,0.2)', borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ fontSize: '0.65rem', color: '#eab308', marginBottom: 8 }}>SESSION INFO</div>
                    <div style={{ fontSize: '0.65rem', color: '#ffffff', fontFamily: 'monospace', lineHeight: 1.8 }}>
                      <div>Session: {sessionId?.slice(0, 16)}...</div>
                      <div>User: {userId || 'anonymous'}</div>
                      <div>Auth: {isAuthenticated ? '✅' : '❌'}</div>
                      <div>Supabase: {supabaseUrl ? '✅' : '❌ Not configured'}</div>
                      <div>Decart: {import.meta.env.VITE_DECART_API_KEY ? '✅' : '❌ Not configured'}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

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
