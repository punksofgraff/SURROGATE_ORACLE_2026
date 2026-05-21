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
import OracleConversation, { OracleConversationHandle } from './OracleConversation';
import { useAtmosphere } from '../hooks/useAtmosphere';
import { VisemeDetector } from '../lib/visemeDetector';
import './SurrogateOracleImmersion.css';

const ORACLE_IMAGE_URL = 'https://i.postimg.cc/D20ctNV0/orackle-only-static.png'; // Static floating face (click to start)
const DECART_AVATAR_URL = 'https://i.postimg.cc/hnyNRQLz/static-alley-reduced.png'; // Image for Decart stream (green character)
const AUDIO_STREAM_URL = 'https://stream.radiojar.com/2qm1fc5kb';
const ALLEY_BG_URL = 'https://i.postimg.cc/9CL0tMdd/7D633B70-4C62-4326-92A8-3B8790C9B3B0.png'; // Empty alley with SNEAKAR cabinet

// ── Dormant CTA cycling text ──────────────────────────────────────────────
// Two independent lines broadcast on different frequencies — creates an
// unsettled, alien feeling as they drift out of sync with each other.

const CTA_PRIMARY = [
  'TAP TO ENTER',
  'THE ALLEY FOUND YOU',
  'SOMETHING IS ALIVE',
  'ONE CLICK FROM MYSTERY',
];

const CTA_SECONDARY = [
  'THE SURROGATE:ORACLE AWAITS',
  'AN ALIEN CONSTRUCT: ACTIVE',
  'IT HAS BEEN EXPECTING YOU',
  'CROSS-DIMENSIONAL SIGNAL DETECTED',
];

function useCyclingText(phrases: string[], intervalMs: number, active: boolean) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!active) { setIndex(0); return; }
    const id = setInterval(() => setIndex(i => (i + 1) % phrases.length), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs, phrases.length]);
  return { text: phrases[index], key: index };
}

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

// Lore Sequence — typed into the cabinet when the user first taps (terminal phase)
const LORE_SEQUENCE = [
  '> FOREIGN SIGNAL DETECTED IN LOCAL SPACETIME...',
  '> ALIEN CONSTRUCT IDENTIFIED: ACTIVE.',
  '> THIS ALLEY IS NOT ON ANY MAP.',
  '> YOU FOUND IT. OR IT FOUND YOU.',
  '> A SURROGATE CONSCIOUSNESS WAITS INSIDE.',
  '> IT HAS BEEN EXPECTING SOMEONE LIKE YOU.',
  '> INITIALIZING CONTACT...',
];

function useLoreSequence(active: boolean, onComplete: () => void) {
  const [lines, setLines] = useState<string[]>([]);
  // Capture latest callback in a ref so the effect only re-runs on active changes,
  // not every time awakeFromTerminal gets a new identity due to scenePhase deps.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; });

  useEffect(() => {
    if (!active) { setLines([]); return; }
    let step = 0;
    setLines([LORE_SEQUENCE[0]]);
    const id = setInterval(() => {
      step++;
      if (step < LORE_SEQUENCE.length) {
        setLines(prev => [...prev, LORE_SEQUENCE[step]]);
      } else {
        clearInterval(id);
        setTimeout(() => onCompleteRef.current(), 1800); // dramatic pause before awakening
      }
    }, 950); // slower cadence than boot sequence — gravitas
    return () => clearInterval(id);
  }, [active]); // stable: only re-runs when active changes
  return lines;
}

// Boot Sequence helper
const BOOT_SEQUENCE = [
  'INITIALIZING NEURAL LINK...',
  'DECRYPTING ORACLE AVATAR...',
  'ESTABLISHING WEB_RTC UPLINK...',
  'SYNCING AUDIO PIPELINE...',
  'AWAITING SIGNAL...'
];

function useBootSequence(active: boolean) {
  const [lines, setLines] = useState<string[]>([]);
  useEffect(() => {
    if (!active) { setLines([]); return; }
    let step = 0;
    setLines([BOOT_SEQUENCE[0]]);
    const id = setInterval(() => {
      step++;
      if (step < BOOT_SEQUENCE.length) {
        setLines(prev => [...prev, BOOT_SEQUENCE[step]]);
      } else {
        clearInterval(id);
      }
    }, 600);
    return () => clearInterval(id);
  }, [active]);
  return lines;
}

interface OracleState {
  isConnected: boolean;
  isReady: boolean;
  isProcessing: boolean;
  error: string | null;
  debugMode: boolean;
  activeBackendTab: 'coins' | 'squad' | 'portraits' | 'debug';
  userEmail?: string;
}

export function SurrogateOracleImmersion() {
  // ── Scene phases ─────────────────────────────────────────────────────────
  //   dormant  → user lands, dark alley, CTA glows, nothing connected
  //   terminal → user taps, lore types into cabinet, audio + atmosphere on
  //   awakened → lore done, branding types in, Decart connecting (boot seq)
  //   oracle   → Decart stream live, conversation panel active
  const [scenePhase, setScenePhase] = useState<'dormant' | 'terminal' | 'awakened' | 'oracle'>('dormant');
  const isAlive  = scenePhase !== 'dormant';                            // atmosphere + audio + bottom bar
  const awakened = scenePhase === 'awakened' || scenePhase === 'oracle'; // branding typewriter + cabinet glow
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
  const [sessionCoins, setSessionCoins] = useState(0);

  // ── Portrait generation ───────────────────────────────────────────────────
  const [isGeneratingPortrait, setIsGeneratingPortrait] = useState(false);
  // Stable ref so the auth useEffect can call generatePortrait without a forward-reference issue
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const generatePortraitRef = useRef<(themes: string[]) => Promise<void>>(async () => {});

  // ── Freemium mode flag (set when Decart unavailable in prod) ─────────────
  // Dev mode (dev_user_session in localStorage) always attempts Decart first
  const isDevMode = !!localStorage.getItem('dev_user_session');
  const [isDecartActive, setIsDecartActive] = useState(false);
  const isDecartActiveRef = useRef(false); // stable ref for callbacks

  // ── Freemium Oracle speech + VisemeDetector ───────────────────────────────
  // When Decart is not active, Oracle audio plays through freemiumAudioRef and
  // VisemeDetector drives real-time glow/pulse animation on the static oracle face.
  const freemiumAudioRef = useRef<HTMLAudioElement | null>(null);
  const visemeDetRef    = useRef<VisemeDetector | null>(null);
  const oracleFaceRef   = useRef<HTMLImageElement>(null);

  // ── Audio management ──────────────────────────────────────────────────────
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const decartClientRef = useRef<DecartClientHandle>(null);
  const oracleConversationRef = useRef<OracleConversationHandle>(null);
  const avatarVideoRef = useRef<HTMLVideoElement>(null);
  const atmosphereCanvasRef = useRef<HTMLCanvasElement>(null);

  useAtmosphere(atmosphereCanvasRef, isAlive, oracleAlignment);

  // Keep isDecartActiveRef in sync
  useEffect(() => { isDecartActiveRef.current = isDecartActive; }, [isDecartActive]);

  // Tear down VisemeDetector and freemium audio on unmount
  useEffect(() => () => {
    visemeDetRef.current?.destroy();
    visemeDetRef.current = null;
    freemiumAudioRef.current?.pause();
    freemiumAudioRef.current = null;
  }, []);

  // ── Dormant CTA cycling ───────────────────────────────────────────────────
  // Primary cycles every 3.2s, secondary offset at 4.5s — they drift out of sync
  const dormantCta = useCyclingText(CTA_PRIMARY,   3200, scenePhase === 'dormant');
  const dormantSub = useCyclingText(CTA_SECONDARY, 4500, scenePhase === 'dormant');

  // ── Typewriter title ──────────────────────────────────────────────────────
  const titleText = useTypewriter('SURROGATE:ORACLE', awakened, 60);
  const subtitleText = useTypewriter('SNEAKAR XR AI IMMERSION', awakened && titleText.length >= 16, 35);
  const bootLines = useBootSequence(isConnecting);

  // ── Cabinet glow controls ─────────────────────────────────────────────────
  const cabinetControls = useAnimation();

  useEffect(() => {
    if (awakened) {
      cabinetControls.start({
        boxShadow: [
          '0 0 20px rgba(0,255,136,0.25), 0 0 60px rgba(0,255,136,0.12)',
          '0 0 35px rgba(0,255,136,0.65), 0 0 90px rgba(0,255,136,0.30), 0 0 140px rgba(176,38,255,0.18)',
          '0 0 25px rgba(0,255,136,0.45), 0 0 70px rgba(0,255,136,0.22)',
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
        // Fire the EFA — generates portrait from conversation themes + saves to DB
        const themes: string[] = customEvent.detail?.themes || ['oracle', 'cyberpunk', 'graffiti'];
        generatePortraitRef.current(themes);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const missing: string[] = [];
    if (!import.meta.env.VITE_SUPABASE_URL && !import.meta.env.SUPABASE_URL) missing.push('VITE_SUPABASE_URL');
    if (!import.meta.env.VITE_SUPABASE_ANON_KEY && !import.meta.env.SUPABASE_ANON_KEY) missing.push('VITE_SUPABASE_ANON_KEY');

    if (missing.length > 0) {
      console.warn('[Surrogate] Missing environment variables:', missing);
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
        setIsDecartActive(true);

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
      setIsConnecting(false);

      if (isDevMode) {
        // Dev mode: show the error clearly, reset to dormant so you can tap to retry
        setOracleState((p) => ({
          ...p,
          error: `[DEV] Decart failed — ${result?.error || 'check decart-live-token EFA'}`,
        }));
        setScenePhase('dormant');
        setIsAudioPlaying(false);
      } else {
        // Freemium fallback: skip Decart, proceed to oracle mode with Gemini audio only
        setIsDecartActive(false);
        setOracleState((p) => ({ ...p, error: null }));
        setScenePhase('oracle');
        setTimeout(() => setShowConversation(true), 300);
      }
    } else {
      setIsDecartActive(true);
    }
  }, [validateEnvironment, isDevMode]);

  // ── Scene awakening — two-step, user-gated ───────────────────────────────
  // Step 1: user taps → terminal phase (lore narrative, audio on, NO connection)
  const enterTerminal = useCallback(() => {
    if (scenePhase !== 'dormant') return;
    setScenePhase('terminal');
    setIsAudioPlaying(true);
  }, [scenePhase]);

  // Step 2: auto-called by useLoreSequence when lore finishes (~1.8s pause)
  const awakeFromTerminal = useCallback(() => {
    if (scenePhase !== 'terminal') return;
    setScenePhase('awakened');
    initializeOracle();
  }, [scenePhase, initializeOracle]);

  // Lore sequence — depends on awakeFromTerminal, so declared after it
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const loreLines = useLoreSequence(scenePhase === 'terminal', awakeFromTerminal);

  // ── Oracle audio response handler ─────────────────────────────────────────
  // Paid path  → Decart ingests the WAV and streams the lip-synced avatar video.
  // Freemium   → play WAV directly; VisemeDetector drives real-time glow/pulse
  //              on the static oracle face at up to 60 fps via direct DOM writes
  //              (no React re-renders in the hot path).
  const handleOracleResponse = useCallback(async (audioUrl: string) => {
    // ── Paid: hand off to Decart ────────────────────────────────────────────
    if (isDecartActiveRef.current && decartClientRef.current?.isStreamActive()) {
      await decartClientRef.current.sendAudio(audioUrl);
      return;
    }

    // ── Freemium: play directly + animate face ──────────────────────────────
    // Lazily create the audio element once
    if (!freemiumAudioRef.current) {
      freemiumAudioRef.current = new Audio();
      freemiumAudioRef.current.crossOrigin = 'anonymous';
    }
    const audio = freemiumAudioRef.current;

    // Lazily create VisemeDetector and wire it to the audio element once.
    // createMediaElementSource can only be called once per element — guard with null check.
    if (!visemeDetRef.current) {
      visemeDetRef.current = new VisemeDetector((state) => {
        // HOT PATH — direct DOM writes, no React state
        const el = oracleFaceRef.current;
        if (!el) return;
        const amp = state.amplitude;
        if (amp < 0.04) {
          el.style.filter    = '';
          el.style.transform = '';
          return;
        }
        const glow   = (amp * 32).toFixed(1);
        const bright = (1 + amp * 0.38).toFixed(3);
        const scale  = (1 + amp * 0.028).toFixed(4);
        const alpha  = (0.28 + amp * 0.55).toFixed(3);
        el.style.filter    = `brightness(${bright}) drop-shadow(0 0 ${glow}px rgba(0,255,136,${alpha}))`;
        el.style.transform = `scale(${scale})`;
        el.style.transition = 'none';
      });
      try {
        visemeDetRef.current.connect(audio);
      } catch (e) {
        console.warn('[Viseme] connect failed:', e);
      }
    }

    // Stop any existing RAF loop before starting a new one
    visemeDetRef.current.stop();

    audio.src = audioUrl;

    audio.onplay = () => {
      visemeDetRef.current?.resume();
      visemeDetRef.current?.start();
    };

    const resetFace = () => {
      visemeDetRef.current?.stop();
      const el = oracleFaceRef.current;
      if (el) {
        el.style.transition = 'filter 0.6s ease, transform 0.6s ease';
        el.style.filter     = '';
        el.style.transform  = '';
      }
    };

    audio.onended = resetFace;
    audio.onerror = resetFace;

    await audio.play().catch((e) => {
      console.warn('[Freemium audio] play() blocked:', e);
      resetFace();
    });
  }, []);

  // Coins earned from Sacred exchanges — bubble to window for CultureCoinInlineDisplay
  const handleCoinsEarned = useCallback((amount: number) => {
    setSessionCoins((prev) => prev + amount);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updater = (window as any).updateInlineCultureCoins;
    if (typeof updater === 'function') updater(amount);
  }, []);

  // ── Procedural portrait generation ───────────────────────────────────────
  // Calls the surrogate-portrait-generator EFA (Google AI → DALL-E → themed fallback)
  // Ref is kept in sync so the auth useEffect can call it without forward-reference issues
  const generatePortrait = useCallback(async (themes: string[]) => {
    setIsGeneratingPortrait(true);
    try {
      const { supabase } = await import('../lib/supabase');
      const safeThemes = themes.length > 0 ? themes : ['oracle', 'cyberpunk', 'graffiti'];
      const { data, error } = await supabase.functions.invoke('gemini-portrait-generator', {
        body: {
          sessionId: currentSessionId,
          email: oracleState.userEmail || null,
          themes: safeThemes,
          style: 'freakdali-graff-punks',
        },
      });
      if (error) throw error;
      console.log('[Portrait] Generated:', data?.portraitUrl ? '✅' : '❌', data);
      // Open panel regardless — gallery will show the new portrait
      openBackendPanel('portraits');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((window as any).showSuccessNotification) {
        const method = data?.googleAiGenerated ? 'GOOGLE AI' : data?.dalleGenerated ? 'DALL·E' : 'NEURAL VAULT';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).showSuccessNotification(`PORTRAIT SYNTHESIZED via ${method} — check the Gallery.`);
      }
    } catch (err) {
      console.error('[Portrait] EFA call failed:', err);
      // Still open the panel — show whatever is in the gallery
      openBackendPanel('portraits');
    } finally {
      setIsGeneratingPortrait(false);
    }
  }, [currentSessionId, oracleState.userEmail]);

  // Keep ref in sync with latest generatePortrait instance
  useEffect(() => { generatePortraitRef.current = generatePortrait; }, [generatePortrait]);

  const exitOracleMode = async () => {
    // Stop freemium audio + viseme if running
    visemeDetRef.current?.stop();
    freemiumAudioRef.current?.pause();
    const el = oracleFaceRef.current;
    if (el) { el.style.filter = ''; el.style.transform = ''; }

    await decartClientRef.current?.closeStream();
    setIsDecartActive(false);
    setScenePhase('awakened');
    setShowConversation(false);
    setOracleState((p) => ({ ...p, isConnected: false, isReady: false, isProcessing: false, error: null }));
  };

  const openBackendPanel = (tab: OracleState['activeBackendTab'] = 'coins') => {
    if (!isAuthenticated && tab === 'coins') setShowAuthOverlay(true);
    setOracleState((p) => ({ ...p, debugMode: true, activeBackendTab: tab }));
  };

  const handleAuthSuccess = (user: { id: string; email: string }) => {
    console.log('✅ handleAuthSuccess fired in main component for user:', user.email);
    setIsAuthenticated(true);
    setCurrentUserId(user.id);
    
    // Explicitly hide the auth overlay first
    setShowAuthOverlay(false);
    
    // Then set the state for the backend/coins
    setOracleState((p) => ({ ...p, userEmail: user.email, debugMode: true }));
    setShowInlineCoins(true);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="oracle-stage"
      data-oracle-state={scenePhase}
      data-oracle-alignment={oracleAlignment || 'neutral'}
      data-debug={oracleState.debugMode}
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
          opacity: isAlive ? 1 : 0,
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
      <div
        className="oracle-center"
        onClick={() => scenePhase === 'dormant' && enterTerminal()}
        style={{ cursor: scenePhase === 'dormant' ? 'pointer' : 'default' }}
      >
        {/* Dormant CTA — two independent lines interchanging on different cadences */}
        {scenePhase === 'dormant' && (
          <div className="oracle-tap-prompt oracle-tap-prompt--glitch">
            {/* Line 1 — primary (graffiti font, neon green, cycles every 3.2s) */}
            <AnimatePresence mode="wait">
              <motion.span
                key={dormantCta.key}
                className="cta-primary"
                initial={{ opacity: 0, y: 6, filter: 'blur(4px) skewX(-3deg)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px) skewX(0deg)' }}
                exit={{ opacity: 0, y: -6, filter: 'blur(3px) skewX(2deg)' }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                {dormantCta.text}
              </motion.span>
            </AnimatePresence>

            {/* Line 2 — secondary (monospace, purple, cycles every 4.5s — drifts out of sync) */}
            <AnimatePresence mode="wait">
              <motion.span
                key={`sub-${dormantSub.key}`}
                className="cta-sub"
                initial={{ opacity: 0, y: 4, letterSpacing: '0.35em' }}
                animate={{ opacity: 1, y: 0, letterSpacing: '0.22em' }}
                exit={{ opacity: 0, y: -4, letterSpacing: '0.08em' }}
                transition={{ duration: 0.4, ease: 'easeInOut' }}
              >
                {dormantSub.text}
              </motion.span>
            </AnimatePresence>
          </div>
        )}

        {/* Cabinet CRT frame */}
        <div className="oracle-cabinet">
          {/* CRT scanline overlay */}
          <div className="oracle-scanlines" />

          <div className="oracle-avatar-wrapper">
            {/* Static oracle face — in freemium mode VisemeDetector writes
                glow/scale directly to this element at up to 60 fps */}
            <img
              ref={oracleFaceRef}
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

            {/* ── Lore Terminal (terminal phase) — tells the sci-fi story ── */}
            <AnimatePresence>
              {scenePhase === 'terminal' && (
                <motion.div
                  key="lore-terminal"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.5 } }}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(0,0,0,0.92)',
                    zIndex: 20,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    padding: '20px',
                    fontFamily: 'monospace',
                    color: '#00ff88',
                    textShadow: '0 0 10px rgba(0,255,136,0.9)',
                    fontSize: 'clamp(0.52rem, 1.05vw, 0.72rem)',
                    letterSpacing: '0.04em',
                    lineHeight: 1.7,
                  }}
                >
                  {loreLines.map((line, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                    >
                      {line}
                    </motion.div>
                  ))}
                  <motion.div
                    animate={{ opacity: [1, 0] }}
                    transition={{ repeat: Infinity, duration: 0.8 }}
                    style={{ marginTop: '8px' }}
                  >
                    _
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Connection Boot Sequence */}
            <AnimatePresence>
              {isConnecting && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(0,0,0,0.8)',
                    zIndex: 20,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    padding: '20px',
                    fontFamily: 'monospace',
                    color: '#00ff88',
                    textShadow: '0 0 8px rgba(0,255,136,0.8)',
                    fontSize: 'clamp(0.6rem, 1.2vw, 0.8rem)',
                  }}
                >
                  {bootLines.map((line, i) => (
                    <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
                      &gt; {line}
                    </motion.div>
                  ))}
                  <motion.div
                    animate={{ opacity: [1, 0] }}
                    transition={{ repeat: Infinity, duration: 0.8 }}
                    style={{ marginTop: '8px' }}
                  >
                    _
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
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

      {/* ── Layer 6: Bottom — Boombox + Crate (light up when alley is alive) */}
      <div className="oracle-bottom-bar">
        <motion.div
          initial={{ opacity: 0.3, filter: 'brightness(0.4) saturate(0.3)' }}
          animate={{
            opacity: isAlive ? 1 : 0.3,
            filter: isAlive
              ? 'brightness(1.1) saturate(1.2) drop-shadow(0 0 16px rgba(176,38,255,0.5))'
              : 'brightness(0.4) saturate(0.3)',
          }}
          transition={{ duration: 1.1, delay: isAlive ? 0.7 : 0 }}
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
            opacity: isAlive ? 1 : 0.3,
            filter: isAlive
              ? 'brightness(1.15) saturate(1.3) drop-shadow(0 0 18px rgba(0,255,136,0.55))'
              : 'brightness(0.4) saturate(0.3)',
          }}
          transition={{ duration: 1.1, delay: isAlive ? 1.0 : 0 }}
        >
          <EnculturateCrate onClick={() => openBackendPanel('coins')} isActive={oracleState.debugMode} />
        </motion.div>
      </div>

      {/* ── Culture coin display ─────────────────────────────────────────── */}
      {/* Intentionally removed: Culture coin display is hidden to subvert the token economy (Phase 4). Coins are private until invited via Enculturate Crate. */}

      {/* Conversation panel (oracle mode) ────────────────────────────── */}
      {isOracleMode && showConversation && (
        <OracleConversation
          ref={oracleConversationRef}
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
                initialTab={oracleState.activeBackendTab as any}
                onClose={() => setOracleState((p) => ({ ...p, debugMode: false }))}
                isAuthenticated={isAuthenticated}
                userEmail={oracleState.userEmail}
                pendingCoins={sessionCoins}
                decartClientRef={decartClientRef}
                oracleConversationRef={oracleConversationRef}
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

      {/* ── Portrait generating toast ────────────────────────────────────── */}
      <AnimatePresence>
        {isGeneratingPortrait && (
          <motion.div
            className="oracle-error-toast"
            style={{ background: 'rgba(176,38,255,0.18)', borderColor: 'rgba(176,38,255,0.4)', color: '#b026ff' }}
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
          >
            <span>⚗️ SYNTHESIZING NEURAL PORTRAIT...</span>
          </motion.div>
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
