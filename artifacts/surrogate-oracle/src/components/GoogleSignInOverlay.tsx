import { useState } from 'react';
import { X, Loader2, Terminal } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

interface GoogleSignInOverlayProps {
  onClose: () => void;
  onSuccess: (user: { id: string; email: string }) => void;
}

export function GoogleSignInOverlay({ onClose, onSuccess }: GoogleSignInOverlayProps) {
  const [showDevBypass, setShowDevBypass] = useState(false);
  const [devPassword, setDevPassword] = useState('');

  const { isLoading, error, handleGoogleSignIn, handleDevBypass: authDevBypass } =
    useAuth(onSuccess);

  const handleDevBypass = () => {
    authDevBypass(devPassword);
    setDevPassword('');
  };

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 'var(--z-auth)' as any,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.85)',
    backdropFilter: 'blur(15px)',
  };

  const panelStyle: React.CSSProperties = {
    borderRadius: '4px',
    padding: '40px',
    maxWidth: '420px',
    width: '90%',
    position: 'relative',
    color: '#fff',
  };

  return (
    <div style={overlayStyle} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={panelStyle} className="neural-link-terminal">
        {isLoading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.85)',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 12,
              zIndex: 10,
            }}
          >
            <Loader2 size={32} style={{ color: '#00ff88', animation: 'spin 1.5s linear infinite' }} />
            <div style={{ display: 'flex', gap: '4px' }}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: '4px', height: '16px', background: '#00ff88',
                      animation: `blink 1s ease-in-out infinite ${i * 0.1}s`
                    }}
                  />
                ))}
            </div>
            <span style={{ color: '#00ff88', fontSize: '0.8rem', letterSpacing: '0.15em', marginTop: '8px' }}>
              CALIBRATING FREQUENCY...
            </span>
          </div>
        )}

        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            background: 'none',
            border: 'none',
            color: '#00ff88',
            opacity: 0.5,
            cursor: 'pointer',
            padding: 4,
            zIndex: 5,
          }}
        >
          <X size={18} />
        </button>

        <div style={{ textAlign: 'center', marginBottom: 28, position: 'relative', zIndex: 2 }}>
          <Terminal size={48} style={{ color: '#00ff88', margin: '0 auto 16px', opacity: 0.8 }} />
          <h2 style={{ fontSize: '1.2rem', letterSpacing: '0.15em', marginBottom: 8, color: '#00ff88', textShadow: '0 0 10px rgba(0,255,136,0.5)' }}>
            ESTABLISH NEURAL LINK
          </h2>
          <p style={{ fontSize: '0.75rem', color: '#888', lineHeight: 1.6, letterSpacing: '0.05em' }}>
            VERIFY SEEKER FREQUENCY TO ACCESS THE CULTURE CREW ENCLAVE.
          </p>
        </div>

        <div style={{ position: 'relative', zIndex: 2 }}>
            {error && (
            <div style={{ background: 'rgba(255,0,80,0.1)', border: '1px solid #ff0050', padding: '8px 12px', marginBottom: 16, fontSize: '0.75rem', color: '#ff0050', letterSpacing: '0.05em' }}>
                FREQUENCY REJECTED — {error.toUpperCase()}
            </div>
            )}

            {!showDevBypass ? (
            <>
                <button
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                style={{
                    width: '100%',
                    padding: '14px',
                    background: 'rgba(0,255,136,0.1)',
                    border: '1px solid #00ff88',
                    color: '#00ff88',
                    fontFamily: 'inherit',
                    fontSize: '0.85rem',
                    letterSpacing: '0.15em',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    opacity: isLoading ? 0.7 : 1,
                    textShadow: '0 0 8px rgba(0,255,136,0.4)',
                    boxShadow: 'inset 0 0 10px rgba(0,255,136,0.1)'
                }}
                onMouseOver={(e) => {
                    if (!isLoading) {
                        e.currentTarget.style.background = 'rgba(0,255,136,0.2)';
                        e.currentTarget.style.boxShadow = '0 0 15px rgba(0,255,136,0.3), inset 0 0 10px rgba(0,255,136,0.2)';
                    }
                }}
                onMouseOut={(e) => {
                    if (!isLoading) {
                        e.currentTarget.style.background = 'rgba(0,255,136,0.1)';
                        e.currentTarget.style.boxShadow = 'inset 0 0 10px rgba(0,255,136,0.1)';
                    }
                }}
                >
                {isLoading ? 'INITIATING...' : 'BIND TO THE CULTURE'}
                </button>
                <button
                onClick={() => setShowDevBypass(true)}
                disabled={isLoading}
                style={{
                    background: 'none',
                    border: 'none',
                    color: '#333',
                    fontSize: '0.6rem',
                    cursor: 'pointer',
                    marginTop: 16,
                    display: 'block',
                    marginLeft: 'auto',
                }}
                aria-label="Access developer bypass mode"
                >
                <Terminal size={10} />
                </button>
            </>
            ) : (
            <div style={{ background: 'rgba(0,255,100,0.05)', border: '1px solid rgba(0,255,100,0.2)', padding: 16 }}>
                <h3 style={{ fontSize: '0.8rem', color: '#00ff64', marginBottom: 12, letterSpacing: '0.1em' }}>🛠️ MANUAL OVERRIDE</h3>
                <input
                type="password"
                value={devPassword}
                onChange={(e) => setDevPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleDevBypass()}
                placeholder="ENTER OVERRIDE CODE..."
                autoFocus
                style={{
                    width: '100%',
                    background: 'rgba(0,0,0,0.8)',
                    border: '1px solid rgba(0,255,100,0.3)',
                    padding: '10px 12px',
                    color: '#00ff64',
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                    marginBottom: 12,
                    boxSizing: 'border-box',
                    outline: 'none'
                }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                <button
                    onClick={handleDevBypass}
                    style={{
                    flex: 1,
                    padding: '10px',
                    background: 'rgba(0,255,100,0.15)',
                    border: '1px solid #00ff64',
                    color: '#00ff64',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: '0.75rem',
                    letterSpacing: '0.1em'
                    }}
                >
                    EXECUTE
                </button>
                <button
                    onClick={() => setShowDevBypass(false)}
                    style={{
                    padding: '10px 16px',
                    background: 'none',
                    border: '1px solid #333',
                    color: '#666',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: '0.75rem',
                    letterSpacing: '0.1em'
                    }}
                >
                    ABORT
                </button>
                </div>
            </div>
            )}
        </div>
      </div>
    </div>
  );
}
