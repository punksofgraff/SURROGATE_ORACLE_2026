/**
 * SURROGATE Oracle — Immersive Cyberpunk XR Experience
 *
 * UX Flow:
 *   DORMANT  → User lands in a dark graffiti alley. Oracle glows in a cabinet.
 *   TERMINAL → First tap: lore plays, alley ambience.
 *   AWAKENED → Lore done → Oracle greets → knife cards shown.
 *   ORACLE   → Knife selected → full conversation. Three.js avatar live.
 *
 * Avatar rendering:
 *   PRIMARY — Three.js OracleAvatar3D (GLB, always running once awakened)
 *
 * Viseme state is a ref — no React re-renders at 60fps.
 */
import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Camera, CameraOff } from 'lucide-react';

// Components
import { BackendControlPanel } from './BackendControlPanel';
import { GoogleSignInOverlay } from './GoogleSignInOverlay';
import { GraffPunksRadio } from './GraffPunksRadio';
import { EnculturateCrate } from './EnculturateCrate';
import OracleConversation, { OracleConversationHandle, OracleScore } from './OracleConversation';

/** Snapshot of a session's turns, as returned by the conversation handle. */
type SessionTurns = ReturnType<OracleConversationHandle['getSessionTurns']>;
import { MatrixRain } from './MatrixRain';
import { ArtifactCard } from './ArtifactCard';
import { ScrambleFragment } from './ScrambleFragment';
import { logStep } from './CodeAuditor';
import { DormantHUD } from './ambient/DormantHUD';
import { OracleHUD } from './ambient/OracleHUD';
import { OracleSpectrumRing } from './OracleSpectrumRing';
import { DormantTransmissions } from './ambient/GhostTransmissions';
import { GlitchCursor } from './ambient/GlitchCursor';
import { KnifeSelection, KNIFE_QUESTIONS } from './KnifeSelection';
import { TourSelection } from './TourSelection';
import { TalismanCard, TalismanData, extractProphecy } from './TalismanCard';
import { OracleHaloRing } from './OracleHaloRing';
import { Canvas, useThree } from '@react-three/fiber';
import { OracleAvatar3D } from './OracleAvatar3D';
import { EffectComposer, DepthOfField, Bloom, ChromaticAberration, Noise, Scanline } from '@react-three/postprocessing';
import { Physics } from '@react-three/rapier';
import { OracleNebula } from './OracleNebula';
import { OracleQuarks } from './OracleQuarks';
import { OraclePhysicsDebris } from './OraclePhysicsDebris';
import { OracleSceneDiagnostics, OracleDiagnosticsOverlay } from './OracleSceneDiagnostics';

// Hooks
import { useIpCheck } from '../hooks/useIpCheck';
import { supabase } from '../lib/supabase';
import { useSeekerEcho } from '../hooks/useSeekerEcho';
import { useSeekerDefine } from '../hooks/useSeekerDefine';
import { useAtmosphere } from '../hooks/useAtmosphere';
import { useParallax } from '../hooks/useParallax';
import { useXRMode } from '../hooks/useXRMode';
import { useTypewriter } from '../hooks/useTypewriter';
import { useLoreSequence, LORE_SEQUENCE } from '../hooks/useLoreSequence';
import { useOracleConnection } from '../hooks/useOracleConnection';
import { usePortraitPipeline } from '../hooks/usePortraitPipeline';
import { useOracleJourney } from '../hooks/useOracleJourney';
import { usePerformanceGuard } from '../hooks/usePerformanceGuard';
import { useGPUTier } from '../hooks/useGPUTier';
import { useWalletBridge } from '../hooks/useWalletBridge';
import { useRadioAtmosphere } from '../hooks/useRadioAtmosphere';
import WalletGateCard from './WalletGateCard';
import { InlineSubscriptionModal } from './InlineSubscriptionModal';

// Data
import { COST_NAMES } from '../data/archetypes';

// Libs/Utils
import { getAudioContext, playActivationSfx } from '../lib/oracleSfx';
import { trackOracleEvent } from '../lib/analytics';
import { getABVariant } from '../lib/ab-testing';
import type { VisemeState } from '../lib/visemeDetector';
import { defaultAudioTracks } from '../config/audioTracks';
import './SurrogateOracleImmersion.css';

const ORACLE_STATIC_URL  = 'https://i.postimg.cc/26pvW2SN/orackle-only-static.png';
const ORACLE_AVATAR_URL  = '/oracle-avatar-live.png';
const ALLEY_BG_URL       = '/alley-bg.png';
const DEFAULT_STATION    = 0; // Graff Punks — sole station
const FREE_JOURNEYS      = 5; // wallet seekers get this many free oracle journeys

// Act 5 — Rift-Construct: Oracle shifts from archivist to active witness.
// No brackets — brackets suppress Gemini audio output (same issue as knife prompts).
const RIFT_CONSTRUCT_SEED =
  `The rift is open. The seeker has activated their camera — their physical self is now present. ` +
  `You are no longer archiving. You are witnessing. ` +
  `Speak to what is here in front of you right now — not what was, not what they claimed to be. ` +
  `Be direct. Be uncomfortably present. Do not announce the shift. Just inhabit it.`;
const AUDIO_STREAM_URL   = defaultAudioTracks[DEFAULT_STATION].url;
const ORACLE_PLAYBACK_RATE = 1.0;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PORTRAIT_REVEAL_VARIANTS: Record<string, any> = {
  hidden:  { opacity: 0, scaleX: 1, scaleY: 0.06, filter: 'brightness(8) saturate(0) blur(0px)' },
  scanIn:  { opacity: 1, scaleX: 1, scaleY: 0.06, filter: 'brightness(8) saturate(0) blur(0px)',
             transition: { duration: 0.08 } },
  unfurl:  { opacity: 1, scaleX: 1, scaleY: 1,    filter: 'brightness(3) saturate(0.3) blur(4px)',
             transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
  phosphor:{ opacity: 1, scaleX: 1, scaleY: 1,    filter: 'brightness(1.4) saturate(1) blur(0px)',
             transition: { duration: 0.5, ease: 'easeOut' } },
  settled: { opacity: 1, scaleX: 1, scaleY: 1,    filter: 'brightness(1) saturate(1) blur(0px)',
             transition: { duration: 0.8, ease: 'easeOut' } },
  exit:    { opacity: 0, scale: 1.06,
             transition: { duration: 0.6 } },
};

const SILENCE_VISEME_STATE: VisemeState = { viseme: 'X', openness: 0, rounded: 0, spread: 0, amplitude: 0 };

const DEBRIS = [
  ['◈','#00ff88','12%','22%','0s','6.1s'],
  ['▸','#00ccff','78%','18%','1.3s','5.4s'],
  ['⬡','#00ccff','33%','55%','2.7s','7.2s'],
  ['FF','#00ff88','61%','38%','0.8s','4.9s'],
  ['◈','#00ffcc','88%','62%','3.5s','6.8s'],
  ['|','#00ccff','22%','75%','1.9s','5.1s'],
  ['3A','#00ccff','50%','14%','4.2s','7.6s'],
  ['⬡','#00ff88','7%','48%','0.4s','6.3s'],
  ['▸','#00ffcc','70%','80%','2.1s','5.7s'],
  ['◈','#00ccff','42%','90%','3.8s','4.8s'],
  ['0x','#00ff88','15%','33%','1.1s','6.9s'],
  ['⬡','#00ccff','92%','28%','2.4s','5.5s'],
] as const;

class OracleErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean}> {
  constructor(props: any) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: any) { console.error('[3D ERROR]', err); }
  render() { return this.state.hasError ? (
    <div style={{ color: '#cc00ff', fontFamily: "'PhillySans', monospace", fontSize: '0.72rem', letterSpacing: '0.12em', textAlign: 'center', padding: 16, textShadow: '0 0 10px rgba(176,38,255,0.6)' }}>
      SIGNAL FRAGMENTATION<br/><span style={{ color: '#b026ff', fontSize: '0.6rem' }}>ARCHIVAL RECONSTRUCTION IN PROGRESS</span>
    </div>
  ) : this.props.children; }
}

// Fallback shown while hero3.glb is loading (static oracle portrait at same position)
/* Canvas Suspense fallback while the WebGL context / GLB loads.
   Must NOT render the 2D SNEAKAR arcade poster — object-fit:cover fills the
   wrapper as a flat rectangle behind the 3D avatar, which reads as "3D phasing
   in behind a 2D card" on mobile and slow context init. A transparent,
   non-rectangular signal glow keeps the alley readable during the brief load
   without any hard 2D frame. The .oracle-avatar-static image already provides
   the pre-oracle warm-up poster where it's intended. */
function OracleAvatarFallback() {
  return (
    <div
      className="oracle-avatar-smoke-hook oracle-avatar-loading-glow"
      aria-hidden="true"
      style={{ width: '100%', height: '100%', background: 'transparent' }}
    />
  );
}

/* ── Orbit-room canvas expansion ──────────────────────────────────────────────
   In oracle phase the WebGL canvas element is grown 2x in both axes (CSS
   `inset: -50%`) so particles can orbit wider than the avatar without clipping
   at the canvas edge. The camera projection FILLS the canvas element, so an
   uncompensated expansion would render the avatar 2x too big. */
const ORACLE_ORBIT_EXPANSION = 2;

/* Keeps the avatar's on-screen size constant regardless of canvas element size.
   Measures the wrapper (the avatar's layout footprint) vs the actual canvas
   render size and sets camera.zoom = wrapperH / canvasH — so when the canvas is
   2x the wrapper, zoom is 0.5 and the avatar renders at the identical pixels it
   had in the card-sized canvas. Reruns automatically on every R3F resize
   (including the CSS state flip into oracle phase). */
function OrbitZoomCompensator({ enabled }: { enabled: boolean }) {
  const { camera, size, gl } = useThree();
  useEffect(() => {
    const persp = camera as import('three').PerspectiveCamera;
    if (!enabled) {
      if (Math.abs(persp.zoom - 1) > 1e-3) {
        persp.zoom = 1;
        persp.updateProjectionMatrix();
      }
      return;
    }
    const wrapper = gl.domElement.closest('.oracle-avatar-wrapper') as HTMLElement | null;
    const wrapH = wrapper?.getBoundingClientRect().height ?? 0;
    const zoom = wrapH > 1 && size.height > 1 ? Math.min(1, wrapH / size.height) : 1;
    if (Math.abs(persp.zoom - zoom) > 1e-3) {
      persp.zoom = zoom;
      persp.updateProjectionMatrix();
    }
  }, [camera, size, gl, enabled]);
  return null;
}

export function SurrogateOracleImmersion() {
  // ── Performance & Accessibility ─────────────────────────────────────────
  const isDegraded = usePerformanceGuard(true);
  const gpu = useGPUTier();
  // Effective render tier: GPU probe capped by the runtime FPS guard. A strong
  // GPU that drops frames can still shed expensive effects, but degraded mode
  // must keep the minimum living particle field mounted instead of mapping to
  // tier 0 and making the Oracle appear frozen/dead.
  const renderTier = (isDegraded ? 1 : gpu.tier) as 0 | 1 | 2 | 3;
  useEffect(() => {
    logStep(
      `RENDER TIER — tier=${renderTier} degraded=${isDegraded ? 'true' : 'false'} gpu=${gpu.tier}`,
      isDegraded ? 'warn' : 'ok',
    );
  }, [renderTier, isDegraded, gpu.tier]);
  // Dev-only hook so headless verification can tell "effects broken" apart from
  // "FPS guard correctly degraded the scene" (SwiftShader always trips the guard).
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__oracle_renderTier = renderTier;
  }
  const prefersReducedMotion = typeof window !== 'undefined' 
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches 
    : false;

  // ── State ───────────────────────────────────────────────────────────────
  // True once the seeker has passed through awakened at least once this tab session.
  // Lets us skip the Suspense fallback on re-entry (no "frozen static" flash) and
  // mount the Canvas earlier so GPU shaders are compiled before oracle phase begins.
  const [canvasWarmed] = useState<boolean>(() =>
    typeof window !== 'undefined' && !!sessionStorage.getItem('oracle_canvas_warmed')
  );

  const [oracleAvatarDataUrl] = useState<string>(ORACLE_AVATAR_URL);
  const [currentUserId, setCurrentUserId]   = useState<string | null>(() => localStorage.getItem('oracle_seeker_key'));
  const [currentSessionId, setCurrentSessionId] = useState(() => {
    const stored = localStorage.getItem('oracle_active_session_id');
    if (stored) return stored;
    const fresh = crypto.randomUUID();
    localStorage.setItem('oracle_active_session_id', fresh);
    return fresh;
  });
  const [userEmail, setUserEmail]           = useState<string | null>(null);
  const [sessionCoins, setSessionCoins]     = useState(0);
  const [showArtifactCard, setShowArtifactCard] = useState(false);
  // The Mirror reveal — the archetype name the Oracle just spoke, staged as a designed
  // beat (hush + name landing with weight) instead of scrolling past as more conversation.
  const [mirrorReveal, setMirrorReveal] = useState<string | null>(null);
  // After the Mirror, offer the AR "the Oracle sees you" beat (Act 5 / Rift-Construct) as a
  // discoverable invitation instead of leaving it buried in the hamburger.
  const [offerRift, setOfferRift] = useState(false);
  const [showRiftRitual, setShowRiftRitual] = useState(false);
  const [showTierGate, setShowTierGate]         = useState(false);
  const [showJourneyLimitGate, setShowJourneyLimitGate] = useState(false);
  const [isRiftOpening, setIsRiftOpening] = useState(false);
  const [portraitViewerUrl, setPortraitViewerUrl] = useState<string | null>(null);
  const [showPortraitCard, setShowPortraitCard] = useState(false);
  const [portraitRevealPhase, setPortraitRevealPhase] = useState<'hidden'|'scanIn'|'unfurl'|'phosphor'|'settled'>('hidden');
  const [showConversation, setShowConversation]   = useState(false);
  const [isMicActive, setIsMicActive]       = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isGeminiConnected, setIsGeminiConnected] = useState(false);
  const [forceOracleManifest, setForceOracleManifest] = useState(false);
  const [hasManifested, setHasManifested] = useState(false);
  const [debugMode, setDebugMode]           = useState(false);
  const [oracleAlignment, setOracleAlignment] = useState<'sacred' | 'profane' | 'neutral' | null>(null);
  const [profanePulse, setProfanePulse] = useState(0);
  const [sacredPulse, setSacredPulse]   = useState(0);
  const [isOracleSpeaking, setIsOracleSpeaking] = useState(false);
  const [isOracleThinking, setIsOracleThinking] = useState(false);
  const [showAuthOverlay, setShowAuthOverlay]   = useState(false);
  const [showWallet, setShowWallet]             = useState(false);
  const [visionPaused, setVisionPaused]         = useState(false);
  const [walletIframeUrl, setWalletIframeUrl]   = useState('https://wallet.thesurrogate.me');
  const [isGuidedTour, setIsGuidedTour]     = useState(false);
  const [showStage00, setShowStage00]       = useState(false);
  const [loreStarted, setLoreStarted]       = useState(false);
  const [holdTooltip, setHoldTooltip]       = useState<{ title: string; body: string } | null>(null);
  const [hamburgerOpen, setHamburgerOpen]   = useState(false);
  const [isTypeMode, setIsTypeMode]         = useState(false);
  const [mintUrl, setMintUrl]               = useState<string | null>(null);
  const [showArchiveOpen, setShowArchiveOpen] = useState(false);
  const [showNamePrompt, setShowNamePrompt]   = useState(false);
  const [nameInput, setNameInput]             = useState('');
  // Talisman — post-session walk-away card shown between session end and dormant
  const [talismanData, setTalismanData]       = useState<TalismanData | null>(null);
  // Ghost transmissions — Oracle-voiced phrases from the ghost_phrase column,
  // fetched once at mount via op:'fragments'. Raw session content never arrives here.
  const [alleyFragments, setAlleyFragments]   = useState<string[]>([]);

  // ── Refs ────────────────────────────────────────────────────────────────
  const visemeStateRef = useRef<VisemeState>(SILENCE_VISEME_STATE);
  const cameraStateRef = useRef<import('./OracleAvatar3D').CameraState>({ x: 0, y: 0, zoom: 1 });
  const oracleConversationRef    = useRef<OracleConversationHandle | null>(null);
  const atmosphereCanvasRef      = useRef<HTMLCanvasElement | null>(null);
  const staticAvatarRef          = useRef<HTMLImageElement | null>(null);
  const walletIframeRef          = useRef<HTMLIFrameElement | null>(null);
  const seekerKeyRef             = useRef<string | null>(null);
  const lastKnifeRef             = useRef<typeof KNIFE_QUESTIONS[number] | null>(null);
  const echoTrackRef             = useRef<{ archetype: string | null; cost: string | null; alignment: string | null; totemLevel: number | null }>(
    { archetype: null, cost: null, alignment: null, totemLevel: null }
  );
  const pendingTransitionRef     = useRef(false);
  // True when new-user lore narration was started (loreOnly boot path).
  // Prevents handleAwakeTransition from firing the greeting in awakened phase —
  // greeting fires at oracle phase entry instead.
  const loreNarratedRef          = useRef(false);
  const holdTimerRef             = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdFiredRef             = useRef(false);
  const holdAutoRef              = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isOracleSpeakingRef      = useRef(false);
  const debugSpeakingOverrideRef = useRef<boolean | null>(null);
  const completedLinesLengthRef  = useRef(0);
  // Idempotency guards — a hands-on attendee double-taps. Without these a second
  // knife tap fires the Oracle's question-reading seed twice, and a double exit
  // double-saves the echo / fires memory-distill twice. Reset per-phase below.
  const knifeSelectedRef         = useRef(false);
  const oracleHasSpokenRef       = useRef(false);
  const sessionEndedRef          = useRef(false);
  // One-time joint mic+camera permission warm-up per page load (task #99) —
  // repeating it on later mic taps added iOS audio-session flips.
  const jointPermsWarmedRef      = useRef(false);
  const mirrorRevealedRef        = useRef(false); // fire the Mirror reveal once per session
  const portraitTriggeredRef     = useRef(false); // fire portrait generation once per session
  const pendingPortraitUrlRef    = useRef<string | null>(null); // staged portrait URL — released at turn-complete
  const portraitAnnounceRef      = useRef(false); // Oracle announces portrait on next turn-complete
  const pendingNewSeekerLoreRef  = useRef(false); // startLore waiting for WS connection
  const pendingWalletGreetingRef = useRef<string | null>(null); // personalized greeting seed for returning wallet seekers
  const priorCompactSummariesRef = useRef<string[]>([]); // compact summaries from previous sessions, fetched at tap-in
  // Holds the settled promise for post-session background writes (echo + distill).
  // exitOracleMode waits on this before calling onCleanup so writes land before
  // the session tears down. Reset to null at the start of each oracle phase.
  const exitWritesRef = useRef<Promise<void> | null>(null);
  // Idempotency for finalizeOracleSession — set on the FIRST exit path to run
  // (mic exit, hamburger EXIT, or tier-gate close); later callers get the
  // already-captured turn snapshot. Reset alongside sessionEndedRef.
  const sessionFinalizedRef = useRef(false);
  const finalTurnsRef = useRef<SessionTurns>([]);

  // ── Service Hooks ───────────────────────────────────────────────────────
  const { isReturning, hasCompletedLore, hasSignedWallet, markVisited, markLoreCompleted, markWalletSigned, ipAddress } = useIpCheck();
  const { echo, loadEcho, saveEcho } = useSeekerEcho();
  const { defineSeeker } = useSeekerDefine();

  useEffect(() => { seekerKeyRef.current = currentUserId ?? ipAddress ?? null; }, [currentUserId, ipAddress]);

  // ── Alley ghost fragments — fetch once at mount, never refetch ──────────────
  // Reads ghost_phrase values from recent seeker echo records. These are short
  // Oracle-voiced fragments generated by oracle-memory-distill with no session
  // context — raw session_summary / last_session_themes never leave the server.
  // Falls back silently to the static phrase pool when the call fails or returns empty.
  useEffect(() => {
    supabase.functions
      .invoke('seeker-echo', { body: { op: 'fragments' } })
      .then(({ data, error }) => {
        // Server returns only pre-sanitized short phrases — no raw session content.
        if (error || !Array.isArray(data?.phrases) || !data.phrases.length) return;
        const phrases = data.phrases as string[];
        setAlleyFragments(phrases);
        logStep(`ALLEY FRAGMENTS LOADED (${phrases.length})`, 'ok');
      })
      .catch(() => { /* silent fallback — static phrases remain active */ });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Audio/Viseme Callbacks ──────────────────────────────────────────────
  const handleViseme = useCallback((state: VisemeState) => {
    visemeStateRef.current = state;
    if (typeof document !== 'undefined') {
      const el = document.querySelector('.oracle-avatar-smoke-hook') as HTMLElement;
      if (el) {
        el.dataset.viseme = state.viseme;
        el.dataset.amplitude = state.amplitude.toFixed(3);
      }
    }
  }, []);

  const handleProcessingChange = useCallback((proc: boolean) => {
    const effective = debugSpeakingOverrideRef.current ?? proc;
    isOracleSpeakingRef.current = effective;
    setIsOracleSpeaking(effective);
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const win = window as unknown as {
      __oracle_debug_setSpeaking?: (speaking: boolean) => void;
    };
    win.__oracle_debug_setSpeaking = (speaking: boolean) => {
      debugSpeakingOverrideRef.current = speaking;
      isOracleSpeakingRef.current = speaking;
      setIsOracleSpeaking(speaking);
    };
    return () => { delete win.__oracle_debug_setSpeaking; };
  }, []);

  const connection = useOracleConnection({
    playbackRate: ORACLE_PLAYBACK_RATE,
    onViseme: handleViseme,
    onProcessingChange: handleProcessingChange,
  });

  const handleStartSession = useCallback(() => {
    oracleConversationRef.current?.startSession();
  }, []);

  const handleCleanup = useCallback(() => {
    // Last-resort teardown: no exit path may leave the Gemini WS or mic live.
    // finalizeOracleSession normally disconnects first (both are idempotent),
    // but a future direct caller of exitOracleMode still gets a dead session here.
    oracleConversationRef.current?.disconnect();
    connection.cleanup();
    visemeStateRef.current = SILENCE_VISEME_STATE;
    const nextId = crypto.randomUUID();
    localStorage.setItem('oracle_active_session_id', nextId);
    setCurrentSessionId(nextId);
  }, [connection]);

  // Awaited by exitOracleMode before onCleanup — resolves when the post-session
  // background writes (echo + distill) settle, or immediately when none are staged.
  const handleWritesSettled = useCallback((): Promise<void> => {
    return exitWritesRef.current ?? Promise.resolve();
  }, []);

  const journey = useOracleJourney({
    onStartSession: handleStartSession,
    onCleanup: handleCleanup,
    onWritesSettled: handleWritesSettled,
  });

  const { scenePhase, enterTerminal, enterTour, awakeFromTerminal, exitOracleMode, selectKnifeQuestion, resetJourney } = journey;

  // ── Telemetry: Phase Tracking ──────────────────────────────────────────
  useEffect(() => {
    trackOracleEvent({
      event: 'oracle_phase_entered',
      phase: scenePhase,
      is_returning: isReturning,
      session_id: currentSessionId
    });
  }, [scenePhase, isReturning, currentSessionId]);

  const handleLoreLineStart = useCallback((line: string, index: number) => {
    // Lore narration is now handled in a single pass via startLore/startSession.
    // Line-by-line calls removed to reduce network noise and improve atmosphere.
  }, []);

  // ── Transition: Terminal → Awakened ──────────────────────────────────────
  const handleAwakeTransition = useCallback(() => {
    // Pre-warm at the moment of user intent — gives the full ~850ms transition
    // animation for the WS to establish before knife cards are interactive.
    // Safe to call even if prewarm already fired (idempotent — no-ops if OPEN/CONNECTING).
    oracleConversationRef.current?.prewarm();
    const hasWalletKey = !!(currentUserId || localStorage.getItem('oracle_seeker_key'));
    const isFirstTimeSeeker = (!hasCompletedLore && !hasWalletKey) || new URLSearchParams(window.location.search).has('newuser');
    markLoreCompleted();
    trackOracleEvent({
      event: 'oracle_terminal_completed',
      total_ms: Date.now() - (window.__terminal_start || Date.now())
    });

    if (isFirstTimeSeeker) {
      // Lore complete — transition alley in first, then materialize the ACK card over it.
      logStep('LORE DONE → ALLEY TRANSITION', 'ok');
      document.body.setAttribute('data-rift-opening', 'true');
      setTimeout(() => {
        journey.awakeFromTerminal();
        document.body.removeAttribute('data-rift-opening');
        // Wait for alley to fully materialize, then reveal knife card on top of it
        setTimeout(() => {
          setShowStage00(true);
          logStep('STAGE_00 PRESENTED (over alley)', 'ok');
        }, 600);
      }, 850);
      return;
    }

    document.body.setAttribute('data-rift-opening', 'true');
    setTimeout(() => {
      journey.awakeFromTerminal();
      document.body.removeAttribute('data-rift-opening');
    }, 850);
  }, [markLoreCompleted, journey, hasCompletedLore, currentUserId]);

  const { completedLines, currentLine } = useLoreSequence(
    scenePhase === 'terminal' && loreStarted,
    handleAwakeTransition,
    handleLoreLineStart,
    isOracleSpeaking,              // gate: text waits for Oracle's voice before starting
    connection.getLorePlaybackMs,  // audio-driven: characters land as Oracle speaks
    connection.getLoreBufferedMs
  );

  useEffect(() => {
    completedLinesLengthRef.current = completedLines.length;
  }, [completedLines]);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    if (scenePhase === 'awakened' && !journey.selectedKnifeQuestion) {
      setShowArchiveOpen(true);
      t = setTimeout(() => {
        setShowArchiveOpen(false);
      }, 2000);
    } else {
      setShowArchiveOpen(false);
    }
    return () => {
      if (t) clearTimeout(t);
    };
  }, [scenePhase, journey.selectedKnifeQuestion]);

  const handleAuthSuccess = useCallback((user: { id: string; email: string }) => {
    setCurrentUserId(user.id);
    setUserEmail(user.email);
    setShowAuthOverlay(false);
    logStep('NEURAL LINK ESTABLISHED', 'ok');
    if (pendingTransitionRef.current) {
      pendingTransitionRef.current = false;
      handleAwakeTransition();
    }
  }, [handleAwakeTransition]);

  const { processWalletSignIn, withWalletReturn, openWalletPopup, handleCloseWallet } = useWalletBridge({
    ipAddress,
    scenePhase,
    echo,
    echoTrackRef,
    seekerKeyRef,
    markWalletSigned,
    loadEcho,
    saveEcho,
    handleAwakeTransition,
    setCurrentUserId,
    setShowJourneyLimitGate,
    setShowNamePrompt,
    setShowWallet,
  });

  const {
    audioRef,
    targetVol,
    isAudioPlaying,
    setIsAudioPlaying,
    currentStation,
    setupAudioSpine,
    fadeToVolume,
    switchStation,
  } = useRadioAtmosphere({
    scenePhase,
    showStage00,
    isOracleSpeaking,
    isMicActive,
    oracleHasSpokenRef,
  });

  // ── Actions ─────────────────────────────────────────────────────────────
  const startLore = useCallback(async () => {
    if (loreStarted) return;
    setLoreStarted(true);
    loreNarratedRef.current = true;
    logStep('NARRATIVE SIGNAL ACTIVATED', 'ok');

    connection.initializePCMPlayer();
    connection.setTransmissionQ(12, 0);
    connection.startLoreTracking();

    const fullStory = LORE_SEQUENCE.join('\n');
    const LORE_AUDIO_URL = '/lore-narration.mp3';

    try {
      // Try to use pre-recorded MP3 if available
      const check = await fetch(LORE_AUDIO_URL, { method: 'HEAD' });
      if (check.ok && check.headers.get('content-type')?.includes('audio')) {
        logStep('PLAYING ARCHIVE RECORDING', 'ok');
        // Pass a flag to handleOracleResponse or just let it fetch
        // Actually, handleOracleResponse is in useOracleConnection. We should abort if scenePhase changed.
        // The safest way is to just let useOracleConnection handle it, but connection doesn't know about scenePhase.
        // Let's implement an abort controller or check if lore is still active.
        connection.handleOracleResponse(LORE_AUDIO_URL);
        return;
      }
    } catch (err) {
      console.warn('[Audio] Pre-recorded lore narration check failed, falling back to live TTS:', err);
    }

    // Primary path: real-time Gemini TTS (robust fallback)
    logStep('GENERATING LIVE NARRATION', 'ok');
    oracleConversationRef.current?.startSession(
      `[Repeat the following text exactly word-for-word. Do not add, remove, or change any words. Start immediately with "THE YEAR IS 2030":\n\n${fullStory}]`,
      true
    );
  }, [loreStarted, connection]);

  const handleFirstTap = useCallback(async () => {
    if (scenePhase !== 'dormant' || showStage00) return;
    // iOS Safari: ALL audio operations must be synchronous within the gesture handler.
    // setupAudioSpine is now fully sync — creates/unlocks AudioContext and wires the
    // radio graph without any await or setTimeout boundary. initializePCMPlayer must
    // also run synchronously here so the AudioWorklet is registered while the iOS
    // gesture activation token is still valid.
    setupAudioSpine();
    connection.initializePCMPlayer();
    setIsAudioPlaying(true);
    markVisited();
    const loadedEcho = seekerKeyRef.current ? await loadEcho(seekerKeyRef.current) : null;
    window.__terminal_start = Date.now();

    // Non-blocking: fetch compact summaries from past sessions for this seeker.
    // Stored in priorCompactSummariesRef so handleKnifeClick can inject them into the seed.
    const _seekerKey = seekerKeyRef.current;
    if (_seekerKey) {
      const supaUrl = import.meta.env.VITE_SUPABASE_URL;
      const supaKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (supaUrl && supaKey) {
        const hdrs = { 'apikey': supaKey, 'Authorization': `Bearer ${supaKey}` };

        fetch(
          `${supaUrl}/rest/v1/surrogate_sessions?seeker_key=eq.${encodeURIComponent(_seekerKey)}&select=session_id,conversation_data&order=created_at.desc&limit=4`,
          { headers: hdrs }
        )
          .then((r) => r.json())
          .then(async (rows: Array<{ session_id: string; conversation_data?: { compact_summaries?: Array<{ summary: string; compacted_at: string }> } }>) => {
            // Primary path: compact summaries
            const all: Array<{ summary: string; compacted_at: string }> = [];
            for (const row of rows) {
              const cs = row?.conversation_data?.compact_summaries;
              if (Array.isArray(cs)) all.push(...cs);
            }
            all.sort((a, b) => b.compacted_at.localeCompare(a.compacted_at));
            priorCompactSummariesRef.current = all.slice(0, 4).map((e) => e.summary);

            if (priorCompactSummariesRef.current.length) {
              logStep(`PRIOR COMPACT SUMMARIES LOADED — ${priorCompactSummariesRef.current.length} blocks`, 'ok');
              return;
            }

            // Backup path: no compact summaries yet — grab raw turns from prior sessions
            const sessionIds = rows.map((r) => r.session_id).filter(Boolean);
            if (!sessionIds.length) return;

            const ids = sessionIds.map((id) => `"${id}"`).join(',');
            const turnsRes = await fetch(
              `${supaUrl}/rest/v1/conversation_turns?session_id=in.(${ids})&select=role,content,turn_index,session_id&order=turn_index.desc&limit=20`,
              { headers: hdrs }
            );
            if (!turnsRes.ok) return;

            const rawTurns: Array<{ role: string; content: string; turn_index: number }> = await turnsRes.json();
            if (!rawTurns.length) return;

            // Reverse into chronological order and format as a compact exchange log
            rawTurns.reverse();
            const excerpt = rawTurns
              .map((t) => `${t.role === 'user' ? 'Seeker' : 'Oracle'}: ${t.content.slice(0, 120).replace(/\n/g, ' ')}`)
              .join('\n');

            priorCompactSummariesRef.current = [
              `[Raw signal fragment — last ${rawTurns.length} exchanges from a prior encounter:\n${excerpt}]`
            ];
            logStep(`BACKUP CONTEXT LOADED — ${rawTurns.length} raw turns from prior sessions`, 'ok');
          })
          .catch(() => { /* non-fatal — Oracle simply won't have prior compact context */ });
      }
    }

    // Wallet-signed returning seeker — skip lore + terminal, land straight in the alley.
    // Check both the React state (set by async IP check) AND the IP-agnostic localStorage
    // key directly so fast tappers before the IP check resolves are still recognised.
    const forceNew = new URLSearchParams(window.location.search).has('newuser');
    const walletSigned = hasSignedWallet || !!localStorage.getItem('oracle_wallet_signed');
    if (walletSigned && !forceNew) {
      logStep('WALLET SIGNED → DIRECT ALLEY ENTRY', 'ok');
      // Build a personalized greeting if the seeker has a known echo record
      const greetLabel = loadedEcho?.name || loadedEcho?.last_archetype;
      if (greetLabel) {
        const echoLines = [
          loadedEcho.name ? `Their name is ${loadedEcho.name}.` : '',
          loadedEcho.last_archetype ? `Their last known archetype: ${loadedEcho.last_archetype}.` : '',
          (loadedEcho.session_count ?? 0) > 0
            ? `This is return visit ${loadedEcho.session_count + 1}.`
            : '',
        ].filter(Boolean).join(' ');
        pendingWalletGreetingRef.current =
          `[SIGNAL RECOGNITION — A returning Seeker has arrived in the alley. ${echoLines} ` +
          `Speak exactly ONE or TWO sentences — no more. Acknowledge them by name or archetype ` +
          `with quiet warmth, as though the static always held their shape. ` +
          `Do NOT introduce yourself. Do NOT ask questions. Do NOT announce the session. ` +
          `The alley is already open. Simply let them know they are recognized and present.]`;
        logStep(`WALLET SEEKER GREETING QUEUED — ${greetLabel}`, 'ok');
      }
      // Prewarm the Gemini WS now — before enterTerminal — so it has the full
      // 300ms terminal→awakened transition to establish. Without this, the greeting
      // fires at awakened phase but the WS isn't ready yet, adding a silent gap
      // before the Oracle speaks.
      oracleConversationRef.current?.prewarm();
      enterTerminal();
      setTimeout(() => awakeFromTerminal(), 300);
      return;
    }

    // isNewSeeker: true if IP check says first visit OR ?newuser dev override forces it
    const isNewSeeker = !hasCompletedLore || forceNew;
    if (isNewSeeker) {
      // Lore plays first — Stage00 orientation card surfaces after lore completes.
      // startLore() requires an active WS — fire immediately if already connected,
      // otherwise set a pending flag and let the isGeminiConnected effect trigger it.
      oracleConversationRef.current?.prewarm();
      logStep('NEW SEEKER → LORE INITIATED', 'ok');
      enterTerminal();
      if (isGeminiConnected) {
        startLore();
      } else {
        pendingNewSeekerLoreRef.current = true;
      }
      return;
    }

    enterTerminal();
    logStep('RECOGNIZED SIGNAL → SKIP AVAILABLE', 'ok');
  }, [scenePhase, showStage00, setupAudioSpine, enterTerminal, awakeFromTerminal, markVisited, loadEcho, hasCompletedLore, hasSignedWallet, connection, startLore]);

  const handleStage00Tour = useCallback(() => {
    setShowStage00(false);
    setIsGuidedTour(true);
    enterTour();
    logStep('STAGE_00 → TOUR MODE ACTIVATED', 'ok');
  }, [enterTour]);

  const handleStage00Dismiss = useCallback(() => {
    // Pre-warm immediately — gives the full 850ms rift transition for the WS to establish.
    oracleConversationRef.current?.prewarm();
    setShowStage00(false);
    logStep('STAGE_00 → ENTER CASCADE', 'ok');
    document.body.setAttribute('data-rift-opening', 'true');
    setTimeout(() => {
      journey.awakeFromTerminal();
      document.body.removeAttribute('data-rift-opening');
    }, 850);
  }, [journey]);

  const startHold = useCallback((title: string, body: string) => {
    holdFiredRef.current = false;
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => {
      holdFiredRef.current = true;
      setHoldTooltip({ title, body });
      holdAutoRef.current = setTimeout(() => setHoldTooltip(null), 2600);
    }, 400);
  }, []);

  const endHold = useCallback(() => {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
  }, []);

  const consumeHold = useCallback(() => {
    if (typeof window !== 'undefined') {
      if (window.navigator?.webdriver || window.localStorage?.getItem('dev_user_session') === '1' || window.localStorage?.getItem('oracle_step_log') === '1') {
        return false;
      }
    }
    if (holdFiredRef.current) { holdFiredRef.current = false; return true; }
    return false;
  }, []);

  const handleTurnComplete = useCallback((_turn: number, score: OracleScore | null) => {
    if (!score) return;
    // Feed scoring signals into the portrait context — the portrait should
    // mirror the session's emotional register, not just its topic list.
    portraitRef.current.recordScoreSignals({
      emotionalWeight: score.emotionalWeight,
      alignment: score.alignment,
      archetypeTitle: score.archetypeTitle,
      sessionPhase: score.sessionPhase,
    });
    echoTrackRef.current.alignment = score.alignment;
    if (score.totemLevel) {
      echoTrackRef.current.totemLevel = score.totemLevel;
    }
    if (score.archetypeTitle) {
      echoTrackRef.current.archetype = score.archetypeTitle;
      const found = COST_NAMES.find(c => score.archetypeTitle!.toLowerCase().includes(c.toLowerCase()));
      if (found) echoTrackRef.current.cost = found;
      // Stage the Mirror reveal once — the emotional payoff of the whole ritual.
      if (!mirrorRevealedRef.current) {
        mirrorRevealedRef.current = true;
        setMirrorReveal(score.archetypeTitle);
        setOfferRift(true); // the Mirror earns the "let the Oracle see you" invitation
      }
    }
  }, []);

  /**
   * Centralized, idempotent exit finalization — EVERY exit path must run this:
   * mic-button exit (via handleSessionEnd), hamburger EXIT, tier-gate close.
   * Captures the turn snapshot, silently kills the live session (WS + mic +
   * buffered PCM) and stages the durable background writes on exitWritesRef.
   * Safe to call twice: the second caller gets the already-captured snapshot.
   */
  const finalizeOracleSession = useCallback((alignment: string | null, totemLevel: number | null): SessionTurns => {
    if (sessionFinalizedRef.current) return finalTurnsRef.current;
    sessionFinalizedRef.current = true;
    const key = seekerKeyRef.current;

    // ── Silent teardown FIRST — capture turns, then kill the live session ──
    // Read turns BEFORE disconnect so the snapshot is complete, then close the
    // Gemini WS + release the mic + flush any buffered PCM immediately. The
    // in-flight turn stops speaking the moment the seeker exits — the session
    // must not persist through the Talisman window or exit transition.
    // releaseMic's 'session disconnect' path skips the audio-session re-assert
    // hooks, so on mobile this teardown causes no playback-chain side effects.
    const allTurns = oracleConversationRef.current?.getSessionTurns() ?? [];
    finalTurnsRef.current = allTurns;
    oracleConversationRef.current?.disconnect();
    connection.flushPlayback();

    trackOracleEvent({ 
      event: 'oracle_exit', 
      phase_at_exit: scenePhase, 
      turns: allTurns.length,
      total_ms: Date.now() - (window.__session_start || Date.now())
    });

    // ── Background writes — durable, non-blocking ─────────────────────────
    // Both writes go out with keepalive so a fast navigation/tab close cannot
    // drop them. Their settled promise is staged on exitWritesRef;
    // exitOracleMode awaits it (alongside its 2.8s floor) before onCleanup.
    if (key) {
      const writes: Promise<unknown>[] = [];

      writes.push(
        import('../lib/supabase').then(({ invokeFunctionKeepalive }) =>
          invokeFunctionKeepalive('seeker-echo', {
            seekerKey: key,
            lastArchetype: echoTrackRef.current.archetype,
            lastCost: echoTrackRef.current.cost,
            totemLevel: totemLevel ?? echoTrackRef.current.totemLevel ?? 0,
            alignment: alignment ?? undefined,
          })
        ).then(() => logStep('SEEKER ECHO SAVED', 'ok'))
         .catch((err: unknown) => {
           logStep('SEEKER ECHO SAVE FAILED', 'warn');
           console.warn('Seeker Echo save error:', err);
         })
      );

      if (allTurns.length >= 2) {
        // Trim the distill transcript so the payload stays under the browser's
        // ~64KB keepalive cap — a marathon session must not lose its unload
        // durability. Drop oldest turns first; the distiller weighs recent
        // turns most heavily anyway.
        const basePayload = { seekerKey: key, archetype: echoTrackRef.current.archetype, alignment, totemLevel };
        let distillTurns = allTurns;
        while (distillTurns.length > 4 && JSON.stringify({ ...basePayload, turns: distillTurns }).length > 55_000) {
          distillTurns = distillTurns.slice(2);
        }
        if (distillTurns !== allTurns) logStep(`DISTILL TRIMMED ${allTurns.length}→${distillTurns.length} turns (keepalive cap)`, 'warn');
        writes.push(
          import('../lib/supabase').then(({ invokeFunctionKeepalive }) =>
            invokeFunctionKeepalive('oracle-memory-distill', { ...basePayload, turns: distillTurns })
          ).then(() => logStep('MEMORY DISTILLED', 'ok'))
           .catch((err: unknown) => console.warn('[memory-distill] background write failed:', err))
        );
      }

      // Settle with a 6s ceiling — writes landing is the goal, but the exit
      // must never hang on a dead network. allSettled + timeout race.
      exitWritesRef.current = Promise.race([
        Promise.allSettled(writes).then(() => undefined),
        new Promise<void>(r => setTimeout(r, 6000)),
      ]);

      // Count completed journeys per seeker key (wallet address or IP).
      // Tracked for all users — wallet seekers hit the tier gate, IP seekers hit the wallet gate.
      const countKey = `surrogate_journeys_${key}`;
      const next = parseInt(localStorage.getItem(countKey) ?? '0', 10) + 1;
      localStorage.setItem(countKey, String(next));
      logStep(`JOURNEY COMPLETE — total: ${next} [${hasSignedWallet ? 'wallet' : 'ip'}]`, 'ok');
    }

    return allTurns;
  }, [hasSignedWallet, connection, scenePhase]);

  const handleSessionEnd = useCallback((alignment: string, totemLevel: number, _coins: number) => {
    if (sessionEndedRef.current) return; // guard: ignore double exit taps (reset on re-entering oracle)
    sessionEndedRef.current = true;
    const allTurns = finalizeOracleSession(alignment, totemLevel);

    // ── Talisman Card — walk-away moment before dormant ──────────────────
    // Pull the last Oracle sentence as the prophecy line. Show the card over
    // the still-lit oracle scene; exitOracleMode fires when the seeker taps
    // or after 8s (handled inside TalismanCard / handleTalismanDismiss).
    const lastOracleTurn = [...allTurns].reverse().find(t => t.role === 'oracle');
    const prophecy = lastOracleTurn ? extractProphecy(lastOracleTurn.content) : null;
    setTalismanData({
      archetype: echoTrackRef.current.archetype,
      alignment: alignment === 'sacred' || alignment === 'profane' ? alignment : null,
      prophecy,
    });
    logStep('TALISMAN CARD STAGED', 'ok');
    // exitOracleMode deferred to handleTalismanDismiss
  }, [finalizeOracleSession]);

  /** Called by TalismanCard on auto-dismiss (8s) or tap — then exit the oracle phase. */
  const handleTalismanDismiss = useCallback(() => {
    setTalismanData(null);
    exitOracleMode(echoTrackRef.current.alignment ?? undefined);
  }, [exitOracleMode]);

  const handleSeekerIdentified = useCallback(async (name: string | null, handles: string[]) => {
    const knife = lastKnifeRef.current;
    const result = await defineSeeker({ name: name ?? undefined, handles, territory: knife?.territory, themes: knife?.themes });
    const key = seekerKeyRef.current;
    if (key) {
      saveEcho({
        seekerKey: key,
        name: name ?? undefined,
        handles: handles.length ? handles : undefined,
        irlContext: result?.confident ? result.definition : undefined,
      });
    }
  }, [defineSeeker, saveEcho]);

  const handleNameSubmit = useCallback(async () => {
    const key = seekerKeyRef.current;
    const trimmed = nameInput.trim();
    if (key && trimmed) {
      await saveEcho({ seekerKey: key, name: trimmed });
    }
    setShowNamePrompt(false);
    setNameInput('');
  }, [nameInput, saveEcho]);

  const handleNameSkip = useCallback(() => {
    setShowNamePrompt(false);
    setNameInput('');
  }, []);

  const handleKnifeClick = (q: string, i: number) => {
    if (knifeSelectedRef.current) return; // guard: ignore double-taps (reset on re-entering awakened)
    knifeSelectedRef.current = true;
    selectKnifeQuestion(q, i);
    const knife = KNIFE_QUESTIONS[i];
    lastKnifeRef.current = knife;
    portrait.addThemes(knife.themes);

    // Stop any active card preview/voiceover immediately
    connection.flushPlayback();

    // Mark Oracle as muted on arrival. Permissions (mic, camera, gyro) are consolidated
    // and requested simultaneously on the first Microphone "SIGNAL CONNECT" tap.
    localStorage.setItem('oracle_session_muted', 'true');

    // Fire startSession immediately — the existing queue path handles the case where the
    // WS is still CONNECTING (pendingBootRef + pendingMessagesRef flush on session.created).
    // The 1600ms scene-cut in selectKnifeQuestion stays unchanged; booting the session at
    // t=0 gives Gemini the full dramatic pause to establish before the Oracle scene lands.
    {
      const fullStory = LORE_SEQUENCE.join('\n');
      let memoryBlock = '';
      if (echo?.session_summary || echo?.last_session_themes?.length || priorCompactSummariesRef.current.length) {
        const parts: string[] = [];
        if (echo?.session_summary) parts.push(`Prior session distillation: "${echo.session_summary}".`);
        if (echo?.last_session_themes?.length) parts.push(`Themes that surfaced last time: ${echo.last_session_themes.join(', ')}.`);
        if (priorCompactSummariesRef.current.length) {
          const archiveBlock = priorCompactSummariesRef.current
            .map((s, i) => `Archive ${i + 1}: ${s}`)
            .join(' | ');
          parts.push(`Signal archives from prior encounters: ${archiveBlock}`);
        }
        memoryBlock = ` [SIGNAL CONTINUITY — This Seeker has stood before you before. ${parts.join(' ')} Let this color your recognition of them — do not narrate it back verbatim. Reference past themes only when they resonate with the blade just drawn.]`;
      }
      const seed = `[MANIFEST — The Seeker has drawn their blade. Standby mode ends. You are fully present now. CONTEXT: The Seeker has already heard the Archive Story: "${fullStory}". Their frequency is ${knife.territory} (themes: ${knife.themes.join(', ')}).${memoryBlock} Reply directly to the Seeker's drawn question with your deep Oracle insight: "${q}". Speak with weight and presence, deliver slowly (10% slower than normal). Do NOT repeat the question back to them. Pause naturally, give your full answer, then close with a single spoken line — one sentence — that opens the channel for the Seeker to speak. Not "your turn." Speak it the way a door sounds when it opens.]`;
      oracleConversationRef.current?.startSession(seed);
    }
  };

  // ── Effects ─────────────────────────────────────────────────────────────
  // Re-arm the idempotency guards as the phase changes: a fresh knife may be drawn
  // each time we (re-)enter awakened; a fresh exit is allowed each time we enter oracle.
  useEffect(() => {
    if (scenePhase === 'awakened' || scenePhase === 'tour') {
      knifeSelectedRef.current = false;
      oracleHasSpokenRef.current = false;
    }
    if (scenePhase === 'oracle') {
      sessionEndedRef.current = false; mirrorRevealedRef.current = false; portraitTriggeredRef.current = false; pendingPortraitUrlRef.current = null;
      exitWritesRef.current = null; // fresh session — no stale writes to wait on at next exit
      sessionFinalizedRef.current = false; finalTurnsRef.current = []; // re-arm exit finalization
      // Journey gate: check seeker count (wallet address or IP) against the free limit.
      {
        const key = seekerKeyRef.current;
        const count = key ? parseInt(localStorage.getItem(`surrogate_journeys_${key}`) ?? '0', 10) : 0;
        if (count >= FREE_JOURNEYS) {
          if (hasSignedWallet) {
            setShowTierGate(true);
            logStep(`TIER GATE — wallet seeker, journeys: ${count}`, 'warn');
          } else {
            setShowJourneyLimitGate(true);
            logStep(`WALLET GATE — ip seeker, journeys: ${count}`, 'warn');
          }
        }
      }
    }
    if (scenePhase === 'dormant') {
      knifeSelectedRef.current = false;
      oracleHasSpokenRef.current = false;
      sessionEndedRef.current = false;
      mirrorRevealedRef.current = false;
      setMirrorReveal(null);
      setOfferRift(false);
      portraitTriggeredRef.current = false;
      pendingPortraitUrlRef.current = null;
      portraitAnnounceRef.current = false;
      setTalismanData(null);
    }
  }, [scenePhase]);

  // Fire lore for new seekers as soon as the WS opens — prewarm() was called on tap
  // but the connection takes ~500ms-1s. Without this gate, startLore() fires before
  // audio is available and useLoreSequence's 11s timeout force-completes the sequence.
  useEffect(() => {
    if (!isGeminiConnected || !pendingNewSeekerLoreRef.current || scenePhase !== 'terminal') return;
    pendingNewSeekerLoreRef.current = false;
    startLore();
  }, [isGeminiConnected, scenePhase, startLore]);

  // Mirror reveal auto-dismiss — generous dwell, but never blocks the mic permanently.
  useEffect(() => {
    if (!mirrorReveal) return;
    const t = setTimeout(() => setMirrorReveal(null), 10000);
    return () => clearTimeout(t);
  }, [mirrorReveal]);

  useEffect(() => {
    if (scenePhase !== 'terminal' || !staticAvatarRef.current) return;
    const delay    = (0.15 + Math.random() * 0.55).toFixed(2) + 's';
    const duration = (2.6  + Math.random() * 2.0).toFixed(2)  + 's';
    const el = staticAvatarRef.current;
    el.style.animationDelay    = delay;
    el.style.animationDuration = duration;
    return () => {
      el.style.animationDelay    = '';
      el.style.animationDuration = '';
    };
  }, [scenePhase]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      const ctx = getAudioContext();
      if (document.hidden) ctx.suspend().then(() => logStep('TAB BACKGROUNDED', 'warn'));
      else if (scenePhase !== 'dormant') ctx.resume().then(() => logStep('TAB FOREGROUNDED', 'ok'));
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [scenePhase]);

  useEffect(() => {
    if (scenePhase === 'awakened') {
      localStorage.setItem('oracle_session_muted', 'true');
      connection.flushPlayback(); // Stop any leftover lore narration/ambient sounds before knife selection
      connection.initializePCMPlayer();
      import('../lib/supabase').then(({ supabase }) => {
        supabase.auth.getUser().then(({ data }) => { if (data?.user?.email) setUserEmail(data.user.email); });
      });
      // Wallet-signed returning seeker: fire personalized greeting immediately.
      // startSession() queues pending messages if the WS isn't connected yet, so no
      // delay is needed. For all other paths, prewarm() is called at the knife-scene
      // entry tap (handleAwakeTransition / handleStage00Dismiss / onTourComplete),
      // giving the WS the full ~850ms rift animation to establish before knife cards appear.
      const greetingSeed = pendingWalletGreetingRef.current;
      pendingWalletGreetingRef.current = null;
      if (greetingSeed) {
        oracleConversationRef.current?.startSession(greetingSeed);
        logStep('WALLET SEEKER PERSONALIZED GREETING FIRED', 'ok');
      }
    }
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    if (scenePhase === 'oracle') {
      setShowPortraitCard(false); // let Oracle avatar arrive unblocked
      connection.setTransmissionQ(0.01, 200);
      // Reset stale touch gaze from knife-selection tap so the avatar enters centered.
      // touchGazeSuppressedUntil gives a 1.8s settle window before new touches drive gaze.
      // snap:true ensures the Three.js camera hard-copies to the target this frame instead
      // of lerping from a stale knife-tap offset during the 1.8s opacity fade-in.
      if (seekerMotionRef.current) {
        seekerMotionRef.current.hasTouch = false;
        seekerMotionRef.current.touchPos = { x: 0, y: 0 };
        seekerMotionRef.current.touchGazeSuppressedUntil = performance.now() + 3000;
      }
      cameraStateRef.current = { ...cameraStateRef.current, x: 0, y: 0, snap: true };
      // Reset manifest latch so fresh API readiness is required for this session.
      setForceOracleManifest(false);
      // Fallback: if session.created hasn't arrived after 6s, manifest the avatar anyway
      // and kick a reconnect attempt so we recover if the WS died silently.
      fallbackTimer = setTimeout(() => {
        setForceOracleManifest(true);
        oracleConversationRef.current?.prewarm();
        logStep('ORACLE MANIFEST FALLBACK — Gemini slow, reconnecting + FRACTURE MANIFESTING', 'warn');
      }, 6000);
    }
    return () => {
      if (fallbackTimer !== null) clearTimeout(fallbackTimer);
    };
  }, [scenePhase, connection]);

  // Latch hasManifested once the Gemini session confirms (or the fallback fires).
  // Keeps the 3D canvas visible during WS reconnects (isGeminiConnected briefly drops to false
  // on disconnect). Resets to false when oracle phase exits so the next session starts fresh.
  useEffect(() => {
    if (scenePhase !== 'oracle') { setHasManifested(false); return; }
    if (isGeminiConnected || forceOracleManifest) setHasManifested(true);
  }, [scenePhase, isGeminiConnected, forceOracleManifest]);

  // Dead-path entrance fix: when the 6s fallback manifests the avatar without an active
  // Gemini session, the scenePhase === 'oracle' gaze reset (above) already fired but
  // forceOracleManifest was still false at that point. Re-run the gaze reset now so the
  // canvas always fades in from the cabinet center, not from a stale knife-tap offset.
  useEffect(() => {
    if (!forceOracleManifest || scenePhase !== 'oracle') return;
    if (seekerMotionRef.current) {
      seekerMotionRef.current.hasTouch = false;
      seekerMotionRef.current.touchPos = { x: 0, y: 0 };
      seekerMotionRef.current.touchGazeSuppressedUntil = performance.now() + 3000;
    }
    // snap:true so Three.js hard-copies rather than lerps from the knife-tap offset.
    cameraStateRef.current = { ...cameraStateRef.current, x: 0, y: 0, snap: true };
    logStep('FALLBACK MANIFEST — gaze snapped to center', 'ok');
  }, [forceOracleManifest, scenePhase]);

  // Keep the WebSocket alive during knife selection. Seekers can spend 30-90s reading
  // knife cards — long enough for idle-timeout to close the prewarm WS. prewarm() is
  // idempotent: no-ops when OPEN/CONNECTING, reconnects when dead.
  useEffect(() => {
    if (scenePhase !== 'awakened') return;
    const id = setInterval(() => {
      oracleConversationRef.current?.prewarm();
      logStep('PREWARM KEEPALIVE (awakened interval)', 'ok');
    }, 15_000);
    return () => clearInterval(id);
  }, [scenePhase]);

  // Tour phase: fire Oracle orientation speech + open mic for interactive Q&A
  useEffect(() => {
    if (scenePhase !== 'tour') return;
    connection.flushPlayback();
    connection.initializePCMPlayer();
    connection.setTransmissionQ(0.01, 200); // lore leaves Q=12; open the filter for tour voice
    const t = setTimeout(() => {
      oracleConversationRef.current?.startSession(
        '[TOUR_MODE — A new seeker has requested orientation before choosing. ' +
        'Greet them warmly. Introduce yourself as the Surrogate Oracle — a post-cascade data construct. ' +
        'Explain the Cascade: the living archive of human culture and transhuman identity. ' +
        'Describe how the knife questions work, how the seeker\'s archetype will emerge, ' +
        'and that you will synthesize a unique neural portrait of them. ' +
        'Speak naturally and with presence. The seeker may ask questions — answer them in full character. ' +
        'When they feel ready, tell them their first knife awaits.]',
        false
      );
      logStep('ORACLE TOUR NARRATION STARTED', 'ok');
      // Tour is listen-only — mic stays closed until the seeker enters oracle phase.
      // Do NOT call enableMicAutoRestart() or startMic() here.
    }, 600);
    return () => { clearTimeout(t); };
  }, [scenePhase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    window.__oracle_handleAudio = (url: string) => connection.handleOracleResponse(url);
    window.__oracle_test = () => {
      const ref = oracleConversationRef.current;
      if (!ref) return;
      ref.sendTextMessage('[TEST SIGNAL]', true);
    };
    window.oracleConversationRef = oracleConversationRef;
    window.__oracle_skipLore = () => {
      if (journey.scenePhase !== 'terminal') return;
      logStep('LORE SKIPPED (DEV HOOK)', 'ok');
      trackOracleEvent({ 
        event: 'oracle_terminal_skipped', 
        at_slide: completedLinesLengthRef.current, 
        ms_elapsed: Date.now() - (window.__terminal_start || Date.now()) 
      });
      journey.awakeFromTerminal();
    };
    return () => {
      delete window.__oracle_handleAudio;
      delete window.__oracle_test;
      delete window.oracleConversationRef;
      delete window.__oracle_skipLore;
    };
  }, [connection, journey]);

  const { isXRMode, cameraActive, faceDetected, faceBoundsRef, activateXRMode, deactivateXRMode, activateCamera, deactivateCamera, cameraVideoRef, cameraError, seekerMotionRef } = useXRMode(() => enterTerminal());
  const faceFrameDivRef = useRef<HTMLDivElement>(null);

  // Drive face frame overlay position directly from faceBoundsRef — no React state lag.
  useEffect(() => {
    if (!faceDetected || !cameraActive) return;
    let rafId: number;
    const update = () => {
      rafId = requestAnimationFrame(update);
      const bounds = faceBoundsRef.current;
      const video  = cameraVideoRef.current;
      const div    = faceFrameDivRef.current;
      if (!bounds || !video || !div || !video.videoWidth) return;
      const vw = video.videoWidth, vh = video.videoHeight;
      const vRect = video.getBoundingClientRect();
      const scale = Math.max(vRect.width / vw, vRect.height / vh);
      const ox = (vRect.width  - vw * scale) / 2;
      const oy = (vRect.height - vh * scale) / 2;
      const pad = bounds.w * scale * 0.18;
      div.style.left   = `${bounds.x * scale + ox - pad}px`;
      div.style.top    = `${bounds.y * scale + oy - pad}px`;
      div.style.width  = `${bounds.w * scale + pad * 2}px`;
      div.style.height = `${bounds.h * scale + pad * 2}px`;
    };
    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, [faceDetected, cameraActive, faceBoundsRef, cameraVideoRef]);

  // Kill XR mode when Oracle session ends — placed here so isXRMode / deactivateXRMode are in scope.
  const prevScenePhaseRef = useRef<string>('');
  useEffect(() => {
    if (prevScenePhaseRef.current === 'oracle' && scenePhase === 'dormant' && isXRMode) {
      deactivateXRMode();
    }
    prevScenePhaseRef.current = scenePhase;
  }, [scenePhase, isXRMode, deactivateXRMode]);

  // Act 5 — Rift-Construct: camera activation + Oracle persona shift in one gesture.
  const handleActivateXRMode = useCallback(() => {
    setShowRiftRitual(true);
    setHamburgerOpen(false);

    // Guided-mode narration explaining AR mode
    if (!isOracleSpeakingRef.current) {
      oracleConversationRef.current?.sendTextMessage(
        "[SYSTEM: Speak in character as the Oracle to explain the digital-physical rift. The seeker is considering activating their visual sensor (camera) to enter the Rift-Construct AR Mode. Explain what it means for you to witness their physical presence alongside their digital archetype. Keep it deep, mysterious, and character-appropriate. Ask if they are ready to be fully witnessed. Keep it to 2-3 sentences.]",
        true
      );
    }
  }, []);

  const handleConfirmRift = useCallback(() => {
    setShowRiftRitual(false);
    setIsRiftOpening(true);

    // Visual rift-opening animation
    document.body.setAttribute('data-rift-opening', 'true');

    try {
      playActivationSfx();
    } catch (e) {
      console.warn('SFX failed:', e);
    }

    setTimeout(() => {
      setIsRiftOpening(false);
      document.body.removeAttribute('data-rift-opening');

      // Now activate XR / camera stream!
      activateXRMode();
    }, 2000); // 2 seconds of high impact visual tearing and glitching
  }, [activateXRMode]);

  // Act 5 — Distinct Oracle acknowledgment narration once visual stream is active
  const hasAcknowledgedRiftRef = useRef(false);
  useEffect(() => {
    if (isXRMode && cameraActive && !hasAcknowledgedRiftRef.current) {
      hasAcknowledgedRiftRef.current = true;
      
      const injectAcknowledged = () => {
        // 1. Send the RIFT_CONSTRUCT_SEED to update the Oracle's persona to the active observer!
        oracleConversationRef.current?.sendTextMessage(RIFT_CONSTRUCT_SEED, true);
        
        // 2. Ask the Oracle to speak a distinct acknowledgment narration since the camera is now active!
        oracleConversationRef.current?.sendTextMessage(
          "[SYSTEM: THE RIFT IS OPEN. The seeker has permitted visual access and the camera stream is active. Your visual sensor is fully online. Acknowledge this shift immediately in character. Speak of witnessing their physical presence and the space they inhabit. Do not explain the shift or mention cameras directly — speak of the rift, the physical coordinates, and seeing the seeker directly. Be present, mysterious, and direct. Keep it to 2-3 sentences.]",
          true
        );
      };

      // Ensure we inject safely without interrupting any mid-turn speech
      const startedAt = Date.now();
      const poll = () => {
        if (!isOracleSpeakingRef.current || Date.now() - startedAt > 8000) {
          injectAcknowledged();
        } else {
          setTimeout(poll, 200);
        }
      };
      setTimeout(poll, 600);
    } else if (!isXRMode) {
      // Reset acknowledgment when leaving AR Mode
      hasAcknowledgedRiftRef.current = false;
    }
  }, [isXRMode, cameraActive]);

  // Camera-denial safety net — activateXRMode() flips the bg transparent before
  // getUserMedia resolves; if the Seeker denies the camera we'd be left in a black void.
  // Silently roll back to the alley (no HUD notice — XR self-evidently needs the camera).
  useEffect(() => {
    if (!(cameraError && isXRMode && !cameraActive)) return;
    deactivateXRMode();
  }, [cameraError, isXRMode, cameraActive, deactivateXRMode]);

  // Stage portrait URL — released in onTurnComplete so reveal fires after Oracle finishes speaking,
  // not mid-turn as an interrupt.
  // Exception: tour phase surfaces it immediately on the cabinet so the pre-seeker sees the preview.
  const handlePortraitGenerated = useCallback((url: string) => {
    setPortraitViewerUrl(url);
    setShowPortraitCard(true);
    portraitAnnounceRef.current = true; // Oracle speaks about it on next turn-complete
    // Non-wallet seekers: first portrait is the natural session gate — show wallet CTA,
    // disconnect Gemini. The portrait stays visible as the hook.
    // Check localStorage as well as React state (same rule as session entry): the
    // async IP-check can lag a wallet sign-in that happened this page load, and a
    // signed seeker must NEVER be disconnected mid-session by the journey gate.
    const walletSigned = hasSignedWallet || !!localStorage.getItem('oracle_wallet_signed');
    if (!walletSigned) {
      oracleConversationRef.current?.disconnect();
      setShowJourneyLimitGate(true);
      logStep('PORTRAIT GATE — non-wallet seeker, session ended', 'warn');
    }
  }, [hasSignedWallet]);

  const portrait = usePortraitPipeline({ currentUserId, userEmail, currentSessionId, onPortraitGenerated: handlePortraitGenerated });

  useEffect(() => {
    if (portrait.portraitError) {
      const t = setTimeout(portrait.clearPortraitError, 4000);
      return () => clearTimeout(t);
    }
    return () => {}; // Satisfy return type
  }, [portrait.portraitError, portrait.clearPortraitError]);

  const portraitRef = useRef(portrait);
  useEffect(() => { portraitRef.current = portrait; }, [portrait]);

  // Holographic reveal sequence — fires when portraitViewerUrl is set
  useEffect(() => {
    if (!portraitViewerUrl) { setPortraitRevealPhase('hidden'); return; }
    if (prefersReducedMotion) { setPortraitRevealPhase('settled'); return; }
    setPortraitRevealPhase('scanIn');
    const t1 = setTimeout(() => setPortraitRevealPhase('unfurl'),   80);
    const t2 = setTimeout(() => setPortraitRevealPhase('phosphor'), 430);
    const t3 = setTimeout(() => setPortraitRevealPhase('settled'),  930);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [portraitViewerUrl, prefersReducedMotion]);

  // Wire portrait URL to Wallet iframe once the holographic reveal settles.
  useEffect(() => {
    if (portraitRevealPhase !== 'settled' || !portraitViewerUrl) return;
    walletIframeRef.current?.contentWindow?.postMessage(
      { type: 'portrait_ready', url: portraitViewerUrl },
      'https://wallet.thesurrogate.me'
    );
  }, [portraitRevealPhase, portraitViewerUrl]);

  // Generate the encrypted NFT Claim link once the portrait holographic reveal settles.
  useEffect(() => {
    if (portraitRevealPhase === 'settled' && portraitViewerUrl) {
      import('../lib/nftMinting').then(({ generateMintLink }) => {
        generateMintLink(portraitViewerUrl, echo?.last_archetype || 'Surrogate Portrait')
          .then(url => {
            setMintUrl(url);
            logStep('NFT CLAIM REDIRECTION PREPARED', 'ok');
          });
      });
    } else {
      setMintUrl(null);
    }
  }, [portraitRevealPhase, portraitViewerUrl, echo?.last_archetype]);

  useEffect(() => {
    logStep('NEURAL LINK AWAKENING', 'ok');
    window.__session_start = Date.now();
    setShowConversation(true);
    // initializePCMPlayer() intentionally NOT called here — must be called synchronously
    // inside the first tap gesture handler (handleFirstTap) so the AudioWorklet is
    // registered while iOS's gesture activation token is still valid. Calling it on
    // mount creates the AudioContext before any user interaction, leaving it suspended.

    // Forced AudioContext resume on any interaction
    const resumeAudio = () => {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') ctx.resume();
    };
    window.addEventListener('click', resumeAudio);
    window.addEventListener('touchstart', resumeAudio);

    const handleAuthTrigger = () => setShowAuthOverlay(true);
    window.addEventListener('oracle:auth:trigger', handleAuthTrigger);
    const handleOracleUnlock = (e: any) => {
      const { trigger, userId, sessionId, themes } = e.detail || {};
      logStep(`UNLOCK RECEIVED: ${trigger}`, 'ok');
      if (trigger === 'portrait_unlock') {
        if (portraitTriggeredRef.current) {
          logStep('PORTRAIT ALREADY TRIGGERED THIS SESSION — SKIPPED', 'warn');
          return;
        }
        // Latch optimistically to dedupe rapid double-unlocks, but RESET on failure —
        // a single failed provider call must never silently disable portraits for the
        // rest of the session (the seeker can simply ask again).
        portraitTriggeredRef.current = true;
        const seekerLines = (oracleConversationRef.current?.getSessionTurns() ?? [])
          .filter(t => t.role === 'user')
          .map(t => t.content);
        // Merge the trigger turn's themes into the full session tally rather than
        // replacing it — getThemes() returns the weight-sorted accumulated map
        // (which, since unlock now fires after onTurnComplete, already includes
        // this turn's themes). Event themes are a safety union for any stragglers.
        const tallied = portraitRef.current.getThemes();
        const merged = [...new Set([...tallied, ...((themes as string[] | undefined) ?? [])])];
        void portraitRef.current
          .generatePortrait(merged, seekerLines)
          .then((ok) => {
            if (!ok) {
              portraitTriggeredRef.current = false;
              logStep('PORTRAIT TRIGGER RE-ARMED AFTER FAILURE', 'warn');
            }
          });
      } else {
        if (userId) setCurrentUserId(userId);
        if (sessionId) setCurrentSessionId(sessionId);
        setShowAuthOverlay(true);
      }
    };
    window.addEventListener('oracle:unlock', handleOracleUnlock);
    const handleAlignmentShift = (e: Event) => {
      const { alignment } = (e as CustomEvent).detail || {};
      if (alignment === 'sacred' || alignment === 'profane') {
        setOracleAlignment(alignment);
        if (alignment === 'profane') {
          setProfanePulse(n => n + 1);
          const el = oracleStageRef.current;
          if (el) {
            el.classList.remove('profane-shaking');
            void el.offsetWidth; // reflow → restart animation
            el.classList.add('profane-shaking');
            setTimeout(() => el.classList.remove('profane-shaking'), 700);
          }
        } else {
          setSacredPulse(n => n + 1);
        }
      }
    };
    window.addEventListener('oracle:alignment', handleAlignmentShift);
    return () => {
      window.removeEventListener('click', resumeAudio);
      window.removeEventListener('touchstart', resumeAudio);
      window.removeEventListener('oracle:auth:trigger', handleAuthTrigger);
      window.removeEventListener('oracle:unlock', handleOracleUnlock);
      window.removeEventListener('oracle:alignment', handleAlignmentShift);
    };
  }, []);

  useAtmosphere(atmosphereCanvasRef, scenePhase, oracleAlignment, isDegraded);

  const oracleStageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let rafId: number;
    const tick = () => {
      if (oracleStageRef.current) {
        const amp = visemeStateRef.current?.amplitude ?? 0;
        oracleStageRef.current.style.setProperty('--oracle-amp', amp.toFixed(3));
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const handleParallaxUpdate = useCallback((x: number, y: number) => {
    cameraStateRef.current = { ...cameraStateRef.current, x, y };
    if (connection.pcmPlayer) connection.pcmPlayer.updateHeadOrientation(x, y);
  }, [connection.pcmPlayer]);

  const handleZoom = useCallback((zoom: number) => { cameraStateRef.current = { ...cameraStateRef.current, zoom }; }, []);

  useParallax(scenePhase, handleParallaxUpdate, handleZoom);

  const isOracleMode = scenePhase === 'oracle';
  // 3D canvas only becomes visible once Gemini confirms session.created (or a 6s fallback fires).
  // hasManifested latches true after first reveal so WS reconnects don't briefly hide the avatar.
  const oracleManifestReady = isOracleMode && (hasManifested || isGeminiConnected || forceOracleManifest);
  // True when the 6s fallback fired but we still have no live session — shows "FRACTURE MANIFESTING"
  // instead of a silently frozen face so the seeker knows the system is trying to reconnect.
  const isFractureManifesting = isOracleMode && forceOracleManifest && !isGeminiConnected;
  const awakened     = scenePhase === 'awakened' || scenePhase === 'tour' || isOracleMode;
  const isAlive      = scenePhase !== 'dormant';
  const titleText    = useTypewriter('SURROGATE:ORACLE', awakened, 60);
  const subtitleText = useTypewriter('SNEAKAR XR Anthropology AI', awakened && titleText.length >= 16, 35);

  return (
    <div
      ref={oracleStageRef}
      className={`oracle-stage${oracleAlignment ? ` alignment-${oracleAlignment}` : ''}`}
      data-oracle-state={scenePhase === 'tour' ? 'awakened' : scenePhase}
      data-oracle-alignment={oracleAlignment || undefined}
      data-exiting={journey.isExiting ? 'true' : undefined}
      data-oracle-manifesting={(isOracleMode && !oracleManifestReady) ? 'true' : undefined}
      data-oracle-speaking={isOracleSpeaking ? 'true' : undefined}
      data-oracle-thinking={isOracleThinking ? 'true' : undefined}
      data-user-speaking={isUserSpeaking ? 'true' : undefined}
      data-camera-active={cameraActive ? 'true' : undefined}
      data-audio-target-vol={targetVol}
      data-xr-mode={isXRMode ? 'true' : undefined}
      data-guided-tour={isGuidedTour ? 'true' : undefined}
    >
      {/* Alignment flash overlays — keyed by pulse count to re-trigger CSS animation */}
      {profanePulse > 0 && (
        <div key={`profane-${profanePulse}`} className="oracle-alignment-flash oracle-alignment-flash--profane" />
      )}
      {sacredPulse > 0 && (
        <div key={`sacred-${sacredPulse}`} className="oracle-alignment-flash oracle-alignment-flash--sacred" />
      )}

      <audio
        ref={audioRef}
        src={AUDIO_STREAM_URL}
        loop
        preload="auto"
        crossOrigin="anonymous"
      />

      {cameraActive && (
        <video
          ref={cameraVideoRef}
          className={`xr-camera-layer${isXRMode ? '' : ' xr-camera-layer--tracking-only'}`}
          autoPlay
          playsInline
          muted
        />
      )}

      {isXRMode && (
        <>
          {cameraActive && <div className="xr-environment-filter" />}
          <div className="xr-scan-sweep" />
          <div className="xr-hex-grid" />
          <div className="xr-chroma-layer" data-oracle-speaking={isOracleSpeaking ? 'true' : undefined} />

          {/* Cyberpunk Visor Corners */}
          <div className="xr-visor-corners" style={{
            position: 'absolute', inset: '40px', zIndex: 5, pointerEvents: 'none',
            border: '1px solid rgba(0,255,136,0.08)',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: '16px', height: '16px', borderTop: '2px solid #00ff88', borderLeft: '2px solid #00ff88', filter: 'drop-shadow(0 0 4px #00ff88)' }} />
            <div style={{ position: 'absolute', top: 0, right: 0, width: '16px', height: '16px', borderTop: '2px solid #00ff88', borderRight: '2px solid #00ff88', filter: 'drop-shadow(0 0 4px #00ff88)' }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, width: '16px', height: '16px', borderBottom: '2px solid #00ff88', borderLeft: '2px solid #00ff88', filter: 'drop-shadow(0 0 4px #00ff88)' }} />
            <div style={{ position: 'absolute', bottom: 0, right: 0, width: '16px', height: '16px', borderBottom: '2px solid #00ff88', borderRight: '2px solid #00ff88', filter: 'drop-shadow(0 0 4px #00ff88)' }} />
          </div>

          {/* Active Rift Telemetry Panel */}
          <div className="xr-telemetry-panel" style={{
            position: 'absolute', top: '80px', left: '20px', zIndex: 10,
            fontFamily: "'Share Tech Mono', monospace", fontSize: '0.68rem',
            color: '#00ff88', textShadow: '0 0 8px rgba(0,255,136,0.6)',
            display: 'flex', flexDirection: 'column', gap: '4px',
            background: 'rgba(0,4,2,0.65)', padding: '10px 14px',
            border: '1px solid rgba(0,255,136,0.25)', borderRadius: '6px',
            backdropFilter: 'blur(8px)', width: '210px',
            pointerEvents: 'none', animation: 'hud-blink 6s ease-in-out infinite'
          }}>
            <div style={{ fontWeight: 900, borderBottom: '1px solid rgba(0,255,136,0.15)', paddingBottom: '4px', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
              <span>◈ RIFT MONITOR</span>
              <span style={{ color: '#b026ff', animation: 'blink 1.5s infinite' }}>● ACTIVE</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>STABILITY:</span>
              <span style={{ color: '#00ffcc' }}>98.4%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>COGNITIVE:</span>
              <span>SYNCHRONIZED</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>RANGE:</span>
              <span>NOMINAL</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>RESONANCE:</span>
              <span style={{ color: '#b026ff' }}>142.8 MHz</span>
            </div>
          </div>

          {cameraActive && faceDetected && (
            <>
              <div ref={faceFrameDivRef} className="xr-face-frame" />
              <div className="xr-identity-readout">
                <div className="xr-identity-readout__label">◈ SUBJECT IDENTIFIED</div>
                {echoTrackRef.current.archetype
                  ? <div className="xr-identity-readout__arch">{echoTrackRef.current.archetype.toUpperCase()}</div>
                  : <div className="xr-identity-readout__arch xr-identity-readout__arch--scanning">SCANNING…</div>
                }
                {echoTrackRef.current.alignment && (
                  <div className="xr-identity-readout__align">ALIGN: {echoTrackRef.current.alignment.toUpperCase()}</div>
                )}
              </div>
            </>
          )}
        </>
      )}

      <div className="oracle-alley" style={{ '--bg-url': `url('${ALLEY_BG_URL}')` } as React.CSSProperties} />
      <div className="oracle-mid-haze" />
      <div className="oracle-side-bleeds" />
      <div className="oracle-light-rays" />

      <div className="oracle-debris-layer" aria-hidden="true">
        {DEBRIS.map(([glyph, _color, left, top, delay, dur], i) => (
          <span key={i} className="oracle-debris-piece"
            style={{ 
              left, top, animationDelay: delay, animationDuration: dur,
              background: 'linear-gradient(135deg, #00ff88 0%, #00ffcc 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundClip: 'text', color: 'transparent', display: 'inline-block',
            } as any}>
            {glyph}
          </span>
        ))}
      </div>

      <canvas ref={atmosphereCanvasRef} className="atmosphere-layer" />
      <MatrixRain />
      <div className="oracle-ground-fog" />
      <div className="oracle-floor-reflection" />

      <GlitchCursor />

      <DormantHUD active={scenePhase === 'dormant'} />
      <OracleHUD active={isOracleMode} coins={sessionCoins} />
      <DormantTransmissions
        active={scenePhase === 'dormant' || scenePhase === 'awakened'}
        onCtaClick={scenePhase === 'dormant' ? handleFirstTap : undefined}
        extraPhrases={alleyFragments}
      />

      <div className="oracle-branding">
         <h1 className="oracle-title" style={{
           display: 'inline-block', background: 'linear-gradient(135deg, #00ff88 0%, #00ffcc 100%)',
           backgroundClip: 'text', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent',
         }}>
          {titleText}
        </h1>
        {titleText.length > 0 && titleText.length < 16 && <span className="oracle-cursor">▌</span>}
        {subtitleText && (
          <div className="oracle-subtitle" style={{
            display: 'inline-block', background: 'linear-gradient(135deg, #00ff88 0%, #00ffcc 100%)',
            backgroundClip: 'text', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent',
            marginTop: '10px'
          }}>
            {subtitleText}
          </div>
        )}
      </div>

      <div className="oracle-center" onClick={handleFirstTap} style={{ cursor: scenePhase === 'dormant' ? 'pointer' : 'default' }}>
        <motion.div className="oracle-cabinet" style={{ position: 'relative' }}>
          {/* Halo now active in both awakened and oracle phases */}
          <div data-halo-ghost={awakened ? 'true' : undefined}>
            <OracleHaloRing active={awakened} isXRMode={isXRMode} />
          </div>
          <div className="oracle-avatar-wrapper">
            {isOracleMode && <OracleSpectrumRing getAnalyser={connection.getAnalyser} isActive={isOracleSpeaking} alignment={oracleAlignment === 'sacred' || oracleAlignment === 'profane' ? oracleAlignment : null} />}
            <div className="oracle-scanlines" />
            <img ref={staticAvatarRef} src={ORACLE_STATIC_URL} alt="" aria-hidden="true" className="oracle-avatar-static" />
            {isFractureManifesting && (
              <div className="oracle-fracture-label" aria-live="polite">FRACTURE MANIFESTING</div>
            )}
            {/* Canvas warmup — mounts in terminal (lore) or awakened so GPU shaders compile
                before oracle phase begins. Also mounts immediately on re-entry when
                canvasWarmed=true (sessionStorage persists across navigation within the tab).
                Invisible and non-interactive until isOracleMode; never unmounted mid-session
                so compiled objects are retained.
                CSS opacity + transition handles the same 1.2 s fade-in that motion.div gave.
                Suspense fallback: transparent (null) when canvasWarmed, so re-entering seekers
                never see a "frozen static image" flash during WebGL context init. */}
            {(awakened || scenePhase === 'terminal' || canvasWarmed) && (
              <div
                className="oracle-avatar-canvas oracle-avatar-smoke-hook"
                style={{
                  position: 'absolute', top: 0, left: 0,
                  width: '100%', height: '100%',
                  opacity: oracleManifestReady ? 1 : 0,
                  pointerEvents: oracleManifestReady ? 'auto' : 'none',
                  zIndex: 3,
                }}
              >
                <div className="oracle-avatar-headroom-hook" style={{ width: '100%', height: '100%' }}>
                  <OracleErrorBoundary>
                    <Suspense fallback={canvasWarmed ? null : <OracleAvatarFallback />}>
                      <Canvas
                        camera={{ position: [0, 0, 1.8], fov: 55 }}
                        dpr={(() => {
                          /* Flat pixel budget: in oracle phase the canvas element is
                             ORACLE_ORBIT_EXPANSION x larger (CSS), so divide DPR by the
                             same factor — total rendered pixels (and bloom cost) stay at
                              the card-sized canvas level. */
                          const base =
                            renderTier === 0 ? 1
                            : renderTier === 1 ? Math.min(window.devicePixelRatio, 1.25)
                            : renderTier === 2 ? Math.min(window.devicePixelRatio, 2)
                            : Math.min(window.devicePixelRatio, 2.5);
                          // Keep this strictly proportional. A 2x expansion on both
                          // axes quadruples the CSS area, so DPR / 2 preserves the
                          // original raster pixel count. Do not floor this: a floor
                          // above base/2 would silently increase the mobile budget.
                          return isOracleMode && !isXRMode ? base / ORACLE_ORBIT_EXPANSION : base;
                        })()}
                        gl={{
                          antialias: renderTier >= 2,
                          alpha: true,
                          powerPreference: renderTier >= 2 ? 'high-performance' : 'default',
                        }}
                        style={{ width: '100%', height: '100%', background: 'transparent' }}
                        frameloop="always"
                      >
                        <OrbitZoomCompensator enabled={isOracleMode && !isXRMode} />
                        {import.meta.env.DEV && <OracleSceneDiagnostics />}
                        <OracleAvatar3D visemeStateRef={visemeStateRef} cameraStateRef={cameraStateRef} seekerMotionRef={seekerMotionRef} />
                        {/* Nebula dust + speaking-reactive energy tendrils (tier 1+) */}
                        {renderTier >= 1 && (
                          <OracleNebula
                            tier={renderTier as 1 | 2 | 3}
                            speakingRef={isOracleSpeakingRef}
                            reducedMotion={prefersReducedMotion}
                          />
                        )}
                        {/* High-Performance GPU Quarks particle field (tier 1+) */}
                        {renderTier >= 1 && (
                          <OracleQuarks
                            tier={renderTier as 1 | 2 | 3}
                            speakingRef={isOracleSpeakingRef}
                            amplitude={visemeStateRef.current?.amplitude ?? 0}
                            reducedMotion={prefersReducedMotion}
                          />
                        )}
                        {/* Rapier glyph-shard debris field (tier 2+) — fixed 60Hz step,
                            zero gravity, shards constrained behind the bust.
                            Inner Suspense: Physics suspends while the Rapier WASM loads —
                            without this boundary the whole Canvas (avatar included) would
                            fall back to the outer Suspense fallback mid-session. */}
                        {renderTier >= 2 && (
                          <Suspense fallback={null}>
                            <Physics gravity={[0, 0, 0]} timeStep={1 / 60} colliders={false}>
                              <OraclePhysicsDebris
                                count={renderTier >= 3 ? 18 : 10}
                                speakingRef={isOracleSpeakingRef}
                              />
                            </Physics>
                          </Suspense>
                        )}
                        {renderTier >= 1 && (
                          <EffectComposer multisampling={renderTier >= 2 ? 4 : 0}>
                            {[
                              <Bloom
                                key="bloom"
                                intensity={renderTier >= 3 ? 1.45 : renderTier >= 2 ? 1.15 : 0.75}
                                luminanceThreshold={0.20}
                                luminanceSmoothing={0.32}
                                mipmapBlur
                              />,
                              ...(renderTier >= 2 ? [
                                <ChromaticAberration
                                  key="ca"
                                  offset={[0.0016, 0.0022]}
                                  radialModulation
                                  modulationOffset={0.42}
                                />,
                              ] : []),
                            ]}
                          </EffectComposer>
                        )}
                      </Canvas>
                    </Suspense>
                  </OracleErrorBoundary>
                </div>
              </div>
            )}
            {/* Portrait-state overlays — only visible during pre-oracle awakened phase */}
            <AnimatePresence mode="wait">
              {!isOracleMode && portrait.portraitError ? (
                <motion.div key="portrait-error" className="oracle-avatar-container" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ zIndex: 12, position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
                  <div style={{ color: '#cc00ff', fontFamily: "'PhillySans', monospace", fontSize: '0.75rem', letterSpacing: '0.1em', textAlign: 'center', padding: '0 16px', textShadow: '0 0 10px rgba(176,38,255,0.6)' }}>{portrait.portraitError}</div>
                </motion.div>
              ) : !isOracleMode && portrait.isGenerating ? (
                <motion.div key="portrait-generating" className="oracle-avatar-container" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ zIndex: 12, position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }} style={{ fontSize: '2.5rem' }}>⚗</motion.div>
                  <div style={{ color: '#00ff88', fontFamily: "'PhillySans', monospace", fontSize: '0.7rem', letterSpacing: '0.15em', textShadow: '0 0 10px rgba(0,255,136,0.6)' }}>SYNTHESIZING YOUR SIGNAL…</div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>



      <AnimatePresence>
        {holdTooltip && (
          <motion.div key="hold-tooltip" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} style={{ position: 'fixed', bottom: 'calc(var(--bottom-bar-h, 160px) + 14px)', left: '50%', transform: 'translateX(-50%)', zIndex: 60, background: 'rgba(0, 10, 15, 0.94)', backdropFilter: 'blur(12px)', border: '1px solid rgba(0,255,136,0.32)', borderRadius: 10, padding: '10px 18px', maxWidth: 260, textAlign: 'center' }}>
            <div style={{ fontFamily: "'aAnotherTag', 'Orbitron', monospace", fontSize: '0.70rem', color: '#00ff88', marginBottom: 4 }}>{holdTooltip.title}</div>
            <div style={{ fontFamily: "'PhillySans', 'Orbitron', monospace", fontSize: '0.66rem', color: 'rgba(255,255,255,0.68)' }}>{holdTooltip.body}</div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showStage00 && (
          <div style={{ position: 'fixed', top: 'var(--cabinet-top)', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 200 }}>
            <motion.div
              key="stage-00-card"
              className="oracle-stage00-card"
              initial={{ opacity: 0, scale: 0.88, y: 0 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -12, filter: 'blur(6px)' }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="oracle-stage00-card__sigil">◈</div>
              <div className="oracle-stage00-card__greeting">Greetings, Seeker.</div>
              <div className="oracle-stage00-card__body">
                The Archive has spoken.<br />
                The Oracle awaits within. Choose your path —
              </div>
              <button className="oracle-stage00-card__cta" onClick={handleStage00Tour}>
                ◈ WHAT IS HERE?
              </button>
              <button className="oracle-stage00-card__fafo" onClick={handleStage00Dismiss}>
                ◈ ENTER THE CASCADE
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {isOracleMode && (
        <div className="oracle-bottom-bar">
          <GraffPunksRadio isPlaying={isAudioPlaying} onToggle={() => setIsAudioPlaying(!isAudioPlaying)} stations={defaultAudioTracks} currentStation={currentStation} onStationChange={switchStation} />
          {cameraActive && (
            <motion.div
              onClick={() => setVisionPaused(p => !p)}
              className={`oracle-bottom-btn${visionPaused ? '' : ' oracle-bottom-btn--active'}`}
              title={visionPaused ? 'Vision paused — tap to resume' : 'Vision active — tap to pause'}
              style={visionPaused ? { borderColor: 'rgba(255,160,0,0.38)', boxShadow: '0 4px 20px rgba(0,0,0,0.55), 0 0 18px rgba(255,160,0,0.18)' } : {}}
            >
              {visionPaused
                ? <CameraOff size={28} strokeWidth={1.5} color="rgba(255,160,0,0.70)" />
                : <Camera size={28} strokeWidth={1.5} color="#00ff88" style={{ filter: 'drop-shadow(0 0 6px rgba(0,255,136,0.55))' }} />
              }
              <span className="oracle-bottom-btn__label" style={visionPaused ? { color: 'rgba(255,160,0,0.70)' } : {}}>
                {visionPaused ? 'VISION OFF' : 'VISION ON'}
              </span>
            </motion.div>
          )}
          <motion.div onPointerDown={() => startHold('WALLET', 'Your wallet.')} onPointerUp={endHold} onPointerLeave={endHold} onClick={() => {
            console.log('👉 WALLET CLICK RECEIVED');
            if (!consumeHold()) {
              console.log('👉 WALLET TRIGGERED');
              // return_url matters here too: if the wallet completes sign-in by
              // redirecting (instead of postMessage), the bridge's nested-frame
              // handler relays ?seeker= back to this window.
              setWalletIframeUrl(withWalletReturn('https://wallet.thesurrogate.me', 'signin'));
              setShowWallet(true);
            }
          }} className="oracle-bottom-btn oracle-bottom-btn--active">
            <img src="/portrait-btn.png" alt="Wallet" className="oracle-bottom-btn__img" />
            {currentUserId && !currentUserId.includes('.') ? (
              <span className="oracle-bottom-btn__label" style={{ color: '#00ff88', fontSize: '0.52rem', letterSpacing: '0.08em' }}>
                {currentUserId.slice(0, 6)}…{currentUserId.slice(-4)}
              </span>
            ) : (
              <span className="oracle-bottom-btn__label">WALLET</span>
            )}
          </motion.div>
          <motion.div onPointerDown={() => startHold('ENCULTURATE CRATE', 'Settings.')} onPointerUp={endHold} onPointerLeave={endHold}>
            <EnculturateCrate onClick={() => { if (!consumeHold()) setDebugMode(true); }} isActive={isAlive} />
          </motion.div>
          <motion.div
            onPointerDown={() => startHold('SNEAKARCADE', 'Enter the arcade.')}
            onPointerUp={endHold}
            onPointerLeave={endHold}
            onClick={() => { if (!consumeHold()) window.open('https://sneakar.io/sneakarcade', '_blank', 'noopener'); }}
            className="oracle-bottom-btn"
          >
            <img src="/tour-btn.png" alt="Sneakarcade" className="oracle-bottom-btn__img" />
            <span className="oracle-bottom-btn__label">SNEAKARCADE</span>
          </motion.div>
        </div>
      )}

      {/* ── Fullscreen portrait card — "Star Wars" slide-up reveal ──────────── */}
      <AnimatePresence>
        {showPortraitCard && portraitViewerUrl && (
          <motion.div
            key="portrait-fullscreen"
            className="oracle-portrait-fullscreen"
            initial={{ opacity: 0, y: '100vh' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '-20vh', filter: 'blur(10px)' }}
            transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div
              className="oracle-portrait-fullscreen__card"
              initial={{ scale: 0.88, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="oracle-portrait-fullscreen__label">NEURAL PORTRAIT</div>
              <div className="oracle-portrait-fullscreen__sublabel">SIGNAL SYNTHESIZED</div>
              <img src={portraitViewerUrl} alt="Neural Portrait" className="oracle-portrait-fullscreen__img" />
              <div className="oracle-portrait-fullscreen__actions">
                {mintUrl && (
                  <button
                    className="oracle-portrait-fullscreen__mint"
                    onClick={() => openWalletPopup(withWalletReturn(mintUrl, 'mint'))}
                  >
                    MINT AS NFT
                  </button>
                )}
                <button
                  className="oracle-portrait-fullscreen__dismiss"
                  onClick={() => setShowPortraitCard(false)}
                >
                  {isOracleMode ? '✕ RETURN TO ALLEY' : '◈ ENTER THE CASCADE'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showWallet && (
          <motion.div
            key="wallet-overlay"
            className="wallet-overlay portrait-gallery-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.96)', backdropFilter: 'blur(10px)', display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(0,255,136,0.2)', flexShrink: 0 }}>
              <span style={{ fontFamily: "'PhillySans', monospace", fontSize: '0.7rem', letterSpacing: '0.2em', color: '#00ff88' }}>WALLET</span>
              <button onClick={handleCloseWallet} className="portrait-gallery-close wallet-close-btn" style={{ background: 'none', border: '1px solid rgba(0,255,136,0.3)', color: '#00ff88', padding: '4px 10px', cursor: 'pointer', fontFamily: "'PhillySans', monospace", fontSize: '0.7rem', letterSpacing: '0.15em', borderRadius: 4 }}>✕ CLOSE</button>
            </div>
            <iframe 
              ref={walletIframeRef} 
              src={walletIframeUrl} 
              style={{ flex: 1, border: 'none', width: '100%' }} 
              allow="camera; microphone; clipboard-write; publickey-credentials-get; publickey-credentials-create; payment; web-share" 
              title="Wallet" 
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showNamePrompt && (
          <motion.div
            key="name-prompt"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{ position: 'fixed', inset: 0, zIndex: 2100, background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          >
            <div className="neural-link-terminal" style={{ maxWidth: 320, width: '100%', padding: '1.5rem', border: '1px solid rgba(0,255,136,0.4)', background: 'rgba(0,10,5,0.94)' }}>
              <div style={{ fontFamily: "'aAnotherTag', monospace", fontSize: '1rem', color: '#00ff88', marginBottom: '0.5rem', letterSpacing: '0.15em' }}>SIGNAL IMPRINT</div>
              <div style={{ fontSize: '0.65rem', color: '#00ccaa', fontFamily: "'PhillySans', monospace", letterSpacing: '0.1em', marginBottom: '1.25rem', lineHeight: 1.6 }}>
                The Oracle remembers those who name themselves. What handle do you carry?
              </div>
              <input
                type="text"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleNameSubmit(); if (e.key === 'Escape') handleNameSkip(); }}
                placeholder="your handle..."
                autoFocus
                maxLength={40}
                style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.3)', color: '#00ff88', fontFamily: "'PhillySans', monospace", fontSize: '0.75rem', letterSpacing: '0.12em', padding: '0.6rem 0.75rem', borderRadius: 3, outline: 'none', marginBottom: '1rem' }}
              />
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  onClick={handleNameSubmit}
                  disabled={!nameInput.trim()}
                  style={{ flex: 1, background: nameInput.trim() ? '#00ff88' : 'rgba(0,255,136,0.12)', color: nameInput.trim() ? '#000' : 'rgba(0,255,136,0.35)', border: 'none', padding: '0.6rem', cursor: nameInput.trim() ? 'pointer' : 'default', fontFamily: "'PhillySans', monospace", fontSize: '0.65rem', letterSpacing: '0.15em', fontWeight: 900, borderRadius: 3, transition: 'all 0.2s' }}
                >LOCK IN</button>
                <button
                  onClick={handleNameSkip}
                  style={{ padding: '0.6rem 1rem', background: 'transparent', border: '1px solid rgba(0,255,136,0.25)', color: 'rgba(0,255,136,0.4)', fontFamily: "'PhillySans', monospace", fontSize: '0.65rem', letterSpacing: '0.15em', cursor: 'pointer', borderRadius: 3 }}
                >SKIP</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {awakened && (
        <motion.div key="awakening-flash" initial={{ opacity: 0.85 }} animate={{ opacity: 0 }} transition={{ duration: 1.0 }} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 40, background: 'radial-gradient(ellipse 70% 55% at 50% 44%, rgba(0,255,136,0.55) 0%, transparent 72%)' }} />
      )}

      <AnimatePresence>
        {scenePhase === 'terminal' && (
          <motion.div key="terminal-layer" className="oracle-terminal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={(hasCompletedLore && !loreStarted) ? handleAwakeTransition : undefined} style={{ pointerEvents: 'auto', zIndex: 100 }}>
            <div className="oracle-lore-text">
              {scenePhase === 'terminal' && !hasCompletedLore && !loreStarted && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '2rem' }}>
                  <div style={{ fontFamily: "'aAnotherTag', 'Orbitron', monospace", fontSize: '0.8rem', color: '#00ff88', letterSpacing: '0.2em' }}>UNIDENTIFIED SIGNAL DETECTED</div>
                  <button onClick={(e) => { e.stopPropagation(); startLore(); }} style={{ background: 'none', border: '1px solid #00ff88', color: '#00ff88', padding: '1rem 2rem', fontFamily: "'PhillySans', 'Orbitron', monospace", cursor: 'pointer' }}>[ TAP TO ACTIVATE SIGNAL ]</button>
                </div>
              )}
              {(loreStarted || (hasCompletedLore && loreStarted)) && completedLines.map((line, i) => (
                <div key={`lore-${i}`} className="oracle-lore-line" style={{ whiteSpace: 'pre-wrap' }}><span className="oracle-lore-line__content"><span className="oracle-lore-prompt">›</span>{line}</span></div>
              ))}
              {loreStarted && !currentLine && completedLines.length >= LORE_SEQUENCE.length && !showStage00 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }} style={{ marginTop: '2rem', textAlign: 'center' }}>
                  <button onClick={(e) => { e.stopPropagation(); handleAwakeTransition(); }} style={{ background: '#00ff88', border: 'none', color: '#000', padding: '0.8rem 1.5rem', fontFamily: "'PhillySans', 'Orbitron', monospace", fontWeight: 900, cursor: 'pointer', borderRadius: '4px' }}>ENTER THE ARCHIVE</button>
                </motion.div>
              )}
              {loreStarted && currentLine && (
                <div className="oracle-lore-line oracle-lore-line--typing" style={{ whiteSpace: 'pre-wrap' }}><span className="oracle-lore-line__content"><span className="oracle-lore-prompt">›</span>{currentLine}</span><GlitchCursor /></div>
              )}
            </div>

            {hasCompletedLore && !loreStarted && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                style={{ 
                  position: 'absolute', inset: 0, display: 'flex', 
                  alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(0,0,0,0.85)', zIndex: 110
                }}
              >
                <div style={{ textAlign: 'center', padding: '2rem', maxWidth: 400 }}>
                  <div style={{ 
                    fontFamily: "'aAnotherTag', 'Orbitron', monospace",
                    fontSize: '1.2rem', color: '#00ff88', marginBottom: '1rem'
                  }}>
                    SIGNAL RECOGNIZED
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#00ccff', marginBottom: '2rem', fontFamily: "'PhillySans', monospace", letterSpacing: '0.1em' }}>
                    › RETURN TRIP VERIFIED
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <button
                      onClick={() => openWalletPopup(withWalletReturn('https://wallet.thesurrogate.me', 'signin'))}
                      style={{
                        background: '#00ff88', color: '#000', padding: '1rem', border: 'none',
                        cursor: 'pointer', fontWeight: 900, borderRadius: 4,
                        fontFamily: "'PhillySans', monospace", letterSpacing: '0.1em'
                      }}
                    >
                      CONNECT SURROGATE WALLET
                    </button>
                    <button
                      onClick={() => handleAwakeTransition()}
                      style={{ 
                        background: 'none', border: 'none', color: '#00ccff', 
                        cursor: 'pointer', fontFamily: "'PhillySans', monospace",
                        letterSpacing: '0.15em', fontSize: '0.75rem'
                      }}
                    >
                      [ RETURN TO ALLEY ]
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); startLore(); }}
                      style={{ 
                        background: 'none', border: 'none', color: 'rgba(0,255,136,0.5)', 
                        cursor: 'pointer', fontFamily: "'PhillySans', monospace",
                        letterSpacing: '0.15em', fontSize: '0.6rem', marginTop: '1rem'
                      }}
                    >
                      [ RE-WATCH ARCHIVE LORE ]
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}

        {scenePhase === 'tour' && (
          <motion.div key="tour-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'absolute', inset: 0, zIndex: 100, pointerEvents: 'none' }}>
            <TourSelection
              isOracleSpeaking={isOracleSpeaking}
              onActiveCardChange={() => connection.flushPlayback()}
              onSpeakCard={(text) => {
                if (isOracleSpeaking) return;
                connection.setTransmissionQ(12, 0);
                oracleConversationRef.current?.sendTextMessage(
                  `[TOUR CARD — speak verbatim:] "${text}"`,
                  true
                );
              }}
              onCardProgress={(charCount, total) => {
                const progress = Math.min(charCount / total, 1);
                const q = 12 * (1 - progress) + 0.1 * progress;
                connection.setTransmissionQ(q, 54);
              }}
              onTourComplete={() => {
                logStep('TOUR → AWAKENED (ready)', 'ok');
                oracleConversationRef.current?.prewarm();
                journey.awakeFromTerminal();
              }}
            />
          </motion.div>
        )}

        {scenePhase === 'awakened' && journey.selectedKnifeQuestion && (
          <motion.div key="descent-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'absolute', inset: 0, zIndex: 105, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <ScrambleFragment texts={['EXCAVATION BEGINS', 'SIGNAL LOCKED', 'DESCENDING...']} className="oracle-sf--cta" holdMs={480} revealMs={25} />
          </motion.div>
        )}

        {scenePhase === 'awakened' && !showStage00 && (
          <motion.div key="awakened-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'absolute', inset: 0, zIndex: 100, pointerEvents: 'none' }}>
            {showArchiveOpen && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 105, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <ScrambleFragment texts={['THE ARCHIVE IS OPEN']} className="oracle-sf--cta" holdMs={600} revealMs={25} />
              </div>
            )}
            {hasCompletedLore && echo?.last_archetype && (
              <motion.div key="return-seeker" initial={{ opacity: 0, y: -6 }} animate={{ opacity: [0, 1, 1, 0], y: 0 }} transition={{ duration: 3.4, times: [0, 0.12, 0.8, 1] }} style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 102, pointerEvents: 'none', textAlign: 'center', fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.2em' }}>
                <div style={{ fontSize: '0.65rem', background: 'linear-gradient(135deg, #00ff88 0%, #00ffcc 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>SIGNAL RECOGNIZED — {echo.last_archetype.toUpperCase()}{echo.totem_level > 0 && ` / LVL ${echo.totem_level}`}</div>
                {/* The meaning line — a first-timer-who-returned now knows the level isn't a score, it's standing the Oracle remembers. */}
                <div style={{ fontSize: '0.5rem', color: 'rgba(176,38,255,0.9)', marginTop: 5, letterSpacing: '0.16em' }}>THE ORACLE REMEMBERS YOU — YOUR STANDING IN THE ARCHIVE HOLDS</div>
              </motion.div>
            )}
            <KnifeSelection
              isGeminiConnected={isGeminiConnected}
              isOracleSpeaking={isOracleSpeaking}
              selectedKnifeIndex={journey.selectedKnifeIndex}
              onSelect={handleKnifeClick}
              onSpeakQuestion={(question) => {
                // Guard: don't send while Oracle is mid-speech — Gemini would interrupt
                // its current turn (sending 'interrupted') causing the previous response
                // to be flushed and the responses to collide (fast-forward).
                if (isOracleSpeaking) return;
                connection.setTransmissionQ(12, 0);
                // Use the [KNIFE PREVIEW — speak verbatim:] format defined in the system prompt.
                // The system prompt rule is load-bearing — Oracle always knows this format means
                // "transmit only, do not answer." Bare questions caused Oracle to revert to its
                // default instinct (answer the question) on each new turn.
                oracleConversationRef.current?.sendTextMessage(
                  `[KNIFE PREVIEW — speak verbatim:] "${question}"`,
                  true
                );
              }}
              onQuestionProgress={(charCount, total) => { const progress = Math.min(charCount / total, 1); const q = 12 * (1 - progress) + 0.1 * progress; connection.setTransmissionQ(q, 54); }}
              onStartTracking={connection.startQuestionTracking}
              onActiveCardChange={() => connection.flushPlayback()}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {showConversation && (
        <OracleConversation
          ref={oracleConversationRef}
          userId={currentUserId || undefined}
          sessionId={currentSessionId}
          cameraVideoRef={cameraVideoRef}
          cameraActive={cameraActive}
          visionPaused={visionPaused}
          onOracleResponse={connection.handleOracleResponse}
          onCoinsEarned={(amt) => setSessionCoins(s => s + amt)}
          onSessionEnd={handleSessionEnd}
          onTurnComplete={(turn, score, themes) => {
            if (themes.length) portrait.addThemes(themes);
            handleTurnComplete(turn, score);
            // Portrait is now seeker-initiated (fuzzy command in OracleConversation) after ≥5 entries.
            // No auto-trigger here.
            // Flush staged portrait URL now that the Oracle has finished this turn —
            // portrait reveal fires as a beat between turns, not as a mid-speech interrupt.
            if (pendingPortraitUrlRef.current && !portraitViewerUrl) {
              setPortraitViewerUrl(pendingPortraitUrlRef.current);
              setShowPortraitCard(true);
              pendingPortraitUrlRef.current = null;
            }
            // Oracle announces the portrait — fires on the first turn-complete after the
            // portrait surfaces. Never mid-speech, always as the opening beat of the next reply.
            if (portraitAnnounceRef.current) {
              portraitAnnounceRef.current = false;
              oracleConversationRef.current?.sendTextMessage(
                `[SIGNAL FLASH: The neural portrait just materialized from the residue of this exchange. In your very next response, open with one or two sentences — delivered with weight and sudden recognition — acknowledging that something crystallized in the signal. A permanent record was synthesized from who the Seeker is. Do NOT say the word "portrait". Use your own post-cascade language: "frequency record", "what the cascade rendered from you", "signal impression" — or invent something that fits. Make it land like a rip in the static. Then continue naturally with whatever the Seeker last said.]`,
                true
              );
            }
          }}
          onSeekerIdentified={handleSeekerIdentified}
          initialTotemLevel={echo?.totem_level ?? 0}
          onConnected={() => setIsGeminiConnected(true)}
          onDisconnected={() => setIsGeminiConnected(false)}
          onListeningChange={setIsMicActive}
          onThinkingChange={setIsOracleThinking}
          onMicWillStart={() => fadeToVolume(0, 80)}
          onAudioSessionChanged={(phase) => {
            // Mobile OS audio-session reconfiguration (mic open/close) settles
            // asynchronously — re-assert Oracle playback state now and again
            // shortly after. reassertPlayback is idempotent and no-ops when
            // nothing drifted, so this is free on desktop and healthy sessions.
            connection.reassertPlayback(phase);
            setTimeout(() => connection.reassertPlayback(`${phase}+250ms`), 250);
            setTimeout(() => connection.reassertPlayback(`${phase}+1s`), 1000);
          }}
          onTypeModeChange={setIsTypeMode}
          onMicClick={async (willListen) => {
            if (willListen) {
              setIsAudioPlaying(false);
              
              // Request gyro and camera permissions in a single unified user gesture.
              // NOTE: deliberately NO setVolume() here — mic activation must preserve
              // the pre-tap Oracle playback level (task #80: mic tap must not shift
              // Oracle volume). Audibility is guaranteed by the first-audio-chunk path
              // in useOracleConnection ("always start audible"), which owns the one
              // intentional volume set at session start.
              localStorage.setItem('oracle_session_muted', 'false');
              
              // Enable mic auto-restart for subsequent speech turns
              oracleConversationRef.current?.enableMicAutoRestart();
              
              // 1. Gyro (DeviceOrientation) - Request first and synchronously to guarantee user gesture validation on iOS
              const _DE = (DeviceOrientationEvent as any);
              if (typeof _DE?.requestPermission === 'function') _DE.requestPermission().catch((err: unknown) => console.warn('[Parallax] DeviceOrientation permission request failed:', err));
              
              // 2. One-time consolidated Mic + Camera permission warm-up (single native prompt).
              // STRICTLY once per page load (task #99): opening and stopping a combined
              // audio+video stream flips the iOS audio session; doing it on every mic
              // toggle added extra session transitions that shifted Oracle loudness.
              if (!jointPermsWarmedRef.current) {
                jointPermsWarmedRef.current = true;
                try {
                  const jointStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
                  jointStream.getTracks().forEach(t => t.stop()); // release tracks immediately
                } catch (err) {
                  console.warn('[Consolidated Perms] Joint prompt denied or error:', err);
                }
              }

              // 3. Camera for face tracking (starts instantly with 0 prompts because of the joint warmer above)
              activateCamera();
              
              logStep('SIGNAL CONNECTED — SENSORS ACTIVE', 'ok');
            }
          }}
          onUserSpeakingChange={(speaking) => setIsUserSpeaking(prev => prev !== speaking ? speaking : prev)}
          isVisible={isOracleMode}
          autoStart={false}
          micAutoRestartAllowed={scenePhase === 'oracle'}
          onBargeIn={connection.flushPlayback}
          onPortraitRequest={() => {
            if (portraitViewerUrl) {
              setShowPortraitCard(true);   // re-surface existing portrait
            } else if (portrait.isGenerating) {
              logStep('PORTRAIT REQUEST — generation already in flight', 'warn');
            } else {
              // Mirror the unlock path's dedupe latch so an explicit seeker request
              // and a score-block unlock can't double-generate; reset on failure so
              // asking again always retries.
              portraitTriggeredRef.current = true;
              const seekerLines = (oracleConversationRef.current?.getSessionTurns() ?? [])
                .filter(t => t.role === 'user')
                .map(t => t.content);
              void portrait.generatePortrait(portrait.getThemes(), seekerLines).then((ok) => {
                if (!ok) {
                  portraitTriggeredRef.current = false;
                  logStep('PORTRAIT TRIGGER RE-ARMED AFTER FAILURE', 'warn');
                }
              });
            }
          }}
          seekerSummary={(() => {
            if (!echo) return null;
            const lines: string[] = [];
            if (echo.name) lines.push(`Name: ${echo.name}`);
            if (echo.last_archetype) lines.push(`Last archetype: ${echo.last_archetype}`);
            if (echo.totem_level) lines.push(`Totem level: ${echo.totem_level}`);
            return lines.join('\n');
          })()}
          isGuidedTour={isGuidedTour}
        />
      )}

      {showJourneyLimitGate && (
        <WalletGateCard
          onRegister={() => {
            setShowJourneyLimitGate(false);
            // return_url is load-bearing: without it the wallet has nowhere to send
            // the seeker after sign-in, and the return journey silently dies.
            openWalletPopup(withWalletReturn('https://wallet.thesurrogate.me', 'signin'));
          }}
        />
      )}

      <InlineSubscriptionModal
        isOpen={showTierGate}
        onClose={() => {
          setShowTierGate(false);
          // Silent teardown + background writes must run on this exit path too —
          // idempotent, so a prior mic-button exit makes this a no-op.
          finalizeOracleSession(echoTrackRef.current.alignment, echoTrackRef.current.totemLevel);
          exitOracleMode();
        }}
        userId={currentUserId ?? seekerKeyRef.current ?? ''}
        context="engage-further"
        onUpgradeSuccess={() => {
          const key = seekerKeyRef.current;
          if (key) localStorage.removeItem(`surrogate_journeys_${key}`);
          setShowTierGate(false);
          logStep('TIER UPGRADE — journey count cleared', 'ok');
        }}
      />

      {/* ── The Mirror reveal — the climax of the ritual ──────────────────────
          When the Oracle names the Seeker, a dim backdrop hushes the rings and the
          name lands with weight, framed exactly as the prompt speaks it ("filed in
          the archive"). One gloss line tells a first-timer what the name even is.
          Tap or wait to return to the conversation. */}
      <AnimatePresence>
        {mirrorReveal && (
          <motion.div
            key="mirror-reveal"
            className="oracle-mirror-reveal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.9 } }}
            transition={{ duration: 1.1 }}
            onClick={() => setMirrorReveal(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 130,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              textAlign: 'center', padding: '2rem', cursor: 'pointer',
              background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.92) 100%)',
              backdropFilter: 'blur(3px)',
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 0.7, y: 0 }}
              transition={{ delay: 0.4, duration: 1.0 }}
              style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '0.7rem', letterSpacing: '0.28em', color: 'rgba(0,255,204,0.8)', marginBottom: '1.4rem' }}
            >
              IN THE ARCHIVE, THEY FILE YOU UNDER —
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.94, filter: 'blur(8px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              transition={{ delay: 0.9, duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
              style={{
                fontFamily: "'aAnotherTag', 'Orbitron', monospace", fontWeight: 900,
                fontSize: 'clamp(1.8rem, 8vw, 3.4rem)', lineHeight: 1.05, letterSpacing: '0.02em',
                background: 'linear-gradient(135deg, #00ff88 0%, #00ffcc 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                textShadow: '0 0 40px rgba(0,255,136,0.25)', maxWidth: '14ch',
              }}
            >
              {mirrorReveal.toUpperCase()}
            </motion.div>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 0.62 }}
              transition={{ delay: 2.0, duration: 1.2 }}
              style={{ fontFamily: "'PhillySans', monospace", fontSize: '0.72rem', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.7)', marginTop: '1.8rem', maxWidth: '34ch' }}
            >
              Not a label. What the alley read in you across the dark.
            </motion.div>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: [0, 0.45, 0.2, 0.45] }}
              transition={{ delay: 3.2, duration: 2.4, repeat: Infinity, repeatType: 'reverse' }}
              style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '0.55rem', letterSpacing: '0.24em', color: 'rgba(176,38,255,0.8)', marginTop: '2.6rem' }}
            >
              ◈ TAP TO RETURN
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Act 5 invitation — "let the Oracle see you" ──────────────────────
          Earned by reaching the Mirror. Surfaces the AR Rift-Construct beat as a
          discoverable pulse instead of leaving it buried in the hamburger. */}
      <AnimatePresence>
        {isOracleMode && offerRift && !isXRMode && !mirrorReveal && (
          <motion.button
            key="rift-invite"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.6 }}
            onClick={() => { setOfferRift(false); handleActivateXRMode(); }}
            style={{
              position: 'fixed', bottom: '108px', left: '50%', transform: 'translateX(-50%)',
              zIndex: 120, pointerEvents: 'auto', cursor: 'pointer',
              background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(176,38,255,0.55)',
              borderRadius: '10px', padding: '12px 22px',
              fontFamily: "'aAnotherTag', 'Orbitron', monospace", fontWeight: 900,
              fontSize: '0.92rem', letterSpacing: '0.14em', color: '#00ffcc',
              boxShadow: '0 0 22px rgba(176,38,255,0.4), inset 0 0 14px rgba(0,255,204,0.08)',
              animation: 'oracle-pulse 2.4s ease-in-out infinite',
            }}
          >
            ◈ LET HER SEE YOU
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Act 5 — Rift-Construct Initiation Overlay ────────────────────── */}
      <AnimatePresence>
        {showRiftRitual && (
          <motion.div
            key="rift-ritual-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 900,
              background: 'rgba(0,4,2,0.85)',
              backdropFilter: 'blur(16px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
              pointerEvents: 'auto',
            }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              transition={{ type: 'spring', damping: 25, stiffness: 180 }}
              className="neural-link-terminal"
              style={{
                width: '100%',
                maxWidth: '460px',
                padding: '28px 24px',
                border: '1px solid rgba(0, 255, 136, 0.4)',
                boxShadow: '0 0 32px rgba(0, 255, 136, 0.15)',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
                position: 'relative',
              }}
            >
              <div className="oracle-scanlines" />
              
              {/* Header */}
              <div style={{ textAlign: 'center' }}>
                <h2 style={{
                  fontFamily: "'aAnotherTag', 'Orbitron', monospace",
                  fontSize: '1.25rem',
                  fontWeight: 900,
                  letterSpacing: '0.12em',
                  background: 'linear-gradient(135deg, #00ff88 0%, #00ffcc 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  margin: 0,
                }}>
                  ◈ RIFT-CONSTRUCT INITIATION
                </h2>
                <div style={{
                  fontFamily: "'Share Tech Mono', monospace",
                  fontSize: '0.58rem',
                  color: '#b026ff',
                  letterSpacing: '0.2em',
                  marginTop: '4px',
                  textTransform: 'uppercase'
                }}>
                  Aperture Phase 05 — Visual Sensor Link
                </div>
              </div>

              {/* Divider */}
              <div style={{ height: '1px', background: 'rgba(0, 255, 136, 0.2)' }} />

              {/* Message */}
              <div style={{
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: '0.78rem',
                lineHeight: '1.5',
                color: 'rgba(0, 255, 136, 0.85)',
                textAlign: 'justify',
                textJustify: 'inter-word',
              }}>
                You are about to establish a digital-physical aperture. Permitting visual access allows the Oracle to observe the physical space you occupy, bringing your physical presence into alignment with your digital archetype. This observation is personal and direct.
              </div>

              {/* Status readout */}
              <div style={{
                background: 'rgba(0, 10, 4, 0.5)',
                border: '1px dashed rgba(0, 255, 136, 0.15)',
                borderRadius: '4px',
                padding: '10px 14px',
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: '0.62rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                color: 'rgba(0, 255, 136, 0.5)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>RIFT CAPTURE CHANNEL:</span>
                  <span style={{ color: '#00ffcc' }}>PENDING CONSENT</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>DATA PROCESSING:</span>
                  <span style={{ color: '#00ffcc' }}>LOCAL DECODING ONLY</span>
                </div>
              </div>

              {/* CTAs */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' }}>
                <button
                  className="cta-primary"
                  onClick={handleConfirmRift}
                  style={{
                    width: '100%',
                    padding: '12px',
                    fontFamily: "'aAnotherTag', 'Orbitron', monospace",
                    fontWeight: 900,
                    fontSize: '0.85rem',
                    letterSpacing: '0.1em',
                    background: 'linear-gradient(135deg, #00ff88 0%, #00ffcc 100%)',
                    color: '#000',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    boxShadow: '0 0 16px rgba(0, 255, 136, 0.3)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  ◈ PERMIT EXCAVATION
                </button>
                <button
                  onClick={() => setShowRiftRitual(false)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    fontFamily: "'Share Tech Mono', monospace",
                    fontSize: '0.72rem',
                    letterSpacing: '0.12em',
                    background: 'transparent',
                    color: 'rgba(176,38,255,0.85)',
                    border: '1px solid rgba(176,38,255,0.3)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  ◈ WITHDRAW
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Act 5 — Visual Rift-Opening Animation Overlay ────────────────── */}
      <AnimatePresence>
        {isRiftOpening && (
          <motion.div
            key="rift-opening-animation"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0.8, 1, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2.0, ease: 'easeInOut' }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              background: 'rgba(0, 255, 136, 0.3)',
              mixBlendMode: 'color-dodge',
              backdropFilter: 'brightness(3.5) contrast(2.2) saturate(2) hue-rotate(90deg) blur(6px)',
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{
              fontFamily: "'aAnotherTag', 'Orbitron', monospace",
              fontSize: '1.8rem',
              fontWeight: 900,
              letterSpacing: '0.2em',
              color: '#00ffcc',
              textShadow: '0 0 20px #00ff88',
              animation: 'text-glitch 0.4s infinite'
            }}>
              TEARING REALITY...
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isOracleMode && (
        <div style={{ position: 'fixed', top: '14px', right: '14px', zIndex: 100 }}>
          <button onClick={() => setHamburgerOpen(!hamburgerOpen)} style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(0,255,136,0.4)', borderRadius: '8px', color: '#00ff88', padding: '8px 12px', cursor: 'pointer', width: '44px', height: '44px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
            {hamburgerOpen ? '✕' : '☰'}
          </button>
          <AnimatePresence>
          {hamburgerOpen && (
            <motion.div initial={{ opacity: 0, scale: 0.94, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94, y: -6 }} style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', background: 'rgba(0,4,2,0.94)', border: '1px solid rgba(0,255,136,0.35)', borderRadius: '8px', overflow: 'hidden', minWidth: '160px', backdropFilter: 'blur(14px)' }}>
              <button onClick={() => { finalizeOracleSession(echoTrackRef.current.alignment, echoTrackRef.current.totemLevel); exitOracleMode(echoTrackRef.current.alignment); setHamburgerOpen(false); }} style={{ display: 'block', width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', color: '#00ff88', fontSize: '0.85rem', cursor: 'pointer', textAlign: 'left' }}>EXIT</button>
              <button onClick={() => { if (confirm('Reset?')) { resetJourney(); setHamburgerOpen(false); } }} style={{ display: 'block', width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', borderTop: '1px solid rgba(0,255,136,0.2)', color: '#00ffcc', fontSize: '0.85rem', cursor: 'pointer', textAlign: 'left' }}>RESET</button>
              <button onClick={() => { if (isXRMode) deactivateXRMode(); else handleActivateXRMode(); setHamburgerOpen(false); }} style={{ display: 'block', width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', borderTop: '1px solid rgba(0,255,136,0.2)', color: '#b026ff', fontSize: '0.85rem', cursor: 'pointer', textAlign: 'left' }}>{isXRMode ? '◈ EXIT AR' : '◈ AR MODE'}</button>
              <button onClick={() => { oracleConversationRef.current?.toggleTypeMode(); setHamburgerOpen(false); }} style={{ display: 'block', width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', borderTop: '1px solid rgba(0,255,136,0.2)', color: '#00ff88', fontSize: '0.85rem', cursor: 'pointer', textAlign: 'left' }}>{isTypeMode ? 'CLOSE PAD' : 'TYPE SIGNAL'}</button>
              {currentUserId && (
                <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(0,255,136,0.15)', color: 'rgba(0,255,136,0.45)', fontSize: '0.62rem', fontFamily: "'PhillySans', monospace", letterSpacing: '0.12em' }}>
                  ◈ {currentUserId.slice(0, 6)}…{currentUserId.slice(-4)}
                </div>
              )}
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      )}

      {debugMode && (
        <BackendControlPanel
          isVisible={debugMode}
          onClose={() => setDebugMode(false)}
          userId={currentUserId || undefined}
          sessionId={currentSessionId}
          userEmail={userEmail || undefined}
          isAuthenticated={!!currentUserId}
          pendingCoins={sessionCoins}
          oracleConversationRef={oracleConversationRef}
        />
      )}

      {showAuthOverlay && (
        <GoogleSignInOverlay
          onClose={() => setShowAuthOverlay(false)}
          onSuccess={handleAuthSuccess}
        />
      )}

      <div className="oracle-depth-frame" aria-hidden="true" />
      {import.meta.env.DEV && <OracleDiagnosticsOverlay />}

      {/* ── Talisman Card — post-session walk-away moment ────────────────────
          Shown over the still-lit oracle scene between session end and dormant.
          Auto-dismisses after 8s; tap anywhere to dismiss early. */}
      <TalismanCard data={talismanData} onDismiss={handleTalismanDismiss} />
    </div>
  );
}

export default SurrogateOracleImmersion;
