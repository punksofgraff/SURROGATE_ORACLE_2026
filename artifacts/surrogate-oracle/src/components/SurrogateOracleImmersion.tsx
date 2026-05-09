/**
 * SURROGATE Oracle — Main Immersive Cyberpunk Interface
 * Avatar: Decart live-avatar (WebRTC, portrait → real-time lip sync)
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mic, MicOff, MessageCircle } from 'lucide-react';
import DecartClient, { DecartClientHandle } from './DecartClient';
import { BackendControlPanel } from './BackendControlPanel';
import { GoogleSignInOverlay } from './GoogleSignInOverlay';
import { GraffPunksRadio } from './GraffPunksRadio';
import { EnculturateCrate } from './EnculturateCrate';
import { CultureCoinInlineDisplay } from './CultureCoinInlineDisplay';
import { ConnectingAnimation } from './ConnectingAnimation';
import { OracleConversation } from './OracleConversation';

const ORACLE_IMAGE_URL = 'https://i.postimg.cc/26pvW2SN/orackle-only-static.png';
const AUDIO_STREAM_URL = 'https://stream.radiojar.com/2qm1fc5kb';

interface OracleState {
  isConnected: boolean;
  isReady: boolean;
  isProcessing: boolean;
  isListening: boolean;
  error: string | null;
  debugMode: boolean;
  activeBackendTab: 'coins' | 'squad' | 'portraits' | 'debug';
}

export function SurrogateOracleImmersion() {
  const [oracleState, setOracleState] = useState<OracleState>({
    isConnected: false,
    isReady: false,
    isProcessing: false,
    isListening: false,
    error: null,
    debugMode: false,
    activeBackendTab: 'coins',
  });

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentSessionId] = useState(() => crypto.randomUUID());

  const [isOracleMode, setIsOracleMode] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioVolume] = useState(0.3);
  const [connectionProgress, setConnectionProgress] = useState(0);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showInlineCoins, setShowInlineCoins] = useState(false);
  const [showConversation, setShowConversation] = useState(false);

  const decartClientRef = useRef<DecartClientHandle>(null);
  const avatarVideoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Auth check from localStorage
  useEffect(() => {
    const devSession = localStorage.getItem('dev_user_session');
    if (devSession) {
      try {
        const user = JSON.parse(devSession);
        setIsAuthenticated(true);
        setCurrentUserId(user.id);
        setShowInlineCoins(true);
      } catch {
        setIsAuthenticated(false);
      }
    }
  }, []);

  // Audio management
  useEffect(() => {
    if (!audioRef.current) return;
    if (isAudioPlaying) {
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
    }
  }, [isAudioPlaying]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = oracleState.isProcessing ? audioVolume * 0.2 : audioVolume;
    }
  }, [audioVolume, oracleState.isProcessing]);

  const validateEnvironment = useCallback(() => {
    const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_DECART_API_KEY'].filter(
      (k) => !import.meta.env[k]
    );
    if (missing.length > 0) {
      setOracleState((prev) => ({ ...prev, error: `Missing env vars: ${missing.join(', ')}` }));
      return false;
    }
    return true;
  }, []);

  const initializeOracle = async () => {
    if (!validateEnvironment()) return;
    if (!avatarVideoRef.current) {
      setOracleState((prev) => ({ ...prev, error: 'Avatar video element not ready' }));
      return;
    }

    setIsConnecting(true);
    setConnectionProgress(0);

    const progressInterval = setInterval(() => {
      setConnectionProgress((prev) => {
        if (prev >= 90) { clearInterval(progressInterval); return 90; }
        return prev + 10;
      });
    }, 500);

    decartClientRef.current?.setCallbacks({
      onConnected: () => {
        setOracleState((prev) => ({ ...prev, isConnected: true }));
        setConnectionProgress(95);
      },
      onStreamReady: () => {
        clearInterval(progressInterval);
        setOracleState((prev) => ({ ...prev, isReady: true, error: null }));
        setConnectionProgress(100);
        setTimeout(() => {
          setIsConnecting(false);
          setIsOracleMode(true);
          setShowConversation(true);
        }, 800);
      },
      onTalkStarted: () => setOracleState((prev) => ({ ...prev, isProcessing: true })),
      onTalkEnded: () => setOracleState((prev) => ({ ...prev, isProcessing: false })),
      onDisconnected: (reason) => {
        setOracleState((prev) => ({ ...prev, isConnected: false, isReady: false, error: `Disconnected: ${reason}` }));
        setIsOracleMode(false);
        setIsConnecting(false);
      },
      onError: (err) => {
        clearInterval(progressInterval);
        setOracleState((prev) => ({ ...prev, error: err }));
        setIsConnecting(false);
      },
    });

    const result = await decartClientRef.current?.initializeStream(
      ORACLE_IMAGE_URL,
      avatarVideoRef.current
    );

    if (!result?.success) {
      clearInterval(progressInterval);
      setOracleState((prev) => ({ ...prev, error: result?.error || 'Failed to initialize Decart stream' }));
      setIsConnecting(false);
    }
  };

  const handleOracleResponse = async (audioUrl: string) => {
    if (!decartClientRef.current?.isStreamActive()) return;
    await decartClientRef.current.sendAudio(audioUrl);
  };

  const exitOracleMode = async () => {
    await decartClientRef.current?.closeStream();
    setIsOracleMode(false);
    setShowConversation(false);
    setOracleState({
      isConnected: false, isReady: false, isProcessing: false,
      isListening: false, error: null, debugMode: false, activeBackendTab: 'coins',
    });
  };

  const openBackendPanel = (tab: 'coins' | 'squad' | 'portraits' | 'debug' = 'coins') => {
    if (!isAuthenticated && (tab === 'coins' || tab === 'squad')) {
      setShowAuthOverlay(true);
    }
    setOracleState((prev) => ({ ...prev, debugMode: true, activeBackendTab: tab }));
  };

  const handleAuthSuccess = (user: { id: string; email: string }) => {
    setIsAuthenticated(true);
    setShowAuthOverlay(false);
    setCurrentUserId(user.id);
    setShowInlineCoins(true);
    setOracleState((prev) => ({ ...prev, debugMode: true }));
  };

  return (
    <div className="oracle-immersion-container">
      {/* Decart LipSync client — headless */}
      <DecartClient ref={decartClientRef} />

      {/* Background audio */}
      <audio ref={audioRef} src={AUDIO_STREAM_URL} loop preload="none" />

      {/* Graffiti alley background */}
      <div
        className="alley-background-tilt"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1920&q=80')`,
          opacity: isOracleMode ? 0.4 : 0.7,
        }}
      />

      {/* Dark overlay */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.6) 100%)', zIndex: 2 }} />

      {/* SNEAKAR branding */}
      <div className="sneakar-branding" style={{ zIndex: 10 }}>
        <motion.h1
          className="sneakar-title"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
        >
          SURROGATE:ORACLE
        </motion.h1>
        <motion.p
          className="sneakar-subtitle"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.5 }}
        >
          SNEAKAR AI IMMERSION
        </motion.p>
      </div>

      {/* Oracle image / video container */}
      <div
        className="oracle-image-container"
        style={{
          position: 'absolute',
          left: '50%',
          top: isOracleMode ? '38%' : '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 5,
          transition: 'top 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
          cursor: isOracleMode ? 'default' : 'pointer',
        }}
        onClick={!isOracleMode && !isConnecting ? initializeOracle : undefined}
      >
        {/* Static image — shown until Decart stream is active */}
        <img
          src={ORACLE_IMAGE_URL}
          alt="SURROGATE Oracle"
          style={{
            width: isOracleMode ? '220px' : '300px',
            height: 'auto',
            display: isOracleMode ? 'none' : 'block',
            transition: 'width 0.8s ease',
            filter: 'drop-shadow(0 0 30px rgba(0,255,255,0.8)) brightness(1.15)',
          }}
        />

        {/* Decart-rendered avatar video */}
        <video
          ref={avatarVideoRef}
          autoPlay
          playsInline
          style={{
            width: '280px',
            borderRadius: '16px',
            display: isOracleMode ? 'block' : 'none',
            border: '2px solid rgba(0,255,255,0.4)',
            boxShadow: '0 0 40px rgba(0,255,255,0.5), 0 0 80px rgba(0,255,255,0.2)',
            background: '#000',
          }}
        />

        {/* "Click to Connect" hint when not in oracle mode */}
        {!isOracleMode && !isConnecting && (
          <motion.div
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
            style={{
              position: 'absolute',
              bottom: -36,
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: '0.65rem',
              color: '#00ffff',
              fontFamily: "'Orbitron', monospace",
              letterSpacing: '0.15em',
              whiteSpace: 'nowrap',
              textShadow: '0 0 10px #00ffff',
            }}
          >
            ▶ CONNECT TO ORACLE
          </motion.div>
        )}

        {/* Processing indicator */}
        {oracleState.isProcessing && (
          <motion.div
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 0.8, repeat: Infinity }}
            style={{
              position: 'absolute',
              bottom: -28,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: 6,
            }}
          >
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                animate={{ scale: [1, 1.4, 1] }}
                transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff00ff' }}
              />
            ))}
          </motion.div>
        )}
      </div>

      {/* Bottom controls: Radio + Crate */}
      <div
        style={{
          position: 'absolute',
          bottom: '5%',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 20,
          display: 'flex',
          alignItems: 'flex-end',
          gap: '60px',
        }}
      >
        <GraffPunksRadio isPlaying={isAudioPlaying} onToggle={() => setIsAudioPlaying(!isAudioPlaying)} volume={audioVolume} />
        <EnculturateCrate onClick={() => openBackendPanel('coins')} isActive={oracleState.debugMode} />
      </div>

      {/* Culture Coin inline display */}
      {showInlineCoins && isAuthenticated && currentUserId && (
        <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 30 }}>
          <CultureCoinInlineDisplay
            userId={currentUserId}
            onUpgradeClick={() => openBackendPanel('coins')}
            showUpgradePrompt
          />
        </div>
      )}

      {/* Oracle mode — conversation panel */}
      <AnimatePresence>
        {isOracleMode && showConversation && (
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            style={{
              position: 'absolute',
              left: 20,
              top: '50%',
              transform: 'translateY(-50%)',
              width: '340px',
              maxHeight: '60vh',
              background: 'rgba(0,0,10,0.85)',
              border: '1px solid rgba(0,255,255,0.2)',
              borderRadius: 16,
              backdropFilter: 'blur(20px)',
              zIndex: 40,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Panel header */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontFamily: "'Orbitron', monospace", fontSize: '0.7rem', color: '#00ffff', letterSpacing: '0.1em' }}>
                ORACLE INTERFACE
              </div>
              <button onClick={exitOracleMode} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', padding: 2 }}>
                <X size={14} />
              </button>
            </div>
            <OracleConversation
              userId={currentUserId}
              sessionId={currentSessionId}
              onAudioReady={handleOracleResponse}
              isOracleReady={oracleState.isReady}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Connecting animation */}
      <AnimatePresence>
        {isConnecting && (
          <ConnectingAnimation
            connectionProgress={connectionProgress}
            onCancel={() => {
              setIsConnecting(false);
              setConnectionProgress(0);
              decartClientRef.current?.closeStream();
            }}
          />
        )}
      </AnimatePresence>

      {/* Backend control panel */}
      <AnimatePresence>
        {oracleState.debugMode && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 150 }}
          >
            <div style={{ pointerEvents: 'auto', position: 'absolute', right: 0, top: 0, bottom: 0 }}>
              <BackendControlPanel
                userId={currentUserId || undefined}
                sessionId={currentSessionId}
                isVisible
                initialTab={oracleState.activeBackendTab}
                onClose={() => setOracleState((prev) => ({ ...prev, debugMode: false }))}
                isAuthenticated={isAuthenticated}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Auth overlay */}
      <AnimatePresence>
        {showAuthOverlay && (
          <GoogleSignInOverlay
            onClose={() => setShowAuthOverlay(false)}
            onSuccess={handleAuthSuccess}
          />
        )}
      </AnimatePresence>

      {/* Error display */}
      <AnimatePresence>
        {oracleState.error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            style={{
              position: 'fixed',
              bottom: 80,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(255,0,80,0.15)',
              border: '1px solid #ff0050',
              borderRadius: 10,
              padding: '10px 20px',
              color: '#ff0050',
              fontFamily: "'Orbitron', monospace",
              fontSize: '0.72rem',
              zIndex: 200,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              maxWidth: '90vw',
              backdropFilter: 'blur(10px)',
            }}
          >
            <span>{oracleState.error}</span>
            <button
              onClick={() => setOracleState((prev) => ({ ...prev, error: null }))}
              style={{ background: 'none', border: 'none', color: '#ff0050', cursor: 'pointer', padding: 0 }}
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default SurrogateOracleImmersion;
