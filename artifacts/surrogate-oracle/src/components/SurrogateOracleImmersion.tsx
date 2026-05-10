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

const ORACLE_IMAGE_URL = 'https://i.postimg.cc/26pvW2SN/orackle-only-static.png';
const AUDIO_STREAM_URL = 'https://stream.radiojar.com/2qm1fc5kb';
const ALLEY_BG_URL =
  'https://raw.githubusercontent.com/punksofgraff/SURROGATE_ORACLE_2026/main/public/image.png';

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
  const subtitleText = useTypewriter('SNEAKAR AI IMMERSION', awakened && titleText.length >= 16, 35);

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
    const devSession = localStorage.getItem('dev_user_session');
    if (devSession) {
      try {
        const user = JSON.parse(devSession);
        setIsAuthenticated(true);
        setCurrentUserId(user.id);
        setShowInlineCoins(true);
      } catch { /* ignore */ }
    }

    const handleUnlock = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.trigger === 'squad_invite' && !isAuthenticated) {
        setShowAuthOverlay(true);
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

  // ── Scene awakening ───────────────────────────────────────────────────────
  const awakenScene = useCallback(() => {
    if (scenePhase !== 'dormant') return;
    setScenePhase('awakened');
  }, [scenePhase]);

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
        setTimeout(() => {
          setIsConnecting(false);
          setScenePhase('oracle');
          setShowConversation(true);
        }, 800);
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

    const result = await decartClientRef.current?.initializeStream(ORACLE_IMAGE_URL, avatarVideoRef.current);
    if (!result?.success) {
      clearInterval(interval);
      setOracleState((p) => ({ ...p, error: result?.error || 'Failed to initialize Decart stream' }));
      setIsConnecting(false);
    }
  }, [validateEnvironment]);

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
    if (!isAuthenticated && (tab === 'coins' || tab === 'squad')) setShowAuthOverlay(true);
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
      onClick={scenePhase === 'dormant' ? awakenScene : undefined}
      style={{ cursor: scenePhase === 'dormant' ? 'pointer' : 'default' }}
    >
      {/* Headless clients */}
      <DecartClient ref={decartClientRef} />
      <audio ref={audioRef} src={AUDIO_STREAM_URL} loop preload="none" />

      {/* ── Layer 1: Graffiti alley background ─────────────────────────── */}
      <motion.div
        className="oracle-alley"
        style={{ backgroundImage: `url('${ALLEY_BG_URL}')` }}
        animate={{
          opacity: isOracleMode ? 0.06 : awakened ? 0.18 : 0.12,
          scale: awakened ? 1 : 1.04,
        }}
        transition={{ duration: 1.8, ease: 'easeOut' }}
      />

      {/* ── Layer 2: Vignette overlay ───────────────────────────────────── */}
      <motion.div 
        className="oracle-vignette" 
        animate={{
          background: oracleAlignment === 'sacred' 
            ? 'radial-gradient(circle at center, transparent 40%, rgba(0,30,15,0.7) 100%)'
            : oracleAlignment === 'profane'
            ? 'radial-gradient(circle at center, transparent 30%, rgba(30,0,0,0.85) 100%)'
            : 'radial-gradient(circle at center, transparent 50%, rgba(0,0,0,0.8) 100%)'
        }}
        transition={{ duration: 2 }}
      />

      {/* ── Layer 3: Atmosphere Canvas (only when awakened) ────────────── */}
      <canvas
        ref={atmosphereCanvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 3,
          opacity: awakened ? 1 : 0,
          transition: 'opacity 2s ease-in-out'
        }}
      />

      {/* ── Layer 4: Top branding — types in on awakening ──────────────── */}
      <div className="oracle-branding">
        <h1 className="oracle-title">
          {titleText}
          {awakened && titleText.length < 16 && (
            <span className="oracle-cursor">▌</span>
          )}
        </h1>
        {subtitleText && (
          <motion.p
            className="oracle-subtitle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            {subtitleText}
          </motion.p>
        )}
      </div>

      {/* ── Layer 5: Central cabinet + avatar ──────────────────────────── */}
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
        <motion.div
          className="oracle-cabinet"
          animate={cabinetControls}
          initial={{ boxShadow: '0 0 20px rgba(0,255,255,0.15), 0 0 40px rgba(0,255,255,0.06)' }}
          onClick={awakened && !isOracleMode && !isConnecting ? initializeOracle : undefined}
          style={{ cursor: awakened && !isOracleMode && !isConnecting ? 'pointer' : 'default' }}
          whileHover={awakened && !isOracleMode ? { scale: 1.015 } : {}}
          whileTap={awakened && !isOracleMode ? { scale: 0.985 } : {}}
        >
          {/* CRT scanline overlay */}
          <div className="oracle-scanlines" />

          {/* Static oracle image (pre-stream) */}
          <motion.img
            src={ORACLE_IMAGE_URL}
            alt="SURROGATE Oracle"
            className="oracle-avatar-img"
            initial={{ opacity: 0.35, filter: 'brightness(0.5) drop-shadow(0 0 8px rgba(0,255,255,0.3))' }}
            animate={{
              opacity: isOracleMode ? 0 : awakened ? 1 : 0.45,
              filter: awakened
                ? oracleAlignment === 'sacred' 
                  ? 'brightness(1.2) drop-shadow(0 0 40px rgba(0,255,136,0.85))'
                  : oracleAlignment === 'profane'
                  ? 'brightness(0.9) drop-shadow(0 0 20px rgba(255,0,0,0.6))'
                  : 'brightness(1.15) drop-shadow(0 0 28px rgba(0,255,255,0.75))'
                : 'brightness(0.5) drop-shadow(0 0 8px rgba(0,255,255,0.3))',
              scale: awakened ? [1, 1.012, 1] : 1,
            }}
            transition={{
              opacity: { duration: 1 },
              filter: { duration: 1.2, delay: 0.3 },
              scale: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
            }}
            style={{ display: isOracleMode ? 'none' : 'block' }}
          />

          {/* Decart live avatar video */}
          <video
            ref={avatarVideoRef}
            autoPlay
            playsInline
            className="oracle-avatar-video"
            style={{ display: isOracleMode ? 'block' : 'none' }}
          />

          {/* "CONNECT TO ORACLE" CTA — shown after awakening */}
          <AnimatePresence>
            {awakened && !isOracleMode && !isConnecting && (
              <motion.div
                className="oracle-connect-cta"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: [0.6, 1, 0.6], y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
              >
                ▶ CONNECT TO ORACLE
              </motion.div>
            )}
          </AnimatePresence>

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
        </motion.div>
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
      <AnimatePresence>
        {showInlineCoins && isAuthenticated && currentUserId && (
          <motion.div
            style={{ position: 'absolute', top: 16, right: 16, zIndex: 30 }}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
          >
            <CultureCoinInlineDisplay
              userId={currentUserId}
              onUpgradeClick={() => openBackendPanel('coins')}
              showUpgradePrompt
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Conversation panel (oracle mode) ────────────────────────────── */}
      {isOracleMode && showConversation && (
        <OracleConversation
          userId={currentUserId || currentSessionId}
          sessionId={currentSessionId}
          onOracleResponse={handleOracleResponse}
          onCoinsEarned={handleCoinsEarned}
          onClose={exitOracleMode}
        />
      )}

      {/* ── Connecting animation ─────────────────────────────────────────── */}
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

      {/* ── Backend panel ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {oracleState.debugMode && (
          <motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 150 }}
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
