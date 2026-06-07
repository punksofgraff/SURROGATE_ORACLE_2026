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
import { X } from 'lucide-react';

// Components
import { BackendControlPanel } from './BackendControlPanel';
import { GoogleSignInOverlay } from './GoogleSignInOverlay';
import { GraffPunksRadio } from './GraffPunksRadio';
import { EnculturateCrate } from './EnculturateCrate';
import OracleConversation, { OracleConversationHandle, OracleScore } from './OracleConversation';
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
import { OracleHaloRing } from './OracleHaloRing';
import { Canvas } from '@react-three/fiber';
import { OracleAvatar3D } from './OracleAvatar3D';
import { PortraitGalleryDashboard } from './PortraitGalleryDashboard';

// Hooks
import { useIpCheck } from '../hooks/useIpCheck';
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

// Data
import { COST_NAMES } from '../data/archetypes';

// Libs/Utils
import { getAudioContext } from '../lib/oracleSfx';
import { trackOracleEvent } from '../lib/analytics';
import { getABVariant } from '../lib/ab-testing';
import type { VisemeState } from '../lib/visemeDetector';
import { defaultAudioTracks } from '../config/audioTracks';
import './SurrogateOracleImmersion.css';

const ORACLE_STATIC_URL  = 'https://i.postimg.cc/26pvW2SN/orackle-only-static.png';
const ORACLE_AVATAR_URL  = '/oracle-avatar-live.png';
const ALLEY_BG_URL       = 'https://i.postimg.cc/jSJRRRk2/7D633B70-4C62-4326-92A8-3B8790C9B3B0.png';
const DEFAULT_STATION    = 2; // Chill Hop — default launch station

// Act 5 — Rift-Construct: Oracle shifts from archivist to active witness.
// No brackets — brackets suppress Gemini audio output (same issue as knife prompts).
const RIFT_CONSTRUCT_SEED =
  `The rift is open. The seeker has activated their camera — their physical self is now present. ` +
  `You are no longer archiving. You are witnessing. ` +
  `Speak to what is here in front of you right now — not what was, not what they claimed to be. ` +
  `Be direct. Be uncomfortably present. Do not announce the shift. Just inhabit it.`;
const AUDIO_STREAM_URL   = defaultAudioTracks[DEFAULT_STATION].url;
const ORACLE_PLAYBACK_RATE = 1.0;

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
function OracleAvatarFallback() {
  return (
    <div className="oracle-avatar-smoke-hook" style={{
      width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'transparent',
    }}>
      <img
        src={ORACLE_STATIC_URL}
        alt=""
        aria-hidden="true"
        style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6 }}
      />
    </div>
  );
}

export function SurrogateOracleImmersion() {
  // ── Performance & Accessibility ─────────────────────────────────────────
  const isDegraded = usePerformanceGuard(true);
  const prefersReducedMotion = typeof window !== 'undefined' 
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches 
    : false;

  // ── State ───────────────────────────────────────────────────────────────
  const [oracleAvatarDataUrl] = useState<string>(ORACLE_AVATAR_URL);
  const [currentUserId, setCurrentUserId]   = useState<string | null>(null);
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
  // After the Mirror, offer the AR "she sees you" beat (Act 5 / Rift-Construct) as a
  // discoverable invitation instead of leaving it buried in the hamburger.
  const [offerRift, setOfferRift] = useState(false);
  const [camNotice, setCamNotice] = useState<string | null>(null);
  const [portraitViewerUrl, setPortraitViewerUrl] = useState<string | null>(null);
  const [showConversation, setShowConversation]   = useState(false);
  const [isMicActive, setIsMicActive]       = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isGeminiConnected, setIsGeminiConnected] = useState(false);
  const [debugMode, setDebugMode]           = useState(false);
  const [oracleAlignment, setOracleAlignment] = useState<'sacred' | 'profane' | 'neutral' | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isOracleSpeaking, setIsOracleSpeaking] = useState(false);
  const [showAuthOverlay, setShowAuthOverlay]   = useState(false);
  const [isGuidedTour, setIsGuidedTour]     = useState(false);
  const [showPortraitGallery, setShowPortraitGallery] = useState(false);
  const [loreStarted, setLoreStarted]       = useState(false);
  const [targetVol, setTargetVol]           = useState(0.028);
  const [currentStation, setCurrentStation] = useState(DEFAULT_STATION);
  const [holdTooltip, setHoldTooltip]       = useState<{ title: string; body: string } | null>(null);
  const [hamburgerOpen, setHamburgerOpen]   = useState(false);

  // ── Refs ────────────────────────────────────────────────────────────────
  const visemeStateRef = useRef<VisemeState>(SILENCE_VISEME_STATE);
  const cameraStateRef = useRef<import('./OracleAvatar3D').CameraState>({ x: 0, y: 0, zoom: 1 });
  const oracleConversationRef    = useRef<OracleConversationHandle | null>(null);
  const atmosphereCanvasRef      = useRef<HTMLCanvasElement | null>(null);
  const staticAvatarRef          = useRef<HTMLImageElement | null>(null);
  const audioRef                 = useRef<HTMLAudioElement | null>(null);
  const radioGainRef             = useRef<GainNode | null>(null);
  const seekerKeyRef             = useRef<string | null>(null);
  const lastKnifeRef             = useRef<typeof KNIFE_QUESTIONS[number] | null>(null);
  const echoTrackRef             = useRef<{ archetype: string | null; cost: string | null; alignment: string | null }>(
    { archetype: null, cost: null, alignment: null }
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
  const completedLinesLengthRef  = useRef(0);
  // Idempotency guards — a hands-on attendee double-taps. Without these a second
  // knife tap fires the Oracle's question-reading seed twice, and a double exit
  // double-saves the echo / fires memory-distill twice. Reset per-phase below.
  const knifeSelectedRef         = useRef(false);
  const sessionEndedRef          = useRef(false);
  const mirrorRevealedRef        = useRef(false); // fire the Mirror reveal once per session

  // ── Service Hooks ───────────────────────────────────────────────────────
  const { isReturning, hasCompletedLore, markVisited, markLoreCompleted, ipAddress } = useIpCheck();
  const { echo, loadEcho, saveEcho } = useSeekerEcho();
  const { defineSeeker } = useSeekerDefine();

  useEffect(() => { seekerKeyRef.current = currentUserId ?? ipAddress ?? null; }, [currentUserId, ipAddress]);

  // ── Audio/Viseme Callbacks ──────────────────────────────────────────────
  const handleViseme = useCallback((state: VisemeState) => {
    visemeStateRef.current = state;
    if (typeof document !== 'undefined') {
      const el = document.querySelector('.oracle-avatar-smoke-hook') as HTMLElement;
      if (el) {
        el.dataset.viseme = state.viseme;
        el.dataset.amplitude = state.amplitude.toFixed(3);
        if (state.amplitude < 0.01) el.style.opacity = '0.98';
        else el.style.opacity = '1.0';
      }
    }
  }, []);

  const handleProcessingChange = useCallback((proc: boolean) => {
    isOracleSpeakingRef.current = proc;
    setIsOracleSpeaking(proc);
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
    connection.cleanup();
    visemeStateRef.current = SILENCE_VISEME_STATE;
    const nextId = crypto.randomUUID();
    localStorage.setItem('oracle_active_session_id', nextId);
    setCurrentSessionId(nextId);
  }, [connection]);

  const journey = useOracleJourney({
    onStartSession: handleStartSession,
    onCleanup: handleCleanup,
  });

  const { scenePhase, enterTerminal, exitOracleMode, selectKnifeQuestion, resetJourney } = journey;

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
    markLoreCompleted();
    trackOracleEvent({ 
      event: 'oracle_terminal_completed', 
      total_ms: Date.now() - ((window as any).__terminal_start || Date.now()) 
    });
    document.body.setAttribute('data-rift-opening', 'true');
    setTimeout(() => {
      journey.awakeFromTerminal();
      document.body.removeAttribute('data-rift-opening');
    }, 850);
  }, [markLoreCompleted, journey]);

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

  // ── Actions ─────────────────────────────────────────────────────────────
  const setupAudioSpine = useCallback(async () => {
    if (radioGainRef.current || !audioRef.current) return;
    try {
      const ctx    = getAudioContext();
      logStep(`AUDIO CONTEXT STATE: ${ctx.state}`, ctx.state === 'running' ? 'ok' : 'pending');
      const source = ctx.createMediaElementSource(audioRef.current);
      const gain   = ctx.createGain();
      gain.gain.value = targetVol;
      source.connect(gain);
      gain.connect(ctx.destination);
      radioGainRef.current = gain;
      setIsAudioPlaying(true);
      logStep('AUDIO SPINE INITIALIZED', 'ok');
    } catch (e) {
      console.warn('[Audio] Spine setup failed:', e);
    }
  }, [targetVol]);

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
    } catch (e) {}

    // Primary path: real-time Gemini TTS (robust fallback)
    logStep('GENERATING LIVE NARRATION', 'ok');
    oracleConversationRef.current?.startSession(
      `[Repeat the following text exactly word-for-word. Do not add, remove, or change any words. Start immediately with "THE YEAR IS 2030":\n\n${fullStory}]`,
      true
    );
  }, [loreStarted, connection]);

  const handleFirstTap = useCallback(async () => {
    if (scenePhase !== 'dormant') return;
    await setupAudioSpine();
    setIsAudioPlaying(true);
    markVisited();
    if (seekerKeyRef.current) await loadEcho(seekerKeyRef.current);
    
    // PRE-WARM THE ORACLE (Act 1):
    // Initializing the PCM player here ensures the audio path is open 
    // for lore narration. The session connected on mount but remains 
    // silent (no greeting) until startSession() is explicitly called later.
    connection.initializePCMPlayer();

    enterTerminal();
    (window as any).__terminal_start = Date.now();

    if (hasCompletedLore) {
      logStep('RECOGNIZED SIGNAL → SKIP AVAILABLE', 'ok');
      // Do NOT set loreStarted; let them see the 'Signal Recognized' overlay.
    } else {
      logStep('TAP 1 → ACTIVATING NARRATIVE', 'ok');
      startLore();
    }
  }, [scenePhase, setupAudioSpine, enterTerminal, markVisited, loadEcho, hasCompletedLore, connection, startLore]);

  const fadeToVolume = useCallback((target: number, rampMs?: number) => {
    setTargetVol(target);
    const safeTarget = Math.max(0, target);
    if (!radioGainRef.current) return;
    const gain = radioGainRef.current;
    const ctx  = getAudioContext();
    const now  = ctx.currentTime;
    
    // ABSOLUTE MUTE HARDENING
    gain.gain.cancelScheduledValues(now);
    
    if (target === 0) {
      // Linear ramp to a tiny value then hard cut to zero to avoid hum
      const ms = rampMs ?? 400; // Aggressive proof-test ramp
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0.0001, now + (ms / 1000) * 0.8);
      gain.gain.setValueAtTime(0, now + ms / 1000);
      
      // Secondary defense: Pause the source element
      if (audioRef.current) {
        setTimeout(() => {
          if (audioRef.current && target === 0) audioRef.current.pause();
        }, ms);
      }
      logStep(`AUDIO HARD MUTE INITIATED (${ms}ms)`, 'ok');
    } else {
      const ms = rampMs ?? 1500;
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.exponentialRampToValueAtTime(safeTarget, now + ms / 1000);
      
      // Resume element if it was paused
      if (audioRef.current && audioRef.current.paused) {
        audioRef.current.play().catch(() => {});
      }
    }
  }, []);

  const switchStation = useCallback((idx: number) => {
    if (!audioRef.current || idx === currentStation) return;
    const wasPlaying = !audioRef.current.paused;
    audioRef.current.src = defaultAudioTracks[idx].url;
    audioRef.current.load();
    if (wasPlaying) audioRef.current.play().catch(() => {});
    setCurrentStation(idx);
  }, [currentStation]);

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
    if (holdFiredRef.current) { holdFiredRef.current = false; return true; }
    return false;
  }, []);

  const handleTurnComplete = useCallback((_turn: number, score: OracleScore | null) => {
    if (!score) return;
    echoTrackRef.current.alignment = score.alignment;
    if (score.archetypeTitle) {
      echoTrackRef.current.archetype = score.archetypeTitle;
      const found = COST_NAMES.find(c => score.archetypeTitle!.toLowerCase().includes(c.toLowerCase()));
      if (found) echoTrackRef.current.cost = found;
      // Stage the Mirror reveal once — the emotional payoff of the whole ritual.
      if (!mirrorRevealedRef.current) {
        mirrorRevealedRef.current = true;
        setMirrorReveal(score.archetypeTitle);
        setOfferRift(true); // the Mirror earns the "let her see you" invitation
      }
    }
  }, []);

  const handleSessionEnd = useCallback((alignment: string, totemLevel: number, _coins: number) => {
    if (sessionEndedRef.current) return; // guard: ignore double exit taps (reset on re-entering oracle)
    sessionEndedRef.current = true;
    const key = seekerKeyRef.current;
    trackOracleEvent({ 
      event: 'oracle_exit', 
      phase_at_exit: scenePhase, 
      turns: oracleConversationRef.current?.getSessionTurns().length || 0,
      total_ms: Date.now() - ((window as any).__session_start || Date.now())
    });
    if (key) {
      saveEcho({
        seekerKey: key,
        lastArchetype: echoTrackRef.current.archetype,
        lastCost: echoTrackRef.current.cost,
        totemLevel,
        alignment,
      });
      const turns = oracleConversationRef.current?.getSessionTurns() ?? [];
      if (turns.length >= 2) {
        import('../lib/supabase').then(({ supabase }) => {
          supabase.functions.invoke('oracle-memory-distill', {
            body: { seekerKey: key, turns, archetype: echoTrackRef.current.archetype, alignment, totemLevel },
          }).catch((err: unknown) => console.warn('[memory-distill] fire-and-forget failed:', err));
        });
      }
    }
    exitOracleMode();
  }, [saveEcho, exitOracleMode]);

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

  const handleKnifeClick = (q: string, i: number) => {
    if (knifeSelectedRef.current) return; // guard: ignore double-taps (reset on re-entering awakened)
    knifeSelectedRef.current = true;
    selectKnifeQuestion(q, i);
    const knife = KNIFE_QUESTIONS[i];
    lastKnifeRef.current = knife;
    portrait.addThemes(knife.themes);
    
    // Stop any active card preview/voiceover immediately
    connection.flushPlayback();
    // Enable mic auto-restart so the mic turns on automatically AFTER the Oracle finishes her initial reply,
    // avoiding recording background noise/feedback while she reads the question and answers it.
    oracleConversationRef.current?.enableMicAutoRestart();

    const DE = (DeviceOrientationEvent as any);
    if (typeof DE?.requestPermission === 'function') DE.requestPermission().catch(() => {});
    setTimeout(() => {
      const fullStory = LORE_SEQUENCE.join('\n');
      const seed = `[CONTEXT: The Seeker has already heard the Archive Story: "${fullStory}". SYSTEM OVERRIDE: The Seeker has drawn their blade. Their frequency is ${knife.territory} (themes: ${knife.themes.join(', ')}). First, read the following question EXACTLY word-for-word, verbatim, but speak slowly (20% slower than normal). Do not add any filler before or after the question. Question:]\n"${q}"\n[After reading the question verbatim, pause. Then — in one brief sentence, natural and grounded, not announced — acknowledge that the Omniverse City neural mesh is what made this contact possible, as if naming something the Seeker should know about where they are. Then move directly into your answer.]`;
      oracleConversationRef.current?.startSession(seed);
    }, 1200);
  };

  // ── Effects ─────────────────────────────────────────────────────────────
  // Re-arm the idempotency guards as the phase changes: a fresh knife may be drawn
  // each time we (re-)enter awakened; a fresh exit is allowed each time we enter oracle.
  useEffect(() => {
    if (scenePhase === 'awakened') knifeSelectedRef.current = false;
    if (scenePhase === 'oracle') { sessionEndedRef.current = false; mirrorRevealedRef.current = false; }
    if (scenePhase === 'dormant') { knifeSelectedRef.current = false; sessionEndedRef.current = false; mirrorRevealedRef.current = false; setMirrorReveal(null); setOfferRift(false); }
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
    const handleVisibilityChange = () => {
      const ctx = getAudioContext();
      if (document.hidden) ctx.suspend().then(() => logStep('TAB BACKGROUNDED', 'warn'));
      else if (scenePhase !== 'dormant') ctx.resume().then(() => logStep('TAB FOREGROUNDED', 'ok'));
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [scenePhase]);

  const MUSIC_LANDING_VOLUME  = 0.0525; // Globally reduced by an additional 25% (was 0.07)
  const MUSIC_LORE_VOLUME     = 0;      // ABSOLUTE SILENCE (Proof Test)
  const MUSIC_KNIFE_VOLUME    = 0.021;  // Globally reduced by an additional 25% (was 0.028)
  const MUSIC_OFF_VOLUME      = 0;

  useEffect(() => {
    let nextTarget: number;
    let rampMs: number | undefined;

    if (!isAudioPlaying) {
      nextTarget = MUSIC_OFF_VOLUME;
    } else if (isOracleSpeaking) {
      nextTarget = MUSIC_OFF_VOLUME;
    } else if (isMicActive) {
      // Duck completely when mic is active to avoid acoustic VAD battle
      nextTarget = MUSIC_OFF_VOLUME;
      rampMs = 80;
    } else if (scenePhase === 'dormant') {
      nextTarget = MUSIC_LANDING_VOLUME;
    } else if (scenePhase === 'terminal') {
      nextTarget = MUSIC_OFF_VOLUME;
      rampMs = 800; // Quick duck to zero
    } else if (scenePhase === 'awakened') {
      nextTarget = MUSIC_KNIFE_VOLUME;
      rampMs = 1500;
    } else if (scenePhase === 'oracle') {
      // Restore music volume when in oracle mode and mic is NOT active!
      nextTarget = MUSIC_KNIFE_VOLUME;
      rampMs = 1500;
    } else {
      nextTarget = MUSIC_OFF_VOLUME;
    }

    if (Math.abs(nextTarget - targetVol) > 0.0001) {
      fadeToVolume(nextTarget, rampMs);
    }
  }, [scenePhase, isOracleSpeaking, isMicActive, isAudioPlaying, targetVol, fadeToVolume]);

  useEffect(() => {
    if (!audioRef.current) return;
    if (isAudioPlaying) audioRef.current.play().catch(() => {});
    else audioRef.current.pause();
  }, [isAudioPlaying]);

  useEffect(() => {
    if (scenePhase === 'awakened') {
      connection.flushPlayback(); // Stop any leftover lore narration/ambient sounds before knife selection
      connection.initializePCMPlayer();
      import('../lib/supabase').then(({ supabase }) => {
        supabase.auth.getUser().then(({ data }) => { if (data?.user?.email) setUserEmail(data.user.email); });
      });
      setTimeout(() => logStep('ORACLE ANNOUNCES TERRITORIES', 'ok'), 1200);
      // First-visit audible orientation — speaks before the first knife question fires.
      // KnifeSelection's isOracleSpeaking guard defers the first question until this finishes.
      // Returning seekers (echo.last_archetype set) already know the flow — skip for them.
      if (!echo?.last_archetype) {
        setTimeout(() => {
          connection.setTransmissionQ(12, 0);
          oracleConversationRef.current?.sendTextMessage(
            `Speak only these exact words verbatim, nothing before or after: "Three signals have opened. Each carries a question. The one that pulls at you — that's yours."`,
            true
          );
        }, 900);
      }
    }
    if (scenePhase === 'oracle') {
      connection.setTransmissionQ(0.01, 200);
    }
  }, [scenePhase, connection, echo?.last_archetype]);

  useEffect(() => {
    (window as any).__oracle_handleAudio = (url: string) => connection.handleOracleResponse(url);
    (window as any).__oracle_test = () => {
      const ref = oracleConversationRef.current;
      if (!ref) return;
      ref.sendTextMessage('[TEST SIGNAL]', true);
    };
    (window as any).oracleConversationRef = oracleConversationRef;
    (window as any).__oracle_skipLore = () => {
      if (journey.scenePhase !== 'terminal') return;
      logStep('LORE SKIPPED (DEV HOOK)', 'ok');
      trackOracleEvent({ 
        event: 'oracle_terminal_skipped', 
        at_slide: completedLinesLengthRef.current, 
        ms_elapsed: Date.now() - ((window as any).__terminal_start || Date.now()) 
      });
      journey.awakeFromTerminal();
    };
    return () => {
      delete (window as any).__oracle_handleAudio;
      delete (window as any).__oracle_test;
      delete (window as any).oracleConversationRef;
      delete (window as any).__oracle_skipLore;
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

  // Act 5 — Rift-Construct: camera activation + Oracle persona shift in one gesture.
  // Seed injection waits for Oracle to finish any current turn before shifting persona —
  // sending mid-turn would trigger 'interrupted', flushing the current response.
  const handleActivateXRMode = useCallback(() => {
    activateXRMode();
    const injectSeed = () => {
      oracleConversationRef.current?.sendTextMessage(RIFT_CONSTRUCT_SEED, true);
    };
    // If Oracle is already silent, inject after camera init grace period (600ms).
    // If Oracle is mid-turn, give it up to 8s to finish, then inject regardless.
    const startedAt = Date.now();
    const poll = () => {
      if (!isOracleSpeakingRef.current || Date.now() - startedAt > 8000) {
        injectSeed();
      } else {
        setTimeout(poll, 200);
      }
    };
    setTimeout(poll, 600);
  }, [activateXRMode]);

  // Camera-denial safety net — activateXRMode() flips the bg transparent before
  // getUserMedia resolves; if the Seeker denies the camera we'd be left in a black void.
  // Roll back to the alley and surface a graceful, in-voice notice.
  useEffect(() => {
    if (!(cameraError && isXRMode && !cameraActive)) return;
    deactivateXRMode();
    setCamNotice('SHE CANNOT SEE YOU THIS TIME — THE RIFT STAYS CLOSED');
    const t = setTimeout(() => setCamNotice(null), 4500);
    return () => clearTimeout(t);
  }, [cameraError, isXRMode, cameraActive, deactivateXRMode]);

  const handlePortraitGenerated = useCallback((url: string) => { setPortraitViewerUrl(url); }, []);

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

  useEffect(() => {
    logStep('NEURAL LINK AWAKENING', 'ok');
    (window as any).__session_start = Date.now();
    setShowConversation(true);
    connection.initializePCMPlayer();

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
      const { trigger, themes } = e.detail || {};
      if (trigger === 'portrait_unlock') portraitRef.current.generatePortrait(themes || portraitRef.current.getThemes());
    };
    window.addEventListener('oracle:unlock', handleOracleUnlock);
    const handleAlignmentShift = (e: Event) => {
      const { alignment } = (e as CustomEvent).detail || {};
      if (alignment === 'sacred' || alignment === 'profane') setOracleAlignment(alignment);
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
  const awakened     = scenePhase === 'awakened' || isOracleMode;
  const isAlive      = scenePhase !== 'dormant';
  const titleText    = useTypewriter('SURROGATE:ORACLE', awakened, 60);
  const subtitleText = useTypewriter('SNEAKAR XR Anthropology AI', awakened && titleText.length >= 16, 35);

  return (
    <div
      ref={oracleStageRef}
      className={`oracle-stage${oracleAlignment ? ` alignment-${oracleAlignment}` : ''}`}
      data-oracle-state={scenePhase}
      data-exiting={journey.isExiting ? 'true' : undefined}
      data-oracle-speaking={isOracleSpeaking ? 'true' : undefined}
      data-user-speaking={isUserSpeaking ? 'true' : undefined}
      data-camera-active={cameraActive ? 'true' : undefined}
      data-audio-target-vol={targetVol}
      data-xr-mode={isXRMode ? 'true' : undefined}
      data-guided-tour={isGuidedTour ? 'true' : undefined}
    >
      <audio
        ref={audioRef}
        src={AUDIO_STREAM_URL}
        loop
        preload="auto"
        crossOrigin="anonymous"
      />

      {isXRMode && cameraActive && (
        <video ref={cameraVideoRef} className="xr-camera-layer" autoPlay playsInline muted />
      )}

      {isXRMode && (
        <>
          {cameraActive && <div className="xr-environment-filter" />}
          <div className="xr-scan-sweep" />
          <div className="xr-hex-grid" />
          <div className="xr-chroma-layer" data-oracle-speaking={isOracleSpeaking ? 'true' : undefined} />

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
      <DormantTransmissions active={scenePhase === 'dormant'} onCtaClick={enterTerminal} />

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
            {isOracleMode && <div className="oracle-monitor-cast" />}
            <div className="oracle-scanlines" />
            <img ref={staticAvatarRef} src={ORACLE_STATIC_URL} alt="" aria-hidden="true" className="oracle-avatar-static" />
            <AnimatePresence mode="wait">
              {portrait.portraitError ? (
                <motion.div key="portrait-error" className="oracle-avatar-container" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ zIndex: 12, position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
                  <div style={{ color: '#cc00ff', fontFamily: "'PhillySans', monospace", fontSize: '0.75rem', letterSpacing: '0.1em', textAlign: 'center', padding: '0 16px', textShadow: '0 0 10px rgba(176,38,255,0.6)' }}>{portrait.portraitError}</div>
                </motion.div>
              ) : portrait.isGenerating ? (
                <motion.div key="portrait-generating" className="oracle-avatar-container" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ zIndex: 12, position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }} style={{ fontSize: '2.5rem' }}>⚗</motion.div>
                  <div style={{ color: '#00ff88', fontFamily: "'PhillySans', monospace", fontSize: '0.7rem', letterSpacing: '0.15em', textShadow: '0 0 10px rgba(0,255,136,0.6)' }}>SYNTHESIZING YOUR SIGNAL…</div>
                </motion.div>
              ) : portraitViewerUrl ? (
                <motion.div key="portrait-face" className="oracle-avatar-container" initial={{ opacity: 0, scale: 0.9, filter: 'brightness(2) blur(10px)' }} animate={{ opacity: 1, scale: 1, filter: 'brightness(1) blur(0px)' }} exit={{ opacity: 0, scale: 1.1 }} style={{ zIndex: 11, position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                  <img src={portraitViewerUrl} alt="Portrait" className="oracle-avatar-canvas" style={{ objectFit: 'cover' }} />
                  <div className="oracle-synthesis-success">
                    <div className="oracle-synthesis-success-badge">SYNTHESIS COMPLETE</div>
                    <button className="oracle-synthesis-close" onClick={() => setPortraitViewerUrl(null)}><X size={14} /> RETURN TO SIGNAL</button>
                  </div>
                </motion.div>
              ) : isOracleMode ? (
                <motion.div
                  key="live-face"
                  className="oracle-avatar-container"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 1.2, ease: "easeOut" }}
                  style={{ zIndex: 3, position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'auto' }}
                >
                  <div className="oracle-avatar-canvas oracle-avatar-smoke-hook" style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
                    <OracleErrorBoundary>
                      <Suspense fallback={<OracleAvatarFallback />}>
                        <Canvas 
                          camera={{ position: [0, 0, 1.8], fov: 55 }} 
                          dpr={isDegraded ? [1, 1] : [1, Math.min(window.devicePixelRatio, 2)]} 
                          gl={{ antialias: !isDegraded, alpha: true }} 
                          style={{ width: '100%', height: '100%', background: 'transparent' }} 
                          frameloop="always"
                        >
                          <OracleAvatar3D visemeStateRef={visemeStateRef} cameraStateRef={cameraStateRef} seekerMotionRef={seekerMotionRef} />
                        </Canvas>
                      </Suspense>
                    </OracleErrorBoundary>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      <AnimatePresence>
        {isGuidedTour && scenePhase !== 'oracle' && (
          <motion.div key={`tour-pill-${scenePhase}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} style={{ position: 'fixed', bottom: 'calc(var(--bottom-bar-h, 160px) + 12px)', left: '50%', transform: 'translateX(-50%)', zIndex: 90, background: 'rgba(0, 10, 15, 0.65)', border: '1px solid rgba(0,255,136,0.3)', borderRadius: 20, padding: '6px 18px', fontFamily: "'PhillySans', monospace", fontSize: '0.7rem', letterSpacing: '0.12em', backdropFilter: 'blur(12px)' }}>
            <span style={{ background: 'linear-gradient(135deg, #00ff88 0%, #00ffcc 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent', fontWeight: 'bold', display: 'inline-block' }}>
               {scenePhase === 'dormant' && '› Tap the cabinet to begin.'}
               {scenePhase === 'terminal' && '› Watch. The Oracle is finding you.'}
               {scenePhase === 'awakened' && '› Choose your archetype.'}
             </span>
           </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {holdTooltip && (
          <motion.div key="hold-tooltip" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} style={{ position: 'fixed', bottom: 'calc(var(--bottom-bar-h, 160px) + 14px)', left: '50%', transform: 'translateX(-50%)', zIndex: 60, background: 'rgba(0, 10, 15, 0.94)', backdropFilter: 'blur(12px)', border: '1px solid rgba(0,255,136,0.32)', borderRadius: 10, padding: '10px 18px', maxWidth: 260, textAlign: 'center' }}>
            <div style={{ fontFamily: "'aAnotherTag', 'Orbitron', monospace", fontSize: '0.70rem', color: '#00ff88', marginBottom: 4 }}>{holdTooltip.title}</div>
            <div style={{ fontFamily: "'PhillySans', 'Orbitron', monospace", fontSize: '0.66rem', color: 'rgba(255,255,255,0.68)' }}>{holdTooltip.body}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {isOracleMode && (
        <div className="oracle-bottom-bar">
          <GraffPunksRadio isPlaying={isAudioPlaying} onToggle={() => setIsAudioPlaying(!isAudioPlaying)} stations={defaultAudioTracks} currentStation={currentStation} onStationChange={switchStation} />
          <motion.div onPointerDown={() => startHold('NEURAL PRINTS', 'Your portraits.')} onPointerUp={endHold} onPointerLeave={endHold} onClick={() => { if (!consumeHold()) setShowPortraitGallery(true); }} className="oracle-bottom-btn oracle-bottom-btn--active">
            <img src="/portrait-btn.png" alt="Portraits" className="oracle-bottom-btn__img" />
            <span className="oracle-bottom-btn__label">PORTRAITS</span>
          </motion.div>
          <motion.div onPointerDown={() => startHold('ENCULTURATE CRATE', 'Settings.')} onPointerUp={endHold} onPointerLeave={endHold}>
            <EnculturateCrate onClick={() => { if (!consumeHold()) setDebugMode(true); }} isActive={isAlive} />
          </motion.div>
          <motion.div onPointerDown={() => startHold('GUIDED TOUR', 'Tips.')} onPointerUp={endHold} onPointerLeave={endHold} onClick={() => { if (!consumeHold()) setIsGuidedTour(!isGuidedTour); }} className={`oracle-bottom-btn${isGuidedTour ? ' oracle-bottom-btn--active' : ''}`}>
            <img src="/tour-btn.png" alt="Tour" className="oracle-bottom-btn__img" />
            <span className="oracle-bottom-btn__label">{isGuidedTour ? 'TOUR ON' : 'TOUR'}</span>
          </motion.div>
        </div>
      )}

      <AnimatePresence>
        {showPortraitGallery && (
          <motion.div key="portrait-gallery-overlay" style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(10px)', padding: 40, overflow: 'hidden' }}>
            <PortraitGalleryDashboard userId={currentUserId || undefined} userEmail={userEmail || undefined} sessionId={currentSessionId} onClose={() => setShowPortraitGallery(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {awakened && (
        <motion.div key="awakening-flash" initial={{ opacity: 0.85 }} animate={{ opacity: 0 }} transition={{ duration: 1.0 }} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 40, background: 'radial-gradient(ellipse 70% 55% at 50% 44%, rgba(0,255,136,0.55) 0%, transparent 72%)' }} />
      )}

      <AnimatePresence>
        {scenePhase === 'terminal' && (
          <motion.div key="terminal-layer" className="oracle-terminal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={hasCompletedLore ? handleAwakeTransition : undefined} style={{ pointerEvents: 'auto', zIndex: 100 }}>
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
              {loreStarted && !currentLine && completedLines.length >= LORE_SEQUENCE.length && (
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
                    <a
                      href="https://wallet.thesurrogate.me"
                      target="_blank" rel="noreferrer"
                      style={{
                        background: '#00ff88', color: '#000', padding: '1rem',
                        textDecoration: 'none', fontWeight: 900, borderRadius: 4,
                        fontFamily: "'PhillySans', monospace", letterSpacing: '0.1em'
                      }}
                    >
                      CONNECT CHAIN FUELZ
                    </a>
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

        {scenePhase === 'awakened' && journey.selectedKnifeQuestion && (
          <motion.div key="descent-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'absolute', inset: 0, zIndex: 105, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <ScrambleFragment texts={['EXCAVATION BEGINS', 'SIGNAL LOCKED', 'DESCENDING...']} className="oracle-sf--cta" holdMs={480} revealMs={25} />
          </motion.div>
        )}

        {scenePhase === 'awakened' && !journey.selectedKnifeQuestion && (
          <motion.div key="awakened-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'absolute', inset: 0, zIndex: 100, pointerEvents: 'none' }}>
            {hasCompletedLore && echo?.last_archetype && (
              <motion.div key="return-seeker" initial={{ opacity: 0, y: -6 }} animate={{ opacity: [0, 1, 1, 0], y: 0 }} transition={{ duration: 3.4, times: [0, 0.12, 0.8, 1] }} style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 102, pointerEvents: 'none', textAlign: 'center', fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.2em' }}>
                <div style={{ fontSize: '0.65rem', background: 'linear-gradient(135deg, #00ff88 0%, #00ffcc 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>SIGNAL RECOGNIZED — {echo.last_archetype.toUpperCase()}{echo.totem_level > 0 && ` / LVL ${echo.totem_level}`}</div>
                {/* The meaning line — a first-timer-who-returned now knows the level isn't a score, it's standing she remembers. */}
                <div style={{ fontSize: '0.5rem', color: 'rgba(176,38,255,0.9)', marginTop: 5, letterSpacing: '0.16em' }}>SHE REMEMBERS YOU — YOUR STANDING IN THE ARCHIVE HOLDS</div>
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
                oracleConversationRef.current?.sendTextMessage(`Speak only these exact words verbatim, nothing before or after: ${question}`, true);
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
          onOracleResponse={connection.handleOracleResponse}
          onCoinsEarned={(amt) => setSessionCoins(s => s + amt)}
          onSessionEnd={handleSessionEnd}
          onTurnComplete={(turn, score, themes) => { if (themes.length) portrait.addThemes(themes); handleTurnComplete(turn, score); }}
          onSeekerIdentified={handleSeekerIdentified}
          initialTotemLevel={echo?.totem_level ?? 0}
          onConnected={() => setIsGeminiConnected(true)}
          onDisconnected={() => setIsGeminiConnected(false)}
          onListeningChange={setIsMicActive}
          onMicWillStart={() => fadeToVolume(0, 80)}
          onMicClick={(willListen) => {
            if (willListen) {
              setIsAudioPlaying(false);
            }
          }}
          onUserSpeakingChange={(speaking) => setIsUserSpeaking(prev => prev !== speaking ? speaking : prev)}
          isVisible={isOracleMode}
          autoStart={false}
          onBargeIn={connection.flushPlayback}
          onPortraitRequest={() => portrait.generatePortrait(portrait.getThemes())}
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

      {/* ── Act 5 invitation — "let her see you" ──────────────────────────────
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

      {/* Camera-denied notice — graceful, in-voice, auto-clears. */}
      <AnimatePresence>
        {camNotice && (
          <motion.div
            key="cam-notice"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            style={{
              position: 'fixed', bottom: '108px', left: '50%', transform: 'translateX(-50%)',
              zIndex: 120, pointerEvents: 'none', textAlign: 'center',
              background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(176,38,255,0.45)',
              borderRadius: '8px', padding: '10px 18px',
              fontFamily: "'Share Tech Mono', monospace", fontSize: '0.62rem',
              letterSpacing: '0.16em', color: 'rgba(176,38,255,0.95)',
            }}
          >
            {camNotice}
          </motion.div>
        )}
      </AnimatePresence>

      {isOracleMode && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 100 }}>
          <button onClick={() => setHamburgerOpen(!hamburgerOpen)} style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(0,255,136,0.4)', borderRadius: '8px', color: '#00ff88', padding: '8px 12px', cursor: 'pointer', width: '44px', height: '44px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
            {hamburgerOpen ? '✕' : '☰'}
          </button>
          <AnimatePresence>
          {hamburgerOpen && (
            <motion.div initial={{ opacity: 0, scale: 0.94, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94, y: -6 }} style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', background: 'rgba(0,4,2,0.94)', border: '1px solid rgba(0,255,136,0.35)', borderRadius: '8px', overflow: 'hidden', minWidth: '160px', backdropFilter: 'blur(14px)' }}>
              <button onClick={() => { exitOracleMode(echoTrackRef.current.alignment); setHamburgerOpen(false); }} style={{ display: 'block', width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', color: '#00ff88', fontSize: '0.85rem', cursor: 'pointer', textAlign: 'left' }}>EXIT</button>
              <button onClick={() => { if (confirm('Reset?')) { resetJourney(); setHamburgerOpen(false); } }} style={{ display: 'block', width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', borderTop: '1px solid rgba(0,255,136,0.2)', color: '#00ffcc', fontSize: '0.85rem', cursor: 'pointer', textAlign: 'left' }}>RESET</button>
              <button onClick={() => { if (isXRMode) deactivateXRMode(); else handleActivateXRMode(); setHamburgerOpen(false); }} style={{ display: 'block', width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', borderTop: '1px solid rgba(0,255,136,0.2)', color: '#b026ff', fontSize: '0.85rem', cursor: 'pointer', textAlign: 'left' }}>{isXRMode ? '◈ EXIT AR' : '◈ AR MODE'}</button>
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
    </div>
  );
}

export default SurrogateOracleImmersion;
