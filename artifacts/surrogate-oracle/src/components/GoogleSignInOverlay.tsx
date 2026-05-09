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

  const { isLoading, error, handleGoogleSignIn, handleDevBypass: authDevBypass, clearError } =
    useAuth(onSuccess);

  const handleDevBypass = () => {
    authDevBypass(devPassword);
    setDevPassword('');
  };

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 300,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.85)',
    backdropFilter: 'blur(15px)',
  };

  const panelStyle: React.CSSProperties = {
    background: 'linear-gradient(135deg, rgba(10,10,20,0.95), rgba(0,0,40,0.95))',
    border: '1px solid rgba(0,255,255,0.3)',
    borderRadius: '16px',
    padding: '40px',
    maxWidth: '420px',
    width: '90%',
    position: 'relative',
    boxShadow: '0 0 40px rgba(0,255,255,0.2)',
    fontFamily: "'Orbitron', monospace",
    color: '#fff',
  };

  return (
    <div style={overlayStyle} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={panelStyle}>
        {isLoading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.7)',
              borderRadius: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 12,
              zIndex: 10,
            }}
          >
            <Loader2 size={32} style={{ color: '#00ffff', animation: 'spin 1s linear infinite' }} />
            <span style={{ color: '#00ffff', fontSize: '0.8rem' }}>Connecting to Google...</span>
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
            color: '#666',
            cursor: 'pointer',
            padding: 4,
          }}
        >
          <X size={18} />
        </button>

        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img
            src="https://sintra-images.s3.eu-north-1.amazonaws.com/3fddfa4f-21d6-4499-8920-9b9b4c304d56/message-files/8732b2b3-dfd0-4cea-beea-2dcb5d908947/unnamed.jpg"
            alt="Culture Coin"
            style={{ width: 64, height: 64, borderRadius: '50%', marginBottom: 16, objectFit: 'cover' }}
          />
          <h2 style={{ fontSize: '1.1rem', letterSpacing: '0.1em', marginBottom: 8, color: '#00ffff' }}>
            Culture Coin Access
          </h2>
          <p style={{ fontSize: '0.75rem', color: '#888', lineHeight: 1.6 }}>
            Sign in with Google to start earning Culture Coins, track your consciousness level, and
            unlock exclusive SNEAKAR Culture Crew rewards.
          </p>
        </div>

        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            ['🪙', 'Earn Culture Coins through Oracle conversations'],
            ['📈', 'Track your consciousness evolution level'],
            ['🎨', 'Generate and save Procedural Portraits'],
            ['👥', 'Join the SNEAKAR Culture Crew community'],
          ].map(([icon, text]) => (
            <li key={text} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.78rem', color: '#ccc' }}>
              <span>{icon}</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>

        {error && (
          <div style={{ background: 'rgba(255,0,80,0.1)', border: '1px solid #ff0050', borderRadius: 8, padding: '8px 12px', marginBottom: 16, fontSize: '0.75rem', color: '#ff0050' }}>
            {error}
          </div>
        )}

        {!showDevBypass ? (
          <>
            <button
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '12px',
                background: 'linear-gradient(135deg, #4285f4, #0066ff)',
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                fontFamily: "'Orbitron', monospace",
                fontSize: '0.85rem',
                letterSpacing: '0.05em',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                opacity: isLoading ? 0.7 : 1,
              }}
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  Connecting...
                </>
              ) : (
                'Continue with Google'
              )}
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
                marginTop: 12,
                display: 'block',
                marginLeft: 'auto',
              }}
              aria-label="Access developer bypass mode"
            >
              <Terminal size={10} />
            </button>
          </>
        ) : (
          <div style={{ background: 'rgba(0,255,100,0.05)', border: '1px solid rgba(0,255,100,0.2)', borderRadius: 8, padding: 16 }}>
            <h3 style={{ fontSize: '0.8rem', color: '#00ff64', marginBottom: 12 }}>🛠️ Developer Bypass</h3>
            <input
              type="password"
              value={devPassword}
              onChange={(e) => setDevPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleDevBypass()}
              placeholder="Enter dev password..."
              autoFocus
              style={{
                width: '100%',
                background: 'rgba(0,0,0,0.5)',
                border: '1px solid rgba(0,255,100,0.3)',
                borderRadius: 6,
                padding: '8px 12px',
                color: '#00ff64',
                fontFamily: 'monospace',
                fontSize: '0.85rem',
                marginBottom: 10,
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleDevBypass}
                style={{
                  flex: 1,
                  padding: '8px',
                  background: 'rgba(0,255,100,0.15)',
                  border: '1px solid #00ff64',
                  borderRadius: 6,
                  color: '#00ff64',
                  cursor: 'pointer',
                  fontFamily: "'Orbitron', monospace",
                  fontSize: '0.75rem',
                }}
              >
                🚀 Bypass
              </button>
              <button
                onClick={() => setShowDevBypass(false)}
                style={{
                  padding: '8px 12px',
                  background: 'none',
                  border: '1px solid #333',
                  borderRadius: 6,
                  color: '#666',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
