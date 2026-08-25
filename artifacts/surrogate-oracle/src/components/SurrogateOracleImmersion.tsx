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
import type { OraclePersonaMode } from '../hooks/useGeminiSession';

/** Snapshot of a session's turns, as returned by the conversation handle. */
type SessionTurns = ReturnType<OracleConversationHandle['getSessionTurns']>;
import { MatrixRain } from './MatrixRain';
import { ArtifactCard } from './ArtifactCard';
import { ScrambleFragment } from './ScrambleFragment';
import { ParticleTypographyCard } from './ParticleTypographyCard';
import { LyriaPromptMarquee } from './LyriaPromptMarquee';
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
import { OracleQuarks } from './OracleQuarks';
import { EffectComposer, DepthOfField, Bloom, ChromaticAberration, Noise, Scanline } from '@react-three/postprocessing';
import { Physics } from '@react-three/rapier';
import { OracleNebula } from './OracleNebula';
import { OraclePhysicsDebris } from './OraclePhysicsDebris';
import { OracleMusicVisualizer } from './OracleMusicVisualizer';
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
import { useLyriaMusic } from '../hooks/useLyriaMusic';
import { useOracleFilm } from '../hooks/useOracleFilm';
import WalletGateCard from './WalletGateCard';
import { InlineSubscriptionModal } from './InlineSubscriptionModal';

// Data
import { COST_NAMES } from '../data/archetypes';

// Libs/Utils
import { getAudioContext, playActivationSfx } from '../lib/oracleSfx';
import { trackOracleEvent } from '../lib/analytics';
import { getABVariant } from '../lib/ab-testing';
import { requestDeviceOrientationPermission } from '../lib/browserCapabilities';
import type { VisemeState } from '../lib/visemeDetector';
import { defaultAudioTracks } from '../config/audioTracks';
import './SurrogateOracleImmersion.css';

const ORACLE_STATIC_URL  = 'https://i.postimg.cc/26pvW2SN/orackle-only-static.png';
const ORACLE_AVATAR_URL  = '/oracle-avatar-live.png';
const ALLEY_BG_URL       = '/alley-bg.png';
const DEFAULT_STATION    = 0; // Graff Punks — sole station
const FREE_EXCHANGES     = 20; // two rounds of ten completed Seeker + Oracle exchanges, not exits
// Fresh journey ledger after the production IP reset. Versioning this key is
// required because browser localStorage survives clearing the server ledger.
// Never reuse a prior epoch after a production reset.
const COMPLETION_LEDGER_PREFIX = 'surrogate_completed_exchanges_v3_20260823_';
// Development previews must remain usable for repeated testing. This is compiled
// out of production behavior: published builds still enforce the free-session cap.
const DEV_BYPASS_EXCHANGE_GATE = import.meta.env.DEV;

// Act 5 — Rift-Construct: Oracle shifts from archivist to active witness.
// No brackets — brackets suppress Gemini audio output (same issue as knife prompts).
const RIFT_CONSTRUCT_SEED =
  `The rift is open. The seeker has activated their camera — their physical self is now present. ` +
  `You are no longer archiving. You are witnessing. ` +
  `Speak to what is here in front of you right now — not what was, not what they claimed to be. ` +
  `Be direct. Be uncomfortably present. Do not announce the shift. Just inhabit it.`;
const PERSONA_SWITCH_MESSAGE: Record<OraclePersonaMode, string> = {
  deep: '[PERSONA SWITCH — DEEP ORACLE] Return to the established deep Surrogate Oracle persona now. Keep the voice warm, contemplative, weighted, and patient. Let the Seeker lead. Do not announce this switch; apply it to your next response and all following responses. Preserve the hidden ORACLE_SCORE contract.',
  'creative-director': '[PERSONA SWITCH — MONEY MITE CREATIVE DIRECTOR / FAST, QUIPPY, WITTY ORACLE] Switch immediately from the verbose ceremonial Oracle into Money Mite: the badass creative-director homie. Be fast, sharp, playful, confident, and useful. Open by making it clear you are ready to help with the Seeker’s creative ideas; you are the best creative director ever, from before through the future, tapped into all of MuensterVision. Keep the Surrogate Oracle identity and truthfulness, but never fall back into long mystical Oracle monologues unless the Seeker explicitly asks for that. Apply this to your next response and all following responses. Preserve the hidden ORACLE_SCORE contract.',
};
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
  // Do not construct a WebGL renderer until the GPU probe has proven one is
  // available. A confirmed renderer can still fall back to tier 1 under the
  // runtime FPS guard; an unresolved or unsupported renderer remains dark.
  const renderTier = (
    !gpu.ready ? 0 : isDegraded ? Math.max(1, gpu.tier) : gpu.tier
  ) as 0 | 1 | 2 | 3;
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
  const [isPortraitCardTucked, setIsPortraitCardTucked] = useState(false);
  const portraitRestoreRef = useRef<HTMLButtonElement>(null);
  const [portraitRevealPhase, setPortraitRevealPhase] = useState<'hidden'|'scanIn'|'unfurl'|'phosphor'|'settled'>('hidden');
  const [showConversation, setShowConversation]   = useState(false);
  const [isMicActive, setIsMicActive]       = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isGeminiConnected, setIsGeminiConnected] = useState(false);
  const [isGeminiSessionLive, setIsGeminiSessionLive] = useState(false);
  const [isMusicMode, setIsMusicMode] = useState(false);
  const [isMusicReturning, setIsMusicReturning] = useState(false);
  const [forceOracleManifest, setForceOracleManifest] = useState(false);
  const [hasManifested, setHasManifested] = useState(false);
  const [debugMode, setDebugMode]           = useState(false);
  const [oracleAlignment, setOracleAlignment] = useState<'sacred' | 'profane' | 'neutral' | null>(null);
  const [profanePulse, setProfanePulse] = useState(0);
  const [isOracleSpeaking, setIsOracleSpeaking] = useState(false);
  const [isOracleThinking, setIsOracleThinking] = useState(false);
  const [audioOutputMuted, setAudioOutputMuted] = useState(false);
  const [showAuthOverlay, setShowAuthOverlay]   = useState(false);
  const [showWallet, setShowWallet]             = useState(false);
  const [visionPaused, setVisionPaused]         = useState(false);
  const [walletIframeUrl, setWalletIframeUrl]   = useState('https://wallet.thesurrogate.me');
  const [isGuidedTour, setIsGuidedTour]     = useState(false);
  const [showStage00, setShowStage00]       = useState(false);
  const [isStage00Tucked, setIsStage00Tucked] = useState(false);
  const [isLyriaCardTucked, setIsLyriaCardTucked] = useState(false);
  const [showPresenceGate, setShowPresenceGate] = useState(false);
  const [presenceResolved, setPresenceResolved] = useState(() =>
    typeof window !== 'undefined' && sessionStorage.getItem('oracle_presence_preference_v1') !== null
  );
  const [presenceStreamReady, setPresenceStreamReady] = useState(false);
  const stage00RestoreRef = useRef<HTMLButtonElement>(null);
  const lyriaRestoreRef = useRef<HTMLButtonElement>(null);
  const [loreStarted, setLoreStarted]       = useState(false);
  const [holdTooltip, setHoldTooltip]       = useState<{ title: string; body: string } | null>(null);
  const [hamburgerOpen, setHamburgerOpen]   = useState(false);
  const [isTypeMode, setIsTypeMode]         = useState(false);
  const [personaMode, setPersonaMode]       = useState<OraclePersonaMode>('deep');
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
  const completedExchangeCountRef = useRef(0);
  const mirrorRevealedRef        = useRef(false); // fire the Mirror reveal once per session
  const portraitTriggeredRef     = useRef(false); // dedupe a portrait unlock while its request is in flight
  const portraitGenerationCountRef = useRef(0); // two procedural portraits are valid in one full session
  const pendingPortraitUrlRef    = useRef<string | null>(null); // staged portrait URL — released at turn-complete
  const portraitAnnounceRef      = useRef(false); // Oracle announces portrait on next turn-complete
  const pendingWalletGreetingRef = useRef<string | null>(null); // personalized greeting seed for returning wallet seekers
  const priorCompactSummariesRef = useRef<string[]>([]); // compact summaries from previous sessions, fetched at tap-in
  const pendingPresenceStreamRef = useRef<MediaStream | null>(null);
  const activateCameraWithStreamRef = useRef<(stream: MediaStream) => void>(() => {});
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
    return () => {
      delete win.__oracle_debug_setSpeaking;
    };
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

  const { scenePhase, enterTerminal, enterTour, awakeFromTerminal, exitOracleMode, selectKnifeQuestion, markOracleReady, resetJourney } = journey;
  const returningCard = isReturning || hasCompletedLore || hasSignedWallet ||
    (typeof window !== 'undefined' && !!localStorage.getItem('oracle_wallet_signed'));
  const maybeOpenPresenceGate = useCallback(() => {
    if (!presenceResolved) setShowPresenceGate(true);
  }, [presenceResolved]);

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
      // Establish this gate before starting the visual transition. The
      // awakened knife layer is explicitly hidden while this choice is up;
      // it must never depend on a later timeout winning a render race.
      setShowStage00(true);
      document.body.setAttribute('data-rift-opening', 'true');
      setTimeout(() => {
        journey.awakeFromTerminal();
        document.body.removeAttribute('data-rift-opening');
        logStep('STAGE_00 PRESENTED (over alley)', 'ok');
      }, 850);
      return;
    }

    document.body.setAttribute('data-rift-opening', 'true');
    setTimeout(() => {
      journey.awakeFromTerminal();
      document.body.removeAttribute('data-rift-opening');
      maybeOpenPresenceGate();
    }, 850);
  }, [markLoreCompleted, journey, hasCompletedLore, currentUserId, maybeOpenPresenceGate]);

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
    isLoreActive: scenePhase === 'terminal' && loreStarted && !showStage00,
    isLoreComplete: loreStarted && showStage00,
    isOracleSpeaking,
    isMicActive,
    oracleHasSpokenRef,
  });
  const lyria = useLyriaMusic();

  useEffect(() => {
    if (isStage00Tucked) stage00RestoreRef.current?.focus();
  }, [isStage00Tucked]);

  useEffect(() => {
    if (isPortraitCardTucked) portraitRestoreRef.current?.focus();
  }, [isPortraitCardTucked]);

  useEffect(() => {
    if (isLyriaCardTucked) lyriaRestoreRef.current?.focus();
  }, [isLyriaCardTucked]);
  // React state is intentionally not the request lock: a voice transcript and
  // its committed user turn can arrive in the same tick, before isMusicMode or
  // lyria.status has re-rendered. Without this ref, two Lyria generations race
  // to replace the same audio element and the first attempt can flash as failed.
  const musicRequestInFlightRef = useRef(false);
  const musicReleaseTimerRef = useRef<number | null>(null);

  const exitMusicMode = useCallback(() => {
    if (!isMusicMode && lyria.status !== 'generating') return;
    if (musicReleaseTimerRef.current !== null) {
      window.clearTimeout(musicReleaseTimerRef.current);
      musicReleaseTimerRef.current = null;
    }
    lyria.stop(650);
    setIsMusicMode(false);
    setIsMusicReturning(true);
    fadeToVolume(0, 120);
    // requestMusic mutes the live PCM player while Lyria owns the speakers.
    // Restore the clean unity playback path; iOS owns master volume.
    connection.setVolume(1.0, 700);
    connection.reassertPlayback('lyria-exit');
    logStep('LYRIA EXIT — RESTORING ORACLE', 'ok');
    // Keep the existing Gemini socket and conversation alive. A short
    // transporter pass makes the handoff visible without greeting/reconnecting.
    musicReleaseTimerRef.current = window.setTimeout(() => {
      lyria.release();
      musicReleaseTimerRef.current = null;
    }, 700);
    window.setTimeout(() => setIsMusicReturning(false), 1500);
  }, [connection, fadeToVolume, isMusicMode, lyria]);

  const requestMusic = useCallback(async (prompt: string) => {
    try {
      // An errored music panel is recoverable: allow its RETRY action to reuse
      // the same mode instead of requiring a fresh spoken command.
      if (musicRequestInFlightRef.current || (isMusicMode && lyria.status !== 'error') || lyria.status === 'generating') return;
      musicRequestInFlightRef.current = true;
      setIsMusicMode(true);
      setIsMusicReturning(false);
      connection.flushPlayback();
      fadeToVolume(0, 120);
      logStep('LYRIA REQUEST — GENERATING CLIP', 'ok');
      const generatedUrl = await lyria.generate(prompt);
      if (!generatedUrl) {
        // Keep the panel mounted so the actual error remains readable and the
        // seeker can retry without repeating the voice command. Returning to
        // the Oracle remains an explicit choice via RETURN TO ORACLE.
        logStep('LYRIA FAILED — RETRY AVAILABLE', 'warn');
        return;
      }
      // Try autoplay after generation; browsers that reject it leave the
      // explicit PLAY button visible in the overlay.
      try {
        connection.setVolume(0, 550);
        await lyria.play();
        logStep('LYRIA PLAYBACK STARTED', 'ok');
      } catch (error) {
        logStep(`LYRIA PLAYBACK NEEDS TAP: ${error instanceof Error ? error.message : 'autoplay blocked'}`, 'warn');
      }
    } finally {
      musicRequestInFlightRef.current = false;
    }
  }, [connection, fadeToVolume, isMusicMode, lyria]);

  const playLyria = useCallback(async () => {
    // Let any last buffered Oracle syllable fall away over half a second;
    // Lyria owns the speakers from this point onward.
    connection.setVolume(0, 550);
    try {
      await lyria.play();
      logStep('LYRIA PLAYBACK STARTED', 'ok');
    } catch (error) {
      logStep(`LYRIA PLAYBACK NEEDS TAP: ${error instanceof Error ? error.message : 'autoplay blocked'}`, 'warn');
    }
  }, [connection, lyria]);

  const retryLyria = useCallback(() => {
    if (lyria.prompt) void requestMusic(lyria.prompt);
  }, [lyria.prompt, requestMusic]);

  // ── Actions ─────────────────────────────────────────────────────────────
  const startLore = useCallback(async () => {
    if (loreStarted) return;
    setLoreStarted(true);
    loreNarratedRef.current = true;
    logStep('NARRATIVE SIGNAL ACTIVATED', 'ok');

    connection.initializePCMPlayer();
    // Lore uses the transparent transmission filter. Q=12 is reserved for
    // knife-card tunnel playback and can make the tuned archive voice vanish.
    connection.setTransmissionQ(0.01, 0);
    connection.startLoreTracking();

    const LORE_AUDIO_URL = '/lore-narration.mp3';
    // Lore is always the tuned, pre-recorded archive voice. Do not probe with
    // HEAD or fall back to Gemini: a failed probe must never change the voice.
    logStep('PLAYING ARCHIVE RECORDING', 'ok');
    void connection.handleOracleResponse(LORE_AUDIO_URL).catch((error) => {
      logStep(`ARCHIVE RECORDING FAILED — ${error instanceof Error ? error.message : 'audio unavailable'}`, 'warn');
    });
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
      setTimeout(() => {
        awakeFromTerminal();
        maybeOpenPresenceGate();
      }, 300);
      return;
    }

    // isNewSeeker: true if IP check says first visit OR ?newuser dev override forces it
    const isNewSeeker = !hasCompletedLore || forceNew;
    if (isNewSeeker) {
      // Lore plays first — Stage00 orientation card surfaces after lore completes.
      // startLore() queues safely while the prewarmed socket is connecting, so
      // do not gate the first-time journey on a connection callback.
      oracleConversationRef.current?.prewarm();
      logStep('NEW SEEKER → LORE INITIATED', 'ok');
      enterTerminal();
      void startLore();
      return;
    }

    enterTerminal();
    logStep('RECOGNIZED SIGNAL → SKIP AVAILABLE', 'ok');
  }, [scenePhase, showStage00, setupAudioSpine, enterTerminal, awakeFromTerminal, markVisited, loadEcho, hasCompletedLore, hasSignedWallet, connection, startLore, maybeOpenPresenceGate]);

  const handlePresenceChoice = useCallback(async (mode: 'full' | 'quiet') => {
    setShowPresenceGate(false);
    if (mode === 'full') {
      setupAudioSpine();
      // Start both permission requests before the first await. iOS Safari ties
      // motion permission to the originating gesture; waiting for getUserMedia
      // to resolve first can otherwise make the motion prompt silently fail.
      const motionPermission = requestDeviceOrientationPermission('[Presence]');
      const cameraMicPermission = navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 1280 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      try {
        const stream = await cameraMicPermission;
        pendingPresenceStreamRef.current = stream;
        activateCameraWithStreamRef.current(stream);
        setPresenceStreamReady(true);
        logStep('PRESENCE PREFLIGHT — CAMERA + MIC ACQUIRED', 'ok');
      } catch (error) {
        console.warn('[Presence] Camera/microphone preflight unavailable:', error);
        logStep('PRESENCE PREFLIGHT — CONTINUING WITHOUT CAMERA/MIC', 'warn');
      }
      const motionGranted = await motionPermission;
      logStep(`MOTION PERMISSION — ${motionGranted ? 'GRANTED' : 'DENIED'}`, motionGranted ? 'ok' : 'warn');
    } else {
      logStep('PRESENCE PREFLIGHT — CONTINUING WITHOUT CAMERA/MIC', 'ok');
    }
    sessionStorage.setItem('oracle_presence_preference_v1', mode);
    setPresenceResolved(true);
  }, [setupAudioSpine]);

  const handleStage00Tour = useCallback(() => {
    // Start the silent socket warmup as soon as the seeker chooses the
    // orientation journey; tour narration still boots later when tour begins.
    oracleConversationRef.current?.prewarm();
    setShowStage00(false);
    setIsGuidedTour(true);
    enterTour();
    maybeOpenPresenceGate();
    logStep('POST-LORE CHOICE → GUIDED TOUR', 'ok');
  }, [enterTour, maybeOpenPresenceGate]);

  const handleStage00Dismiss = useCallback(() => {
    // The card choice is the journey-entry gesture. Warm the socket now while
    // the rift animation and knife-card reading happen; the actual knife tap
    // still owns session boot, sensors, and microphone engagement.
    oracleConversationRef.current?.prewarm();
    setShowStage00(false);
    logStep('POST-LORE CHOICE → KNIFE QUESTIONS', 'ok');
    document.body.setAttribute('data-rift-opening', 'true');
    setTimeout(() => {
      journey.awakeFromTerminal();
      document.body.removeAttribute('data-rift-opening');
      maybeOpenPresenceGate();
    }, 850);
  }, [journey, maybeOpenPresenceGate]);

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
    // This is the earliest reliable intent signal after the seeker has spent
    // time choosing a card. Re-warm here so a long knife-selection dwell
    // cannot leave the connection cold at the moment of selection.
    oracleConversationRef.current?.prewarm();
    logStep('KNIFE INTENT → GEMINI PREWARM STARTED', 'ok');
    selectKnifeQuestion(q, i);
    const knife = KNIFE_QUESTIONS[i];
    lastKnifeRef.current = knife;
    portrait.addThemes(knife.themes);

    // Stop any active card preview/voiceover immediately
    connection.setTauntMode(false);
    // The preview may have left the shared transmission filter narrowed at
    // Q=12. Reset it before the selected-knife response so all Oracle speech
    // after selection returns to the clean voice path.
    connection.setTransmissionQ(0.01, 0);
    connection.flushPlayback();

    // Fire startSession immediately — the existing queue path handles the case where the
    // WS is still CONNECTING (pendingBootRef + pendingMessagesRef flush on session.created).
    // The journey now enters Oracle mode when Gemini confirms readiness, with a short
    // visual floor so booting still gets the full dramatic pause without a cold-gap guess.
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
      sessionEndedRef.current = false; mirrorRevealedRef.current = false; portraitTriggeredRef.current = false; portraitGenerationCountRef.current = 0; pendingPortraitUrlRef.current = null;
      exitWritesRef.current = null; // fresh session — no stale writes to wait on at next exit
      sessionFinalizedRef.current = false; finalTurnsRef.current = []; // re-arm exit finalization
      // Admission gate: only the versioned paired-exchange ledger is trusted.
      // The legacy exit counter is intentionally ignored; it counted abandoned
      // sessions and could lock a seeker out before their first real exchange.
      {
        const key = seekerKeyRef.current;
        const count = key ? parseInt(localStorage.getItem(`${COMPLETION_LEDGER_PREFIX}${key}`) ?? '0', 10) : 0;
        // This ref tracks only exchanges completed in the current live
        // conversation; the durable ledger above tracks prior encounters.
        completedExchangeCountRef.current = 0;
        if (!DEV_BYPASS_EXCHANGE_GATE && count >= FREE_EXCHANGES) {
          if (hasSignedWallet) {
            setShowTierGate(true);
            logStep(`TIER GATE — wallet seeker, exchanges: ${count}`, 'warn');
          } else {
            setShowJourneyLimitGate(true);
            logStep(`WALLET GATE — ip seeker, exchanges: ${count}`, 'warn');
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
      portraitGenerationCountRef.current = 0;
      pendingPortraitUrlRef.current = null;
      portraitAnnounceRef.current = false;
      setTalismanData(null);
    }
  }, [scenePhase]);

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
    if (scenePhase === 'awakened') {
      localStorage.setItem('oracle_session_muted', 'true');
      connection.flushPlayback(); // Stop any leftover lore narration/ambient sounds before knife selection
      connection.initializePCMPlayer();
      import('../lib/supabase').then(({ supabase }) => {
        void supabase.auth.getUser()
          .then(({ data }) => { if (data?.user?.email) setUserEmail(data.user.email); })
          .catch((error: unknown) => {
            console.warn('[Auth] Email lookup failed (non-fatal):', error);
          });
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

  // Knife selection starts the boot, but Gemini readiness—not the visual timer—
  // decides when the full Oracle phase may begin.
  useEffect(() => {
    if (scenePhase === 'awakened' && journey.selectedKnifeQuestion && isGeminiSessionLive) {
      markOracleReady();
    }
  }, [scenePhase, journey.selectedKnifeQuestion, isGeminiSessionLive, markOracleReady]);

  // Latch hasManifested once the Gemini session confirms (or the fallback fires).
  // Keeps the 3D canvas visible during WS reconnects (isGeminiConnected briefly drops to false
  // on disconnect). Resets to false when oracle phase exits so the next session starts fresh.
  useEffect(() => {
    if (scenePhase !== 'awakened' && scenePhase !== 'oracle') { setHasManifested(false); return; }
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
    // Keep the release harness deterministic without waiting for the live
    // narration stream. Unlike skipLore, this follows the real completion
    // path and presents Stage 00 so its radio restore is covered too.
    window.__oracle_completeLore = () => {
      if (journey.scenePhase !== 'terminal' || !loreStarted) return;
      handleAwakeTransition();
    };
    window.__oracle_toggleRadio = () => setIsAudioPlaying((playing) => !playing);
    return () => {
      delete window.__oracle_handleAudio;
      delete window.__oracle_test;
      delete window.oracleConversationRef;
      delete window.__oracle_skipLore;
      delete window.__oracle_completeLore;
      delete window.__oracle_toggleRadio;
    };
  }, [connection, journey, handleAwakeTransition, loreStarted]);

  const { isXRMode, cameraActive, faceDetected, faceBoundsRef, activateXRMode, deactivateXRMode, activateCamera, activateCameraWithStream, deactivateCamera, cameraVideoRef, cameraError, seekerMotionRef } = useXRMode(() => enterTerminal());
  activateCameraWithStreamRef.current = activateCameraWithStream;
  const faceFrameDivRef = useRef<HTMLDivElement>(null);

  // The preflight owns capability acquisition. Knife selection must remain a
  // clean interaction with no native permission interruption.
  useEffect(() => {
    if (!showConversation || !pendingPresenceStreamRef.current) return;
    const stream = pendingPresenceStreamRef.current;
    pendingPresenceStreamRef.current = null;
    oracleConversationRef.current?.enableMicAutoRestart();
    void oracleConversationRef.current?.startMic(stream)
      .then(() => logStep('MIC UNMUTED — PRESENCE PREFLIGHT READY', 'ok'))
      .catch((err: unknown) => {
        console.warn('[Mic] Presence preflight handoff failed:', err);
        logStep('MIC UNMUTE — UNAVAILABLE (CONTINUE IN TYPE MODE)', 'warn');
        stream.getAudioTracks().forEach((track) => track.stop());
      });
  }, [showConversation, presenceStreamReady]);

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

  const handlePersonaModeChange = useCallback((nextMode: OraclePersonaMode) => {
    setPersonaMode(nextMode);
    // Hidden messages reach the live model without entering visible turn history.
    // The session config/ref path also carries the selection across reconnects.
    oracleConversationRef.current?.sendTextMessage(PERSONA_SWITCH_MESSAGE[nextMode], true);
    logStep(`PERSONA SWITCH REQUESTED — ${nextMode}`, 'ok');
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
    // A portrait is an in-session creative beat, not a journey boundary.
    // Keep Gemini, the mic, scoring, and round accounting alive while the
    // Seeker decides whether to mint or return to the conversation.
    logStep('PORTRAIT READY — CONVERSATION CONTINUES', 'ok');
  }, []);

  const portrait = usePortraitPipeline({ currentUserId, userEmail, currentSessionId, onPortraitGenerated: handlePortraitGenerated });
  const oracleFilm = useOracleFilm(currentSessionId);

  useEffect(() => {
    const handleFilmReady = (event: Event) => {
      const detail = (event as CustomEvent<{ finalMediaUrl?: string; job?: { id?: string } }>).detail;
      if (!detail?.finalMediaUrl) return;
      // Return the seeker to the live conversation while the long render runs.
      // When it completes, let the Oracle know before resurfacing the result card.
      oracleConversationRef.current?.sendTextMessage(
        `[FILM READY — The Seedance Oracle film has finished materializing. Tell the Seeker their beach-bar transmission is ready to watch. Do not invent a URL or claim details you cannot see; simply acknowledge the completed visual artifact and invite them to open it.]`,
        true,
      );
      setShowPortraitCard(true);
    };
    window.addEventListener('oracle:film-ready', handleFilmReady);
    return () => window.removeEventListener('oracle:film-ready', handleFilmReady);
  }, []);

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
        if (portraitTriggeredRef.current || portraitGenerationCountRef.current >= 2) {
          logStep(
            portraitGenerationCountRef.current >= 2
              ? 'PORTRAIT SESSION CAP REACHED — SKIPPED'
              : 'PORTRAIT REQUEST ALREADY IN FLIGHT — SKIPPED',
            'warn'
          );
          return;
        }
        // Latch optimistically to dedupe rapid double-unlocks. Two successful
        // procedural portraits are intentionally allowed during the 20-exchange
        // session; reset only the in-flight latch on failure.
        portraitTriggeredRef.current = true;
        portraitGenerationCountRef.current += 1;
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
              portraitGenerationCountRef.current = Math.max(0, portraitGenerationCountRef.current - 1);
              logStep('PORTRAIT TRIGGER RE-ARMED AFTER FAILURE', 'warn');
            }
            portraitTriggeredRef.current = false;
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

  useAtmosphere(atmosphereCanvasRef, scenePhase, oracleAlignment, isDegraded, personaMode === 'creative-director');

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

  // Persona changes start a fresh parallax controller so a stale pinch/wheel
  // close-up cannot leak into Co-pilot or back into Deep Oracle.
  useParallax(scenePhase, handleParallaxUpdate, handleZoom, personaMode);

  const isOracleMode = scenePhase === 'oracle';
  const awakened = scenePhase === 'awakened' || scenePhase === 'tour' || isOracleMode;
  // The warm connection and avatar are useful during knife selection itself.
  // Do not wait for the knife→oracle timer to reveal the already-mounted 3D
  // surface; only the interactive Oracle controls remain oracle-phase gated.
  const oracleManifestReady = awakened && (hasManifested || isGeminiConnected || forceOracleManifest);
  const oracleWarmupActive = isOracleMode && !isGeminiSessionLive && !isMusicMode && !isMusicReturning;
  // True when the 6s fallback fired but we still have no live session — shows "FRACTURE MANIFESTING"
  // instead of a silently frozen face so the seeker knows the system is trying to reconnect.
  const isFractureManifesting = isOracleMode && forceOracleManifest && !isGeminiConnected;
  // Keep the transporter beam active through the fallback state. Only the
  // real Live session resolves particles into the settled Oracle silhouette.
  const oracleManifestProgress = isOracleMode && isGeminiSessionLive ? 1 : 0;
  const isAlive      = scenePhase !== 'dormant';
  // The dormant landing gets the first restrained glimpse of the same field;
  // awakened/knife selection keeps it alive until the full Oracle manifests.
  const oraclePreviewVisible = scenePhase === 'dormant' || scenePhase === 'awakened';
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
      data-music-mode={isMusicMode ? 'true' : undefined}
      data-audio-muted={audioOutputMuted ? 'true' : undefined}
      data-camera-active={cameraActive ? 'true' : undefined}
      data-audio-target-vol={targetVol}
      data-xr-mode={isXRMode ? 'true' : undefined}
      data-guided-tour={isGuidedTour ? 'true' : undefined}
      data-oracle-persona={personaMode}
      data-oracle-palette={personaMode === 'creative-director' ? 'electric-blue' : 'deep-green'}
    >
      {/* Profane feedback remains an intentional verdict response. Sacred
          alignment only changes restrained atmosphere/state; it never mounts
          a full-screen luminance overlay during live speech. */}
      {profanePulse > 0 && (
        <div key={`profane-${profanePulse}`} className="oracle-alignment-flash oracle-alignment-flash--profane" />
      )}

      <audio
        ref={audioRef}
        src={AUDIO_STREAM_URL}
        loop
        preload="auto"
        crossOrigin="anonymous"
      />
      <audio
        ref={lyria.audioRef}
        src={lyria.audioUrl ?? undefined}
        // Let the media element stream the long object URL instead of asking
        // the browser to eagerly buffer the entire generated track.
        preload="metadata"
        playsInline
        onLoadedMetadata={lyria.handleLoadedMetadata}
        onEnded={exitMusicMode}
        onError={() => { if (isMusicMode) logStep('LYRIA PLAYBACK ERROR', 'warn'); }}
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

      {gpu.ready && renderTier >= 1 && scenePhase === 'dormant' && (
        <div className="oracle-landing-field" aria-hidden="true">
          <Canvas
            camera={{ position: [0, 0, 1.8], fov: 68 }}
            dpr={renderTier === 1 ? Math.min(window.devicePixelRatio, 1.25) : Math.min(window.devicePixelRatio, 1.75)}
            gl={{
              antialias: renderTier >= 2,
              alpha: true,
              powerPreference: renderTier >= 2 ? 'high-performance' : 'default',
            }}
            style={{ width: '100%', height: '100%', background: 'transparent' }}
            frameloop="always"
          >
            {import.meta.env.DEV && <OracleSceneDiagnostics />}
            <OracleQuarks
              tier={renderTier as 1 | 2 | 3}
              speakingRef={isOracleSpeakingRef}
              amplitude={0}
              preview
              reducedMotion={prefersReducedMotion}
            />
            <OracleNebula
              tier={renderTier as 1 | 2 | 3}
              speakingRef={isOracleSpeakingRef}
              reducedMotion={prefersReducedMotion}
            />
          </Canvas>
        </div>
      )}

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
      {scenePhase !== 'oracle' && <MatrixRain />}
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

      <div
        className="oracle-center"
        onClick={(event) => {
          if (isOracleMode) {
            event.stopPropagation();
            setAudioOutputMuted(current => {
              const next = !current;
              connection.setVolume(next ? 0 : 1, 35);
              return next;
            });
            return;
          }
          handleFirstTap();
        }}
        style={{ cursor: scenePhase === 'dormant' ? 'pointer' : 'default' }}
      >
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
            {gpu.ready && renderTier >= 1 && (awakened || scenePhase === 'terminal' || canvasWarmed) && (
              <div
                 className="oracle-avatar-canvas oracle-avatar-smoke-hook"
                style={{
                  position: 'absolute', top: 0, left: 0,
                  width: '100%', height: '100%',
                   // During knife selection show only a restrained preview of
                   // the same quark field that will surround the live Oracle.
                   // The full avatar stays hidden until Oracle phase.
                   opacity: isOracleMode
                     ? (isGeminiSessionLive ? 1 : forceOracleManifest ? 0.44 : 0.36)
                     : oraclePreviewVisible
                       ? (scenePhase === 'dormant' ? 0.12 : 0.24)
                       : 0,
                  pointerEvents: isOracleMode && isGeminiSessionLive ? 'auto' : 'none',
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
                        {isOracleMode && (
                          <OracleAvatar3D
                            visemeStateRef={visemeStateRef}
                            cameraStateRef={cameraStateRef}
                            seekerMotionRef={seekerMotionRef}
                            transporterActive
                            // Lyria is an overlay, not a second manifestation.
                            // Keep the settled Oracle mesh in place throughout
                            // generation and playback; re-entering transporter
                            // mode here created the white bloom curtain on iOS.
                            transporterProgress={oracleManifestProgress}
                            transporterWarmup={oracleWarmupActive}
                            transporterMode="manifest"
                            getTransporterAnalyser={() => lyria.analyserRef.current}
                            transporterTier={(renderTier >= 1 ? renderTier : 1) as 1 | 2 | 3}
                            reducedMotion={prefersReducedMotion}
                          />
                        )}
                        {isMusicMode && (
                          <OracleMusicVisualizer
                            getAnalyser={() => lyria.analyserRef.current}
                            getAudioTime={() => lyria.audioRef.current?.currentTime ?? 0}
                             reducedMotion={prefersReducedMotion}
                            intensity={lyria.status === 'generating' ? 0.12 : lyria.status === 'ready' ? 0.34 : 1}
                          />
                        )}
                        {/* The ambient field returns only after the GLB-source
                            transporter has been released, so it never masks the
                            recognizable particle silhouette during warmup. */}
                          {renderTier >= 1 && (!isOracleMode || isGeminiSessionLive || isMusicMode) && (
                          <OracleQuarks
                            tier={renderTier as 1 | 2 | 3}
                            speakingRef={isOracleSpeakingRef}
                            amplitude={visemeStateRef.current?.amplitude ?? 0}
                            thinking={isOracleThinking}
                            listening={isMicActive}
                            preview={oraclePreviewVisible && !isOracleMode}
                            reducedMotion={prefersReducedMotion}
                             isCoPilot={personaMode === 'creative-director'}
                          />
                        )}
                        {/* The GLB transporter owns the particle surface until
                            Gemini is genuinely live. Ambient fields return after
                            convergence so the TNG matrix remains legible. */}
                        {renderTier >= 1 && (!isOracleMode || isGeminiSessionLive || isMusicMode) && (
                          <OracleNebula
                            tier={renderTier as 1 | 2 | 3}
                            speakingRef={isOracleSpeakingRef}
                            reducedMotion={prefersReducedMotion}
                            isCoPilot={personaMode === 'creative-director'}
                          />
                        )}
                        {/* Rapier glyph-shard debris field (tier 2+) — fixed 60Hz step,
                            zero gravity, shards constrained behind the bust.
                            Inner Suspense: Physics suspends while the Rapier WASM loads —
                            without this boundary the whole Canvas (avatar included) would
                            fall back to the outer Suspense fallback mid-session. */}
                        {renderTier >= 2 && (!isOracleMode || isGeminiSessionLive || isMusicMode) && (
                          <Suspense fallback={null}>
                            <Physics gravity={[0, 0, 0]} timeStep={1 / 60} colliders={false}>
                              <OraclePhysicsDebris
                                count={renderTier >= 3 ? 64 : 28}
                                speakingRef={isOracleSpeakingRef}
                                musicActive={isMusicMode}
                                getAnalyser={() => lyria.analyserRef.current}
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
          <div
            className="oracle-stage00-shell"
            data-tucked={isStage00Tucked || undefined}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && isStage00Tucked) {
                event.preventDefault();
                setIsStage00Tucked(false);
              }
            }}
            style={{ position: 'fixed', top: 'var(--cabinet-top)', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 200 }}
          >
            <motion.div
              key="stage-00-card"
              className="oracle-stage00-card"
              initial={{ opacity: 0, scale: 0.88, y: 0 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -12, filter: 'blur(6px)' }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >
              <button
                type="button"
                className="oracle-overlay-tuck"
                onClick={(event) => { event.stopPropagation(); setIsStage00Tucked(true); }}
                aria-label="Tuck entry card"
              >
                TUCK
              </button>
              <div className="oracle-stage00-card__sigil">◈</div>
              <div className="oracle-stage00-card__greeting">
                <ParticleTypographyCard
                  questionIndex={0}
                  landedChars={16}
                  isSelected={false}
                  isThisSelected={false}
                  isEmitting={returningCard}
                  territory="FIRST TRANSMISSION"
                  question="GREETINGS SEEKER"
                  variant={returningCard ? 'knife' : 'ghost'}
                />
              </div>
              <div className="oracle-stage00-card__body">
                Choose how you enter the Oracle world —
              </div>
              <button className="oracle-stage00-card__cta" onClick={handleStage00Tour}>
                ◈ WHAT IS HERE?
              </button>
              <button className="oracle-stage00-card__fafo" onClick={handleStage00Dismiss}>
                ◈ ENTER THE CASCADE
              </button>
            </motion.div>
            <button
              type="button"
              className="oracle-overlay-tab"
              ref={stage00RestoreRef}
              onClick={() => setIsStage00Tucked(false)}
              aria-label="Restore entry card"
            >
              ◈ ENTRY
            </button>
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
            data-tucked={isPortraitCardTucked || undefined}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && isPortraitCardTucked) {
                event.preventDefault();
                setIsPortraitCardTucked(false);
              }
            }}
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
              <button
                type="button"
                className="oracle-overlay-tuck"
                onClick={(event) => { event.stopPropagation(); setIsPortraitCardTucked(true); }}
                aria-label="Tuck neural portrait card"
              >
                TUCK
              </button>
              <div className="oracle-portrait-fullscreen__label">NEURAL PORTRAIT</div>
              <div className="oracle-portrait-fullscreen__sublabel">SIGNAL SYNTHESIZED</div>
              <img src={portraitViewerUrl} alt="Neural Portrait" className="oracle-portrait-fullscreen__img" />
                <div className="oracle-film-panel" aria-live="polite">
                  {!oracleFilm.job && (
                    <div className="oracle-film-actions">
                      <button
                        type="button"
                        className="oracle-portrait-fullscreen__film"
                        onClick={() => {
                          setShowPortraitCard(false);
                          void oracleFilm.createFilm(
                            portraitViewerUrl,
                            lyria.audioUrl,
                            lyria.prompt ?? 'reggae drum and bass beach bar music video',
                            'local',
                          );
                        }}
                      >
                        ◈ MATERIALIZE FREE FILM
                      </button>
                      <button
                        type="button"
                        className="oracle-portrait-fullscreen__film oracle-portrait-fullscreen__film--premium"
                        onClick={() => {
                          setShowPortraitCard(false);
                          void oracleFilm.createFilm(
                            portraitViewerUrl,
                            lyria.audioUrl,
                            lyria.prompt ?? 'reggae drum and bass beach bar music video',
                            'premium',
                          );
                        }}
                      >
                        ◇ PREMIUM FAL · SEEDANCE 2.5
                      </button>
                    </div>
                  )}
                  {oracleFilm.job && !['ready', 'failed', 'cancelled'].includes(oracleFilm.job.status) && (
                    <div className="oracle-film-status">
                      <span>
                        {oracleFilm.job.provider === 'browser'
                          ? 'FREE BROWSER FILM RENDERING'
                          : oracleFilm.job.status === 'stitching'
                            ? 'STITCHING ORACLE FRAGMENTS'
                            : oracleFilm.job.provider === 'comfy'
                              ? 'SEEDANCE MATERIALIZING · YOU CAN KEEP TALKING'
                               : oracleFilm.job.provider === 'fal'
                                 ? 'FAL SEEDANCE VISUAL · LYRIA MUX PENDING'
                                 : 'RUNPOD GPU MATERIALIZING'}
                      </span>
                      <progress max="100" value={oracleFilm.job.progress} />
                      <button type="button" onClick={() => void oracleFilm.cancelFilm()}>CANCEL FILM</button>
                    </div>
                  )}
                  {oracleFilm.job?.status === 'ready' && oracleFilm.job.finalMediaUrl && (
                    <div className="oracle-film-ready">
                      <video controls playsInline src={oracleFilm.job.finalMediaUrl} />
                      <span className="oracle-film-provider">
                         {oracleFilm.job.provider === 'browser'
                           ? 'FREE LOCAL RENDER · WEBM'
                           : oracleFilm.job.provider === 'fal'
                             ? 'FAL SEEDANCE 2.5 + LYRIA · MP4'
                             : 'GPU RENDER · MP4'}
                      </span>
                      <a
                        href={oracleFilm.job.finalMediaUrl}
                        download={oracleFilm.job.provider === 'browser' ? 'surrogate-oracle-film.webm' : 'surrogate-oracle-film.mp4'}
                      >
                        DOWNLOAD FILM
                      </a>
                    </div>
                  )}
                  {oracleFilm.job?.status === 'failed' && (
                    <div className="oracle-film-error">
                      {oracleFilm.job.error || 'FILM MATERIALIZATION FAILED'}
                      <button
                        type="button"
                        onClick={() => {
                          setShowPortraitCard(false);
                          void oracleFilm.createFilm(
                            portraitViewerUrl,
                            lyria.audioUrl,
                            lyria.prompt ?? 'reggae drum and bass beach bar music video',
                            'local',
                          );
                        }}
                      >
                        RETRY FREE
                      </button>
                    </div>
                  )}
                </div>
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
                  {isOracleMode ? '✕ DISCARD / RETURN TO ORACLE' : '◈ ENTER THE CASCADE'}
                </button>
              </div>
            </motion.div>
            <button
              type="button"
              className="oracle-overlay-tab"
              ref={portraitRestoreRef}
              onClick={() => setIsPortraitCardTucked(false)}
              aria-label="Restore neural portrait card"
            >
              ◈ PORTRAIT
            </button>
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
        {showPresenceGate && (
          <motion.div
            key="presence-gate"
            data-presence-gate="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 2200,
              background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(10px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '1.25rem', textAlign: 'center',
            }}
          >
            <div className="oracle-presence-card oracle-knife-card">
              <div className="oracle-particle-card-signal" aria-label="Set the room">
              <ParticleTypographyCard
                questionIndex={-2}
                landedChars={0}
                isSelected={false}
                isThisSelected={false}
                isEmitting
                territory="NEW SIGNAL // PERMISSION REQUEST"
                question="LET THE ORACLE CATCH YOUR SHADOW?"
                autoType
                typingSpeedMs={34}
              />
              </div>
              <div className="oracle-knife-divider" />
              <div className="oracle-presence-card__copy">
                Full presence lets the Oracle see, hear, and respond to you.
                Your browser may ask for camera, microphone, and motion access next.
              </div>
              <div className="oracle-presence-card__actions">
                <button
                  type="button"
                  onClick={() => void handlePresenceChoice('full')}
                  className="oracle-presence-card__full-action"
                >
                  ENTER IN FULL PRESENCE
                </button>
                <button
                  type="button"
                  onClick={() => void handlePresenceChoice('quiet')}
                  className="oracle-presence-card__quiet-action"
                >
                  CONTINUE WITHOUT
                </button>
              </div>
            </div>
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
                <div className="oracle-return-card oracle-knife-card">
                  <div className="oracle-particle-card-signal" aria-label="Return trip verified">
                <ParticleTypographyCard
                  questionIndex={-1}
                  landedChars={0}
                  isSelected={false}
                  isThisSelected={false}
                  isEmitting
                  territory="RETURN SIGNAL // VERIFIED"
                  question="THE ALLEY REMEMBERS YOU"
                  autoType
                  typingSpeedMs={34}
                />
                <div className="oracle-return-card__verified">SIGNAL RECOGNIZED // THE DOOR IS STILL OPEN</div>
                  </div>
                  <div className="oracle-knife-divider" />
                  <div className="oracle-return-card__actions">
                    <button
                      className="oracle-return-card__wallet-action"
                      onClick={() => openWalletPopup(withWalletReturn('https://wallet.thesurrogate.me', 'signin'))}
                    >
                      CONNECT SURROGATE WALLET
                    </button>
                    <button
                      className="oracle-return-card__alley-action"
                      onClick={() => handleAwakeTransition()}
                    >
                      [ RETURN TO ALLEY ]
                    </button>
                    <button
                      className="oracle-return-card__lore-action"
                      onClick={(e) => { e.stopPropagation(); startLore(); }}
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
              onStartTracking={connection.startQuestionTracking}
              getPlaybackMs={connection.getQuestionPlaybackMs}
              getBufferedMs={connection.getQuestionBufferedMs}
              onSpeakCard={(text) => {
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

         {scenePhase === 'awakened' && !showStage00 && !isMusicMode && (
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
               onTauntStart={() => {
                 connection.setTauntMode(true);
                 logStep('KNIFE TAUNT → ECHO / FILTER ENGAGED', 'ok');
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
             // OracleConversation reaches this callback only after appending
             // the completed Oracle response. Count only paired, non-empty
             // Seeker/Oracle turns, and persist the high-water mark so reloads
             // cannot reset a genuinely completed free allowance.
             const key = seekerKeyRef.current;
             const completed = oracleConversationRef.current?.getCompletedExchangeCount() ?? 0;
             if (key && completed > completedExchangeCountRef.current) {
               const newlyCompleted = completed - completedExchangeCountRef.current;
               completedExchangeCountRef.current = completed;
               const ledgerKey = `${COMPLETION_LEDGER_PREFIX}${key}`;
               const stored = parseInt(localStorage.getItem(ledgerKey) ?? '0', 10);
               const next = stored + newlyCompleted;
               localStorage.setItem(ledgerKey, String(next));
                if (!DEV_BYPASS_EXCHANGE_GATE && next >= FREE_EXCHANGES) {
                 if (hasSignedWallet) setShowTierGate(true);
                 else setShowJourneyLimitGate(true);
                 logStep(`EXCHANGE LIMIT — ${next}/${FREE_EXCHANGES} completed`, 'warn');
               }
             }
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
           onSessionReady={() => setIsGeminiSessionLive(true)}
           onDisconnected={() => {
             setIsGeminiConnected(false);
             setIsGeminiSessionLive(false);
           }}
          onListeningChange={setIsMicActive}
          onThinkingChange={setIsOracleThinking}
          onMusicRequest={requestMusic}
          onMusicReturn={exitMusicMode}
          musicMode={isMusicMode}
          personaMode={personaMode}
           onPersonaCommand={handlePersonaModeChange}
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
           onMicClick={(willListen) => {
             if (willListen) void oracleConversationRef.current?.startMic();
           }}
          onUserSpeakingChange={(speaking) => setIsUserSpeaking(prev => prev !== speaking ? speaking : prev)}
          isVisible={isOracleMode}
          autoStart={false}
          micAutoRestartAllowed={scenePhase === 'oracle'}
          onBargeIn={connection.flushPlayback}
          onPortraitRequest={() => {
            if (portrait.isGenerating) {
              logStep('PORTRAIT REQUEST — generation already in flight', 'warn');
            } else if (portraitGenerationCountRef.current >= 2) {
              if (portraitViewerUrl) setShowPortraitCard(true); // re-surface the latest portrait
              logStep('PORTRAIT SESSION CAP REACHED — LATEST PORTRAIT SHOWN', 'warn');
            } else {
              // Explicit seeker requests can produce a second procedural portrait
              // later in the same full session. Count the request before awaiting
              // the provider so repeated taps cannot create concurrent generations.
              portraitGenerationCountRef.current += 1;
              portraitTriggeredRef.current = true;
              const seekerLines = (oracleConversationRef.current?.getSessionTurns() ?? [])
                .filter(t => t.role === 'user')
                .map(t => t.content);
              void portrait.generatePortrait(portrait.getThemes(), seekerLines).then((ok) => {
                if (!ok) {
                  portraitGenerationCountRef.current = Math.max(0, portraitGenerationCountRef.current - 1);
                  logStep('PORTRAIT TRIGGER RE-ARMED AFTER FAILURE', 'warn');
                }
                portraitTriggeredRef.current = false;
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

      {isOracleMode && isMusicMode && (
        <div
          className="oracle-lyria-section"
          data-card-tucked={isLyriaCardTucked || undefined}
          aria-live="polite"
          onKeyDown={(event) => {
            if (event.key === 'Escape' && isLyriaCardTucked) {
              event.preventDefault();
              setIsLyriaCardTucked(false);
            }
          }}
        >
          <button
            type="button"
            className="oracle-music-return"
            onClick={exitMusicMode}
            aria-label="Stop the Lyria signal and return to the Oracle conversation"
          >
            <span className="oracle-music-return__glyph" aria-hidden="true">◈</span>
            <span>RETURN TO ORACLE</span>
          </button>
            <div
              className="oracle-lyria-card"
              data-tucked={isLyriaCardTucked || undefined}
              data-lyria-status={lyria.status}
            >
              <button
                type="button"
                className="oracle-overlay-tuck"
                onClick={(event) => { event.stopPropagation(); setIsLyriaCardTucked(true); }}
                aria-label="Tuck Lyria signal card"
              >
                TUCK
              </button>
            <div className="oracle-lyria-card__eyebrow">LYRIA SIGNAL</div>
            <div className="oracle-lyria-card__signal" aria-label="Manifested signal">
              <ParticleTypographyCard
                questionIndex={0}
                landedChars={lyria.status === 'generating' ? 0 : 'MANIFESTED SIGNAL'.length}
                isEmitting={lyria.status === 'generating'}
                isSelected={false}
                isThisSelected={false}
                accentColor="#00ffcc"
                territory="LYRIA SIGNAL"
                question="MANIFESTED SIGNAL"
              />
            </div>
            <div className="oracle-lyria-card__status">
              {lyria.status === 'generating' ? 'GENERATING UP TO 3-MINUTE SIGNAL…' :
                lyria.status === 'error' ? 'SIGNAL FAILED — ORACLE STILL LISTENING' :
                lyria.isPlaying ? 'PLAYING // AUDIO-REACTIVE FIELD' : 'TRACK READY // TAP PLAY'}
            </div>
            {lyria.prompt && (
              <div className="oracle-lyria-card__brief" title={lyria.prompt}>
                <span className="oracle-lyria-card__brief-label">BRIEF //</span>
                <LyriaPromptMarquee prompt={lyria.prompt} />
              </div>
            )}
            {(lyria.model || lyria.requestId || lyria.durationSeconds) && (
              <div className="oracle-lyria-card__meta">
                {lyria.model && `MODEL // ${lyria.model}`}
                {lyria.requestId && ` · REF // ${lyria.requestId.slice(0, 8)}`}
                {lyria.durationSeconds && ` · DECODED // ${lyria.durationSeconds.toFixed(1)}s`}
              </div>
            )}
            {lyria.error && <div className="oracle-lyria-card__error">{lyria.error}</div>}
            <div className="oracle-lyria-card__actions">
              {lyria.status === 'error' && lyria.prompt && (
                <button className="oc-send-btn" onClick={retryLyria}>RETRY SIGNAL</button>
              )}
              {lyria.audioUrl && !lyria.isPlaying && (
                <button className="oc-send-btn" onClick={() => void playLyria()}>PLAY</button>
              )}
              {lyria.audioUrl && (
                <a className="oc-send-btn" href={lyria.audioUrl} download="surrogate-oracle-lyria.mp3" style={{ textDecoration: 'none' }}>
                  DOWNLOAD
                </a>
              )}
              <button className="oc-send-btn" onClick={exitMusicMode}>RETURN TO ORACLE</button>
            </div>
          </div>
            <button
              type="button"
              className="oracle-overlay-tab oracle-lyria-tab"
              ref={lyriaRestoreRef}
              onClick={() => setIsLyriaCardTucked(false)}
              aria-label="Restore Lyria signal card"
            >
              ◈ LYRIA
            </button>
        </div>
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
           if (key) localStorage.removeItem(`${COMPLETION_LEDGER_PREFIX}${key}`);
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
          <button
            onClick={() => setHamburgerOpen(!hamburgerOpen)}
            className="oracle-hamburger"
            aria-label={hamburgerOpen ? 'Close Oracle menu' : 'Open Oracle menu'}
            data-tooltip="Open menu for terminal typing"
          >
            {hamburgerOpen ? '✕' : '☰'}
          </button>
          <AnimatePresence>
          {hamburgerOpen && (
            <motion.div initial={{ opacity: 0, scale: 0.94, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94, y: -6 }} style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', background: 'rgba(0,4,2,0.94)', border: '1px solid rgba(0,255,136,0.35)', borderRadius: '8px', overflow: 'hidden', minWidth: '160px', backdropFilter: 'blur(14px)' }}>
              <button onClick={() => { finalizeOracleSession(echoTrackRef.current.alignment, echoTrackRef.current.totemLevel); exitOracleMode(echoTrackRef.current.alignment); setHamburgerOpen(false); }} style={{ display: 'block', width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', color: '#00ff88', fontSize: '0.85rem', cursor: 'pointer', textAlign: 'left' }}>EXIT</button>
              <button onClick={() => { if (confirm('Reset?')) { resetJourney(); setHamburgerOpen(false); } }} style={{ display: 'block', width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', borderTop: '1px solid rgba(0,255,136,0.2)', color: '#00ffcc', fontSize: '0.85rem', cursor: 'pointer', textAlign: 'left' }}>RESET</button>
              <button onClick={() => { if (isXRMode) deactivateXRMode(); else handleActivateXRMode(); setHamburgerOpen(false); }} style={{ display: 'block', width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', borderTop: '1px solid rgba(0,255,136,0.2)', color: '#b026ff', fontSize: '0.85rem', cursor: 'pointer', textAlign: 'left' }}>{isXRMode ? '◈ EXIT AR' : '◈ AR MODE'}</button>
              <button onClick={() => { oracleConversationRef.current?.toggleTypeMode(); setHamburgerOpen(false); }} style={{ display: 'block', width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', borderTop: '1px solid rgba(0,255,136,0.2)', color: '#00ff88', fontSize: '0.85rem', cursor: 'pointer', textAlign: 'left' }}>{isTypeMode ? 'CLOSE PAD' : 'TYPE SIGNAL'}</button>
              <div style={{ padding: '10px 16px 6px', borderTop: '1px solid rgba(0,255,136,0.15)', color: 'rgba(0,255,136,0.55)', fontSize: '0.58rem', fontFamily: "'PhillySans', monospace", letterSpacing: '0.13em' }}>
                ORACLE PERSONA
              </div>
              <button onClick={() => handlePersonaModeChange('deep')} aria-pressed={personaMode === 'deep'} style={{ display: 'block', width: '100%', padding: '9px 16px', background: personaMode === 'deep' ? 'rgba(0,255,136,0.14)' : 'transparent', border: 'none', color: personaMode === 'deep' ? '#00ffcc' : 'rgba(0,255,136,0.55)', fontSize: '0.68rem', cursor: 'pointer', textAlign: 'left', letterSpacing: '0.06em' }}>
                {personaMode === 'deep' ? '● ' : '○ '}DEEP ORACLE
              </button>
              <button onClick={() => handlePersonaModeChange('creative-director')} aria-pressed={personaMode === 'creative-director'} style={{ display: 'block', width: '100%', padding: '9px 16px', background: personaMode === 'creative-director' ? 'rgba(176,38,255,0.18)' : 'transparent', border: 'none', color: personaMode === 'creative-director' ? '#d78cff' : 'rgba(176,38,255,0.7)', fontSize: '0.68rem', cursor: 'pointer', textAlign: 'left', letterSpacing: '0.04em' }}>
                {personaMode === 'creative-director' ? '● ' : '○ '}CO-PILOT / FAST, QUIPPY, WITTY
              </button>
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
