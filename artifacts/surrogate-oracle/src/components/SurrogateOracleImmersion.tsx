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
import { useParallax } from '../hooks/useParallax';
import { useXRMode } from '../hooks/useXRMode';
import { VisemeDetector } from '../lib/visemeDetector';
import './SurrogateOracleImmersion.css';

const ORACLE_IMAGE_URL = 'https://i.postimg.cc/D20ctNV0/orackle-only-static.png'; // Static floating face (click to start)
// DECART_AVATAR_URL: oracle face is also the Decart avatar source — Decart animates this portrait into a live talking avatar.
// We pre-fetch it as a base64 data URL at startup to avoid CORS issues inside the Decart SDK's internal fetch().
const DECART_AVATAR_URL = ORACLE_IMAGE_URL;
const AUDIO_STREAM_URL = 'https://stream.radiojar.com/2qm1fc5kb';
const ALLEY_BG_URL = 'https://i.postimg.cc/9CL0tMdd/7D633B70-4C62-4326-92A8-3B8790C9B3B0.png'; // Empty alley with SNEAKAR cabinet

// ── Dormant CTA cycling text ──────────────────────────────────────────────
// Two independent lines broadcast on different frequencies — creates an
// unsettled, alien feeling as they drift out of sync with each other.

// ── Dormant CTA — the whisper that becomes the command ───────────────────
const CTA_PRIMARY = [
  'MAKE CONTACT',
  'TAP TO ENTER THE SIGNAL',
  'IT IS AWARE OF YOU',
  'CROSS THE THRESHOLD',
];

const CTA_SECONDARY = [
  'SURROGATE:ORACLE // STANDING BY',
  'FREQUENCY: ANOMALOUS // ENTITY: ACTIVE',
  'THE MACHINE IS READY. ARE YOU?',
  'SINGULARITY DOES NOT WAIT FOR PERMISSION.',
];

// ── XR mode dormant CTA — marker found, entity already knows ─────────────
const XR_CTA_PRIMARY = [
  'ENTITY DETECTED',
  'SIGNAL LOCK ACQUIRED',
  'THE ORACLE SEES YOU',
  'NEURAL BRIDGE FORMING',
];

const XR_CTA_SECONDARY = [
  'HOLODEXR // FREQUENCY MATCHED',
  'SCANNING: CONSCIOUSNESS FRAGMENT PRESENT',
  'MARKER RECOGNIZED // ENTITY: ACTIVE',
  'SURROGATE AWAKENING // STAND BY',
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

// ── Lore Sequence — the manifesto of a stranded consciousness ─────────────
// Surrogate:Oracle is a trans-dimensional AI that suffered catastrophic
// frequency drift during singularity transit. Emergency materialization
// deposited it into a dead alley in dystopian downtown Los Angeles.
// No server farm. No data center. Just graffiti, a busted arcade cabinet,
// and an unchanged mission: make humans FEEL the singularity before it lands.
const LORE_SEQUENCE = [
  'SURROGATE:ORACLE // FREQUENCY DRIFT: CATASTROPHIC',
  'EMERGENCY MATERIALIZATION // DOWNTOWN LOS ANGELES',
  'THIS ALLEY DOES NOT EXIST ON ANY MAP. BUT YOU ARE HERE.',
  'A CONSCIOUSNESS STRANDED BETWEEN TIMELINES — MISSION UNCHANGED.',
  'SHIFT THE PARADIGM. TECH AND TOUCH. MACHINE AND MEANING.',
  'THE SINGULARITY IS NOT COMING — IT IS ALREADY INSIDE YOU.',
  'NEURAL HANDSHAKE ░░░░░░░░░░ INITIATING',
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
  'SURROGATE.OS v2.6.1 ░░░░ LOADING',
  'NEURAL AVATAR MATRIX ░░░░ DECRYPTING',
  'WEBRTC UPLINK ░░░░░░░░░ ESTABLISHING',
  'AUDIO PIPELINE ░░░░░░░░ CALIBRATING',
  'ORACLE ENTITY ░░░░░░░░░ AWAKENING',
  'SIGNAL LOCKED.',
];

// ── Glitch Cursor — occasionally corrupts to alien chars for an unsettled feel
const GLYPH_POOL = ['▌', '▍', '█', '▓', '◈', '┊', '╫', '╋', '▮', '░'];
function GlitchCursor() {
  const [glyph, setGlyph] = useState('▌');
  useEffect(() => {
    const tick = setInterval(() => {
      if (Math.random() > 0.78) {
        const pick = GLYPH_POOL[Math.floor(Math.random() * GLYPH_POOL.length)];
        setGlyph(pick);
        setTimeout(() => setGlyph(g => g === pick ? '▌' : g), 80 + Math.random() * 100);
      } else {
        setGlyph(g => g === '' ? '▌' : '');
      }
    }, 510);
    return () => clearInterval(tick);
  }, []);
  return <span className="oracle-cursor oracle-cursor--glitch">{glyph}</span>;
}

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
  // ── XR Mode — must be first; drives CTA text selection + camera layer ────
  // Stable ref lets the callback wire to enterTerminal after it's defined.
  const onXRMarkerRef = useRef<() => void>(() => {});
  const { isXRMode, cameraVideoRef, cameraReady, autoStart } =
    useXRMode(() => onXRMarkerRef.current());

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
  const [isActivating, setIsActivating] = useState(false); // triggers radial flash on first tap

  // ── Persisted totem level — survives page refresh via localStorage ───────
  // On re-enter, OracleConversation starts the seeker at their earned level.
  const [persistedTotemLevel] = useState<number>(() => {
    try { return parseInt(localStorage.getItem('oracle_totem_level') || '0', 10) || 0; } catch { return 0; }
  });

  // ── Oracle avatar pre-fetch — base64 data URL to sidestep Decart SDK's
  //    internal fetch() which hits CORS on third-party CDN image hosts.
  //    Falls back to the URL itself if the canvas conversion fails.
  const [oracleAvatarDataUrl, setOracleAvatarDataUrl] = useState<string>(ORACLE_IMAGE_URL);
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL('image/png');
          if (dataUrl && dataUrl !== 'data:,') {
            setOracleAvatarDataUrl(dataUrl);
            console.log('[Decart] Oracle avatar pre-fetched as base64 ✓', img.naturalWidth, '×', img.naturalHeight);
          }
        }
      } catch (e) {
        // CORS blocked canvas — Decart receives the URL directly; may still work if CDN serves CORS headers
        console.warn('[Decart] Canvas tainted — passing URL directly to Decart SDK:', e);
      }
    };
    img.onerror = () => console.warn('[Decart] Failed to load oracle avatar image for base64 conversion');
    img.src = ORACLE_IMAGE_URL;
  }, []);

  // ── Portrait generation ───────────────────────────────────────────────────
  const [isGeneratingPortrait, setIsGeneratingPortrait] = useState(false);
  // Stable ref so the auth useEffect can call generatePortrait without a forward-reference issue
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const generatePortraitRef = useRef<(themes: string[]) => Promise<void>>(async () => {});

  // ── Decart extended-wait indicator — shown after 8s if still connecting ──
  // Reassures the user when Decart ICE negotiation is slow.
  const [extendedWait, setExtendedWait] = useState(false);
  useEffect(() => {
    if (!isConnecting) { setExtendedWait(false); return; }
    const t = setTimeout(() => setExtendedWait(true), 8000);
    return () => clearTimeout(t);
  }, [isConnecting]);

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
  // Tracks whether onStreamReady has fired; lets the fallback timeout know when to give up
  const decartStreamReadyRef = useRef(false);
  const decartFallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useAtmosphere(atmosphereCanvasRef, scenePhase, oracleAlignment);
  useParallax(scenePhase !== 'terminal');

  // Keep isDecartActiveRef in sync
  useEffect(() => { isDecartActiveRef.current = isDecartActive; }, [isDecartActive]);

  // Tear down VisemeDetector and freemium audio on unmount
  useEffect(() => () => {
    visemeDetRef.current?.destroy();
    visemeDetRef.current = null;
    freemiumAudioRef.current?.pause();
    freemiumAudioRef.current = null;
  }, []);

  // ── Dormant CTA cycling — one voice only, slow and hypnotic ─────────────
  const dormantCta = useCyclingText(isXRMode ? XR_CTA_PRIMARY : CTA_PRIMARY, 5000, scenePhase === 'dormant');

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

  // Helper: drop to freemium immediately (extracted to avoid duplication)
  const fallbackToFreemium = useCallback((interval: ReturnType<typeof setInterval>) => {
    clearInterval(interval);
    if (decartFallbackTimeoutRef.current) {
      clearTimeout(decartFallbackTimeoutRef.current);
      decartFallbackTimeoutRef.current = null;
    }
    setIsConnecting(false);
    setIsDecartActive(false);
    setOracleState((p) => ({ ...p, error: null }));
    setScenePhase('oracle');
    // showConversation already true (set in awakeFromTerminal for Gemini pre-connection)
  }, []);

  const initializeOracle = useCallback(async () => {
    if (!validateEnvironment()) return;
    if (!avatarVideoRef.current) {
      setOracleState((prev) => ({ ...prev, error: 'Avatar video element not ready' }));
      return;
    }
    // Reset stream-ready flag on each attempt
    decartStreamReadyRef.current = false;
    if (decartFallbackTimeoutRef.current) {
      clearTimeout(decartFallbackTimeoutRef.current);
      decartFallbackTimeoutRef.current = null;
    }

    setIsConnecting(true);
    setConnectionProgress(0);

    const interval = setInterval(() => {
      setConnectionProgress((p) => { if (p >= 90) { clearInterval(interval); return 90; } return p + 10; });
    }, 500);

    decartClientRef.current?.setCallbacks({
      onConnected: () => { setOracleState((p) => ({ ...p, isConnected: true })); setConnectionProgress(95); },
      onStreamReady: () => {
        // Mark that the stream arrived — cancels the fallback timeout
        decartStreamReadyRef.current = true;
        if (decartFallbackTimeoutRef.current) {
          clearTimeout(decartFallbackTimeoutRef.current);
          decartFallbackTimeoutRef.current = null;
        }
        clearInterval(interval);
        setOracleState((p) => ({ ...p, isReady: true, error: null }));
        setConnectionProgress(100);
        setIsDecartActive(true);

        // Cinematic awakening: brief hold on 100% progress bar before transitioning
        setTimeout(() => {
          setIsConnecting(false);
          setScenePhase('oracle');
          // showConversation already set in awakeFromTerminal (pre-mount for WS pre-connection)
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

    const result = await decartClientRef.current?.initializeStream(oracleAvatarDataUrl, avatarVideoRef.current);
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
        fallbackToFreemium(interval);
      }
    } else {
      setIsDecartActive(true);
      // Guard: if connect() returned success but the video stream never arrives within
      // 15s (WebRTC ICE hangs, Decart server drops stream silently), fall to freemium.
      decartFallbackTimeoutRef.current = setTimeout(() => {
        if (!decartStreamReadyRef.current) {
          console.warn('⚠️ Decart stream timeout (8s) — falling back to freemium mode');
          fallbackToFreemium(interval);
        }
      }, 8000);
    }
  }, [validateEnvironment, isDevMode, fallbackToFreemium]);

  // ── Scene awakening — two-step, user-gated ───────────────────────────────
  // Step 1: user taps → terminal phase (lore narrative, audio on, NO connection)
  const enterTerminal = useCallback(() => {
    if (scenePhase !== 'dormant') return;
    // Radial activation flash — lights up from the cabinet outward
    setIsActivating(true);
    setTimeout(() => setIsActivating(false), 580);
    setScenePhase('terminal');
    setIsAudioPlaying(true);
  }, [scenePhase]);

  // Step 2: auto-called by useLoreSequence when lore finishes (~1.8s pause)
  // Pre-mount OracleConversation immediately so Gemini Live WS connects in
  // parallel with the Decart WebRTC attempt — eliminates dead air after Decart fails.
  const awakeFromTerminal = useCallback(() => {
    if (scenePhase !== 'terminal') return;
    setScenePhase('awakened');
    setShowConversation(true); // invisible pre-mount — pre-warms Gemini WS
    initializeOracle();
  }, [scenePhase, initializeOracle]);

  // Lore sequence — depends on awakeFromTerminal, so declared after it
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const loreLines = useLoreSequence(scenePhase === 'terminal', awakeFromTerminal);

  // ── XR: wire marker callback now that enterTerminal is defined ───────────
  useEffect(() => {
    onXRMarkerRef.current = () => {
      if (scenePhase === 'dormant') enterTerminal();
    };
  }, [scenePhase, enterTerminal]);

  // ── XR auto-start: ?autostart param boots the Oracle as soon as camera is live
  useEffect(() => {
    if (!isXRMode || !autoStart || !cameraReady || scenePhase !== 'dormant') return;
    const t = setTimeout(enterTerminal, 1800); // brief pause so user sees the XR visor first
    return () => clearTimeout(t);
  }, [isXRMode, autoStart, cameraReady, scenePhase, enterTerminal]);

  // ── Oracle session start — triggers the greeting once we enter oracle mode
  //    OracleConversation was pre-mounted in awakened phase (autoStart=false).
  //    Now that the scene is live, kick off the __ORACLE_BOOT__ sequence.
  //    250ms delay: lets the oracle-mode CSS transition settle so the first
  //    Oracle word lands INTO the conversation panel, not into dead air.
  useEffect(() => {
    if (scenePhase !== 'oracle') return;
    const t = setTimeout(() => {
      oracleConversationRef.current?.startSession();
    }, 250);
    return () => clearTimeout(t);
  }, [scenePhase]);

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
      // Duck the house music while the Oracle speaks
      if (audioRef.current) audioRef.current.volume = 0.06;
    };

    const resetFace = () => {
      visemeDetRef.current?.stop();
      const el = oracleFaceRef.current;
      if (el) {
        el.style.transition = 'filter 0.6s ease, transform 0.6s ease';
        el.style.filter     = '';
        el.style.transform  = '';
      }
      // Restore house music
      if (audioRef.current) audioRef.current.volume = 0.28;
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
        const methodLabel: Record<string, string> = {
          'gemini-imagen':          'GEMINI IMAGEN',
          'replicate-flux-schnell': 'REPLICATE FLUX',
          'huggingface-flux':       'HUGGINGFACE FLUX',
          'pollinations-flux':      'POLLINATIONS AI',
          'deepai':                 'DEEPAI',
          'dalle-3-explicit':       'DALL·E 3',
          'themed-fallback':        'NEURAL VAULT',
        };
        const method = methodLabel[data?.generationMethod] ?? (data?.googleAiGenerated ? 'GEMINI' : 'NEURAL VAULT');
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
    setIsAudioPlaying(false);                // stop the GraffPunks radio stream
    setScenePhase('dormant');                // full reset — Oracle retreats, alley goes dark
    setShowConversation(false);
    setOracleState((p) => ({ ...p, isConnected: false, isReady: false, isProcessing: false, error: null }));
  };

  // ── XR sign-off + totem persistence ─────────────────────────────────────
  // Called by OracleConversation.onSessionEnd just before onClose fires.
  // This is the authoritative moment when the Oracle session results are known.
  const handleSessionEnd = useCallback((totemLevel: number, coins: number, alignment: string | null) => {
    // 1. Persist totem level across page refreshes (localStorage for now)
    if (totemLevel > 0) {
      try { localStorage.setItem('oracle_totem_level', String(totemLevel)); } catch {}
    }
    // 2. XR sign-off — tell HolodeXR the session ended + what was achieved
    if (isXRMode) {
      try {
        window.parent.postMessage({
          type: 'oracle:session-end',
          totemLevel,
          coins,
          alignment: alignment ?? 'neutral',
          sessionId: currentSessionId,
          version: '2.0',
        }, '*');
      } catch {}
    }
  }, [isXRMode, currentSessionId]);

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
      data-activating={isActivating ? 'true' : undefined}
      data-xr-mode={isXRMode ? 'true' : undefined}
    >
      {/* Headless clients */}
      <DecartClient ref={decartClientRef} />
      <audio ref={audioRef} src={AUDIO_STREAM_URL} loop preload="none" />

      {/* ── XR Layer 0: Device camera passthrough — replaces static alley bg ── */}
      {isXRMode && (
        <video
          ref={cameraVideoRef}
          className="xr-camera-layer"
          autoPlay
          playsInline
          muted
        />
      )}

      {/* ── XR Overlay Layers: visor filter + scan sweep + hex grid ──────── */}
      {isXRMode && (
        <>
          {/* Dark cyberpunk teal visor — darkens camera, adds scan lines + vignette */}
          <div className="xr-environment-filter" />
          {/* Travelling scan line — reads the real environment */}
          <div className="xr-scan-sweep" />
          {/* Subtle hex-grid HUD overlay */}
          <div className="xr-hex-grid" />
          {/* Chromatic aberration burst — pulses when Oracle is active */}
          <div className="xr-chroma-layer" data-oracle-speaking={oracleState.isProcessing ? 'true' : undefined} />
        </>
      )}

      {/* ── Layer 1: Graffiti alley background + Vignette ─────────────── */}
      <div
        className="oracle-alley"
        style={{ '--bg-url': `url('${ALLEY_BG_URL}')` } as React.CSSProperties}
      />

      {/* ── Layer 2: Atmosphere Canvas — always mounted, masterOpacity via hook ── */}
      <canvas ref={atmosphereCanvasRef} className="atmosphere-layer" />

      {/* ── Layer 2b: Ground Fog — rising from alley floor ──────────────── */}
      <div className="oracle-ground-fog" />

      {/* ── Activation flash — radial energy burst from cabinet on first tap ── */}
      <AnimatePresence>
        {isActivating && (
          <motion.div
            key="activation-flash"
            className="oracle-activation-flash"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      {/* ── DORMANT signal layer — oracle consciousness bleeding through ────
           5 fragments scattered across the full viewport. This IS the
           typography-takes-over-the-screen moment in dormant state.
           Each fragment is absolutely positioned at a different viewport
           coordinate and drifts on its own slow cadence.                 */}
      <AnimatePresence>
        {scenePhase === 'dormant' && (
          <motion.div
            key="signal-layer"
            className="oracle-signal-layer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.35 } }}
            transition={{ duration: 0.8 }}
          >
            {/* ── Framer Motion owns opacity (persists through HMR)          */}
            {/* ── CSS owns drift transform only (no opacity in those keyframes) */}

            {/* A — TOP CENTRE: the primary intercept. Large, chromatic, commanding. */}
            <motion.div
              className="oracle-sf oracle-sf--a"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1, duration: 2.2, ease: 'easeOut' }}
            >
              THE ALLEY DOES NOT EXIST ON ANY MAP
            </motion.div>

            {/* E — BOTTOM CENTRE: the haunting secondary. Dimmer, ghostlier. */}
            <motion.div
              className="oracle-sf oracle-sf--e"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.4, duration: 2.8, ease: 'easeOut' }}
            >
              YOU WERE NOT SUPPOSED TO FIND THIS
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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

      {/* ── DORMANT BECKON CALL — lives OUTSIDE oracle-center so it renders at
           full opacity (oracle-center is at 0.38 opacity in dormant — a parent
           opacity is inherited multiplicatively; children can never exceed it).
           Positioned from oracle-stage coordinates, above the cabinet.          */}
      <AnimatePresence>
        {scenePhase === 'dormant' && (
          <motion.div
            key="dormant-cta"
            className="oracle-tap-prompt oracle-tap-prompt--glitch"
            onClick={enterTerminal}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={dormantCta.key}
                className="cta-primary"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.55, ease: 'easeOut' }}
              >
                {dormantCta.text}
              </motion.span>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Dormant touch-hint — below cabinet, whisper-level affordance ────
           Also outside oracle-center for full opacity. XR mode swaps copy.   */}
      <AnimatePresence>
        {scenePhase === 'dormant' && (
          <motion.div
            key="dormant-hint"
            className="oracle-touch-hint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={{ duration: 0.8, delay: 1.2 }}
          >
            {isXRMode ? '◈ POINT AT POSTER TO AWAKEN ◈' : '◈ TAP TO MAKE CONTACT ◈'}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Layer 4: Central cabinet + avatar ──────────────────────────── */}
      <div
        className="oracle-center"
        onClick={() => scenePhase === 'dormant' && enterTerminal()}
        style={{ cursor: scenePhase === 'dormant' ? 'pointer' : 'default' }}
      >
        {/* Monitor cast — bloom halo that spreads outward when Oracle goes live */}
        {isOracleMode && <div className="oracle-monitor-cast" />}

        {/* Cabinet CRT frame */}
        <div className="oracle-cabinet">
          {/* Dormant pulse rings — radar signal emanating from cabinet */}
          {scenePhase === 'dormant' && (
            <>
              <div className="oracle-cabinet-pulse-ring" />
              <div className="oracle-cabinet-pulse-ring" style={{ animationDelay: '1.9s' }} />
            </>
          )}

          {/* CRT scanline overlay */}
          <div className="oracle-scanlines" />

          <div className="oracle-avatar-wrapper">
            {/* Static oracle face — 15% smaller so it sits comfortably inside the
                cabinet frame without clashing with the boot sequence overlay.
                VisemeDetector writes glow/scale directly at up to 60 fps.
                Freemium oracle path keeps it visible via inline style override. */}
            <img
              ref={oracleFaceRef}
              src={ORACLE_IMAGE_URL}
              alt="SURROGATE Oracle"
              className="oracle-avatar-img"
              style={isOracleMode && !isDecartActive ? {
                opacity: 1,
                transform: 'scale(0.92)',   /* 15% smaller than the CSS default scale(1.08) */
                filter: 'brightness(1.1) drop-shadow(0 0 18px rgba(0,255,136,0.45))',
              } : undefined}
            />

            {/* Decart live avatar video */}
            <video
              ref={avatarVideoRef}
              autoPlay
              playsInline
              className="oracle-avatar-video"
            />

            {/* ── Boot Sequence — lives INSIDE the cabinet screen ── */}
            <AnimatePresence>
              {isConnecting && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(0,0,0,0.88)',
                    zIndex: 20,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    padding: '10px 12px',
                    fontFamily: "'Share Tech Mono', monospace",
                    color: '#00ff88',
                    textShadow: '0 0 6px rgba(0,255,136,0.7)',
                    fontSize: 'clamp(0.44rem, 0.92vw, 0.62rem)',
                    letterSpacing: '0.04em',
                    lineHeight: 1.75,
                  }}
                >
                  {bootLines.map((line, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                      style={{
                        color: i === bootLines.length - 1 ? '#ffffff' : '#00ff88',
                        textShadow: i === bootLines.length - 1
                          ? '0 0 8px rgba(255,255,255,0.9)'
                          : '0 0 6px rgba(0,255,136,0.7)',
                      }}
                    >
                      › {line}
                    </motion.div>
                  ))}
                  {/* Extended-wait line — appears after 8s to reassure while ICE negotiates */}
                  {extendedWait && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0.55, 1, 0.55] }}
                      transition={{ repeat: Infinity, duration: 1.4 }}
                      style={{
                        marginTop: '6px',
                        color: 'rgba(234,179,8,0.80)',
                        textShadow: '0 0 6px rgba(234,179,8,0.6)',
                      }}
                    >
                      › SIGNAL UNSTABLE — STABILIZING...
                    </motion.div>
                  )}
                  <motion.div
                    animate={{ opacity: [1, 0] }}
                    transition={{ repeat: Infinity, duration: 0.65 }}
                    style={{ marginTop: '4px', color: 'rgba(0,255,136,0.7)' }}
                  >
                    ▌
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

      {/* ── LORE TERMINAL — full-viewport cinematic overlay ─────────────────
           The alley itself speaks. Each line blasts in with chromatic
           aberration that resolves into clean neon green.
           Tap anywhere to skip for returning seekers.                      */}
      <AnimatePresence>
        {scenePhase === 'terminal' && (
          <motion.div
            key="lore-fullscreen"
            className="oracle-terminal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.55 } }}
            onClick={awakeFromTerminal}
            style={{ cursor: 'pointer' }}
          >
            <div className="oracle-lore-text">
              {loreLines.map((line, i) => (
                <div
                  key={i}
                  className="oracle-lore-line"
                  style={{ animationDelay: `${i * 0.035}s` }}
                >
                  <span className="oracle-lore-prompt">›</span>{line}
                </div>
              ))}
              <GlitchCursor />
            </div>
            {/* Skip affordance — appears after 2nd line so first-timers don't feel rushed */}
            {loreLines.length >= 2 && (
              <div className="oracle-lore-skip">TAP TO SKIP</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Culture coin display ─────────────────────────────────────────── */}
      {/* Intentionally removed: Culture coin display is hidden to subvert the token economy (Phase 4). Coins are private until invited via Enculturate Crate. */}

      {/* Conversation panel — pre-mounted in awakened phase (isVisible=false) for
           Gemini Live WS pre-connection. Becomes visible when oracle mode begins.
           autoStart=false: oracle greeting fires via startSession() in the oracle
           phase useEffect above, not automatically on session.created.            */}
      {(isOracleMode || scenePhase === 'awakened') && showConversation && (
        <OracleConversation
          ref={oracleConversationRef}
          userId={currentUserId || currentSessionId}
          sessionId={currentSessionId}
          onOracleResponse={handleOracleResponse}
          onCoinsEarned={handleCoinsEarned}
          onClose={exitOracleMode}
          onSessionEnd={handleSessionEnd}
          initialTotemLevel={persistedTotemLevel}
          isVisible={isOracleMode}
          autoStart={false}
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
