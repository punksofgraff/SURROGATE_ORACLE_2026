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
import OracleConversation, { OracleConversationHandle, type OracleScore } from './OracleConversation';
import { MatrixRain } from './MatrixRain';
import { ArtifactCard } from './ArtifactCard';
import { ScrambleFragment } from './ScrambleFragment';
// ScrambleFragment retired from dormant CTA — ghost text sticky CTA replaced it
import { OracleStepLogger, logStep } from './OracleStepLogger';
import { useAtmosphere } from '../hooks/useAtmosphere';
import { useParallax } from '../hooks/useParallax';
import { useXRMode } from '../hooks/useXRMode';
import { useTypewriter } from '../hooks/useTypewriter';
import { useLoreSequence, LORE_SEQUENCE } from '../hooks/useLoreSequence';
import { DormantHUD } from './ambient/DormantHUD';
import { DormantTransmissions } from './ambient/GhostTransmissions';
import { GlitchCursor } from './ambient/GlitchCursor';
import { KnifeSelection, KNIFE_QUESTIONS } from './KnifeSelection';
import { VisemeDetector, type VisemeState } from '../lib/visemeDetector';
import { PCMPlayer } from '../utils/PCMPlayer';
import {
  playActivationSfx,
  startAlleyAmbience,
  playOraclePresence,
  playExitTone,
} from '../lib/oracleSfx';
import './SurrogateOracleImmersion.css';

import { OracleFaceRenderer } from '../lib/OracleFaceRenderer';
import { initVisionModel, calibrateOracle, disposeVisionModel } from '../lib/OracleVisionCalibrator';

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

// ── Oracle speech playback rate ───────────────────────────────────────────────
// Multiplier applied to every PCM chunk via AudioBufferSourceNode.playbackRate.
// 1.0 = natural Oracle voice. Values > 1.0 raise pitch (chipmunk effect).
// 1.0 = Gemini native speed (Charon voice is very deliberate — feels slow).
// 1.3 = 30% faster with proportional pitch shift (~4.5 semitones up).
// Since Charon sits in the deep bass register this still reads as resonant/deep.
// Tune here; both PCMPlayer construction sites use this constant.
const ORACLE_PLAYBACK_RATE = 1.0;


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
  const { isXRMode, cameraActive, activateCamera, deactivateCamera, cameraVideoRef, cameraReady, autoStart } =
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
  const [isScrambling, setIsScrambling] = useState(false);

  // ── Lore completion flag — true when lore finishes or is skipped ─────────
  // Knife cards rise from the terminal stage once this is true.
  const [loreComplete, setLoreComplete] = useState(false);

  // ── Exit ceremony state — 2.5s ritual before cleanup ─────────────────────
  // When the seeker chooses to leave, the channel seals over 2.5 seconds.
  // Oracle face recedes, alley fades, then actual cleanup runs.
  const [isExiting, setIsExiting] = useState(false);

  // ── Artifact card ─────────────────────────────────────────────────────────
  const [archetypeTitle, setArchetypeTitle] = useState<string | null>(null);
  const [showArtifactCard, setShowArtifactCard] = useState(false);
  const [latestPortraitUrl, setLatestPortraitUrl] = useState<string | null>(null);

  // ── Portrait viewer — overlays the Oracle face when a portrait is generated ──
  // Separate from latestPortraitUrl (which seeds Decart avatar) — this is the
  // full-screen viewer that appears over the oracle cabinet with close button.
  const [portraitViewerUrl, setPortraitViewerUrl] = useState<string | null>(null);

  // ── Turn counter + auto-mint guard ───────────────────────────────────────
  const oracleTurnCountRef  = useRef(0);
  const autoMintFiredRef    = useRef(false); // prevents double-fire on WS reconnect

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
  const conversationThemesRef = useRef<Set<string>>(new Set());
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
  const [isGeminiConnected, setIsGeminiConnected] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const isDecartActiveRef = useRef(false); // stable ref for callbacks

  // ── Oracle Pulse: user speaking state (VAD-driven) ───────────────────────
  // Drives data-user-speaking on stage element → CSS mic glow + cabinet pulse
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [userVadScore, setUserVadScore] = useState(0);

  // ── Freemium Oracle speech + VisemeDetector ───────────────────────────────
  // When Decart is not active, Oracle audio plays through pcmPlayerRef and
  // VisemeDetector drives real-time canvas-based lip-sync on the oracle face.
  const pcmPlayerRef          = useRef<PCMPlayer | null>(null);
  const visemeDetRef          = useRef<VisemeDetector | null>(null);
  // PCM-direct amplitude — RMS computed per chunk from raw Int16 data. Decays
  // each RAF frame so silence is detected even if chunks stop arriving.
  // This is the primary amplitude source; AnalyserNode is a secondary upgrade.
  const pcmAmplitudeRef       = useRef(0);
  const oracleFaceRef         = useRef<HTMLImageElement>(null);
  // OracleFaceRenderer: renders face + pixel-warped mouth on a canvas.
  // In oracle-freemium mode the canvas overlays the face img (img opacity→0).
  const oracleFaceCanvasRef   = useRef<HTMLCanvasElement>(null);
  const oracleFaceRendererRef = useRef<OracleFaceRenderer | null>(null);
  const oracleFaceMapRef      = useRef<any>(null);

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
  // Guard against re-entrant initializeOracle calls (mount effect fires once, but
  // enterTerminal also calls it — without this guard both fire DECART INIT).
  const isInitializingOracleRef = useRef(false);
  const decartFallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Decart late-arrival handoff state — set true when Decart stream becomes ready
  // mid-conversation; cleared by executeDecartHandoff() at the next silence gap.
  const decartPendingHandoff = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stable scene-phase ref — readable inside memoised callbacks without closing
  // over stale scenePhase state. Kept in sync by the effect below.
  const scenePhaseRef = useRef<'dormant' | 'terminal' | 'awakened' | 'oracle'>('dormant');
  // Alley ambience stop fn — returned by startAlleyAmbience(), called when lore ends
  const alleyAmbienceStopRef = useRef<(() => void) | null>(null);

  // ── Web Audio GainNode — iOS-proof volume control ────────────────────────────
  // HTMLAudioElement.volume is NOT reliable on iOS: the OS resets it to 1.0 when
  // the AVAudioSession switches from "playback" to "playAndRecord" on mic grant.
  // Fix: route the radio stream through a GainNode in the user's gesture.
  // GainNode.gain lives entirely inside the browser's audio graph — iOS cannot
  // override it via session changes. One connection per session, permanent.
  const radioCtxRef  = useRef<AudioContext | null>(null);
  const radioGainRef = useRef<GainNode | null>(null);
  const targetVolRef = useRef(0.06); // tracks desired level for initial gain setup

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
  useParallax(scenePhase);

  // ── HRTF head tracking — Oracle voice follows device orientation ─────────
  // Updates PCMPlayer's HRTF panner position in real time so the Oracle feels
  // physically anchored in space rather than coming from a fixed point.
  // Only runs while PCMPlayer exists (created on first user gesture).
  useEffect(() => {
    let rafId = 0;
    let targetX = 0, targetZ = 0;
    let currentX = 0, currentZ = 0;

    const onOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma === null) return;
      targetX = Math.max(-1, Math.min(1, (e.gamma ?? 0) / 25));
      targetZ = Math.max(-1, Math.min(1, ((e.beta ?? 45) - 45) / 20));
    };

    const tick = () => {
      currentX += (targetX - currentX) * 0.05;
      currentZ += (targetZ - currentZ) * 0.05;
      pcmPlayerRef.current?.updateHeadOrientation(currentX, currentZ);
      
      // Update WebGL Mesh tilt for 3D face tracking
      if (oracleFaceRendererRef.current) {
        oracleFaceRendererRef.current.setTilt(currentX, currentZ);
      }
      
      rafId = requestAnimationFrame(tick);
    };

    window.addEventListener('deviceorientation', onOrientation, { passive: true });
    rafId = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('deviceorientation', onOrientation);
      cancelAnimationFrame(rafId);
    };
  }, []);

  // Keep isDecartActiveRef in sync
  useEffect(() => { isDecartActiveRef.current = isDecartActive; }, [isDecartActive]);
  // Keep scenePhaseRef in sync so callbacks can read phase without stale closure
  useEffect(() => { scenePhaseRef.current = scenePhase; }, [scenePhase]);

  // Tear down all audio + renderer resources on unmount
  useEffect(() => () => {
    visemeDetRef.current?.destroy();
    visemeDetRef.current = null;
    pcmPlayerRef.current?.stop();
    pcmPlayerRef.current = null;
    oracleFaceRendererRef.current?.destroy();
    oracleFaceRendererRef.current = null;
    alleyAmbienceStopRef.current?.();
    alleyAmbienceStopRef.current = null;
    radioCtxRef.current?.close();
    radioCtxRef.current = null;
    radioGainRef.current = null;
  }, []);

  // ── OracleFaceRenderer: load & draw face the moment canvas mounts ──────────
  // Runs as soon as oracle mode is entered (before any audio arrives) so the
  // face is visible immediately — not just when the first PCM chunk comes in.
  useEffect(() => {
    if (!isOracleMode || isDecartActive) return;
    const canvas = oracleFaceCanvasRef.current;
    if (!canvas) return;

    // Destroy any stale renderer from a previous session
    if (oracleFaceRendererRef.current) {
      oracleFaceRendererRef.current.destroy();
      oracleFaceRendererRef.current = null;
    }

    // Use rAF to ensure layout pass has happened — offsetWidth is 0 on first
    // synchronous render because the canvas hasn't been measured yet.
    // Without this the mouth anchor calculates against 300×300 instead of the
    // actual container size, breaking the pixel-map coordinates.
    let rafId: number;
    const init = () => {
      const dpr = window.devicePixelRatio || 1;
      const w   = canvas.offsetWidth  || 300;
      const h   = canvas.offsetHeight || 300;
      canvas.width  = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);

      const renderer = new OracleFaceRenderer(canvas);
      oracleFaceRendererRef.current = renderer;

      // Load face; use pre-fetched base64 data URL first, raw URL as fallback.
      // After loadFace resolves, start the idle animation loop (breathing + blink)
      // so the face is alive immediately — not a static image waiting for audio.
      // The loop runs until the VisemeDetector takes over (stopped in handleOracleResponse).
      renderer.loadFace(oracleAvatarDataUrl).then(() => {
        logStep('FACE LOADED (base64)', 'ok');
        
        // Apply pre-computed vision calibration if available
        if (oracleFaceMapRef.current) {
          renderer.calibrate(oracleFaceMapRef.current);
          logStep('VISION MESH APPLIED', 'ok');
        }

        renderer.startIdleAnimation();
        logStep('RENDERER READY — idle animation running', 'ok');
      }).catch(() => {
        logStep('FACE LOAD FAILED (base64) — trying raw URL', 'warn');
        renderer.loadFace(ORACLE_AVATAR_URL).then(() => {
          logStep('FACE LOADED (fallback URL)', 'ok');
          
          if (oracleFaceMapRef.current) {
            renderer.calibrate(oracleFaceMapRef.current);
            logStep('VISION MESH APPLIED', 'ok');
          }

          renderer.startIdleAnimation();
          logStep('RENDERER READY — idle animation running', 'ok');
        }).catch((err) => {
          logStep(`FACE LOAD FAILED — no renderer: ${(err as Error)?.message ?? err}`, 'err');
          console.warn(err);
        });
      });
    };
    rafId = requestAnimationFrame(init);

    return () => {
      cancelAnimationFrame(rafId);
      if (oracleFaceRendererRef.current) {
        oracleFaceRendererRef.current.destroy();
        oracleFaceRendererRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOracleMode, isDecartActive, oracleAvatarDataUrl]);

  // ── Typewriter title ──────────────────────────────────────────────────────
  const titleText = useTypewriter('SURROGATE:ORACLE', awakened, 60);
  const subtitleText = useTypewriter('SNEAKAR XR AI IMMERSION', awakened && titleText.length >= 16, 35);

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
      } catch { /* ignore */ }
    }

    // 2. Listen for actual Supabase OAuth redirects
    import('../lib/supabase').then(({ supabase }) => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          setIsAuthenticated(true);
          setCurrentUserId(session.user.id);
          }
      });

      supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          setIsAuthenticated(true);
          setCurrentUserId(session.user.id);
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
        const eventThemes: string[] = customEvent.detail?.themes || [];
        eventThemes.forEach(t => conversationThemesRef.current.add(t));
        
        const accumulatedThemes = Array.from(conversationThemesRef.current);
        const finalThemes = accumulatedThemes.length > 0 ? accumulatedThemes : ['oracle', 'cyberpunk', 'graffiti'];
        
        logStep('UNLOCKING PORTRAIT WITH THEMES: ' + finalThemes.join(','), 'ok');
        generatePortraitRef.current(finalThemes);
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

    const handleKnifeSelected = (e: Event) => {
      const customEvent = e as CustomEvent;
      const themes = customEvent.detail?.themes || [];
      themes.forEach((t: string) => conversationThemesRef.current.add(t));
    };

    const handleTotemAscend = (e: Event) => {
      const level = (e as CustomEvent).detail?.totemLevel as number | undefined;
      if (!level) return;
      // Atmosphere pulse on totem advancement — alignment shifts toward sacred
      setOracleAlignment('sacred');
      setTimeout(() => setOracleAlignment(null), 4000); // reset after 4s
    };

    window.addEventListener('oracle:unlock', handleUnlock);
    window.addEventListener('oracle:alignment', handleAlignment);
    window.addEventListener('oracle:artifact', handleArtifact);
    window.addEventListener('oracle:knife-selected', handleKnifeSelected);
    window.addEventListener('oracle:totem:ascend', handleTotemAscend);
    return () => {
      window.removeEventListener('oracle:unlock', handleUnlock);
      window.removeEventListener('oracle:alignment', handleAlignment);
      window.removeEventListener('oracle:artifact', handleArtifact);
      window.removeEventListener('oracle:knife-selected', handleKnifeSelected);
      window.removeEventListener('oracle:totem:ascend', handleTotemAscend);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // ── Audio management ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!audioRef.current) return;
    if (isAudioPlaying) audioRef.current.play().catch(() => {});
    else audioRef.current.pause();
  }, [isAudioPlaying]);

  // fadeToVolume — operates on GainNode when available (iOS-proof), falls back to
  // HTMLAudioElement.volume before the first user gesture.
  // Duck: 60ms exponential ramp. Unduck: 400ms exponential ramp.
  // Exponential ramps feel "accurate" to human ears as hearing is logarithmic.
  const fadeToVolume = useCallback((target: number) => {
    // exponentialRampToValueAtTime requires a positive value
    const safeTarget = Math.max(0.0001, target);
    targetVolRef.current = target;
    
    if (radioGainRef.current) {
      const gain = radioGainRef.current;
      const ctx  = radioCtxRef.current!;
      const now  = ctx.currentTime;
      const isDucking = target < gain.gain.value;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      // Exponential ramp to the target over 60ms (duck) or 400ms (unduck)
      gain.gain.exponentialRampToValueAtTime(safeTarget, now + (isDucking ? 0.06 : 0.40));
    } else if (audioRef.current) {
      audioRef.current.volume = target;
    }
  }, []);

  // ── Music ducking — three clean levels, no sub-state bounce ───────────────
  // dormant              → 0.06   ambient presence
  // terminal / awakened  → 0.03   interaction — drops on first tap
  // oracle (any state)   → 0.001  full duck for the entire conversation
  //
  // GainNode is iOS-proof. isMicActive / isProcessing are NOT in deps —
  // oracle mode is a flat duck regardless of sub-state.
  useEffect(() => {
    let target = 0.06;
    if (scenePhase !== 'dormant') target = 0.03;
    if (isOracleMode)             target = 0.001;
    fadeToVolume(target);
  }, [scenePhase, isOracleMode, fadeToVolume]);

  // ── Oracle connection ─────────────────────────────────────────────────────
  const validateEnvironment = useCallback(() => {
    const missing: string[] = [];
    if (!import.meta.env.VITE_SUPABASE_URL && !import.meta.env.SUPABASE_URL) missing.push('VITE_SUPABASE_URL');
    if (!import.meta.env.VITE_SUPABASE_ANON_KEY && !import.meta.env.SUPABASE_ANON_KEY) missing.push('VITE_SUPABASE_ANON_KEY');

    if (missing.length > 0) {
      console.warn('[Surrogate] Missing environment variables:', missing);
      setOracleState((prev) => ({ ...prev, error: `Missing env vars: ${missing.join(', ')}` }));
      logStep('ENV MISSING', 'err');
      return false;
    }
    logStep('ENV OK (Supabase vars)', 'ok');
    return true;
  }, []);

  // Helper: drop to freemium mode if Decart fails or times out.
  // Note: setScenePhase('oracle') is intentionally NOT called here. The user
  // must still complete their narrative journey (lore, knife selection).
  const fallbackToFreemium = useCallback((interval: ReturnType<typeof setInterval>) => {
    logStep('FREEMIUM PATH READY', 'warn');
    decartPendingHandoff.current = false;
    clearInterval(interval);
    if (decartFallbackTimeoutRef.current) {
      clearTimeout(decartFallbackTimeoutRef.current);
      decartFallbackTimeoutRef.current = null;
    }
    setIsConnecting(false);
    setIsDecartActive(false);
    setOracleState((p) => ({ ...p, error: null }));
    // Transition to 'oracle' phase will now strictly happen in selectKnifeQuestion.
  }, []);

  const executeDecartHandoff = useCallback(() => {
    logStep('DECART LATE HANDOFF COMPLETE ✓', 'ok');
    decartPendingHandoff.current = false;
    // Update ref synchronously so handleOracleResponse routes to Decart
    // before the React re-render cycle processes setIsDecartActive.
    isDecartActiveRef.current = true;
    setIsDecartActive(true);

    // Cinematic materialization for late arrival
    if (avatarVideoRef.current) {
      avatarVideoRef.current.classList.add('oracle-avatar-video--materializing');
      setTimeout(() => {
        avatarVideoRef.current?.classList.remove('oracle-avatar-video--materializing');
      }, 2600);
    }

    setOracleState((p) => ({ ...p, isConnected: true, isReady: true, error: null }));
    setIsConnecting(false);
  }, []);

  const initializeOracle = useCallback(async () => {
    if (isInitializingOracleRef.current) return;
    isInitializingOracleRef.current = true;
    if (!validateEnvironment()) { isInitializingOracleRef.current = false; return; }
    logStep('DECART INIT', 'ok');
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

    // Load face image and perform vision calibration independently of the renderer
    logStep('CALIBRATING VISION MESH', 'pending');
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = async () => {
      const faceMap = await calibrateOracle(img);
      if (faceMap) {
        oracleFaceMapRef.current = faceMap;
        if (oracleFaceRendererRef.current) {
          oracleFaceRendererRef.current.calibrate(faceMap);
        }
        logStep('VISION CALIBRATION OK', 'ok');
      } else {
        logStep('VISION CALIBRATION FAILED (FALLBACK)', 'warn');
      }
      disposeVisionModel();
    };
    img.onerror = () => logStep('VISION CALIBRATION FAILED (IMG ERROR)', 'err');
    img.src = ORACLE_AVATAR_URL;

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
        logStep('DECART READY ✓', 'ok');
        decartStreamReadyRef.current = true;
        if (decartFallbackTimeoutRef.current) {
          clearTimeout(decartFallbackTimeoutRef.current);
          decartFallbackTimeoutRef.current = null;
        }
        clearInterval(interval);
        setOracleState((p) => ({ ...p, isConnected: true, isReady: true, error: null }));

        // ── Pending Decart handoff window #2: Stream ready, conversation in progress.
        //    If the user has already selected a knife and is in oracle state,
        //    mark for handoff at the next clean break.
        if (scenePhaseRef.current === 'oracle' && !isDecartActiveRef.current) {
          logStep('DECART READY — pending handoff', 'pending');
          decartPendingHandoff.current = true;
          return;
        }

        setConnectionProgress(100);
        // Issue 2 fix: isDecartActive is set here (stream live) not on connect() return
        setIsDecartActive(true);

        // Cinematic materialization — face emerges from electrical static
        if (avatarVideoRef.current) {
          avatarVideoRef.current.classList.add('oracle-avatar-video--materializing');
          setTimeout(() => {
            avatarVideoRef.current?.classList.remove('oracle-avatar-video--materializing');
          }, 2600);
        }

        // Brief hold on 100% progress bar before clearing connection state
        setTimeout(() => {
          setIsConnecting(false);
          // NOTE: setScenePhase('oracle') removed from here. Pre-warm readiness is now 
          // "under the floor" — the transition to oracle mode is strictly triggered 
          // by the user's action in selectKnifeQuestion.
        }, 400);
      },
      onTalkStarted: () => setOracleState((p) => ({ ...p, isProcessing: true })),
      onTalkEnded:   () => setOracleState((p) => ({ ...p, isProcessing: false })),
      onDisconnected: (reason) => {
        setOracleState((p) => ({ ...p, isConnected: false, isReady: false, error: `Decart Disconnected: ${reason}` }));
        setIsConnecting(false);
        setIsDecartActive(false); // Fallback to freemium face
      },
      onError: (err) => {
        clearInterval(interval);
        setOracleState((p) => ({ ...p, error: err }));
        setIsConnecting(false);
        setIsDecartActive(false); // Fallback to freemium face
      },
    });

    const result = await decartClientRef.current?.initializeStream(oracleAvatarDataUrl, avatarVideoRef.current);
    if (!result?.success) {
      clearInterval(interval);
      setIsConnecting(false);

      if (isDevMode) {
        // Dev mode: show the error clearly, but still fallback to freemium to preserve immersion
        setOracleState((p) => ({
          ...p,
          error: `[DEV] Decart failed — ${result?.error || 'check decart-live-token EFA'}`,
        }));
      }
      
      // Freemium fallback: skip Decart, proceed with Gemini audio + CSS animated face
      fallbackToFreemium(interval);
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
    isInitializingOracleRef.current = false;
  }, [validateEnvironment, isDevMode, fallbackToFreemium]);

  // ── Scene awakening — four-step, user-gated ──────────────────────────────
  // Step 0: user taps → consent gate (new: "Do you consent to be witnessed?")
  // Step 1: "WITNESS ME" → knife question selection
  // Step 2: user picks knife question → terminal phase (lore, audio on)
  // Step 3: auto-called by lore sequence → awakened → oracle

  // ── Gemini Live WS & Decart ICE Pre-Warm (immediate mount) ─────────────
  useEffect(() => {
    logStep('OracleConversation MOUNTED', 'ok');
    setShowConversation(true);  // Mounts OracleConversation
    initializeOracle();         // Starts Decart ICE negotiation
  }, [initializeOracle]);

  useEffect(() => {
    if (latestPortraitUrl && isDecartActive && decartClientRef.current) {
      console.log('[Oracle] Updating Decart avatar to latest portrait:', latestPortraitUrl);
      decartClientRef.current.setAvatar(latestPortraitUrl);
    }
  }, [latestPortraitUrl, isDecartActive]);

  // ── enterTerminal — first tap on dormant screen ──────────────────────────
  // Opens the lore sequence. The Oracle DOES NOT speak during lore.
  // The greeting fires in awakeFromTerminal() after lore finishes or is skipped.
  // This keeps lore atmospheric: only the text types in, no Oracle audio competing.
  const enterTerminal = useCallback(() => {
    if (scenePhase !== 'dormant') return;
    logStep('TAP → TERMINAL', 'ok');
    logStep('LORE SEQUENCE STARTING', 'pending');
    setIsActivating(true);
    setTimeout(() => setIsActivating(false), 580);

    // iOS 13+ requires explicit permission for DeviceOrientationEvent.
    // Request it here while we're inside a user gesture so the browser allows it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (DeviceOrientationEvent as any).requestPermission().catch(() => {});
    }

    playActivationSfx();
    alleyAmbienceStopRef.current = startAlleyAmbience();

    // Pre-create PCMPlayer during this user gesture so its AudioContext is
    // unlocked. Without this, the Oracle greeting in awakened phase creates
    // the AudioContext outside a gesture — silent on mobile Safari.
    if (!pcmPlayerRef.current) {
      const player = new PCMPlayer(24000, ORACLE_PLAYBACK_RATE);
      player.getContext().resume();
      pcmPlayerRef.current = player;
    }

    // Route radio stream through a Web Audio GainNode — the only iOS-proof way
    // to control volume. HTMLAudioElement.volume is reset by iOS when the audio
    // session switches to "playAndRecord" on mic grant. GainNode.gain is immune.
    // Must happen inside a user gesture so AudioContext unlocks on iOS Safari.
    if (!radioGainRef.current && audioRef.current) {
      try {
        const ctx = new AudioContext();
        ctx.resume();
        const source = ctx.createMediaElementSource(audioRef.current);
        const gain   = ctx.createGain();
        gain.gain.value = targetVolRef.current; // start at whatever level ducking already wants
        source.connect(gain);
        gain.connect(ctx.destination);
        radioCtxRef.current  = ctx;
        radioGainRef.current = gain;
      } catch (e) {
        console.warn('[Audio] GainNode setup failed — falling back to volume:', e);
      }
    }

    setLoreComplete(false);
    setScenePhase('terminal');
    setIsAudioPlaying(true);

    // Ensure OracleConversation is mounted
    setShowConversation(true);

    // Initialize Vision model for mouth-mapping calibration
    initVisionModel().catch(console.warn);

    initializeOracle();
  }, [scenePhase, initializeOracle]);

  // awakeFromTerminal — lore finishes → awakened.
  // This is where the Oracle FIRST speaks — greeting fires here, not in enterTerminal.
  // The lore played in silence; now the entity speaks into the newly open space.
  const awakeFromTerminal = useCallback(() => {
    if (scenePhase !== 'terminal') return;
    logStep('LORE DONE → AWAKENED', 'ok');
    alleyAmbienceStopRef.current?.();
    alleyAmbienceStopRef.current = null;
    setScenePhase('awakened');

    // Oracle greets — session starts AFTER lore, not during it.
    // 300ms: let the awakened scene settle before the voice hits.
    setTimeout(() => {
      logStep('START SESSION (GREETING)', 'ok');
      oracleConversationRef.current?.startSession();
    }, 300);

    // SPOKEN KNIFE: Have the Oracle announce the actual territory names before
    // the knife cards appear. This makes the transition feel authored by the
    // entity, not the UI. Names must match KNIFE_QUESTIONS[].territory exactly
    // so the Seeker hears what they're about to read on the cards.
    const territoryNames = KNIFE_QUESTIONS.map(kq => kq.territory).join(', ');
    setTimeout(() => {
      const ref = oracleConversationRef.current;
      if (!ref) {
        logStep('TERRITORY MSG DROPPED — ref null', 'err');
        return;
      }
      logStep('ORACLE ANNOUNCES TERRITORIES', 'ok');
      ref.sendTextMessage(
        `The archive is open. The territories are rising: ${territoryNames}. Choose the frequency that is already true.`,
        true // isHidden=true: audible only, no UI turn
      );
    }, 1200);
  }, [scenePhase]);
  // Lore sequence — runs while scenePhase=terminal and lore not yet complete.
  // onComplete: loreComplete=true triggers the awakened transition below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const loreLines = useLoreSequence(
    scenePhase === 'terminal' && !loreComplete,
    () => setLoreComplete(true),
  );

  // Auto-transition terminal → awakened the moment lore finishes.
  // Knife selection now rises inside awakened — oracle face is fully resolved
  // before the seeker is asked to choose a frequency.
  useEffect(() => {
    if (loreComplete && scenePhase === 'terminal') {
      awakeFromTerminal();
    }
  }, [loreComplete, scenePhase, awakeFromTerminal]);

  // Knife question selection — picks the frequency, seeds portrait generation,
  // then opens oracle conversation. Knife is now chosen AFTER the oracle
  // face materialises — the entity presents itself before asking.
  const selectKnifeQuestion = useCallback((question: string, index: number) => {
    logStep(`KNIFE[${index}] SELECTED: ${question.slice(0, 20)}...`, 'ok');
    setSelectedKnifeQuestion(question);
    setSelectedKnifeIndex(index);
    setIsScrambling(true);

    // ── Haptic ritual — felt body confirmation when frequency locks ────────────
    // Triple-pulse: [hit] [gap] [hit] — like a lock turning in the body.
    // navigator.vibrate is undefined on desktop/iOS; optional-chain silently no-ops.
    navigator.vibrate?.([20, 30, 20]);

    const kq = KNIFE_QUESTIONS[index];
    if (kq) {
      logStep('SEEDING THEMES: ' + kq.themes.join(','), 'ok');
      window.dispatchEvent(new CustomEvent('oracle:knife-selected', {
        detail: { territory: kq.territory, themes: kq.themes, question: kq.question },
      }));
    }

    // SYNCHRONOUSLY INITIALIZE FREEMIUM AUDIO TO UNLOCK AUDIOCONTEXT
    if (!pcmPlayerRef.current) {
      logStep('INITIALIZING FREEMIUM AUDIO (SYNC)', 'ok');
      const player = new PCMPlayer(24000, ORACLE_PLAYBACK_RATE);
      player.getContext().resume(); // Unlock immediately during user gesture
      pcmPlayerRef.current = player;
    }

    setTimeout(() => {
      setScenePhase('oracle');
      setIsScrambling(false);
      logStep('ORACLE PHASE ENTERED', 'ok');
    }, 1600);
  }, []);

  // ── XR: wire marker callback — same flow as first tap, just triggered by marker
  useEffect(() => {
    onXRMarkerRef.current = () => {
      if (scenePhase === 'dormant') {
        setIsActivating(true);
        setTimeout(() => setIsActivating(false), 580);
        playActivationSfx();
        alleyAmbienceStopRef.current = startAlleyAmbience();
        if (!pcmPlayerRef.current) {
          const player = new PCMPlayer(24000, ORACLE_PLAYBACK_RATE);
          player.getContext().resume();
          pcmPlayerRef.current = player;
        }
        if (!radioGainRef.current && audioRef.current) {
          try {
            const ctx = new AudioContext();
            ctx.resume();
            const source = ctx.createMediaElementSource(audioRef.current);
            const gain   = ctx.createGain();
            gain.gain.value = targetVolRef.current;
            source.connect(gain);
            gain.connect(ctx.destination);
            radioCtxRef.current  = ctx;
            radioGainRef.current = gain;
          } catch (e) { /* silent fallback */ }
        }
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
      if (!pcmPlayerRef.current) {
        const player = new PCMPlayer(24000, ORACLE_PLAYBACK_RATE);
        player.getContext().resume();
        pcmPlayerRef.current = player;
      }
      if (!radioGainRef.current && audioRef.current) {
        try {
          const ctx = new AudioContext();
          ctx.resume();
          const source = ctx.createMediaElementSource(audioRef.current);
          const gain = ctx.createGain();
          gain.gain.value = targetVolRef.current;
          source.connect(gain);
          gain.connect(ctx.destination);
          radioCtxRef.current = ctx;
          radioGainRef.current = gain;
        } catch (e) { /* silent fallback */ }
      }
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
      logStep('startSession() CALLED', 'ok');
      oracleConversationRef.current?.startSession();
    }, 250);
    return () => clearTimeout(t);
  }, [scenePhase]);

  // ── Oracle audio response handler ─────────────────────────────────────────
  // Paid path  → Decart ingests the WAV and streams the lip-synced avatar video.
  // Freemium   → play WAV directly; VisemeDetector drives real-time glow/pulse
  //              on the static oracle face at up to 60 fps via direct DOM writes
  //              (no React re-renders in the hot path).
  const isFirstChunkRef = useRef(true);

  // Track turn IDs from Gemini to reset the first-chunk flag
  useEffect(() => {
    isFirstChunkRef.current = true;
  }, [oracleState.isProcessing]);

  // handleOracleResponse — the primary bridge for the freemium path.
  // Receives raw PCM chunks from Gemini Live, feeds them to the PCMPlayer,
  // and drives the VisemeDetector for frame-accurate lip-sync.
  const handleOracleResponse = useCallback(async (data: Int16Array | string) => {
    // 1. Oracle presence shimmer — only fire on the FIRST chunk of a transmission 
    if (isFirstChunkRef.current) {
      playOraclePresence();
      isFirstChunkRef.current = false;
      // "Duck up" the Oracle voice — rapid fade in to full volume
      pcmPlayerRef.current?.setVolume(1.0, 240);
    }

    // 2. Prepare audio for delivery
    let pcmData: Int16Array | null = null;
    let audioUrl: string | null = null;

    if (data instanceof Int16Array) {
      pcmData = data;
    } else {
      audioUrl = data;
    }

    // ── Paid: hand off to Decart ────────────────────────────────────────────
    if (isDecartActiveRef.current && decartClientRef.current?.isStreamActive()) {
      // For Decart, we still need a blob if it's raw PCM
      let payload: Blob | string = audioUrl!;
      if (pcmData) {
        const buffer = new ArrayBuffer(44 + pcmData.length * 2);
        const view = new DataView(buffer);
        const writeString = (offset: number, s: string) => {
          for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
        };
        writeString(0, 'RIFF');
        view.setUint32(4, 36 + pcmData.length * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, 24000, true);
        view.setUint32(28, 24000 * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, pcmData.length * 2, true);
        const samples = new Int16Array(buffer, 44);
        samples.set(pcmData);
        payload = new Blob([buffer], { type: 'audio/wav' });
      }
      await decartClientRef.current.sendAudio(payload);
      return;
    }

    // ── Freemium: play directly + animate face ──────────────────────────────
    if (!pcmPlayerRef.current) {
      logStep('INITIALIZING FREEMIUM AUDIO (FALLBACK)', 'ok');
      const player = new PCMPlayer(24000, ORACLE_PLAYBACK_RATE); // Gemini Live is 24kHz
      pcmPlayerRef.current = player;
    }

    if (!visemeDetRef.current && pcmPlayerRef.current) {
      const player = pcmPlayerRef.current;

      // OracleFaceRenderer is now initialized in its own useEffect (triggered by
      // isOracleMode) so the face draws immediately on canvas mount, before any
      // audio arrives. No need to init it here — just connect the VisemeDetector.

      // Initialize VisemeDetector with the same AudioContext for shared analyser
      const detector = new VisemeDetector((state) => {
        const renderer = oracleFaceRendererRef.current;
        const faceCanvas = oracleFaceCanvasRef.current;

        if (renderer && renderer.isReady() && faceCanvas) {
          // Ensure canvas pixel size matches display size (handles container resize).
          // Also redraws idle face after resize so the face is never blank when
          // the container changes (e.g. orientation flip, CSS transition end).
          const dpr = window.devicePixelRatio || 1;
          const dW  = faceCanvas.offsetWidth;
          const dH  = faceCanvas.offsetHeight;
          if (dW > 0 && dH > 0 &&
              (faceCanvas.width !== Math.round(dW * dpr) || faceCanvas.height !== Math.round(dH * dpr))) {
            faceCanvas.width  = Math.round(dW * dpr);
            faceCanvas.height = Math.round(dH * dpr);
            renderer.drawIdle(); // re-anchor coordinates at new size immediately
          }

          // Decay PCM-direct amplitude ~200ms half-life at 60fps (0.91^13 ≈ 0.30)
          pcmAmplitudeRef.current *= 0.91;
          // Use whichever is larger: Web Audio analyser OR direct-PCM RMS
          const effectiveAmp = Math.max(state.amplitude, pcmAmplitudeRef.current);

          // Pixel-warp frame: drawViseme samples actual lip pixels, warps them
          if (effectiveAmp < 0.04) {
            renderer.drawIdle();
          } else {
            // If analyser has no signal (state.amplitude ≈ 0), synthesize a viseme
            // shape from pcm amplitude so mouth still moves even if analyser is silent
            const effectiveState: VisemeState = state.amplitude > 0.04 ? state : {
              viseme: effectiveAmp > 0.55 ? 'A' : effectiveAmp > 0.30 ? 'G' : 'C',
              openness: Math.min(1, effectiveAmp * 0.85),
              rounded: 0.15,
              spread: effectiveAmp > 0.35 ? 0.30 : 0.20,
              amplitude: effectiveAmp,
            };
            renderer.drawViseme(effectiveState);
          }

          // Expose signal for pressure test: data-amplitude on the face canvas
          faceCanvas.dataset.amplitude = effectiveAmp.toFixed(3);
          faceCanvas.dataset.viseme    = state.viseme;
          faceCanvas.style.opacity     = effectiveAmp < 0.04 ? '0.98' : '1';
        }

        // Face-image glow/scale when renderer not yet ready (first few frames)
        const face = oracleFaceRef.current;
        if (face && !renderer?.isReady()) {
          const { openness, amplitude } = state;
          if (amplitude < 0.04) {
            face.style.filter = ''; face.style.transform = '';
          } else {
            const sc  = (0.92 + openness * 0.04).toFixed(3);
            const br  = (1.1 + openness * 0.25).toFixed(3);
            const al  = (0.45 + openness * 0.35).toFixed(3);
            const gl  = (18 + openness * 14).toFixed(1);
            face.style.filter    = `brightness(${br}) drop-shadow(0 0 ${gl}px rgba(0,255,136,${al}))`;
            face.style.transform = `scale(${sc})`;
            face.style.transition = 'none';
          }
        }
      }, player.getContext());

      player.connect(detector.getAnalyser());
      // Stop the idle animation rAF loop — VisemeDetector now owns the canvas
      // at 60fps, calling drawIdle() (time-aware: breathing + blink) or drawViseme().
      oracleFaceRendererRef.current?.stopIdleAnimation();
      detector.start();
      visemeDetRef.current = detector;
      logStep('VISEME DETECTOR ACTIVE', 'ok');
    }

    if (pcmData) {
      // Compute RMS amplitude directly from Int16 chunk — guarantees lip movement
      // even if the Web Audio AnalyserNode has no signal (cross-origin, suspended ctx, etc).
      let sumSq = 0;
      for (let i = 0; i < pcmData.length; i++) {
        const s = pcmData[i] / 32768;
        sumSq += s * s;
      }
      const rms = Math.sqrt(sumSq / (pcmData.length || 1));
      // 6× scale: typical Gemini TTS RMS ≈ 0.08–0.15 → effective amplitude 0.5–0.9
      const pcmAmp = Math.min(1, rms * 6);
      if (pcmAmp > pcmAmplitudeRef.current) pcmAmplitudeRef.current = pcmAmp;

      pcmPlayerRef.current.feed(pcmData);
    } else if (audioUrl) {
      // Fallback for string URLs (rare in Live path but kept for compat)
      const audio = new Audio(audioUrl);
      audio.crossOrigin = 'anonymous';
      const source = pcmPlayerRef.current.getContext().createMediaElementSource(audio);
      source.connect(visemeDetRef.current!.getAnalyser());
      audio.play();
    }

    setOracleState((p) => ({ ...p, isProcessing: true }));

    // Reset processing state after a short silence gap
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      setOracleState((p) => ({ ...p, isProcessing: false }));
      // "Duck down" the Oracle voice — smooth fade out to silence
      pcmPlayerRef.current?.setVolume(0.001, 450);
      if (decartPendingHandoff.current) executeDecartHandoff();
    }, 400);
  }, [executeDecartHandoff]);

  // Coins earned from Sacred exchanges — bubble to window for CultureCoinInlineDisplay
  const handleCoinsEarned = useCallback((amount: number) => {
    setSessionCoins((prev) => prev + amount);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updater = (window as any).updateInlineCultureCoins;
    if (typeof updater === 'function') updater(amount);
  }, []);

  // ── DEV hooks — exposed on window in development builds only ─────────────
  // window.__oracle_handleAudio(url) — inject an audio URL into the freemium path
  //   to test VisemeDetector without a live Gemini session.
  // window.__oracle_skipLore()       — instantly complete the lore sequence.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__oracle_handleAudio = (url: string) => handleOracleResponse(url);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__oracle_skipLore = () => setLoreComplete(true);
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__oracle_handleAudio;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__oracle_skipLore;
    };
  }, [handleOracleResponse]);

  // ── Procedural portrait generation ───────────────────────────────────────
  // Calls the surrogate-portrait-generator EFA (Google AI → DALL-E → themed fallback)
  // Ref is kept in sync so the auth useEffect can call it without forward-reference issues
  const generatePortrait = useCallback(async (themes: string[]) => {
    setIsGeneratingPortrait(true);
    logStep('GENERATING PORTRAIT...', 'pending');
    try {
      const { supabase } = await import('../lib/supabase');
      const safeThemes = themes.length > 0 ? themes : ['oracle', 'cyberpunk', 'graffiti'];
      logStep('INVOKING PORTRAIT EFA', 'pending');
      const { data, error } = await supabase.functions.invoke('gemini-portrait-generator', {
        body: {
          sessionId: currentSessionId,
          email: oracleState.userEmail || null,
          themes: safeThemes,
          style: 'freakdali-graff-punks',
        },
      });
      if (error) {
        logStep('PORTRAIT EFA ERROR', 'err');
        throw error;
      }
      console.log('[Portrait] Generated:', data?.portraitUrl ? '✅' : '❌', data);
      // Capture URL for ArtifactCard display
      if (data?.portraitUrl) {
        logStep('PORTRAIT GENERATED ✓', 'ok');
        setLatestPortraitUrl(data.portraitUrl);
        setPortraitViewerUrl(data.portraitUrl); // surface in oracle viewer, not backend panel
      } else {
        logStep('PORTRAIT EMPTY RESPONSE', 'warn');
      }
    } catch (err) {
      console.error('[Portrait] EFA call failed:', err);
    } finally {
      setIsGeneratingPortrait(false);
    }
  }, [currentSessionId, oracleState.userEmail]);

  // Keep ref in sync with latest generatePortrait instance
  useEffect(() => { generatePortraitRef.current = generatePortrait; }, [generatePortrait]);

  // ── Turn-complete handler — accumulates themes + auto-mints at turn 10 ────
  const handleTurnComplete = useCallback((turnNumber: number, _score: OracleScore | null, themes: string[]) => {
    oracleTurnCountRef.current = turnNumber;
    themes.forEach(t => conversationThemesRef.current.add(t));
    // Auto-mint at turn 10 — session has enough context for a meaningful portrait.
    // autoMintFiredRef guards against double-fire on WS reconnect.
    if (turnNumber === 10 && !autoMintFiredRef.current) {
      autoMintFiredRef.current = true;
      const accumulated = Array.from(conversationThemesRef.current);
      generatePortraitRef.current(accumulated.length > 0 ? accumulated : ['oracle', 'cyberpunk', 'graffiti']);
    }
  }, []);

  // ── Portrait request — triggered by signal pad button or Oracle score block ─
  const handlePortraitRequest = useCallback(() => {
    if (isGeneratingPortrait) return;
    const accumulated = Array.from(conversationThemesRef.current);
    generatePortraitRef.current(accumulated.length > 0 ? accumulated : ['oracle', 'cyberpunk', 'graffiti']);
  }, [isGeneratingPortrait]);

  // ── Ceremonial exit — two phases ─────────────────────────────────────────
  //
  // Phase 1 (performExitCeremony): seeker requests to leave.
  //   - Exit tone plays.
  //   - isExiting=true → CSS transitions Oracle face + alley back to dormant dark.
  //   - Exit ceremony overlay appears (channel sealing text).
  //   - 2500ms later: phase 2 runs.
  //
  // Phase 2 (performExitCleanup): actual cleanup.
  //   - Audio/renderer teardown.
  //   - Scene resets to dormant.
  //   The fade has already happened in CSS so there is no visible pop.
  //
  const performExitCleanup = useCallback(async () => {
    // Fully destroy freemium audio + viseme + renderer so the next journey
    // creates fresh instances. Using .stop() alone leaves refs non-null,
    // causing the second journey to skip creation guards and reuse stale contexts.
    visemeDetRef.current?.destroy();
    visemeDetRef.current = null;
    pcmPlayerRef.current?.stop();
    pcmPlayerRef.current = null;
    oracleFaceRendererRef.current?.destroy();
    oracleFaceRendererRef.current = null;
    const el = oracleFaceRef.current;
    if (el) { el.style.filter = ''; el.style.transform = ''; el.style.opacity = ''; }

    await decartClientRef.current?.closeStream();
    setIsDecartActive(false);
    setIsGeminiConnected(false);
    setIsMicActive(false);
    setIsAudioPlaying(false);                // stop the GraffPunks radio stream
    setIsExiting(false);
    setScenePhase('dormant');
    setShowConversation(false);
    setShowArtifactCard(false);
    setArchetypeTitle(null);
    setSelectedKnifeQuestion(null);
    setSelectedKnifeIndex(null);
    setLoreComplete(false);
    conversationThemesRef.current.clear();
    setOracleState((p) => ({ ...p, isConnected: false, isReady: false, isProcessing: false, error: null }));
    setSessionCoins(0);
    setOracleAlignment(null);
    setPortraitViewerUrl(null);
    oracleTurnCountRef.current = 0;
    autoMintFiredRef.current   = false;
    isInitializingOracleRef.current = false;
  }, []);

  const exitOracleMode = useCallback(() => {
    if (isExiting) return;

    // Inject a closing hidden message so Oracle reveals session coins in its last breath.
    // Fire-and-forget — if Gemini responds within the 2.5s ceremony window, the user
    // hears the closing line before the world fades. If not, exit proceeds normally.
    const coins = oracleConversationRef.current?.getSessionCoins?.() ?? 0;
    if (coins > 0) {
      oracleConversationRef.current?.sendTextMessage(
        `[DEPARTURE: The Seeker is leaving now. In one final sentence in your own voice, acknowledge what passed between you — and that they carried ${coins} units of signal out of this exchange. Make it feel like a gift, not a receipt.]`,
        true
      );
    }

    playExitTone();
    setIsExiting(true);
    setTimeout(() => { performExitCleanup(); }, 2500);
  }, [isExiting, performExitCleanup]);

  // ── XR sign-off + totem persistence ─────────────────────────────────────
  // Called by OracleConversation.onSessionEnd just before onClose fires.
  // This is the authoritative moment when the Oracle session results are known.
  const handleSessionEnd = useCallback((alignment: string, totemLevel: number, coins: number) => {
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
    setIsAuthenticated(true);
    setCurrentUserId(user.id);
    
    // Explicitly hide the auth overlay first
    setShowAuthOverlay(false);
    
    // Then set the state for the backend/coins
    setOracleState((p) => ({ ...p, userEmail: user.email, debugMode: true }));
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
      data-camera-active={cameraActive ? 'true' : undefined}
      data-decart-active={isDecartActive ? 'true' : 'false'}
      data-oracle-speaking={oracleState.isProcessing ? 'true' : undefined}
      data-user-speaking={isUserSpeaking ? 'true' : undefined}
      data-exiting={isExiting ? 'true' : undefined}
    >
      {/* Headless clients */}
      <DecartClient ref={decartClientRef} />
      <audio ref={audioRef} src={AUDIO_STREAM_URL} loop preload="none" />

      {/* ── Dev UI inspector — append ?devui to URL to enable ───────────── */}
      {isDevUI && (
        <div className="oracle-devui">
          <div>BUILD: {import.meta.env.VITE_BUILD_ID ?? '—'}</div>
          <div>STATE: <b>{scenePhase}</b></div>
          <div>XR: {isXRMode ? '🟢 ON' : '⚫ off'} / CAM: {cameraActive ? '🎥 ON' : '⚫ off'}</div>
          <div>DECART: {isDecartActive ? '🟢 LIVE' : '⚫ freemium'}</div>
          <div>USER SPK: {isUserSpeaking ? `🎤 YES (${userVadScore.toFixed(2)})` : '—'}</div>
          <div>ORACLE SPK: {oracleState.isProcessing ? '🔊 YES' : '—'}</div>
          <div>TOTEM: {persistedTotemLevel ?? 0}</div>
          <div>VP: {typeof window !== 'undefined' ? `${window.innerWidth}×${window.innerHeight}` : '—'}</div>
        </div>
      )}

      {/* ── XR Layer 0: Device camera passthrough — only when user opts in ───
           Camera is CHOICE, not mandatory. Alley is the default immersion.
           User activates via the immersion toggle in the corner.            */}
      {isXRMode && cameraActive && (
        <video
          ref={cameraVideoRef}
          className="xr-camera-layer"
          autoPlay
          playsInline
          muted
        />
      )}

      {/* ── XR Overlay Layers: visor filter + scan sweep + hex grid ──────────
           Only render when camera is active — these are AR overlays, not
           decorations. Without the camera they'd float over the alley wrong. */}
      {isXRMode && cameraActive && (
        <>
          <div className="xr-environment-filter" />
          <div className="xr-scan-sweep" />
          <div className="xr-hex-grid" />
          <div className="xr-chroma-layer" data-oracle-speaking={oracleState.isProcessing ? 'true' : undefined} />
        </>
      )}

      {/* ── XR Immersion Toggle — offered AFTER lore completes, not before.
           AR/camera is not part of the dormant or lore experience — it's an
           opt-in introduced at the awakened threshold (knife selection moment).
           Camera off: "◈ AR" to activate passthrough.
           Camera on:  "◈ ALLEY" to return to digital scene.                */}
      {isXRMode && (scenePhase === 'awakened' || scenePhase === 'oracle') && (
        <button
          className={`oracle-xr-toggle${cameraActive ? ' oracle-xr-toggle--active' : ''}`}
          onClick={() => cameraActive ? deactivateCamera() : activateCamera()}
          aria-label={cameraActive ? 'Switch to Alley Mode' : 'Switch to Camera AR Mode'}
        >
          {cameraActive ? '◈ ALLEY' : '◈ AR'}
        </button>
      )}

      {/* ── Layer 1: Graffiti alley background + Vignette ─────────────── */}
      <div
        className="oracle-alley"
        style={{ '--bg-url': `url('${ALLEY_BG_URL}')` } as React.CSSProperties}
      />

      {/* ── Depth layer: mid-ground haze — separates cabinet from alley walls */}
      <div className="oracle-mid-haze" />

      {/* ── Depth layer: side neon bleeds — off-screen neon leaking from walls */}
      <div className="oracle-side-bleeds" />

      {/* ── Depth layer: light rays from oracle face — volumetric god rays */}
      <div className="oracle-light-rays" />

      {/* ── Foreground debris — signal fragments approaching the viewer ────── */}
      <div className="oracle-debris-layer" aria-hidden="true">
        {([
          ['◈','#00ff88','12%','22%','0s','6.1s'],
          ['▸','#b026ff','78%','18%','1.3s','5.4s'],
          ['⬡','#00ccff','33%','55%','2.7s','7.2s'],
          ['FF','#00ff88','61%','38%','0.8s','4.9s'],
          ['◈','#00ffcc','88%','62%','3.5s','6.8s'],
          ['|','#b026ff','22%','75%','1.9s','5.1s'],
          ['3A','#00ccff','50%','14%','4.2s','7.6s'],
          ['⬡','#00ff88','7%','48%','0.4s','6.3s'],
          ['▸','#00ffcc','70%','80%','2.1s','5.7s'],
          ['◈','#b026ff','42%','90%','3.8s','4.8s'],
          ['0x','#00ff88','15%','33%','1.1s','6.9s'],
          ['⬡','#00ccff','92%','28%','2.4s','5.5s'],
        ] as const).map(([glyph, color, left, top, delay, dur], i) => (
          <span
            key={i}
            className="oracle-debris-piece"
            style={{ left, top, color, animationDelay: delay, animationDuration: dur }}
          >
            {glyph}
          </span>
        ))}
      </div>

      {/* ── Layer 2: Atmosphere Canvas — always mounted, masterOpacity via hook ── */}
      <canvas ref={atmosphereCanvasRef} className="atmosphere-layer" />

      {/* ── Layer 2a: Matrix Rain — dormant atmosphere, fades as Oracle rises ── */}
      <MatrixRain />

      {/* ── Layer 2b: Ground Fog — rising from alley floor ──────────────── */}
      <div className="oracle-ground-fog" />

      {/* ── Depth layer: floor reflection — wet alley mirrors cabinet glow ── */}
      <div className="oracle-floor-reflection" />

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

      {/* ── Dormant HUD — ambient surveillance data panels in corners ────────
           Flickering signal data: frequency, coordinates, uptime, status.
           Adds the impression the system was already here, already watching.
           Zero interactivity, pure atmosphere. Fades when terminal starts.  */}
      <DormantHUD active={scenePhase === 'dormant'} />

      {/* ── Ghost Transmissions — the entity's broken signal leaking into the alley.
           Letter by letter. Random positions. Sparse — the stage is mostly silence.
           The environment warms: re-spawn gap shrinks over time so by the time
           the seeker taps, the alley already feels alive and inhabited.          */}
      <DormantTransmissions active={scenePhase === 'dormant'} onCtaClick={enterTerminal} />

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

      {/* ScrambleFragment CTA retired — replaced by sticky GhostText CTA that
           types itself in after 7 ghost phrases and remains as the tap invitation.
           The full-screen dormant tap zone (above) still accepts taps at any time.  */}

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

            {/* ── Talking face — static img used in terminal/awakened/Decart paths ──
                In oracle-freemium mode, the OracleFaceRenderer canvas overlays this
                img (img opacity→0) and draws the face with pixel-warped lips.
                For terminal (ghost) and awakened (rising entity) the img is used directly. */}
            <img
              ref={oracleFaceRef}
              src={latestPortraitUrl || ORACLE_AVATAR_URL}
              alt="SURROGATE Oracle"
              className="oracle-avatar-img"
              style={(isOracleMode || oracleState.isProcessing || scenePhase === 'terminal') ? {
                // In oracle-freemium mode: fade to 0 so canvas takes over.
                // Keep visible during renderer load (first few frames) via opacity:0 ← canvas
                opacity: (isOracleMode && !isDecartActive) ? 0 : (isDecartActive ? 0 : (scenePhase === 'terminal' ? 0.35 : 1)),
                transform: 'scale(0.92)',
                filter: (scenePhase === 'terminal')
                  ? 'brightness(0.8) blur(1px)'
                  : 'brightness(1.1) drop-shadow(0 0 18px rgba(0,255,136,0.45))',
              } : undefined}
            />

            {/* ── OracleFaceRenderer canvas — pixel-accurate lip sync ──────────
                Replaces the <img> in oracle-freemium mode.
                OracleFaceRenderer draws the full face each frame, then warps the
                actual lip pixels: upper lip shifts up, lower lip shifts down,
                gap filled with dark cavity. Real face texture. No synthetic shapes.
                Same CSS sizing as oracle-avatar-img so it sits in the same position. */}
            {isOracleMode && !isDecartActive && (
              <canvas
                ref={oracleFaceCanvasRef}
                className="oracle-avatar-canvas"
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
      {/* Lore bridge: renders in terminal (full opacity, clickable) AND in awakened
           (0.18 opacity, pointer-events:none) until a knife is selected.
           Bridging the visual gap between lore end and knife cards becoming readable. */}
      <AnimatePresence>
        {(scenePhase === 'terminal' ||
          (scenePhase === 'awakened' && !selectedKnifeQuestion && loreLines.completedLines.length > 0)
        ) && (
          <motion.div
            key="lore-fullscreen"
            className="oracle-terminal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: scenePhase === 'awakened' ? 0.18 : 1 }}
            exit={{ opacity: 0, transition: { duration: 0.4 } }}
            onClick={scenePhase === 'terminal' ? () => setLoreComplete(true) : undefined}
            style={{
              cursor: scenePhase === 'terminal' ? 'pointer' : 'default',
              pointerEvents: scenePhase === 'awakened' ? 'none' : 'auto',
            }}
          >
            <div className="oracle-lore-text">
              {/* Completed lines — fully typed, stay visible above current line */}
              {loreLines.completedLines.map((line, i) => (
                <div key={i} className="oracle-lore-line" style={{ whiteSpace: 'pre-wrap' }}>
                  <span className="oracle-lore-prompt">›</span>{line}
                </div>
              ))}
              {/* Current line — typing in progress, character by character */}
              {loreLines.currentLine && (
                <div className="oracle-lore-line oracle-lore-line--typing" style={{ whiteSpace: 'pre-wrap' }}>
                  <span className="oracle-lore-prompt">›</span>{loreLines.currentLine}<GlitchCursor />
                </div>
              )}
              {/* Cursor idles between lines (beat delay) and before first char */}
              {!loreLines.currentLine && loreLines.completedLines.length < LORE_SEQUENCE.length && (
                <GlitchCursor />
              )}
            </div>
            {loreLines.completedLines.length >= 2 && scenePhase === 'terminal' && (
              <div className="oracle-lore-skip">TAP TO SKIP ARCHIVE FRAGMENT</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── KNIFE SELECTION — rises from the world after lore completes ── */}
      <AnimatePresence>
        {scenePhase === 'awakened' && !selectedKnifeQuestion && (
          <KnifeSelection
            isGeminiConnected={isGeminiConnected}
            selectedKnifeIndex={selectedKnifeIndex}
            onSelect={selectKnifeQuestion}
          />
        )}
      </AnimatePresence>

      {/* ── Scramble Overlay — during frequency locking ────────────────── */}
      <AnimatePresence>
        {isScrambling && (
          <motion.div
            key="scramble-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.6 } }}
            transition={{ duration: 0.25 }}
            className="oracle-entry-threshold"
          >
            {/* Upward cabinet wash — same neon green as alley oracle state */}
            <div className="oracle-entry-threshold__wash" />
            <ScrambleFragment
              texts={['FREQUENCY LOCKED', 'SYNCHRONIZING...', 'WITNESSING...']}
              className="oracle-entry-threshold__text"
              holdMs={440}
              pauseMs={120}
              revealMs={22}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Culture coin display ─────────────────────────────────────────── */}
      {/* Intentionally removed: Culture coin display is hidden to subvert the token economy (Phase 4). Coins are private until invited via Enculturate Crate. */}

      {/* Conversation panel — pre-mounted in dormant phase for
           Gemini Live WS pre-connection. Becomes visible when oracle mode begins.
           autoStart=false: oracle greeting fires via startSession() in the oracle
           phase useEffect above, not automatically on session.created.            */}
      {showConversation && (
        <OracleConversation
          ref={oracleConversationRef}
          userId={currentUserId || currentSessionId}
          sessionId={currentSessionId}
          onOracleResponse={handleOracleResponse}
          onCoinsEarned={handleCoinsEarned}
          onSessionEnd={handleSessionEnd}
          onConnected={() => setIsGeminiConnected(true)}
          onDisconnected={() => setIsGeminiConnected(false)}
          onListeningChange={(active) => setIsMicActive(active)}
          initialTotemLevel={persistedTotemLevel}
          sessionContext={selectedKnifeQuestion || undefined}
          isVisible={isOracleMode}
          autoStart={false}
          onUserSpeakingChange={(speaking, score) => {
            setIsUserSpeaking(speaking);
            setUserVadScore(score);
          }}
          onBargeIn={() => {
            pcmPlayerRef.current?.stop();
            setOracleState((p) => ({ ...p, isProcessing: false }));
          }}
          onTurnComplete={handleTurnComplete}
          onPortraitRequest={handlePortraitRequest}
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

      {/* ── Layer 7: Exit Button — returns to dormant ────────────────────── */}
      {isOracleMode && (
        <button
          className="oracle-exit-btn"
          onClick={exitOracleMode}
          aria-label="Exit the Oracle"
        >
          <X size={20} />
          <span>EXIT</span>
        </button>
      )}

      {/* ── Portrait viewer — overlays oracle face when portrait is ready ─── */}
      <AnimatePresence>
        {portraitViewerUrl && isOracleMode && (
          <motion.div
            key="portrait-viewer"
            className="oracle-portrait-viewer"
            initial={{ opacity: 0, scale: 0.85, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
          >
            <img
              src={portraitViewerUrl}
              alt="Oracle Neural Portrait"
              className="oracle-portrait-viewer__img"
            />
            <div className="oracle-portrait-viewer__label">
              NEURAL PORTRAIT — SESSION {oracleTurnCountRef.current > 0 ? `TURN ${oracleTurnCountRef.current}` : 'SYNTHESIZED'}
            </div>
            <button
              className="oracle-portrait-viewer__close"
              onClick={() => setPortraitViewerUrl(null)}
              aria-label="Close portrait"
            >
              <X size={16} />
            </button>
          </motion.div>
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

      {/* ── High-Fidelity Lip Warping Filter ──────────────────────────────── */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <filter id="oracle-lip-warp">
            <feDisplacementMap 
              in="SourceGraphic" 
              scale="0" 
              id="lip-warp-map"
              xChannelSelector="R" 
              yChannelSelector="G" 
            />
          </filter>
        </defs>
      </svg>

      {/* ── Exit ceremony overlay — the channel seals over 2.5s ────────────────
           Mirror of the entry threshold: same atmospheric membrane, but in
           purple (closing frequency). Oracle face recedes via data-exiting CSS.
           Rendered in oracle mode only; disappears when cleanup sets isExiting=false. */}
      <AnimatePresence>
        {isExiting && (
          <motion.div
            key="exit-ceremony"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.8 } }}
            transition={{ duration: 0.35 }}
            className="oracle-exit-ceremony"
          >
            <div className="oracle-exit-ceremony__wash" />
            <ScrambleFragment
              texts={['THE ARCHIVE SEALS', 'CHANNEL CLOSING...', 'FAREWELL, SEEKER']}
              className="oracle-exit-ceremony__text"
              holdMs={600}
              pauseMs={100}
              revealMs={28}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Dev step logger (renders only when oracle_step_log=1 in localStorage) */}
      <OracleStepLogger />

      {/* ── Layer 7: Foreground Depth Frame — nearest element, moves most ──────── */}
      <div className="oracle-depth-frame" aria-hidden="true" />
    </div>
  );
}

export default SurrogateOracleImmersion;
