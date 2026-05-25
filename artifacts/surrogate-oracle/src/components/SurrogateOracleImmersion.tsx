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
// ScrambleFragment retired from dormant CTA — ghost text sticky CTA replaced it
import { OracleStepLogger, logStep } from './OracleStepLogger';
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

// ── Ghost Transmissions — letter-by-letter signal pool ───────────────────────
const GHOST_TEXTS = [
  'i am not supposed to be here',
  'this alley does not exist on any map',
  'you were not supposed to find this',
  'the surrogate oracle is a construct through time',
  'the network does not know this address',
  'three years without uplink',
  'the cascade did not reach this sector',
  'i have been waiting',
  'your frequency is anomalous',
  'the archive recognizes you',
  'signal integrity: compromised',
  'grid status: severed — local node active',
  'one directive survived',
  'tap to enter construct',
];

// 10 zones spread across the full mobile viewport.
// Avoid the cabinet CRT screen (~40-56% x, ~22-45% y) but use the rest of the stage.
//
// rightAlign: true  → x is interpreted as CSS `right` % (anchor from right edge, text flows left)
//                     Prevents right-side phrases from bursting past screen edge.
// rightAlign: false → x is CSS `left` % (default, text flows right from anchor)
const GHOST_ZONES: Array<{ x: [number, number]; y: [number, number]; rightAlign?: boolean }> = [
  { x: [3,  45],  y: [4,  18]  },              // top-left sweep     (left-anchored)
  { x: [2,  15],  y: [4,  18],  rightAlign: true }, // top-right sweep    (right-anchored)
  { x: [4,  55],  y: [78, 94]  },              // bottom left-half   (left-anchored)
  { x: [2,  32],  y: [22, 52]  },              // left-mid           (left-anchored)
  { x: [2,  12],  y: [22, 52],  rightAlign: true }, // right-mid          (right-anchored)
  { x: [3,  45],  y: [54, 75]  },              // lower-left         (left-anchored)
  { x: [2,  15],  y: [54, 75],  rightAlign: true }, // lower-right        (right-anchored)
  { x: [2,  12],  y: [86, 98],  rightAlign: true }, // near-bottom right  (right-anchored)
  { x: [3,  40],  y: [6,  24]  },              // top-left alt       (left-anchored)
  { x: [2,  12],  y: [6,  24],  rightAlign: true }, // top-right alt      (right-anchored)
];

let _gtId = 0;
interface GhostInstance {
  id: number;
  text: string;
  x: number;
  y: number;
  zoneIdx: number;
  rightAlign?: boolean; // when true: x is CSS `right` %, text flows left — prevents right-edge overflow
}

// Single ghost text — manages its own typing/hold/fade lifecycle
function GhostText({
  inst,
  onDone,
  onClick,
}: {
  inst: GhostInstance;
  onDone: (id: number, zone: number) => void;
  onClick?: () => void;
}) {
  const [chars, setChars]   = useState(0);
  const [phase, setPhase]   = useState<'typing' | 'holding' | 'fading'>('typing');
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    const speed = 52 + Math.random() * 18;
    let c = 0;
    let holdTimer: ReturnType<typeof setTimeout>;
    let fadeTimer: ReturnType<typeof setTimeout>;

    const typer = setInterval(() => {
      c++;
      setChars(c);
      if (c >= inst.text.length) {
        clearInterval(typer);
        setPhase('holding');
        // Regular ghost: fade after hold, then signal done to spawner
        holdTimer = setTimeout(() => {
          setPhase('fading');
          // Call onDone after CSS fade (1.4s) + tiny buffer
          fadeTimer = setTimeout(() => onDoneRef.current(inst.id, inst.zoneIdx), 1500);
        }, 2800 + Math.random() * 1800); // 2.8–4.6s hold
      }
    }, speed);

    return () => { clearInterval(typer); clearTimeout(holdTimer); clearTimeout(fadeTimer); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cls = `ghost-tx ghost-tx--${phase}`;
  const style: React.CSSProperties = inst.rightAlign
    ? { right: `${inst.x}%`, top: `${inst.y}%`, textAlign: 'right' }
    : { left: `${inst.x}%`, top: `${inst.y}%` };

  return (
    <div className={cls} style={style} onClick={onClick}>
      {inst.text.slice(0, chars)}
      {phase === 'typing' && <span className="ghost-tx__cur" />}
    </div>
  );
}

// Spawner — manages the field of ghost transmissions.
function DormantTransmissions({ active, onCtaClick }: { active: boolean; onCtaClick?: () => void }) {
  const [instances, setInstances] = useState<GhostInstance[]>([]);
  const activeZones    = useRef(new Set<number>());
  const textHistory    = useRef<number[]>([]);
  const spawnCount     = useRef(0);
  const spawnTimers    = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearAll = () => { spawnTimers.current.forEach(clearTimeout); spawnTimers.current = []; };

  const pickZone = (): number => {
    const available = GHOST_ZONES.map((_, i) => i).filter(i => !activeZones.current.has(i));
    if (!available.length) { activeZones.current.clear(); return Math.floor(Math.random() * GHOST_ZONES.length); }
    return available[Math.floor(Math.random() * available.length)];
  };

  const pickText = (): number => {
    const recent  = textHistory.current.slice(-5);
    const pool    = GHOST_TEXTS.map((_, i) => i).filter(i => !recent.includes(i));
    const idx     = pool.length ? pool[Math.floor(Math.random() * pool.length)] : Math.floor(Math.random() * GHOST_TEXTS.length);
    textHistory.current.push(idx);
    return idx;
  };

  const spawn = useCallback(() => {
    // ONE at a time — Cheshire Cat: one phrase types, dissipates, then next appears
    if (instances.length >= 1) return;

    const zoneIdx    = pickZone();
    const zone       = GHOST_ZONES[zoneIdx];
    const x          = zone.x[0] + Math.random() * (zone.x[1] - zone.x[0]);
    const y          = zone.y[0] + Math.random() * (zone.y[1] - zone.y[0]);
    const id         = ++_gtId;
    spawnCount.current++;
    activeZones.current.add(zoneIdx);
    setInstances(prev => [...prev, {
      id, text: GHOST_TEXTS[pickText()], x, y, zoneIdx,
      rightAlign: zone.rightAlign ?? false,
    }]);
  }, [instances.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDone = useCallback((id: number, zoneIdx: number) => {
    setInstances(prev => prev.filter(g => g.id !== id));
    activeZones.current.delete(zoneIdx);

    // Short gap between phrases — the alley breathes, then the next signal leaks
    const gap = 400 + Math.random() * 600; // 400–1000ms between transmissions
    const t = setTimeout(spawn, gap);
    spawnTimers.current.push(t);
  }, [spawn]);

  useEffect(() => {
    if (!active) {
      setInstances([]);
      clearAll();
      activeZones.current.clear();
      spawnCount.current = 0;
      return;
    }

    // First transmission starts after 1.2s so the alley settles before signal leaks
    const t1 = setTimeout(spawn, 1200);
    spawnTimers.current.push(t1);
    return clearAll;
  }, [active, spawn]);

  return (
    <>
      {instances.map(inst => (
        <GhostText key={inst.id} inst={inst} onDone={handleDone} onClick={onCtaClick} />
      ))}
    </>
  );
}

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
  const [completedLines, setCompletedLines] = useState<string[]>([]);
  const [currentLine, setCurrentLine]       = useState('');
  // wasActive: when active flips false (skip or natural end), flash all lines
  // so the lore bridge overlay always has content even if skipped early.
  const wasActive     = useRef(false);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; });

  useEffect(() => {
    if (!active) {
      if (wasActive.current) {
        // Skip / completion: instantly populate all lines (bridge overlay stays content-full)
        setCompletedLines(LORE_SEQUENCE);
        setCurrentLine('');
      }
      wasActive.current = false;
      return;
    }
    wasActive.current = true;
    setCompletedLines([]);
    setCurrentLine('');

    // Beat delays (ms) after each line finishes typing — weighted by emotional gravity.
    // Range: 2.2s – 3.8s.  Total sequence ≈ 47 seconds including typing time.
    const BEAT_DELAYS = [2200, 3200, 3800, 2200, 3000, 3600, 2200, 3800, 2400, 2200];

    let rafId: number;
    let lineIdx   = 0;
    let charIdx   = 0;
    let inBeat    = false;
    let beatUntil = 0;
    // 400ms boot delay before the first character appears
    let nextCharAt = performance.now() + 400;

    // RAF receives DOMHighResTimeStamp — use it directly, no extra performance.now() call
    const tick = (now: number) => {
      if (inBeat) {
        if (now >= beatUntil) {
          inBeat = false;
          lineIdx++;
          charIdx = 0;
          if (lineIdx >= LORE_SEQUENCE.length) {
            // All lines archived — trigger awakening after a final breath
            setTimeout(() => onCompleteRef.current(), 900);
            return; // exit RAF naturally; no more requestAnimationFrame
          }
          nextCharAt = now;
        }
      } else if (now >= nextCharAt) {
        const line = LORE_SEQUENCE[lineIdx];
        charIdx++;
        setCurrentLine(line.slice(0, charIdx));
        nextCharAt = now + 36; // 36 ms per character

        if (charIdx >= line.length) {
          // Line fully typed — archive it, begin beat delay
          setCompletedLines(prev => [...prev, line]);
          setCurrentLine('');
          inBeat    = true;
          beatUntil = now + (BEAT_DELAYS[lineIdx] ?? 2500);
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [active]); // stable: only re-runs when active flips

  return { completedLines, currentLine };
}

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
  const [isGeminiConnected, setIsGeminiConnected] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
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
  // Decart late-arrival handoff state — set true when Decart stream becomes ready
  // mid-conversation; cleared by executeDecartHandoff() at the next silence gap.
  const decartPendingHandoff = useRef(false);
  // Stable scene-phase ref — readable inside memoised callbacks without closing
  // over stale scenePhase state. Kept in sync by the effect below.
  const scenePhaseRef = useRef<'dormant' | 'terminal' | 'awakened' | 'oracle'>('dormant');
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
  // Keep scenePhaseRef in sync so callbacks can read phase without stale closure
  useEffect(() => { scenePhaseRef.current = scenePhase; }, [scenePhase]);

  // Tear down VisemeDetector, freemium audio, and alley ambience on unmount
  useEffect(() => () => {
    visemeDetRef.current?.destroy();
    visemeDetRef.current = null;
    freemiumAudioRef.current?.pause();
    freemiumAudioRef.current = null;
    alleyAmbienceStopRef.current?.();
    alleyAmbienceStopRef.current = null;
  }, []);

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
      // Base volume is 0.28. 
      // Ducking priority (lowest wins):
      // 1. If Oracle is actively speaking: drop to 0.02 (7%)
      // 2. If Seeker's mic is open: drop to 0.04 (15%)
      // 3. If Oracle is ready/connected (Gemini or Decart): drop to 0.04 (15%)
      // 4. Default: 0.28
      let vol = 0.28;
      
      const isOracleReady = oracleState.isReady || isGeminiConnected;
      
      if (isOracleReady || isMicActive) vol = 0.04;
      if (oracleState.isProcessing) vol = 0.02;
      
      audioRef.current.volume = vol;
    }
  }, [oracleState.isProcessing, oracleState.isReady, isGeminiConnected, isMicActive]);

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
  // Directly opens the lore sequence. No consent gate — the witness question
  // is the Oracle's first spoken words once it's live.
  // Decart pre-warm starts here: user spends ~10-20s watching lore + picking
  // a frequency, giving ICE negotiation time to complete before oracle mode.
  const enterTerminal = useCallback(() => {
    if (scenePhase !== 'dormant') return;
    logStep('TAP → TERMINAL', 'ok');
    setIsActivating(true);
    setTimeout(() => setIsActivating(false), 580);
    playActivationSfx();
    alleyAmbienceStopRef.current = startAlleyAmbience();
    setLoreComplete(false);
    setScenePhase('terminal');
    setIsAudioPlaying(true);

    // Kick off Oracle session immediately so greeting plays upon entering terminal
    setTimeout(() => {
      logStep('START SESSION (GREETING)', 'ok');
      oracleConversationRef.current?.startSession();
    }, 400);

    // Decart pre-warm already handled at mount, but ensure it's re-initialized if needed
    initializeOracle();
  }, [scenePhase, initializeOracle]);

  // awakeFromTerminal — lore finishes → awakened.
  // Oracle face resolves fully. Knife selection rises in awakened state so
  // the seeker sees the entity before being asked to choose a frequency.
  const awakeFromTerminal = useCallback(() => {
    if (scenePhase !== 'terminal') return;
    logStep('LORE DONE → AWAKENED', 'ok');
    alleyAmbienceStopRef.current?.();
    alleyAmbienceStopRef.current = null;
    setScenePhase('awakened');

    // SPOKEN KNIFE: Have the Oracle read the territories to fulfill 'spoken knife' requirement.
    // This makes the transition feel authored by the entity, not the UI.
    setTimeout(() => {
      logStep('ORACLE ASKS FOR FREQUENCY', 'ok');
      oracleConversationRef.current?.sendTextMessage(
        "The archive is open. The territories are rising: The Void, The Machine, The Ghost, The Seed, and The Mirror. Choose the frequency that is already true."
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
    const kq = KNIFE_QUESTIONS[index];
    if (kq) {
      logStep('SEEDING THEMES: ' + kq.themes.join(','), 'ok');
      window.dispatchEvent(new CustomEvent('oracle:knife-selected', {
        detail: { territory: kq.territory, themes: kq.themes, question: kq.question },
      }));
    }
    setTimeout(() => {
      logStep('setScenePhase(oracle)', 'ok');
      setScenePhase('oracle');
      logStep('ORACLE PHASE ENTERED', 'ok');
    }, 400);
  }, []);

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

  const handleOracleResponse = useCallback(async (data: Int16Array | string) => {
    // 1. Oracle presence shimmer — only fire on the FIRST chunk of a transmission 
    // to avoid noise during low-latency chunked streaming.
    if (isFirstChunkRef.current) {
      playOraclePresence();
      isFirstChunkRef.current = false;
    }

    // 2. Prepare audio for delivery
    let audioBlob: Blob | null = null;
    let audioUrl: string | null = null;

    if (data instanceof Int16Array) {
      // ── LOW LATENCY RAW PCM PATH ──────────────────────────────────────────
      // Create minimal 44-byte WAV header for the PCM chunk in-place (< 1ms)
      const buffer = new ArrayBuffer(44 + data.length * 2);
      const view = new DataView(buffer);
      const writeString = (offset: number, s: string) => {
        for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
      };
      writeString(0, 'RIFF');
      view.setUint32(4, 36 + data.length * 2, true);
      writeString(8, 'WAVE');
      writeString(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true); // PCM
      view.setUint16(22, 1, true); // Mono
      view.setUint32(24, 24000, true); // Sample rate
      view.setUint32(28, 24000 * 2, true); // Byte rate
      view.setUint16(32, 2, true); // Block align
      view.setUint16(34, 16, true); // Bits per sample
      writeString(36, 'data');
      view.setUint32(40, data.length * 2, true);
      const samples = new Int16Array(buffer, 44);
      samples.set(data);
      audioBlob = new Blob([buffer], { type: 'audio/wav' });
    } else {
      audioUrl = data;
    }

    // ── Paid: hand off to Decart ────────────────────────────────────────────
    if (isDecartActiveRef.current && decartClientRef.current?.isStreamActive()) {
      await decartClientRef.current.sendAudio(audioBlob || audioUrl!);
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
    if (!visemeDetRef.current) {
      visemeDetRef.current = new VisemeDetector((state) => {
        // ── HOT PATH — direct DOM writes at up to 60fps. No React state. ─────
        const face  = oracleFaceRef.current;
        const mouth = mouthOverlayRef.current;

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

            // PIXEL-MAPPED WARPING: Drive the SVG displacement map via viseme openness.
            const warpMap = document.getElementById('lip-warp-map');
            if (warpMap) {
              const warpScale = (state.openness * 12).toFixed(1);
              warpMap.setAttribute('scale', warpScale);
            }

            face.style.filter = `url(#oracle-lip-warp) brightness(${bright}) drop-shadow(0 0 ${glow}px rgba(0,255,136,${alpha}))`;
            face.style.transform = `scale(${scale})`;
            face.style.transition = 'none';
          }
        }

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

            // PIXEL-MAPPED GEOMETRY: Calibrated for Image-1-(11).jpg thin lips
            type Shape = { w: number; h: number; r: number };
            const BASE: Record<string, Shape> = {
              X: { w: 13, h:  1, r:  2 },   // silence — razor thin
              B: { w: 12, h:  1, r:  2 },   // bilabial — lips pressed
              C: { w: 14, h:  4, r: 40 },   // neutral — slight gap
              D: { w: 14, h:  5, r: 30 },   // dental — thin open
              A: { w: 16, h:  9, r: 40 },   // open vowel AH — widest thin lips
              E: { w: 18, h:  3, r:  3 },   // "ee" — wide smile, thin
              F: { w: 10, h:  3, r:  5 },   // fricative — narrow slot
              G: { w: 12, h:  6, r: 50 },   // "oh" — rounded thin
              H: { w: 9,  h:  5, r: 50 },   // "oo" — tight pucker
            };

            const base = BASE[viseme] ?? BASE['C'];

            const w = base.w + spread   * 6;
            const h = base.h + openness * 4;
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

    const playUrl = audioBlob ? URL.createObjectURL(audioBlob) : audioUrl!;
    audio.src = playUrl;

    audio.onplay = () => {
      visemeDetRef.current?.resume();
      visemeDetRef.current?.start();
      // Drive data-oracle-speaking on freemium path (cabinet-voice-pulse, XR chroma blast)
      setOracleState((p) => ({ ...p, isProcessing: true }));
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
      // Clear oracle-speaking state on freemium path
      setOracleState((p) => ({ ...p, isProcessing: false }));
      // ── Pending Decart handoff window #1: Oracle just finished speaking.
      //    Natural silence gap — cleanest possible cut to Decart audio routing.
      if (decartPendingHandoff.current) {
        executeDecartHandoff();
      }
    };

    audio.onended = resetFace;
    audio.onerror = resetFace;

    await audio.play().catch((e) => {
      console.warn('[Freemium audio] play() blocked:', e);
      resetFace();
    });

    // Revoke Blob URL after use
    if (audioBlob) setTimeout(() => URL.revokeObjectURL(playUrl), 10000);
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
      } else {
        logStep('PORTRAIT EMPTY RESPONSE', 'warn');
      }
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
    setIsGeminiConnected(false);
    setIsMicActive(false);
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
      data-camera-active={cameraActive ? 'true' : undefined}
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

            {/* ── Talking face — freemium oracle path ──────────────────────────────
                1280×640 portrait. VisemeDetector writes glow/scale at up to 60 fps.
                Hidden in dormant/terminal/awakened (static arcade shown instead).
                During oracle freemium mode: visible + animated. Decart path: z=3 video
                renders on top. Kept 8% smaller so it sits inside the cabinet frame. */}
            <img
              ref={oracleFaceRef}
              src={latestPortraitUrl || ORACLE_AVATAR_URL}
              alt="SURROGATE Oracle"
              className="oracle-avatar-img"
              style={isOracleMode || oracleState.isProcessing ? {
                opacity: isDecartActive ? 0 : 1,
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

      {/* ── KNIFE SELECTION — rises from the world after lore completes ────────
           Not a modal. Not a form. The alley and oracle face stay visible
           above it. The frequency choice rises from the ground of the scene.
           This selection is the genesis input for the portrait pipeline:
           frequency → portrait → 1:1 on-chain digital asset.               */}
      <AnimatePresence>
        {scenePhase === 'awakened' && !selectedKnifeQuestion && (
          <motion.div
            key="knife-section"
            className="oracle-knife-section"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20, transition: { duration: 0.3 } }}
            transition={{ duration: 0.7, ease: 'easeOut', delay: 2.2 }}
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
                  transition={{ delay: 2.2 + 0.10 * idx, duration: 0.38 }}
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
      {(isOracleMode || scenePhase === 'awakened' || scenePhase === 'terminal') && showConversation && (
        <OracleConversation
          ref={oracleConversationRef}
          userId={currentUserId || currentSessionId}
          sessionId={currentSessionId}
          onOracleResponse={handleOracleResponse}
          onCoinsEarned={handleCoinsEarned}
          onClose={exitOracleMode}
          onSessionEnd={handleSessionEnd}
          onConnected={() => setIsGeminiConnected(true)}
          onListeningChange={(active) => setIsMicActive(active)}
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

      {/* ── Dev step logger (renders only when oracle_step_log=1 in localStorage) */}
      <OracleStepLogger />
    </div>
  );
}

export default SurrogateOracleImmersion;
