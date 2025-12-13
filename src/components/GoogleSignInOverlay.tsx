import React, { useState } from 'react';
import { X, Loader2, Terminal } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

interface GoogleSignInOverlayProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function GoogleSignInOverlay({ onClose, onSuccess }: GoogleSignInOverlayProps) {
  const [showDevBypass, setShowDevBypass] = useState(false);
  const [devPassword, setDevPassword] = useState('');

  const { 
    isLoading, 
    error, 
    handleGoogleSignIn, 
    handleDevBypass: authDevBypass,
    clearError 
  } = useAuth(onSuccess);

  const handleDevBypass = () => {
    authDevBypass(devPassword);
    setDevPassword('');
  };

  return (
    <div className="sign-in-overlay">
      {/* Loading overlay */}
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-content">
            <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mb-4" />
            <p className="info-text text-cyan-400">Connecting to Google...</p>
          </div>
        </div>
      )}
      
      <div className="sign-in-modal" role="dialog" aria-modal="true" aria-labelledby="signin-title">
        <button 
          className="close-btn"
          onClick={onClose}
          disabled={isLoading}
          aria-label="Close sign-in modal"
        >
          <X size={20} />
        </button>

        <div className="sign-in-content">
          <h2 id="signin-title" className="oracle-title signin-title">
            Culture Coin Access
          </h2>
          
          <div className="culture-coin-preview">
            <img 
              src="https://sintra-images.s3.eu-north-1.amazonaws.com/3fddfa4f-21d6-4499-8920-9b9b4c304d56/message-files/8732b2b3-dfd0-4cea-beea-2dcb5d908947/unnamed.jpg"
              alt="Culture Coin"
              className="culture-coin-image"
            />
          </div>

          <p className="info-text signin-description">
            Sign in with Google to start earning Culture Coins, track your consciousness level, 
            and unlock exclusive SNEAKAR Culture Crew rewards.
          </p>

          <div className="benefits-list">
            <div className="benefit-item">
              <span className="benefit-icon">🪙</span>
              <span className="info-text">Earn Culture Coins through Oracle conversations</span>
            </div>
            <div className="benefit-item">
              <span className="benefit-icon">📈</span>
              <span className="info-text">Track your consciousness evolution level</span>
            </div>
            <div className="benefit-item">
              <span className="benefit-icon">🎨</span>
              <span className="info-text">Generate and save Procedural Portraits</span>
            </div>
            <div className="benefit-item">
              <span className="benefit-icon">👥</span>
              <span className="info-text">Join the SNEAKAR Culture Crew community</span>
            </div>
          </div>

          {!showDevBypass ? (
            <>
              <button 
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="google-sign-in-btn"
                aria-label="Sign in with Google account"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Continue with Google
                  </>
                )}
              </button>

              {/* DEV BYPASS TRIGGER */}
              <button 
                onClick={() => setShowDevBypass(true)}
                disabled={isLoading}
                className="dev-bypass-trigger"
                aria-label="Access developer bypass mode"
              >
                <Terminal size={12} style={{ marginRight: '5px', display: 'inline' }} />
                dev access
              </button>
            </>
          ) : (
            <div className="dev-bypass-panel">
             <h3 className="oracle-title" style={{ 
                color: 'var(--neon-yellow)',
                fontSize: '1.2rem', 
                marginBottom: '15px'
              }}>
                🛠️ Developer Bypass
              </h3>
              <p className="info-text" style={{ 
                fontSize: '0.9rem', 
                marginBottom: '15px', 
                color: 'rgba(255, 255, 255, 0.8)'
              }}>
                {/* DEV ONLY: This bypass is strictly for development environments */}
                {/* In production, this should be disabled or removed entirely */}
                Enter developer password to bypass Google Sign-In:
              </p>
              <input
                type="password"
                value={devPassword}
                onChange={(e) => setDevPassword(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleDevBypass();
                  }
                }}
                placeholder="Enter dev password..."
                className="dev-password-input" 
                aria-label="Developer bypass password"
                autoFocus
              />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  onClick={handleDevBypass}
                  disabled={!devPassword}
                   className="accent-text dev-bypass-btn"
                  style={{
                    background: 'rgba(255, 255, 0, 0.3)',
                    border: '2px solid var(--neon-yellow)',
                  }}
                >
                  🚀 Bypass
                </button>
                <button 
                  onClick={() => setShowDevBypass(false)}
                   className="accent-text dev-cancel-btn"
                  style={{
                    textTransform: 'uppercase',
                    fontSize: '0.9rem'
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="error-message" role="alert">
              <span className="info-text error-text">
                {error}
              </span>
              <button onClick={clearError} className="error-dismiss" aria-label="Dismiss error">×</button>
            </div>
          )}

          <p className="privacy-note info-text">
            We only use your Google account for authentication. 
            Your Culture Coin progress is saved securely.
          </p>
        </div>
      </div>
    </div>
  );
}