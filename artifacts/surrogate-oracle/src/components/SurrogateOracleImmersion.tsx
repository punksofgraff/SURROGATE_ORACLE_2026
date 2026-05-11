/**
 * SURROGATE Oracle — Immersive Cyberpunk XR Experience
 *
 * UX Flow:
 *   DORMANT  → User lands in a dark graffiti alley.  Oracle glows in a cabinet.
 *   AWAKENED → One tap: title types in, dust moves, boombox + crate light up, avatar pulses.
 *   ORACLE   → Decart WebRTC stream active, conversation panel live.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { X } from 'lucide-react';
import DecartClient, { DecartClientHandle } from './DecartClient';
import { BackendControlPanel } from './BackendControlPanel';
import { GoogleSignInOverlay } from './GoogleSignInOverlay';
import { GraffPunksRadio } from './GraffPunksRadio';
import { EnculturateCrate } from './EnculturateCrate';
import { CultureCoinInlineDisplay } from './CultureCoinInlineDisplay';
import { ConnectingAnimation } from './ConnectingAnimation';
import OracleConversation from './OracleConversation';
import { useAtmosphere } from '../hooks/useAtmosphere';
import './SurrogateOracleImmersion.css';

const ORACLE_IMAGE_URL = 'https://i.postimg.cc/D20ctNV0/orackle-only-static.png'; // Static floating face (click to start)
const DECART_AVATAR_URL = 'https://i.postimg.cc/hnyNRQLz/static-alley-reduced.png'; // Image for Decart stream (green character)
const AUDIO_STREAM_URL = 'https://stream.radiojar.com/2qm1fc5kb';
const ALLEY_BG_URL = 'https://i.postimg.cc/9CL0tMdd/7D633B70-4C62-4326-92A8-3B8790C9B3B0.png'; // Empty alley with SNEAKAR cabinet

// Typewriter helper
function useTypewriter(text: string, active: boolean, speed = 55) {
  const [displayed, setDisplayed] = useState('');
  useEffect(() => {
    if (!active) { setDisplayed(''); return; }
    setDisplayed('');
    let i = 0;
    const id = setInterval(() => {
      setDisplayed(text.slice(0, ++i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [active, text, speed]);
  return displayed;
}

interface OracleState {
  isConnected: boolean;
  isReady: boolean;
  isProcessing: boolean;
  error: string | null;
  debugMode: boolean;
  activeBackendTab: 'coins' | 'squad' | 'portraits' | 'debug';
}

export function SurrogateOracleImmersion() {
  // ── Scene phases ─────────────────────────────────────────────────────────
  const [scenePhase, setScenePhase] = useState<'dormant' | 'awakened' | 'oracle'>('dormant');
  const awakened = scenePhase !== 'dormant';
  const isOracleMode = scenePhase === 'oracle';

  // ── Oracle connection state ───────────────────────────────────────────────
  const [oracleState, setOracleState] = useState<OracleState>({
    isConnected: false, isReady: false, isProcessing: false,
    error: null, debugMode: false, activeBackendTab: 'coins',
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionProgress, setConnectionProgress] = useState(0);
  const [showConversation, setShowConversation] = useState(false);

  // ── Auth ──────────────────────────────────────────────────────────────────
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentSessionId] = useState(() => crypto.randomUUID());
  const [showInlineCoins, setShowInlineCoins] = useState(false);
  const [oracleAlignment, setOracleAlignment] = useState<'sacred' | 'profane' | 'neutral' | null>(null);

  // ── Audio management ──────────────────────────────────────────────────────
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const decartClientRef = useRef<DecartClientHandle>(null);
  const avatarVideoRef = useRef<HTMLVideoElement>(null);
  const atmosphereCanvasRef = useRef<HTMLCanvasElement>(null);

  useAtmosphere(atmosphereCanvasRef, awakened, oracleAlignment);

  // ── Typewriter title ──────────────────────────────────────────────────────
  const titleText = useTypewriter('SURROGATE:ORACLE', awakened, 60);
  const subtitleText = useTypewriter('SNEAKAR XR AI IMMERSION', awakened && titleText.length >= 16, 35);

  // ── Cabinet glow controls ─────────────────────────────────────────────────
  const cabinetControls = useAnimation();

  useEffect(() => {
    if (awakened) {
      cabinetControls.start({
        boxShadow: [
          '0 0 20px rgba(0,255,255,0.25), 0 0 60px rgba(0,255,255,0.12)',
          '0 0 35px rgba(0,255,255,0.65), 0 0 90px rgba(0,255,255,0.30), 0 0 140px rgba(255,0,255,0.18)',
          '0 0 25px rgba(0,255,255,0.45), 0 0 70px rgba(0,255,255,0.22)',
        ],
        transition: { duration: 2.2, repeat: Infinity, ease: 'easeInOut' },
      });
    }
  }, [awakened, cabinetControls]);

  // ── Auth check ────────────────────────────────────────────────────────────
  useEffect(() => {
    // 1. Check for local dev bypass
    const devSession = localStorage.getItem('dev_user_session');
    if (devSession) {
      try {
        const user = JSON.parse(devSession);
        setIsAuthenticated(true);
        setCurrentUserId(user.id);
        setShowInlineCoins(true);
      } catch { /* ignore */ }
    }

    // 2. Listen for actual Supabase OAuth redirects
    import('../lib/supabase').then(({ supabase }) => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          setIsAuthenticated(true);
          setCurrentUserId(session.user.id);
          setShowInlineCoins(true);
        }
      });

      supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          setIsAuthenticated(true);
          setCurrentUserId(session.user.id);
          setShowInlineCoins(true);
        }
      });
    });

    const handleUnlock = (e: Event) => {
      const customEvent = e as CustomEvent;
      const trigger = customEvent.detail?.trigger;
      
      if (trigger === 'squad_invite' && !isAuthenticated) {
        setShowAuthOverlay(true);
      } else if (trigger === 'portrait_unlock') {
        // Phase 4: Procedural Portrait Path Wiring
        openBackendPanel('portraits');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((window as any).showSuccessNotification) {
          (window as any).showSuccessNotification('PORTRAIT UNLOCKED: Neural imprint captured.');
        }
      }
    };
    
    const handleAlignment = (e: Event) => {
      const customEvent = e as CustomEvent;
      setOracleAlignment(customEvent.detail?.alignment);
    };

    window.addEventListener('oracle:unlock', handleUnlock);
    window.addEventListener('oracle:alignment', handleAlignment);
    return () => {
      window.removeEventListener('oracle:unlock', handleUnlock);
      window.removeEventListener('oracle:alignment', handleAlignment);
    };
  }, [isAuthenticated]);

  // ── Audio management ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!audioRef.current) return;
    if (isAudioPlaying) audioRef.current.play().catch(() => {});
    else audioRef.current.pause();
  }, [isAudioPlaying]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = oracleState.isProcessing ? 0.06 : 0.28;
    }
  }, [oracleState.isProcessing]);

  // ── Oracle connection ─────────────────────────────────────────────────────
  const validateEnvironment = useCallback(() => {
    const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_DECART_API_KEY'].filter(
      (k) => !import.meta.env[k],
    );
    if (missing.length > 0) {
      setOracleState((prev) => ({ ...prev, error: `Missing env vars: ${missing.join(', ')}` }));
      return false;
    }
    return true;
  }, []);

  const initializeOracle = useCallback(async () => {
    if (!validateEnvironment()) return;
    if (!avatarVideoRef.current) {
      setOracleState((prev) => ({ ...prev, error: 'Avatar video element not ready' }));
      return;
    }
    setIsConnecting(true);
    setConnectionProgress(0);

    const interval = setInterval(() => {
      setConnectionProgress((p) => { if (p >= 90) { clearInterval(interval); return 90; } return p + 10; });
    }, 500);

    decartClientRef.current?.setCallbacks({
      onConnected: () => { setOracleState((p) => ({ ...p, isConnected: true })); setConnectionProgress(95); },
      onStreamReady: () => {
        clearInterval(interval);
        setOracleState((p) => ({ ...p, isReady: true, error: null }));
        setConnectionProgress(100);
        
        // Phase 1 Overhaul: Staggered Cinematic Awakening (Tightened)
        setTimeout(() => {
          setIsConnecting(false);
          setScenePhase('oracle');
          
          // Very brief pause before showing conversation panel
          setTimeout(() => {
            setShowConversation(true);
          }, 300);
        }, 400);
      },
      onTalkStarted: () => setOracleState((p) => ({ ...p, isProcessing: true })),
      onTalkEnded: () => setOracleState((p) => ({ ...p, isProcessing: false })),
      onDisconnected: (reason) => {
        setOracleState((p) => ({ ...p, isConnected: false, isReady: false, error: `Disconnected: ${reason}` }));
        setScenePhase('awakened');
        setIsConnecting(false);
      },
      onError: (err) => {
        clearInterval(interval);
        setOracleState((p) => ({ ...p, error: err }));
        setIsConnecting(false);
      },
    });

    const result = await decartClientRef.current?.initializeStream(DECART_AVATAR_URL, avatarVideoRef.current);
    if (!result?.success) {
      clearInterval(interval);
      setOracleState((p) => ({ ...p, error: result?.error || 'Failed to initialize Decart stream' }));
      setIsConnecting(false);
    }
  }, [validateEnvironment]);

  // ── Scene awakening ───────────────────────────────────────────────────────
  const awakenScene = useCallback(() => {
    if (scenePhase !== 'dormant') return;
    setScenePhase('awakened');
    setIsAudioPlaying(true);
    // 2 Birds with One Stone: Initiate connection immediately on awakening
    // This kills the separate "Connect" step and lets the pulse lead directly to live mode
    initializeOracle();
  }, [scenePhase, initializeOracle]);

  const handleOracleResponse = async (audioUrl: string) => {
    if (!decartClientRef.current?.isStreamActive()) return;
    await decartClientRef.current.sendAudio(audioUrl);
  };

  // Coins earned from Sacred exchanges — bubble to window for CultureCoinInlineDisplay
  const handleCoinsEarned = useCallback((amount: number) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updater = (window as any).updateInlineCultureCoins;
    if (typeof updater === 'function') updater(amount);
  }, []);

  const exitOracleMode = async () => {
    await decartClientRef.current?.closeStream();
    setScenePhase('awakened');
    setShowConversation(false);
    setOracleState((p) => ({ ...p, isConnected: false, isReady: false, isProcessing: false, error: null }));
  };

  const openBackendPanel = (tab: OracleState['activeBackendTab'] = 'coins') => {
    if (!isAuthenticated && tab === 'coins') setShowAuthOverlay(true);
    setOracleState((p) => ({ ...p, debugMode: true, activeBackendTab: tab }));
  };

  const handleAuthSuccess = (user: { id: string; email: string }) => {
    setIsAuthenticated(true);
    setShowAuthOverlay(false);
    setCurrentUserId(user.id);
    setShowInlineCoins(true);
    setOracleState((p) => ({ ...p, debugMode: true }));
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="oracle-stage"
      data-oracle-state={scenePhase}
      data-oracle-alignment={oracleAlignment || 'neutral'}
      data-debug={oracleState.debugMode}
      onClick={scenePhase === 'dormant' ? awakenScene : undefined}
      style={{ cursor: scenePhase === 'dormant' ? 'pointer' : 'default' }}
    >
      {/* Headless clients */}
      <DecartClient ref={decartClientRef} />
      <audio ref={audioRef} src={AUDIO_STREAM_URL} loop preload="none" />

      {/* ── Layer 1: Graffiti alley background + Vignette ─────────────── */}
      <div
        className="oracle-alley"
        style={{ '--bg-url': `url('${ALLEY_BG_URL}')` } as React.CSSProperties}
      />

      {/* ── Layer 2: Atmosphere Canvas (only when awakened) ────────────── */}
      <canvas
        ref={atmosphereCanvasRef}
        className="atmosphere-layer"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 'var(--z-atmosphere)',
          opacity: awakened ? 1 : 0,
          transition: 'opacity 2s ease-in-out'
        }}
      />

      {/* ── Layer 3: Top branding — types in on awakening ──────────────── */}
      <div className="oracle-branding">
        <h1 className="oracle-title">
          {titleText}
          {awakened && titleText.length < 16 && (
            <span className="oracle-cursor">▌</span>
          )}
        </h1>
        {subtitleText && (
          <div className="oracle-subtitle">
            {subtitleText}
          </div>
        )}
      </div>

      {/* ── Layer 4: Central cabinet + avatar ──────────────────────────── */}
      <div className="oracle-center">
        {/* Dormant tap prompt */}
        <AnimatePresence>
          {scenePhase === 'dormant' && (
            <motion.div
              className="oracle-tap-prompt"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.35, 0.9, 0.35] }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            >
              ◈ TAP TO ENTER ◈
            </motion.div>
          )}
        </AnimatePresence>

        {/* Cabinet CRT frame */}
        <div
          className="oracle-cabinet"
          onClick={awakened && !isOracleMode && !isConnecting ? initializeOracle : undefined}
          style={{ cursor: awakened && !isOracleMode && !isConnecting ? 'pointer' : 'default' }}
        >
          {/* CRT scanline overlay */}
          <div className="oracle-scanlines" />

          <div className="oracle-avatar-wrapper">
            {/* Static oracle image (pre-stream) */}
            <img
              src={ORACLE_IMAGE_URL}
              alt="SURROGATE Oracle"
              className="oracle-avatar-img"
            />

            {/* Decart live avatar video */}
            <video
              ref={avatarVideoRef}
              autoPlay
              playsInline
              className="oracle-avatar-video"
            />
          </div>

          {/* Processing dots */}
          <AnimatePresence>
            {oracleState.isProcessing && (
              <motion.div className="oracle-processing-dots" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="oracle-dot"
                    animate={{ scale: [1, 1.5, 1] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.18 }}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Layer 6: Bottom — Boombox + Crate (light up on awakening) ──── */}
      <div className="oracle-bottom-bar">
        <motion.div
          initial={{ opacity: 0.3, filter: 'brightness(0.4) saturate(0.3)' }}
          animate={{
            opacity: awakened ? 1 : 0.3,
            filter: awakened
              ? 'brightness(1.1) saturate(1.2) drop-shadow(0 0 16px rgba(255,0,255,0.5))'
              : 'brightness(0.4) saturate(0.3)',
          }}
          transition={{ duration: 1.1, delay: awakened ? 0.7 : 0 }}
        >
          <GraffPunksRadio
            isPlaying={isAudioPlaying}
            onToggle={() => setIsAudioPlaying(!isAudioPlaying)}
            volume={0.28}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0.3, filter: 'brightness(0.4) saturate(0.3)' }}
          animate={{
            opacity: awakened ? 1 : 0.3,
            filter: awakened
              ? 'brightness(1.15) saturate(1.3) drop-shadow(0 0 18px rgba(0,255,136,0.55))'
              : 'brightness(0.4) saturate(0.3)',
          }}
          transition={{ duration: 1.1, delay: awakened ? 1.0 : 0 }}
        >
          <EnculturateCrate onClick={() => openBackendPanel('coins')} isActive={oracleState.debugMode} />
        </motion.div>
      </div>

      {/* ── Culture coin display ─────────────────────────────────────────── */}
      {/* Intentionally removed: Culture coin display is hidden to subvert the token economy (Phase 4). Coins are private until invited via Enculturate Crate. */}

      {/* Conversation panel (oracle mode) ────────────────────────────── */}
      {isOracleMode && showConversation && (
        <OracleConversation
          userId={currentUserId || currentSessionId}
          sessionId={currentSessionId}
          onOracleResponse={handleOracleResponse}
          onCoinsEarned={handleCoinsEarned}
          onClose={exitOracleMode}
        />
      )}

      {/* Backend panel ───────────────────────────────────────────────── */}

      <AnimatePresence>
        {oracleState.debugMode && (
          <motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 'var(--z-system)' as any }}
          >
            <div style={{ pointerEvents: 'auto', position: 'absolute', right: 0, top: 0, bottom: 0 }}>
              <BackendControlPanel
                userId={currentUserId || undefined}
                sessionId={currentSessionId}
                isVisible
                initialTab={oracleState.activeBackendTab}
                onClose={() => setOracleState((p) => ({ ...p, debugMode: false }))}
                isAuthenticated={isAuthenticated}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Auth overlay ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showAuthOverlay && (
          <GoogleSignInOverlay onClose={() => setShowAuthOverlay(false)} onSuccess={handleAuthSuccess} />
        )}
      </AnimatePresence>

      {/* ── Error toast ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {oracleState.error && (
          <motion.div
            className="oracle-error-toast"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
          >
            <span>{oracleState.error}</span>
            <button onClick={() => setOracleState((p) => ({ ...p, error: null }))} className="oracle-close-btn">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default SurrogateOracleImmersion;
