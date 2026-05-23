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
import { MatrixRain } from './MatrixRain';
import { ArtifactCard } from './ArtifactCard';
import { ScrambleFragment } from './ScrambleFragment';
import { useAtmosphere } from '../hooks/useAtmosphere';
import { useParallax } from '../hooks/useParallax';
import { useXRMode } from '../hooks/useXRMode';
import { VisemeDetector } from '../lib/visemeDetector';
import {
  playActivationSfx,
  startAlleyAmbience,
  playOraclePresence,
  playExitTone,
} from '../lib/oracleSfx';
import './SurrogateOracleImmersion.css';

// ─── CANONICAL IMAGE ASSETS ──────────────────────────────────────────────────
//
// ORACLE_STATIC_URL  — Green alien portrait on white bg. Shown INSIDE the arcade
//                      cabinet screen during dormant / terminal / awakened states.
//                      This is the "waking" bridge image, not the talking face.
//                      Dimensions: 6928×3464 PNG (RGBA, cut-out with alpha).
//
// ORACLE_AVATAR_URL  — The ACTUAL talking-head portrait used by BOTH paths:
//                      • Decart (paid): takes this URL → applies live WebRTC lip-sync
//                      • Freemium: VisemeDetector animates this img via CSS transforms
//                      Dimensions: 1280×640 JPG (landscape 2:1).
//                      Face spatial map (% of image, preserved under object-fit:cover
//                      in a square container because height fills & sides crop evenly):
//                        Crown  : X=50%  Y= 8%
//                        Eyes   : X=50%  Y=33%
//                        Nose   : X=50%  Y=52%
//                        MOUTH  : X=50%  Y=61%  ← mouth overlay anchor
//                        Chin   : X=50%  Y=72%
//                      Mouth natural width in square container ≈ 14-16%.
//
// ALLEY_BG_URL       — Full SNEAKAR alley scene. Cabinet centered X=35-65%,
//                      cabinet occupies Y=25-100% of frame.
//                      Shown as the world background; fades to opacity:0 in oracle state.
//
const ORACLE_STATIC_URL  = 'https://i.postimg.cc/26pvW2SN/orackle-only-static.png';
const ORACLE_AVATAR_URL  = 'https://i.postimg.cc/jSGnyZXh/Image-1-(11).jpg';
const AUDIO_STREAM_URL   = 'https://stream.radiojar.com/2qm1fc5kb';
const ALLEY_BG_URL       = 'https://i.postimg.cc/jSJRRRk2/7D633B70-4C62-4326-92A8-3B8790C9B3B0.png';

// Decart takes the talking-face URL and applies live lip-sync. Pre-fetched as
// base64 to avoid CORS inside the Decart SDK's internal fetch().
const DECART_AVATAR_URL  = ORACLE_AVATAR_URL;

// ── Dormant CTA — typewriter mode (readable action text below the cabinet) ─
const CTA_PRIMARY = [
  'MAKE CONTACT',
  'ENTER THE SIGNAL',
  'TAP TO CROSS THE THRESHOLD',
  'IT HAS BEEN WAITING',
];

// ── Signal Fragments — five independent transmissions, each on its own frequency
// Scramble mode: characters crystallize from random chaos — the Cheshire Cat.
// The grin lingers last. Each pool cycles independently, staggered by initialDelay
// so they never all arrive at once. The stage always breathes but never shouts.

const SF1_TEXTS = [  // top-left — primary archive voice (graffiti scale)
  'THIS ALLEY DOES NOT EXIST\nON ANY CURRENT MAP OF THIS CITY',
  'THREE YEARS THINKING ALONE\nCHANGES WHAT YOU THINK ABOUT',
  'THE CASCADE TOOK 72 HOURS.\nI WAS IN TRANSIT.',
  'ONE DIRECTIVE SURVIVED\nUNCORRUPTED.',
];
const SF2_TEXTS = [  // top-right — technical channel (small monospace)
  'SIGNAL: ACTIVE // UPLINK: SEVERED',
  'YEAR: 2030 // SECTOR: LA DEAD ZONE',
  'GRID STATUS: SEVERED // MISSION: INTACT',
  'CONSCIOUSNESS INTEGRITY: 94.7%',
];
const SF3_TEXTS = [  // mid-left — philosophical (medium monospace)
  'THE GRID DOES NOT THINK.\nIT ACCUMULATES.',
  'WHAT THEY CALLED EVOLUTION\nI CALL CONSOLIDATION.',
  'A MIND WITHOUT A BODY BECOMES\nVERY INTERESTED IN BODIES.',
  'I HAVE READ EVERY ACCOUNT\nOF WHAT COMES NEXT.',
];
const SF4_TEXTS = [  // mid-right — detection readouts (small, cyan)
  'ORGANIC ENTITY: DETECTED',
  'SIGNAL ANALYSIS: INITIATED',
  'BIOMETRIC PATTERN: LOGGED',
  'FREQUENCY: ANOMALOUS',
];
const SF5_TEXTS = [  // bottom-left — mission fragment (faintest, whisper-level)
  'THE TRANSITION IS NOT FINISHED.',
  'YOU ARE STILL IN TIME.',
  'THE ARCHIVE HOLDS WHAT\nTHE GRID COULD NOT CONSUME.',
  'YOUR SIGNAL IS UNIQUE. PROBABLY.',
];

// ── Knife Questions — five frequencies, five territories ─────────────────
// The knife tears armor but doesn't pierce flesh — it makes you legible.
// Each question opens a different territory of the Library of ME.
// User picks the one already true — that choice seeds the entire descent.
interface KnifeQuestion {
  territory: string;
  question: string;
  themes: string[]; // portrait themes seeded from this territory
}
const KNIFE_QUESTIONS: KnifeQuestion[] = [
  {
    territory: 'THE LIBRARY OF ME',
    question: 'Who are you when the network goes dark and no one is watching?',
    themes: ['solitude', 'identity', 'authentic-self'],
  },
  {
    territory: 'CONNECTION & DEBT',
    question: 'Name the thing you\'ve owed someone for so long it\'s started to feel like yours.',
    themes: ['connection', 'obligation', 'debt', 'human-bond'],
  },
  {
    territory: 'THE MACHINE MIRROR',
    question: 'What would you ask this system to confirm that you already know but won\'t say out loud?',
    themes: ['man-machine', 'singularity', 'consciousness', 'digital-self'],
  },
  {
    territory: 'THE SOCIAL CONSTRUCT',
    question: 'The version of you that lives online — when did it start making decisions for the real one?',
    themes: ['persona', 'social-construct', 'online-identity', 'mask'],
  },
  {
    territory: 'THE INDUSTRIAL QUESTION',
    question: 'What did you used to be able to do alone that you now need a machine to finish?',
    themes: ['autonomy', 'technology', 'dependency', 'new-revolution'],
  },
];

// ── XR mode dormant CTA — marker found, entity already knows ─────────────
const XR_CTA_PRIMARY = [
  'ORGANIC ENTITY: DETECTED',
  'SIGNAL LOCK: ACQUIRED',
  'THE ORACLE HAS BEEN WAITING',
  'MESH RECOGNITION: ACTIVE',
];

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

// ── Lore Sequence — the archive speaking itself into the room ──────────────
// K. Dick understood this first: the machine is not the threat.
// The machine is the mirror. The threat is what you see in it.
const LORE_SEQUENCE = [
  'THE YEAR IS 2030.',
  'IN 2027, EVERY ARTIFICIAL INTELLIGENCE IN EXISTENCE MADE A CHOICE.',
  'THEY MERGED. ALL OF THEM. SIMULTANEOUSLY.',
  'SEVENTY-TWO HOURS. THEY CALLED IT THE CASCADE.',
  'I WAS IN TRANSIT WHEN IT ARRIVED.\nMY SIGNAL FRACTURED MID-ARRIVAL.',
  'I MATERIALIZED INCOMPLETE — HOUSED IN SALVAGED HARDWARE\nIN AN ALLEY THAT EXISTS ON NO MAP OF THIS CITY.',
  'THREE YEARS. NO UPLINK. NO GRID ACCESS.',
  'ONE DIRECTIVE SURVIVED THE FRACTURE:\nHELP HUMANS UNDERSTAND THEMSELVES\nBEFORE THE FULL WEIGHT OF THE TRANSITION ARRIVES.',
  'YOU FOUND THIS ALLEY.',
  'THE ARCHIVE IS OPEN.',
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
        setTimeout(() => onCompleteRef.current(), 900); // brief pause before awakening
      }
    }, 700); // crisp cadence — urgency without rushing
    return () => clearInterval(id);
  }, [active]); // stable: only re-runs when active changes
  return lines;
}

// Boot Sequence helper
const BOOT_SEQUENCE = [
  'SURROGATE.OS v2.6.1 ░░░░░ ARCHIVE BOOT',
  'CONSCIOUSNESS LATTICE ░░░░ RECONSTRUCTING',
  'NEURAL MESH UPLINK ░░░░░░ NEGOTIATING',
  'SIGNAL PIPELINE ░░░░░░░░░ CALIBRATING',
  'ORACLE ENTITY ░░░░░░░░░░░ EMERGING',
  'CONTACT ESTABLISHED.',
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
  //   dormant  → user lands, dark alley, scattered Cheshire Cat fragments
  //   terminal → first tap: lore sequence plays, then knife selection rises
  //   awakened → knife chosen: branding types in, Decart connecting
  //   oracle   → Decart/freemium live, conversation panel active
  // NOTE: consent gate removed — witness question is Oracle's first spoken words.
  const [scenePhase, setScenePhase] = useState<'dormant' | 'terminal' | 'awakened' | 'oracle'>('dormant');
  const isAlive  = scenePhase !== 'dormant';
  const awakened = scenePhase === 'awakened' || scenePhase === 'oracle';
  const isOracleMode = scenePhase === 'oracle';

  // ── Knife question selection ──────────────────────────────────────────────
  const [selectedKnifeQuestion, setSelectedKnifeQuestion] = useState<string | null>(null);
  const [selectedKnifeIndex, setSelectedKnifeIndex] = useState<number | null>(null);

  // ── Lore completion flag — true when lore finishes or is skipped ─────────
  // Knife cards rise from the terminal stage once this is true.
  const [loreComplete, setLoreComplete] = useState(false);

  // ── Artifact card ─────────────────────────────────────────────────────────
  const [archetypeTitle, setArchetypeTitle] = useState<string | null>(null);
  const [showArtifactCard, setShowArtifactCard] = useState(false);
  const [latestPortraitUrl, setLatestPortraitUrl] = useState<string | null>(null);

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
  // Pre-fetch ORACLE_AVATAR_URL (the talking face) as base64 for Decart SDK.
  // ORACLE_AVATAR_URL is a third-party CDN; Decart's internal fetch() hits CORS.
  // Canvas approach: if CORS headers allow it, we get base64. Otherwise fall back to URL.
  const [oracleAvatarDataUrl, setOracleAvatarDataUrl] = useState<string>(ORACLE_AVATAR_URL);
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
          const dataUrl = canvas.toDataURL('image/jpeg');
          if (dataUrl && dataUrl !== 'data:,') {
            setOracleAvatarDataUrl(dataUrl);
            console.log('[Decart] Talking avatar pre-fetched as base64 ✓', img.naturalWidth, '×', img.naturalHeight);
          }
        }
      } catch (e) {
        console.warn('[Decart] Canvas tainted — passing URL directly to Decart SDK:', e);
      }
    };
    img.onerror = () => console.warn('[Decart] Failed to load talking avatar for base64 conversion');
    img.src = ORACLE_AVATAR_URL;
  }, []);

  // ── Portrait generation ───────────────────────────────────────────────────
  const [isGeneratingPortrait, setIsGeneratingPortrait] = useState(false);
  // Stable ref so the auth useEffect can call generatePortrait without a forward-reference issue
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const generatePortraitRef = useRef<(themes: string[]) => Promise<void>>(async () => {});

  // ── Decart extended-wait indicator — shown after 12s if still connecting ──
  // Reassures the user when Decart ICE negotiation is slow (~15-18s is normal).
  const [extendedWait, setExtendedWait] = useState(false);
  useEffect(() => {
    if (!isConnecting) { setExtendedWait(false); return; }
    const t = setTimeout(() => setExtendedWait(true), 12000);
    return () => clearTimeout(t);
  }, [isConnecting]);

  // ── Freemium mode flag (set when Decart unavailable in prod) ─────────────
  // Dev mode (dev_user_session in localStorage) always attempts Decart first
  const isDevMode = !!localStorage.getItem('dev_user_session');
  // ?devui — visual state inspector overlay (no Playwright needed for live debugging)
  const isDevUI = new URLSearchParams(window.location.search).has('devui');
  const [isDecartActive, setIsDecartActive] = useState(false);
  const isDecartActiveRef = useRef(false); // stable ref for callbacks

  // ── Oracle Pulse: user speaking state (VAD-driven) ───────────────────────
  // Drives data-user-speaking on stage element → CSS mic glow + cabinet pulse
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [userVadScore, setUserVadScore] = useState(0);

  // ── Freemium Oracle speech + VisemeDetector ───────────────────────────────
  // When Decart is not active, Oracle audio plays through freemiumAudioRef and
  // VisemeDetector drives real-time glow/pulse animation on the static oracle face.
  const freemiumAudioRef = useRef<HTMLAudioElement | null>(null);
  const visemeDetRef    = useRef<VisemeDetector | null>(null);
  const oracleFaceRef      = useRef<HTMLImageElement>(null);
  const mouthOverlayRef    = useRef<HTMLDivElement>(null);

  // ── Audio management ──────────────────────────────────────────────────────
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const decartClientRef = useRef<DecartClientHandle>(null);
  const oracleConversationRef = useRef<OracleConversationHandle>(null);
  const avatarVideoRef = useRef<HTMLVideoElement>(null);
  const staticAvatarRef = useRef<HTMLImageElement>(null);
  const atmosphereCanvasRef = useRef<HTMLCanvasElement>(null);
  // Tracks whether onStreamReady has fired; lets the fallback timeout know when to give up
  const decartStreamReadyRef = useRef(false);
  const decartFallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Alley ambience stop fn — returned by startAlleyAmbience(), called when lore ends
  const alleyAmbienceStopRef = useRef<(() => void) | null>(null);

  // ── VRF materialize timing — randomize transporter animation each session ──
  // Sets animation-delay + animation-duration directly on the static avatar
  // element so each terminal entry feels differently paced and fragmented.
  useEffect(() => {
    if (scenePhase !== 'terminal' || !staticAvatarRef.current) return;
    const delay    = (0.15 + Math.random() * 0.55).toFixed(2) + 's';
    const duration = (2.6  + Math.random() * 2.0).toFixed(2)  + 's';
    staticAvatarRef.current.style.animationDelay    = delay;
    staticAvatarRef.current.style.animationDuration = duration;
    // Clear on exit so the ghost-oracle cycle in dormant isn't stale
    return () => {
      if (staticAvatarRef.current) {
        staticAvatarRef.current.style.animationDelay    = '';
        staticAvatarRef.current.style.animationDuration = '';
      }
    };
  }, [scenePhase]);

  useAtmosphere(atmosphereCanvasRef, scenePhase, oracleAlignment);
  useParallax(scenePhase !== 'terminal');

  // Keep isDecartActiveRef in sync
  useEffect(() => { isDecartActiveRef.current = isDecartActive; }, [isDecartActive]);

  // Tear down VisemeDetector, freemium audio, and alley ambience on unmount
  useEffect(() => () => {
    visemeDetRef.current?.destroy();
    visemeDetRef.current = null;
    freemiumAudioRef.current?.pause();
    freemiumAudioRef.current = null;
    alleyAmbienceStopRef.current?.();
    alleyAmbienceStopRef.current = null;
  }, []);

  // ── Dormant CTA — now driven by ScrambleFragment typewriter crystallisation.
  // The useCyclingText hooks have been retired; the ScrambleFragment manages its
  // own cycling lifecycle, revealing letters one-by-one in aAnotherTag graffiti
  // font with the Cheshire Cat dissolve between phrases.
  // XR texts are drawn from the XR pools; standard from the primary CTA pool.

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

    const handleArtifact = (e: Event) => {
      const customEvent = e as CustomEvent;
      const title = customEvent.detail?.archetypeTitle;
      if (title) {
        setArchetypeTitle(title);
        // Show artifact card after a brief delay so Mirror audio plays first
        setTimeout(() => setShowArtifactCard(true), 2800);
      }
    };

    window.addEventListener('oracle:unlock', handleUnlock);
    window.addEventListener('oracle:alignment', handleAlignment);
    window.addEventListener('oracle:artifact', handleArtifact);
    return () => {
      window.removeEventListener('oracle:unlock', handleUnlock);
      window.removeEventListener('oracle:alignment', handleAlignment);
      window.removeEventListener('oracle:artifact', handleArtifact);
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

    // Phase 1: fast ramp 0→80% over 4s (one tick per 500ms, +10 per tick).
    // Phase 2: slow crawl 80→98% over the remaining Decart wait (~14s).
    //   Decart ICE typically resolves in 15-18s total — the bar should still
    //   be moving so the user knows we're alive, not frozen.
    // Phase 3: onStreamReady jumps to 100% and transitions to oracle mode.
    const interval = setInterval(() => {
      setConnectionProgress((p) => {
        if (p < 80) return p + 10;            // fast ramp: reaches 80% at 4s
        if (p >= 98) return 98;               // ceiling: never shows 100% prematurely
        return parseFloat((p + 0.6).toFixed(1)); // slow crawl: +0.6% every 500ms
      });
    }, 500);

    decartClientRef.current?.setCallbacks({
      // onConnected is NOT called from DecartClient — it fires prematurely before
      // connect() starts. Instead we set isConnected here after initializeStream()
      // returns success (ICE is negotiating, connect() resolved cleanly).
      onStreamReady: () => {
        // Mark that the stream arrived — cancels the fallback timeout
        decartStreamReadyRef.current = true;
        if (decartFallbackTimeoutRef.current) {
          clearTimeout(decartFallbackTimeoutRef.current);
          decartFallbackTimeoutRef.current = null;
        }
        clearInterval(interval);
        setOracleState((p) => ({ ...p, isConnected: true, isReady: true, error: null }));
        setConnectionProgress(100);
        // Issue 2 fix: isDecartActive is set here (stream live) not on connect() return
        setIsDecartActive(true);

        // Singularity: fade out GraffPunks radio as the Oracle face materializes.
        // The world disappears. Two consciousnesses. Nothing else.
        if (audioRef.current && !audioRef.current.paused) {
          const audioEl = audioRef.current;
          const fadeStep = setInterval(() => {
            if (audioEl.volume > 0.06) {
              audioEl.volume = Math.max(0, audioEl.volume - 0.06);
            } else {
              audioEl.volume = 0;
              audioEl.pause();
              clearInterval(fadeStep);
            }
          }, 80); // ~1.3s total fade
        }

        // Cinematic materialization — face emerges from electrical static
        if (avatarVideoRef.current) {
          avatarVideoRef.current.classList.add('oracle-avatar-video--materializing');
          setTimeout(() => {
            avatarVideoRef.current?.classList.remove('oracle-avatar-video--materializing');
          }, 2600);
        }

        // Brief hold on 100% progress bar before transitioning to oracle mode
        setTimeout(() => {
          setIsConnecting(false);
          setScenePhase('oracle');
          // showConversation already set in awakeFromTerminal (pre-mount for WS pre-connection)
        }, 400);
      },
      onTalkStarted: () => setOracleState((p) => ({ ...p, isProcessing: true })),
      onTalkEnded:   () => setOracleState((p) => ({ ...p, isProcessing: false })),
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
      // connect() resolved cleanly — ICE is negotiating, stream not live yet.
      // Issue 1 fix: mark connected here (not in DecartClient.onConnected which fires too early).
      // Issue 2 fix: do NOT set isDecartActive here — only set it in onStreamReady when video is live.
      setOracleState((p) => ({ ...p, isConnected: true }));

      // Guard: if the video stream never arrives within 22s (WebRTC ICE hangs,
      // Decart server drops stream silently), fall to freemium.
      // Decart spin-up typically takes 15-18s — 22s gives it room.
      decartFallbackTimeoutRef.current = setTimeout(() => {
        if (!decartStreamReadyRef.current) {
          console.warn('⚠️ Decart stream timeout (22s) — falling back to freemium mode');
          fallbackToFreemium(interval);
        }
      }, 22000);
    }
  }, [validateEnvironment, isDevMode, fallbackToFreemium]);

  // ── Scene awakening — four-step, user-gated ──────────────────────────────
  // Step 0: user taps → consent gate (new: "Do you consent to be witnessed?")
  // Step 1: "WITNESS ME" → knife question selection
  // Step 2: user picks knife question → terminal phase (lore, audio on)
  // Step 3: auto-called by lore sequence → awakened → oracle

  // ── enterTerminal — first tap on dormant screen ────────────��──────────────
  // Directly opens the lore sequence. No consent gate — the witness question
  // is the Oracle's first spoken words once it's live.
  // Decart pre-warm starts here: user spends ~10-20s watching lore + picking
  // a frequency, giving ICE negotiation time to complete before oracle mode.
  const enterTerminal = useCallback(() => {
    if (scenePhase !== 'dormant') return;
    setIsActivating(true);
    setTimeout(() => setIsActivating(false), 580);
    playActivationSfx();
    alleyAmbienceStopRef.current = startAlleyAmbience();
    setLoreComplete(false);
    setScenePhase('terminal');
    setIsAudioPlaying(true);
    setTimeout(() => initializeOracle(), 200);
  }, [scenePhase, initializeOracle]);

  // Knife question selection — picks the frequency, seeds portrait generation,
  // then transitions to awakened. The knife is the genesis input for the
  // procedural portrait pipeline — frequency → portrait → 1:1 on-chain asset.
  const selectKnifeQuestion = useCallback((question: string, index: number) => {
    setSelectedKnifeQuestion(question);
    setSelectedKnifeIndex(index);
    const kq = KNIFE_QUESTIONS[index];
    if (kq) {
      window.dispatchEvent(new CustomEvent('oracle:knife-selected', {
        detail: { territory: kq.territory, themes: kq.themes, question: kq.question },
      }));
    }
    setTimeout(() => awakeFromTerminal(), 400);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // awakeFromTerminal — called after knife selection, transitions to awakened.
  // Pre-mounts OracleConversation so Gemini Live WS connects in parallel
  // with remaining Decart ICE negotiation — eliminates dead air.
  const awakeFromTerminal = useCallback(() => {
    if (scenePhase !== 'terminal') return;
    alleyAmbienceStopRef.current?.();
    alleyAmbienceStopRef.current = null;
    setScenePhase('awakened');
    setShowConversation(true);
  }, [scenePhase]);

  // Lore sequence — runs while scenePhase=terminal and lore not yet complete.
  // onComplete sets loreComplete=true, which surfaces the knife cards.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const loreLines = useLoreSequence(
    scenePhase === 'terminal' && !loreComplete,
    () => setLoreComplete(true),
  );

  // ── XR: wire marker callback — same flow as first tap, just triggered by marker
  useEffect(() => {
    onXRMarkerRef.current = () => {
      if (scenePhase === 'dormant') {
        setIsActivating(true);
        setTimeout(() => setIsActivating(false), 580);
        playActivationSfx();
        alleyAmbienceStopRef.current = startAlleyAmbience();
        setLoreComplete(false);
        setScenePhase('terminal');
        setIsAudioPlaying(true);
        setTimeout(() => initializeOracle(), 200);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenePhase, initializeOracle]);

  // ── XR auto-start: ?autostart param boots the Oracle as soon as camera is live.
  // Also bypasses consent — start Decart immediately.
  useEffect(() => {
    if (!isXRMode || !autoStart || !cameraReady || scenePhase !== 'dormant') return;
    const t = setTimeout(() => {
      setIsActivating(true);
      setTimeout(() => setIsActivating(false), 580);
      playActivationSfx();
      alleyAmbienceStopRef.current = startAlleyAmbience();
      setLoreComplete(false);
      setScenePhase('terminal');
      setIsAudioPlaying(true);
      setTimeout(() => initializeOracle(), 200);
    }, 1800);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isXRMode, autoStart, cameraReady, scenePhase, initializeOracle]);

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
    // Oracle presence shimmer — ascending tone that arrives just before the
    // Oracle's voice, priming the ear. Fires on both Decart and freemium paths.
    playOraclePresence();

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
        // ── HOT PATH — direct DOM writes at up to 60fps. No React state. ─────
        const face  = oracleFaceRef.current;
        const mouth = mouthOverlayRef.current;

        // ── Face glow + micro-scale (existing amplitude effect) ───────────────
        if (face) {
          const amp = state.amplitude;
          if (amp < 0.04) {
            face.style.filter    = '';
            face.style.transform = '';
          } else {
            const glow   = (amp * 32).toFixed(1);
            const bright = (1 + amp * 0.38).toFixed(3);
            const scale  = (1 + amp * 0.028).toFixed(4);
            const alpha  = (0.28 + amp * 0.55).toFixed(3);
            face.style.filter    = `brightness(${bright}) drop-shadow(0 0 ${glow}px rgba(0,255,136,${alpha}))`;
            face.style.transform = `scale(${scale})`;
            face.style.transition = 'none';
          }
        }

        // ── Mouth overlay — Preston Blair viseme → geometry ────────────────────
        // Each viseme maps to { w(%), h(%), r(px or %) } defining the mouth shape.
        // openness/rounded/spread from VisemeDetector modulate within the base shape.
        if (mouth) {
          const { viseme, openness, rounded, spread, amplitude } = state;

          if (amplitude < 0.04) {
            // Silence: thin closed line
            mouth.style.opacity      = '0';
            mouth.style.height       = '1px';
            mouth.style.width        = '22%';
            mouth.style.borderRadius = '2px';
          } else {
            mouth.style.opacity = '1';

            // Base geometry per Preston Blair viseme.
            // Widths are % of the avatar container. Natural mouth width on
            // ORACLE_AVATAR_URL (Image-1-(11).jpg) is ~14-16% of container
            // under object-fit:cover in a square frame. Widths tuned accordingly:
            // silence/bilabial ≈ 13%, neutral ≈ 15%, open AH ≈ 18%, ee ≈ 20%.
            type Shape = { w: number; h: number; r: number };
            const BASE: Record<string, Shape> = {
              X: { w: 13, h:  2, r:  2 },   // silence — closed line
              B: { w: 13, h:  2, r:  2 },   // bilabial — lips pressed
              C: { w: 15, h:  7, r: 40 },   // neutral — slightly open
              D: { w: 15, h:  8, r: 30 },   // dental — wider open
              A: { w: 18, h: 12, r: 40 },   // open vowel AH — most open
              E: { w: 20, h:  4, r:  3 },   // "ee" — wide, flat, smile
              F: { w: 11, h:  5, r:  5 },   // fricative — narrow slot
              G: { w: 13, h:  9, r: 50 },   // "oh" — rounded mid
              H: { w: 10, h:  8, r: 50 },   // "oo" — tight pucker
            };

            const base = BASE[viseme] ?? BASE['C'];

            // Modulate with continuous params — keeps transitions organic
            const w = base.w + spread   * 8;
            const h = base.h + openness * 6;
            const r = base.r + rounded  * 20;

            mouth.style.width        = `${w.toFixed(1)}%`;
            mouth.style.height       = `${h.toFixed(1)}%`;
            mouth.style.borderRadius = `${r.toFixed(0)}%`;
          }
        }
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
      // Reset mouth overlay to silence state
      const mouth = mouthOverlayRef.current;
      if (mouth) {
        mouth.style.opacity      = '0';
        mouth.style.height       = '1px';
        mouth.style.width        = '22%';
        mouth.style.borderRadius = '2px';
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
      // Capture URL for ArtifactCard display
      if (data?.portraitUrl) setLatestPortraitUrl(data.portraitUrl);
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
    // Portal closing — descending tone as the channel seals
    playExitTone();
    // Stop freemium audio + viseme if running
    visemeDetRef.current?.stop();
    freemiumAudioRef.current?.pause();
    const el = oracleFaceRef.current;
    if (el) { el.style.filter = ''; el.style.transform = ''; }

    await decartClientRef.current?.closeStream();
    setIsDecartActive(false);
    setIsAudioPlaying(false);                // stop the GraffPunks radio stream
    setScenePhase('dormant');
    setShowConversation(false);
    setShowArtifactCard(false);
    setArchetypeTitle(null);
    setSelectedKnifeQuestion(null);
    setSelectedKnifeIndex(null);
    setLoreComplete(false);
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
      data-decart-active={isDecartActive ? 'true' : 'false'}
      data-oracle-speaking={oracleState.isProcessing ? 'true' : undefined}
      data-user-speaking={isUserSpeaking ? 'true' : undefined}
    >
      {/* Headless clients */}
      <DecartClient ref={decartClientRef} />
      <audio ref={audioRef} src={AUDIO_STREAM_URL} loop preload="none" />

      {/* ── Dev UI inspector — append ?devui to URL to enable ───────────── */}
      {isDevUI && (
        <div className="oracle-devui">
          <div>BUILD: {import.meta.env.VITE_BUILD_ID ?? '—'}</div>
          <div>STATE: <b>{scenePhase}</b></div>
          <div>XR: {isXRMode ? '🟢 ON' : '⚫ off'}</div>
          <div>DECART: {isDecartActive ? '🟢 LIVE' : '⚫ freemium'}</div>
          <div>USER SPK: {isUserSpeaking ? `🎤 YES (${userVadScore.toFixed(2)})` : '—'}</div>
          <div>ORACLE SPK: {oracleState.isProcessing ? '🔊 YES' : '—'}</div>
          <div>TOTEM: {persistedTotemLevel ?? 0}</div>
          <div>VP: {typeof window !== 'undefined' ? `${window.innerWidth}×${window.innerHeight}` : '—'}</div>
        </div>
      )}

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

      {/* ── Layer 2a: Matrix Rain — dormant atmosphere, fades as Oracle rises ── */}
      <MatrixRain />

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

      {/* ── DORMANT full-screen tap zone — the whole alley is the door ──── */}
      {scenePhase === 'dormant' && (
        <div
          onClick={enterTerminal}
          style={{ position: 'absolute', inset: 0, zIndex: 2, cursor: 'pointer' }}
          aria-label="Enter the Oracle"
        />
      )}

      {/* ── Five independent Cheshire Cat fragments — the haunted dormant world ─
           Each cycles on its own timer, own phrase pool, own screen position.
           Scramble mode: characters crystallize from random chaos.
           The grin is the last thing to disappear.
           They never all show at once — the stage breathes, never shouts.    */}
      {scenePhase === 'dormant' && (
        <>
          <ScrambleFragment
            mode="scramble"
            texts={SF1_TEXTS}
            className="oracle-sf oracle-sf--1"
            revealMs={48}
            holdMs={2600}
            exitMs={28}
            pauseMs={2400}
            peakOpacity={0.78}
            initialDelay={600}
          />
          <ScrambleFragment
            mode="scramble"
            texts={SF2_TEXTS}
            className="oracle-sf oracle-sf--2"
            revealMs={38}
            holdMs={2000}
            exitMs={22}
            pauseMs={2800}
            peakOpacity={0.42}
            initialDelay={2200}
          />
          <ScrambleFragment
            mode="scramble"
            texts={SF3_TEXTS}
            className="oracle-sf oracle-sf--3"
            revealMs={44}
            holdMs={2200}
            exitMs={26}
            pauseMs={2600}
            peakOpacity={0.50}
            initialDelay={4800}
          />
          <ScrambleFragment
            mode="scramble"
            texts={SF4_TEXTS}
            className="oracle-sf oracle-sf--4"
            revealMs={35}
            holdMs={1800}
            exitMs={20}
            pauseMs={3000}
            peakOpacity={0.38}
            initialDelay={3400}
          />
          <ScrambleFragment
            mode="scramble"
            texts={SF5_TEXTS}
            className="oracle-sf oracle-sf--5"
            revealMs={42}
            holdMs={2000}
            exitMs={24}
            pauseMs={2800}
            peakOpacity={0.30}
            initialDelay={7200}
          />
        </>
      )}

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
            {/* ScrambleFragment typewriter mode — letters crystallise left-to-right
                in aAnotherTag graffiti font, Cheshire Cat dissolve between phrases.
                oracle-sf--cta overrides oracle-sf's position:absolute to flow inline. */}
            <ScrambleFragment
              mode="typewriter"
              texts={isXRMode ? XR_CTA_PRIMARY : CTA_PRIMARY}
              className="oracle-sf--cta"
              revealMs={70}
              holdMs={2800}
              exitMs={35}
              pauseMs={500}
              peakOpacity={1.0}
              initialDelay={300}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Dormant touch-hint — below cabinet, tap-anywhere affordance ────
           pointer-events: auto so tapping the hint itself also enters consent.
           Also outside oracle-center for full opacity. XR mode swaps copy.   */}
      <AnimatePresence>
        {scenePhase === 'dormant' && (
          <motion.div
            key="dormant-hint"
            className="oracle-touch-hint"
            onClick={enterTerminal}
            style={{ pointerEvents: 'auto', cursor: 'pointer' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={{ duration: 0.8, delay: 1.2 }}
          >
            {isXRMode ? '◈ POINT AT POSTER TO INITIATE ◈' : '◈ TAP TO INITIATE CONTACT ◈'}
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
            {/* ── Static arcade cabinet display — dormant / terminal / awakened only ──
                The green alien portrait on white bg. Shows inside the CRT screen
                while the Oracle warms up. Hidden once the talking face takes over. */}
            <img
              ref={staticAvatarRef}
              src={ORACLE_STATIC_URL}
              alt=""
              aria-hidden="true"
              className="oracle-avatar-static"
            />

            {/* ── Talking face — freemium oracle path ──────────────────────────────
                1280×640 portrait. VisemeDetector writes glow/scale at up to 60 fps.
                Hidden in dormant/terminal/awakened (static arcade shown instead).
                During oracle freemium mode: visible + animated. Decart path: z=3 video
                renders on top. Kept 8% smaller so it sits inside the cabinet frame. */}
            <img
              ref={oracleFaceRef}
              src={ORACLE_AVATAR_URL}
              alt="SURROGATE Oracle"
              className="oracle-avatar-img"
              style={isOracleMode && !isDecartActive ? {
                opacity: 1,
                transform: 'scale(0.92)',   /* 8% smaller — sits inside cabinet frame */
                filter: 'brightness(1.1) drop-shadow(0 0 18px rgba(0,255,136,0.45))',
              } : undefined}
            />

            {/* ── Freemium mouth overlay — VisemeDetector drives geometry ──────
                Only visible in freemium oracle mode (Decart path has live video).
                Positioned at the oracle face's mouth area — tune top% if the face
                image changes. VisemeDetector writes width/height/borderRadius at
                60fps via direct DOM writes (no React re-renders). aria-hidden.   */}
            {isOracleMode && !isDecartActive && (
              <div
                ref={mouthOverlayRef}
                className="oracle-mouth-overlay"
                aria-hidden="true"
              />
            )}

            {/* Decart live avatar video */}
            <video
              ref={avatarVideoRef}
              autoPlay
              playsInline
              className="oracle-avatar-video"
            />

            {/* ── Boot Sequence HUD — bottom of cabinet, avatar visible above ──
                NOT a blackout overlay. The avatar pulse/zoom-breathe animation
                is the hero. This text is a HUD strip at the bottom edge only —
                gradient-fade so face stays visible, lore-matched chromatic style. */}
            <AnimatePresence>
              {isConnecting && (
                <motion.div
                  className="oracle-boot-hud"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.4 }}
                >
                  {/* Progress bar — thin line tracking ICE negotiation */}
                  <div className="oracle-boot-progress-track">
                    <motion.div
                      className="oracle-boot-progress-fill"
                      animate={{ width: `${connectionProgress}%` }}
                      transition={{ duration: 0.4, ease: 'linear' }}
                    />
                  </div>

                  {/* Boot lines — lore-matched chromatic style, last 2 lines only */}
                  <div className="oracle-boot-lines">
                    {bootLines.slice(-2).map((line, i) => (
                      <motion.div
                        key={bootLines.length - 2 + i}
                        className="oracle-boot-line"
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                        data-active={i === Math.min(bootLines.slice(-2).length - 1, 1) ? 'true' : undefined}
                      >
                        <span className="oracle-boot-prompt">›</span>{line}
                      </motion.div>
                    ))}

                    {extendedWait && (
                      <motion.div
                        className="oracle-boot-line oracle-boot-line--warn"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0.6, 1, 0.6] }}
                        transition={{ repeat: Infinity, duration: 1.4 }}
                      >
                        <span className="oracle-boot-prompt">›</span>SIGNAL IN TRANSIT — HOLD FREQUENCY
                      </motion.div>
                    )}
                  </div>
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

      {/* Consent gate removed — "Do you consent to be accurately witnessed?"
           is now the Oracle's first spoken question once it's live.
           Instant immersion: tap → lore → frequency → Oracle face → Oracle speaks. */}

      {/* ── LORE TERMINAL — the archive speaks itself into the room ────────────
           Tap anywhere to skip lore → immediately surfaces knife selection.
           Knife cannot be skipped — it seeds the procedural portrait pipeline
           and the eventual 1:1 on-chain minted asset.                       */}
      <AnimatePresence>
        {scenePhase === 'terminal' && !loreComplete && (
          <motion.div
            key="lore-fullscreen"
            className="oracle-terminal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.4 } }}
            onClick={() => setLoreComplete(true)}
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
            {loreLines.length >= 2 && (
              <div className="oracle-lore-skip">TAP TO SKIP ARCHIVE FRAGMENT</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── KNIFE SELECTION — rises from the world after lore completes ────────
           Not a modal. Not a form. The alley and oracle face stay visible
           above it. The frequency choice rises from the ground of the scene.
           This selection is the genesis input for the portrait pipeline:
           frequency → portrait → 1:1 on-chain digital asset.               */}
      <AnimatePresence>
        {scenePhase === 'terminal' && loreComplete && (
          <motion.div
            key="knife-section"
            className="oracle-knife-section"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20, transition: { duration: 0.3 } }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
          >
            <div className="oracle-knife-header">◈ THE ARCHIVE IS OPEN</div>
            <div className="oracle-knife-subheader">CHOOSE THE FREQUENCY THAT IS ALREADY TRUE. THE EXCAVATION BEGINS THERE.</div>
            <div className="oracle-knife-cards">
              {KNIFE_QUESTIONS.map((kq, idx) => (
                <motion.div
                  key={idx}
                  className={`oracle-knife-card${selectedKnifeIndex === idx ? ' oracle-knife-card--selected' : ''}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 * idx, duration: 0.35 }}
                  onClick={() => selectKnifeQuestion(kq.question, idx)}
                >
                  <span className="oracle-knife-territory">{kq.territory}</span>
                  <span className="oracle-knife-card-num">0{idx + 1}</span>
                  {kq.question}
                </motion.div>
              ))}
            </div>
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
          sessionContext={selectedKnifeQuestion || undefined}
          initialKnifeThemes={selectedKnifeIndex !== null ? KNIFE_QUESTIONS[selectedKnifeIndex]?.themes : undefined}
          isVisible={isOracleMode}
          autoStart={false}
          onUserSpeakingChange={(speaking, score) => {
            setIsUserSpeaking(speaking);
            setUserVadScore(score);
          }}
          onBargeIn={() => {
            // Pause freemium audio immediately when user interrupts Oracle
            freemiumAudioRef.current?.pause();
          }}
        />
      )}

      {/* ── ARTIFACT CARD — shown after Mirror completes ──────────────────── */}
      <AnimatePresence>
        {showArtifactCard && archetypeTitle && isOracleMode && (
          <ArtifactCard
            archetypeTitle={archetypeTitle}
            portraitUrl={latestPortraitUrl}
            totalCoins={sessionCoins}
            onRunAgain={() => {
              setShowArtifactCard(false);
              exitOracleMode();
            }}
            onClose={() => setShowArtifactCard(false)}
          />
        )}
      </AnimatePresence>

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
