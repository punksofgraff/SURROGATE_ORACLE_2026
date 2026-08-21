import { useState, useEffect } from 'react';
import { X, Loader2, Terminal, Mail, Key } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

interface GoogleSignInOverlayProps {
  onClose: () => void;
  onSuccess: (user: { id: string; email: string }) => void;
}

export function GoogleSignInOverlay({ onClose, onSuccess }: GoogleSignInOverlayProps) {
  useEffect(() => {
    console.log('🚨 GoogleSignInOverlay MOUNTED (v3 - active logging)');
  }, []);

  const [showDevBypass, setShowDevBypass] = useState(false);
  const [devPassword, setDevPassword] = useState('');
  
  // Email flow state
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');

  const { 
    isLoading, 
    error, 
    handleEmailSignIn, 
    handleVerifyOtp,
    handleDevBypass: authDevBypass 
  } = useAuth(onSuccess);

  console.log(`🖼️ Overlay Render - Step: ${step}, IsLoading: ${isLoading}`);

  const handleDevBypass = () => {
    authDevBypass(devPassword);
    setDevPassword('');
  };

  const onEmailSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    console.log('🔘 onEmailSubmit triggered!');
    if (!email) {
      console.warn('⚠️ No email provided, aborting submission');
      return;
    }
    const success = await handleEmailSignIn(email);
    console.log('🔄 handleEmailSignIn returned:', success);
    if (success) setStep('otp');
  };

  const onOtpSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    console.log('🔘 onOtpSubmit triggered! OTP value:', otp);
    if (!otp) return;
    await handleVerifyOtp(email, otp);
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
    padding: '40px',
    maxWidth: '420px',
    width: '90%',
    position: 'relative',
    color: '#fff',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'rgba(0,0,0,0.8)',
    border: '1px solid rgba(0,255,136,0.3)',
    padding: '12px 14px',
    color: '#00ff88',
    fontFamily: 'monospace',
    fontSize: '0.9rem',
    marginBottom: 16,
    boxSizing: 'border-box',
    outline: 'none',
    textAlign: step === 'otp' ? 'center' : 'left',
    letterSpacing: step === 'otp' ? '0.5em' : 'normal',
  };

  const buttonStyle: React.CSSProperties = {
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
    boxShadow: 'inset 0 0 10px rgba(0,255,136,0.1)',
    transition: 'all 0.2s ease',
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
          <h2 style={{ 
            fontSize: '1.4rem', 
            fontFamily: "'adrip1', 'Orbitron', monospace",
            letterSpacing: '0.15em', 
            marginBottom: 8, 
            background: 'linear-gradient(135deg, #00ff88 0%, #00ffcc 100%)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            color: 'transparent',
          }}>
            ESTABLISH NEURAL LINK
          </h2>
          <p style={{ 
            fontSize: '0.75rem', 
            color: '#ffffff', 
            lineHeight: 1.6, 
            letterSpacing: '0.05em',
            fontFamily: "'PhillySans', 'Orbitron', monospace" 
          }}>
            {step === 'email' 
              ? 'VERIFY SEEKER FREQUENCY TO ACCESS THE CULTURE CREW ENCLAVE.' 
              : 'ACCESS CODE SENT. CALIBRATE NEURAL FREQUENCY NOW.'}
          </p>
        </div>

        <div style={{ position: 'relative', zIndex: 2 }}>
            {error && (
            <div style={{ 
              background: 'rgba(176,38,255,0.1)', 
              border: '1px solid rgba(176,38,255,0.45)', 
              padding: '8px 12px', 
              marginBottom: 16, 
              fontSize: '0.75rem', 
              color: '#cc88ff', 
              letterSpacing: '0.05em',
              fontFamily: "'PhillySans', 'Orbitron', monospace"
            }}>
                FREQUENCY REJECTED — {error.toUpperCase()}
            </div>
            )}

            {!showDevBypass ? (
              <form 
                onSubmit={step === 'email' ? onEmailSubmit : onOtpSubmit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    console.log('⌨️ Enter key detected in form');
                  }
                }}
              >
                {step === 'email' ? (
                  <>
                    <div style={{ position: 'relative', marginBottom: 4 }}>
                      <Mail size={14} style={{ position: 'absolute', left: 14, top: 15, color: 'rgba(0,255,136,0.4)' }} />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => {
                          console.log('⌨️ Typing email:', e.target.value);
                          setEmail(e.target.value);
                        }}
                        placeholder="ENTER IDENTIFIER (EMAIL)"
                        style={{ ...inputStyle, paddingLeft: 40 }}
                        autoFocus
                        required
                      />
                    </div>
                    <button 
                      type="submit" 
                      disabled={isLoading} 
                      style={{ ...buttonStyle, fontFamily: "'PhillySans', 'Orbitron', monospace" }}
                      onClick={() => console.log('🖱️ Submit button explicitly clicked')}
                    >
                      INITIALIZE LINK
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ position: 'relative', marginBottom: 4 }}>
                      <Key size={14} style={{ position: 'absolute', left: 14, top: 15, color: 'rgba(0,255,136,0.4)' }} />
                      <input
                        type="text"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        placeholder="000000"
                        maxLength={6}
                        style={{ ...inputStyle, paddingLeft: 40 }}
                        autoFocus
                        required
                      />
                    </div>
                    <button type="submit" disabled={isLoading} style={{ ...buttonStyle, fontFamily: "'PhillySans', 'Orbitron', monospace" }}>
                      CALIBRATE LINK
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setStep('email')}
                      style={{ 
                        background: 'none', border: 'none', color: '#ffffff', 
                        fontSize: '0.65rem', marginTop: 12, cursor: 'pointer', 
                        width: '100%', textAlign: 'center',
                        fontFamily: "'PhillySans', 'Orbitron', monospace"
                      }}
                    >
                      WRONG IDENTIFIER? ABORT AND RETRY.
                    </button>
                  </>
                )}
                
                <button
                onClick={(e) => {
                  e.preventDefault();
                  console.log('🖱️ Dev Bypass button clicked');
                  setShowDevBypass(true);
                }}
                disabled={isLoading}
                style={{
                    background: 'none',
                    border: 'none',
                    color: '#ffffff',
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
              </form>
            ) : (
            <div style={{ background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.2)', padding: 16 }}>
                <h3 style={{ fontSize: '0.8rem', color: '#00ff88', marginBottom: 12, letterSpacing: '0.1em' }}>🛠️ MANUAL OVERRIDE</h3>
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
                    border: '1px solid rgba(0,255,136,0.3)',
                    padding: '10px 12px',
                    color: '#00ff88',
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
                    background: 'rgba(0,255,136,0.15)',
                    border: '1px solid #00ff88',
                    color: '#00ff88',
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
                    border: '1px solid #ffffff',
                    color: '#ffffff',
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
