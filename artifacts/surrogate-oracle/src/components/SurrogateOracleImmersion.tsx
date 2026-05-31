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
import { DormantTransmissions } from './ambient/GhostTransmissions';
import { GlitchCursor } from './ambient/GlitchCursor';
import { KnifeSelection, KNIFE_QUESTIONS } from './KnifeSelection';
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

// Data
import { COST_NAMES } from '../data/archetypes';

// Libs/Utils
import { getAudioContext } from '../lib/oracleSfx';
import type { VisemeState } from '../lib/visemeDetector';
import { defaultAudioTracks } from '../config/audioTracks';
import './SurrogateOracleImmersion.css';

const ORACLE_STATIC_URL  = 'https://i.postimg.cc/26pvW2SN/orackle-only-static.png';
const ORACLE_AVATAR_URL  = '/oracle-avatar-live.png';
const ALLEY_BG_URL       = 'https://i.postimg.cc/jSJRRRk2/7D633B70-4C62-4326-92A8-3B8790C9B3B0.png';
const AUDIO_STREAM_URL   = defaultAudioTracks[0].url; // Graff Punks — always the launch station
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
  const [oracleAvatarDataUrl] = useState<string>(ORACLE_AVATAR_URL);
  const [currentUserId, setCurrentUserId]   = useState<string | null>(null);
  // Stable session ID — survives page reloads so localStorage turns persist across
  // reconnects. A new UUID is written to localStorage on session exit (handleCleanup)
  // so the *next* encounter always starts fresh.
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
  const [portraitViewerUrl, setPortraitViewerUrl] = useState<string | null>(null);
  const [showConversation, setShowConversation]   = useState(false);
  const [isMicActive, setIsMicActive]       = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isGeminiConnected, setIsGeminiConnected] = useState(false);
  const [debugMode, setDebugMode]           = useState(false);
  const [oracleAlignment]                   = useState<'sacred' | 'profane' | 'neutral' | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isOracleSpeaking, setIsOracleSpeaking] = useState(false);
  const [showAuthOverlay, setShowAuthOverlay]   = useState(false);
  const [showWalletConnect, setShowWalletConnect] = useState(false);
  const [isGuidedTour, setIsGuidedTour]     = useState(false);
  const [showPortraitGallery, setShowPortraitGallery] = useState(false);

  // ── Viseme state ref — NO useState, no 60fps re-renders ──────────────────
  // OracleAvatar3D reads this directly in useFrame.
  const visemeStateRef = useRef<VisemeState>(SILENCE_VISEME_STATE);

  // ── Camera state ref — parallax look-around + pinch zoom ─────────────────
  // Written by handleParallaxUpdate / handleZoom at up to 60fps, read in useFrame.
  const cameraStateRef = useRef<import('./OracleAvatar3D').CameraState>({ x: 0, y: 0, zoom: 1 });

  // Refs
  const oracleConversationRef    = useRef<OracleConversationHandle | null>(null);
  const atmosphereCanvasRef      = useRef<HTMLCanvasElement | null>(null);
  const staticAvatarRef          = useRef<HTMLImageElement | null>(null);
  const audioRef                 = useRef<HTMLAudioElement | null>(null);
  const radioGainRef             = useRef<GainNode | null>(null);
  const [targetVol, setTargetVol] = useState(0.22);

  // ── Radio stations ───────────────────────────────────────────────────────────
  const [currentStation, setCurrentStation] = useState(0);
  const switchStation = useCallback((idx: number) => {
    if (!audioRef.current || idx === currentStation) return;
    const wasPlaying = !audioRef.current.paused;
    audioRef.current.src = defaultAudioTracks[idx].url;
    audioRef.current.load();
    if (wasPlaying) audioRef.current.play().catch(() => {});
    setCurrentStation(idx);
  }, [currentStation]);

  // ── Hold-tooltip for bottom bar buttons ─────────────────────────────────────
  const [holdTooltip, setHoldTooltip] = useState<{ title: string; body: string } | null>(null);
  const holdTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdFiredRef  = useRef(false);
  const holdAutoRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    // Returns true if a hold fired — caller should skip the tap action
    if (holdFiredRef.current) { holdFiredRef.current = false; return true; }
    return false;
  }, []);

  const { isReturning, hasCompletedLore, markVisited, markLoreCompleted, ipAddress } = useIpCheck();

  // ── Seeker Echo — returning-Seeker memory (Build Contract §E / design §I.5) ──
  // Keyed by wallet (currentUserId) or IP. Read on entry to seed the totem floor;
  // written on session end with the latest archetype / cost / alignment / totem.
  const { echo, loadEcho, saveEcho } = useSeekerEcho();
  const { defineSeeker } = useSeekerDefine();
  const seekerKeyRef = useRef<string | null>(null);
  useEffect(() => { seekerKeyRef.current = currentUserId ?? ipAddress ?? null; }, [currentUserId, ipAddress]);
  // The knife the Seeker drew — stashed so identity resolution can disambiguate by
  // territory/themes without a TDZ dependency on `journey` (defined further down).
  const lastKnifeRef = useRef<typeof KNIFE_QUESTIONS[number] | null>(null);

  // Latest score facts the Oracle surfaced this session — what we persist on exit.
  const echoTrackRef = useRef<{ archetype: string | null; cost: string | null; alignment: string | null }>(
    { archetype: null, cost: null, alignment: null }
  );

  const handleTurnComplete = useCallback((_turn: number, score: OracleScore | null) => {
    if (!score) return;
    echoTrackRef.current.alignment = score.alignment;
    if (score.archetypeTitle) {
      echoTrackRef.current.archetype = score.archetypeTitle;
      // The Oracle composes titles freely ("The Unfinished King"), so derive the
      // cost-shape by scanning the title for a known cost word — best effort, null if none.
      const found = COST_NAMES.find(c => score.archetypeTitle!.toLowerCase().includes(c.toLowerCase()));
      if (found) echoTrackRef.current.cost = found;
    }
  }, []);

  const handleSessionEnd = useCallback((alignment: string, totemLevel: number, _coins: number) => {
    const key = seekerKeyRef.current;
    if (key) {
      saveEcho({
        seekerKey: key,
        lastArchetype: echoTrackRef.current.archetype,
        lastCost: echoTrackRef.current.cost,
        totemLevel,
        alignment,
      });
      // Fire-and-forget: distill session into narrative memory for next encounter
      const turns = oracleConversationRef.current?.getSessionTurns() ?? [];
      if (turns.length >= 2) {
        import('../lib/supabase').then(({ supabase }) => {
          supabase.functions.invoke('oracle-memory-distill', {
            body: {
              seekerKey: key,
              turns,
              archetype: echoTrackRef.current.archetype,
              alignment,
              totemLevel,
            },
          }).catch((err: unknown) => console.warn('[memory-distill] fire-and-forget failed:', err));
        });
      }
    }
    exitOracleMode();
  }, [saveEcho]);

  // The Oracle captured the Seeker's name/handles → resolve them IRL out-of-band
  // (web-grounded, separate from the tool-free live voice) and persist the result.
  // The IRL context is stored on seeker_echo for our side; it is NOT spoken back by
  // the Oracle, whose signal still ends at 2027.
  const handleSeekerIdentified = useCallback(async (name: string | null, handles: string[]) => {
    const knife = lastKnifeRef.current;
    const result = await defineSeeker({
      name: name ?? undefined,
      handles,
      territory: knife?.territory,
      themes: knife?.themes,
    });
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

  // ── Audio Spine setup — must be called inside user gesture ───────────────
  const setupAudioSpine = useCallback(async () => {
    if (radioGainRef.current || !audioRef.current) return;
    try {
      const ctx    = getAudioContext();
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

  const [isOracleSpeakingDelayed, setIsOracleSpeakingDelayed] = useState(false);
  const speakingTimeoutRef = useRef<number | null>(null);
  // Once Oracle first speaks in a session, radio stays at spatial ambience
  // for the rest of the session — no popping back to 0.08 between turns.
  const oracleHasSpokenRef = useRef(false);
  const [isUserSpeakingDelayed, setIsUserSpeakingDelayed]     = useState(false);
  const userSpeakingTimeoutRef = useRef<number | null>(null);

  // ── User speaking handler — with "hold" to prevent radio flicker ────────
  const handleUserSpeakingChange = useCallback((speaking: boolean) => {
    setIsUserSpeaking(speaking);
    if (speaking) {
      if (userSpeakingTimeoutRef.current) window.clearTimeout(userSpeakingTimeoutRef.current);
      setIsUserSpeakingDelayed(true);
    } else {
      userSpeakingTimeoutRef.current = window.setTimeout(() => {
        setIsUserSpeakingDelayed(false);
      }, 600); // 600ms hold after user stops
    }
  }, []);

  // ── Viseme handler — writes to ref only, NO setState ────────────────────
  const handleViseme = useCallback((state: VisemeState) => {
    visemeStateRef.current = state;

    // ── Smoke Test Hooks ──────────────────────────────────────────────────
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
    setIsOracleSpeaking(proc);
    if (proc) {
      if (speakingTimeoutRef.current) window.clearTimeout(speakingTimeoutRef.current);
      setIsOracleSpeakingDelayed(true);
    } else {
      speakingTimeoutRef.current = window.setTimeout(() => {
        setIsOracleSpeakingDelayed(false);
      }, 500);
    }
  }, []);

  // ── Connection Hook ──────────────────────────────────────────────────────
  const connection = useOracleConnection({
    playbackRate: ORACLE_PLAYBACK_RATE,
    onViseme: handleViseme,
    onProcessingChange: handleProcessingChange,
  });

  // ── Journey Hook ─────────────────────────────────────────────────────────
  const handleStartSession = useCallback(() => {
    oracleConversationRef.current?.startSession();
  }, []);

  const handleCleanup = useCallback(() => {
    connection.cleanup();
    // Reset viseme ref to silence on exit
    visemeStateRef.current = SILENCE_VISEME_STATE;
    // Rotate session ID so the next encounter starts with a clean turn log.
    // The old turns remain in localStorage under the old key (available for
    // memory distillation) but the new session won't load them.
    const nextId = crypto.randomUUID();
    localStorage.setItem('oracle_active_session_id', nextId);
    setCurrentSessionId(nextId);
  }, [connection.cleanup]);

  const handleAuthSuccess = useCallback((user: { id: string; email: string }) => {
    setCurrentUserId(user.id);
    setUserEmail(user.email);
    setShowAuthOverlay(false);
    logStep('NEURAL LINK ESTABLISHED', 'ok');
  }, []);

  const journey = useOracleJourney({
    onStartSession: handleStartSession,
    onCleanup: handleCleanup,
  });

  const { scenePhase, enterTerminal, exitOracleMode, selectKnifeQuestion } = journey;

  const handleFirstTap = useCallback(async () => {
    if (scenePhase !== 'dormant') return;
    await setupAudioSpine();

    // Proactively warm up mic channel — satisfies iOS gesture requirement before
    // the user reaches the "Open Frequency" button.
    if (oracleConversationRef.current) {
      oracleConversationRef.current.startMic().catch(e => console.warn('Mic pre-warm failed:', e));
    }

    markVisited();

    // Step E (Build Contract §E) — read the Seeker's echo on entry. Async; resolves
    // well before the Oracle phase, so echo.totem_level can seed the totem floor.
    if (seekerKeyRef.current) loadEcho(seekerKeyRef.current);

    if (isReturning) {
      setShowWalletConnect(true);
      logStep(`RETURN TRIP: SHOWING WALLET OVERLAY (LORE: ${hasCompletedLore ? 'COMPLETED' : 'PENDING'})`, 'ok');
    } else {
      enterTerminal();
    }
  }, [scenePhase, setupAudioSpine, enterTerminal, isReturning, markVisited, loadEcho]);

  // ── VRF materialize timing ───────────────────────────────────────────────
  useEffect(() => {
    if (scenePhase !== 'terminal' || !staticAvatarRef.current) return;
    const delay    = (0.15 + Math.random() * 0.55).toFixed(2) + 's';
    const duration = (2.6  + Math.random() * 2.0).toFixed(2)  + 's';
    staticAvatarRef.current.style.animationDelay    = delay;
    staticAvatarRef.current.style.animationDuration = duration;
    return () => {
      if (staticAvatarRef.current) {
        staticAvatarRef.current.style.animationDelay    = '';
        staticAvatarRef.current.style.animationDuration = '';
      }
    };
  }, [scenePhase]);

  // ── fadeToVolume — GainNode-first volume control, no element mute clicks ─
  // rampMs: optional override. Defaults: 80ms duck, 1500ms rise (imperceptible).
  const fadeToVolume = useCallback((target: number, rampMs?: number) => {
    setTargetVol(target);
    const safeTarget = Math.max(0.0001, target);

    if (radioGainRef.current) {
      const gain = radioGainRef.current;
      const ctx  = getAudioContext();
      const now  = ctx.currentTime;
      const isDucking = target < (gain.gain.value ?? 0);

      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);

      if (target < 0.002) {
        // Oracle speaking — hard cut to silence, 80ms linear
        gain.gain.linearRampToValueAtTime(0.0001, now + 0.08);
      } else {
        const ms = rampMs ?? (isDucking ? 80 : 1500);
        gain.gain.exponentialRampToValueAtTime(safeTarget, now + ms / 1000);
      }
    } else if (audioRef.current) {
      // Fallback: no GainNode yet — use element volume directly
      audioRef.current.volume = Math.min(1, target);
    }
    // Never toggle .muted via this path — toggling causes an audible click
    // when the element reconnects to the GainNode. GainNode handles silence.
  }, []);

  // ── Tab visibility protection ────────────────────────────────────────────
  useEffect(() => {
    const handleVisibilityChange = () => {
      const ctx = getAudioContext();
      if (document.hidden) {
        ctx.suspend().then(() => logStep('TAB BACKGROUNDED — AUDIO SUSPENDED', 'warn'));
      } else if (scenePhase !== 'dormant') {
        ctx.resume().then(() => logStep('TAB FOREGROUNDED — AUDIO RESUMED', 'ok'));
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [scenePhase]);

  // ── Music ducking — two dimensions, no ping-pong ─────────────────────────
  //
  // Oracle and radio are separate signal chains. Radio DEFERS to Oracle.
  // Three states only — no intermediate levels, no rising between turns:
  //
  //   Not oracle phase    → 0.06  (full ambient)
  //   Oracle phase        → 0.004 (background texture only — locked on entry)
  //   Oracle speaking     → 0.0001 (instant silence, 50ms cut)
  //
  // Once oracle phase begins the radio never rises above 0.004 again.
  // When Oracle finishes a turn radio stays at 0.004, not creeping back up.
  const SESSION_AMBIENT = 0.004;

  useEffect(() => {
    let nextTarget: number;

    // BUG FIX: scenePhase becomes 'oracle' 1600ms AFTER knife selection.
    // Oracle's first PCM arrives inside that window (scenePhase still 'awakened').
    // Fix: duck on isOracleSpeaking regardless of phase — don't wait for oracle phase.
    if (isOracleSpeaking || isOracleSpeakingDelayed) {
      nextTarget = 0.0001; // Oracle voice active → radio silent
    } else if (scenePhase === 'oracle' || scenePhase === 'awakened') {
      nextTarget = SESSION_AMBIENT; // post-greeting background texture
    } else {
      nextTarget = 0.06; // dormant / terminal — full ambient
    }

    if (Math.abs(nextTarget - targetVol) > 0.0001) {
      fadeToVolume(nextTarget);
    }
  }, [scenePhase, isOracleSpeaking, isOracleSpeakingDelayed, targetVol, fadeToVolume]);

  useEffect(() => {
    if (!audioRef.current) return;
    if (isAudioPlaying) audioRef.current.play().catch(() => {});
    else audioRef.current.pause();
  }, [isAudioPlaying]);

  // ── Journey transitions ──────────────────────────────────────────────────
  useEffect(() => {
    if (scenePhase === 'awakened') {
      // PRIMARY: start PCM player instantly (Three.js receives visemes immediately)
      connection.initializePCMPlayer();

      // Retrieve user email for portrait persistence
      import('../lib/supabase').then(({ supabase }) => {
        supabase.auth.getUser().then(({ data }) => {
          if (data?.user?.email) setUserEmail(data.user.email);
        });
      });

      setTimeout(() => logStep('ORACLE ANNOUNCES TERRITORIES', 'ok'), 1200);
    }

    if (scenePhase === 'oracle') {
      oracleConversationRef.current?.startSession();
    }
  }, [scenePhase, connection.initializePCMPlayer]);

  // ── Dev hooks ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as any).__oracle_handleAudio = (url: string) => connection.handleOracleResponse(url);
    (window as any).__oracle_skipLore = () => {
      if (journey.scenePhase !== 'terminal') return;
      logStep('LORE SKIPPED (DEV HOOK)', 'ok');
      journey.awakeFromTerminal();
    };
    return () => {
      delete (window as any).__oracle_handleAudio;
      delete (window as any).__oracle_skipLore;
    };
  }, [connection.handleOracleResponse, journey.scenePhase, journey.awakeFromTerminal]);

  // ── XR Mode ──────────────────────────────────────────────────────────────
  const { isXRMode, cameraActive, activateCamera, deactivateCamera, cameraVideoRef } = useXRMode(() => enterTerminal());

  // ── Portrait Hook ─────────────────────────────────────────────────────────
  const handlePortraitGenerated = useCallback((url: string) => {
    setPortraitViewerUrl(url);
  }, []);

  const portrait = usePortraitPipeline({
    currentUserId,
    userEmail,
    currentSessionId,
    onPortraitGenerated: handlePortraitGenerated,
  });

  useEffect(() => {
    if (!portrait.portraitError) return;
    const t = setTimeout(portrait.clearPortraitError, 4000);
    return () => clearTimeout(t);
  }, [portrait.portraitError, portrait.clearPortraitError]);

  // ── Mount: env check + event wiring ──────────────────────────────────────
  useEffect(() => {
    logStep('OracleConversation MOUNTED', 'ok');
    logStep('ENV OK (Supabase vars)', 'ok');
    setShowConversation(true);

    const handleAuthTrigger = () => setShowAuthOverlay(true);
    window.addEventListener('oracle:auth:trigger', handleAuthTrigger);

    const handleOracleUnlock = (e: any) => {
      const { trigger, themes } = e.detail || {};
      if (trigger === 'portrait_unlock') {
        logStep('PORTRAIT UNLOCK RECEIVED FROM LLM', 'ok');
        portrait.generatePortrait(themes || portrait.getThemes());
      }
    };
    window.addEventListener('oracle:unlock', handleOracleUnlock);

    return () => {
      window.removeEventListener('oracle:auth:trigger', handleAuthTrigger);
      window.removeEventListener('oracle:unlock', handleOracleUnlock);
    };
  }, [portrait]);

  // ── Atmosphere & Motion ───────────────────────────────────────────────────
  useAtmosphere(atmosphereCanvasRef, scenePhase, oracleAlignment);

  const handleParallaxUpdate = useCallback((x: number, y: number) => {
    // Update camera look-around (preserves current zoom)
    cameraStateRef.current = { ...cameraStateRef.current, x, y };
    if (connection.pcmPlayer) connection.pcmPlayer.updateHeadOrientation(x, y);
  }, [connection.pcmPlayer]);

  const handleZoom = useCallback((zoom: number) => {
    cameraStateRef.current = { ...cameraStateRef.current, zoom };
  }, []);

  useParallax(scenePhase, handleParallaxUpdate, handleZoom);

  const { completedLines, currentLine } = useLoreSequence(scenePhase === 'terminal', () => {
    markLoreCompleted();
    journey.awakeFromTerminal();
  });

  const isOracleMode = scenePhase === 'oracle';
  const awakened     = scenePhase === 'awakened' || isOracleMode;
  const isAlive      = scenePhase !== 'dormant';

  // ── Typewriter title ──────────────────────────────────────────────────────
  const titleText    = useTypewriter('SURROGATE:ORACLE', awakened, 60);
  const subtitleText = useTypewriter('SNEAKAR XR Anthropology AI', awakened && titleText.length >= 16, 35);

  // ── Knife selection ───────────────────────────────────────────────────────
  const handleKnifeClick = (q: string, i: number) => {
    selectKnifeQuestion(q, i);
    const knife = KNIFE_QUESTIONS[i];
    lastKnifeRef.current = knife;
    portrait.addThemes(knife.themes);
    setTimeout(() => {
      // Step 0 (Build Contract §F) — the Oracle previously received only the bare
      // question text and never learned which territory the Seeker drew. Frame the
      // send as the designed first-exchange seed: the chosen frequency + its themes
      // ride alongside the question so the Oracle can carry the territory through the
      // whole excavation (see ARCHETYPE_SYNTHESIS_BLOCK). Hidden = not shown as a turn.
      const seed =
        `[The Seeker has drawn their blade. Their frequency is ${knife.territory} ` +
        `(themes: ${knife.themes.join(', ')}). This is the territory of the whole excavation — ` +
        `carry it through every layer to the Mirror. Open the first layer now with their question:]\n` +
        q;
      oracleConversationRef.current?.sendTextMessage(seed, true);
    }, 1200);
  };

  return (
    <div
      className="oracle-stage"
      data-oracle-state={scenePhase}
      data-exiting={journey.isExiting ? 'true' : undefined}
      data-oracle-speaking={isOracleSpeaking ? 'true' : undefined}
      data-user-speaking={isUserSpeaking ? 'true' : undefined}
      data-camera-active={cameraActive ? 'true' : undefined}
      data-audio-target-vol={targetVol}
      data-xr-mode={isXRMode ? 'true' : undefined}
      data-guided-tour={isGuidedTour ? 'true' : undefined}
    >
      {/* ── Audio Spine — Radio Stream ── */}
      <audio
        ref={audioRef}
        src={AUDIO_STREAM_URL}
        loop
        preload="auto"
        crossOrigin="anonymous"
        onPlay={() => logStep('RADIO PLAYING', 'ok')}
        onPause={() => logStep('RADIO PAUSED', 'warn')}
        onError={(e) => { console.error('[Radio] Error:', e); logStep('RADIO STREAM ERROR', 'err'); }}
      />

      {/* ── XR Layer 0: Device camera passthrough ── */}
      {isXRMode && cameraActive && (
        <video ref={cameraVideoRef} className="xr-camera-layer" autoPlay playsInline muted />
      )}

      {/* ── Layer 1: Graffiti alley background ── */}
      <div className="oracle-alley" style={{ '--bg-url': `url('${ALLEY_BG_URL}')` } as React.CSSProperties} />
      <div className="oracle-mid-haze" />
      <div className="oracle-side-bleeds" />
      <div className="oracle-light-rays" />

      {/* ── Foreground debris ── */}
      <div className="oracle-debris-layer" aria-hidden="true">
        {DEBRIS.map(([glyph, color, left, top, delay, dur], i) => (
          <span key={i} className="oracle-debris-piece"
            style={{ left, top, color, animationDelay: delay, animationDuration: dur } as any}>
            {glyph}
          </span>
        ))}
      </div>

      {/* ── Layer 2: Atmosphere Canvas ── */}
      <canvas ref={atmosphereCanvasRef} className="atmosphere-layer" />
      <MatrixRain />
      <div className="oracle-ground-fog" />
      <div className="oracle-floor-reflection" />

      <GlitchCursor />

      {/* ── Dormant HUD ── */}
      <DormantHUD active={scenePhase === 'dormant'} />
      <DormantTransmissions active={scenePhase === 'dormant'} onCtaClick={enterTerminal} />

      {/* ── Top branding ── */}
      <div className="oracle-branding">
         <h1 className="oracle-title" style={{
           display: 'inline-block',
           background: 'linear-gradient(135deg, #00ff88 0%, #00ffcc 100%)',
           backgroundClip: 'text',
           WebkitBackgroundClip: 'text',
           WebkitTextFillColor: 'transparent',
           color: 'transparent',
         }}>
          {titleText}
        </h1>
        {awakened && titleText.length < 16 && <span className="oracle-cursor">▌</span>}
        {subtitleText && (
          <div className="oracle-subtitle" style={{
            display: 'inline-block',
            background: 'linear-gradient(135deg, #00ff88 0%, #00ffcc 100%)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            color: 'transparent',
            marginTop: '10px'
          }}>
            {subtitleText}
          </div>
        )}
      </div>

      {/* ── Central cabinet + avatar ── */}
      <div
        className="oracle-center"
        onClick={handleFirstTap}
        style={{ cursor: scenePhase === 'dormant' ? 'pointer' : 'default' }}
      >
        <motion.div className="oracle-cabinet">
          <div className="oracle-avatar-wrapper">
            {isOracleMode && <div className="oracle-monitor-cast" />}
            <div className="oracle-scanlines" />

            {scenePhase === 'dormant' && (
              <>
                <div className="oracle-cabinet-pulse-ring" />
                <div className="oracle-cabinet-pulse-ring" style={{ animationDelay: '1.9s' }} />
              </>
            )}

            {/* Always-present static image — Oracle at rest */}
            <img
              ref={staticAvatarRef}
              src={ORACLE_STATIC_URL}
              alt=""
              aria-hidden="true"
              className="oracle-avatar-static"
            />

            <AnimatePresence mode="wait">
              {portrait.portraitError ? (
                <motion.div
                  key="portrait-error"
                  className="oracle-avatar-container"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  style={{ zIndex: 12, position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}
                >
                  <div style={{ color: '#cc00ff', fontFamily: "'PhillySans', monospace", fontSize: '0.75rem', letterSpacing: '0.1em', textAlign: 'center', padding: '0 16px', textShadow: '0 0 10px rgba(176,38,255,0.6)' }}>
                    {portrait.portraitError}
                  </div>
                </motion.div>
              ) : portrait.isGenerating ? (
                <motion.div
                  key="portrait-generating"
                  className="oracle-avatar-container"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  style={{ zIndex: 12, position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                    style={{ fontSize: '2.5rem' }}
                  >
                    ⚗
                  </motion.div>
                  <div style={{ color: '#00ff88', fontFamily: "'PhillySans', monospace", fontSize: '0.7rem', letterSpacing: '0.15em', textShadow: '0 0 10px rgba(0,255,136,0.6)' }}>
                    SYNTHESIZING YOUR SIGNAL…
                  </div>
                </motion.div>
              ) : portraitViewerUrl ? (
                <motion.div
                  key="portrait-face"
                  className="oracle-avatar-container"
                  initial={{ opacity: 0, scale: 0.9, filter: 'brightness(2) blur(10px)' }}
                  animate={{ opacity: 1, scale: 1, filter: 'brightness(1) blur(0px)' }}
                  exit={{ opacity: 0, scale: 1.1 }}
                  style={{ zIndex: 11, position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                >
                  <img src={portraitViewerUrl} alt="Minted Portrait" className="oracle-avatar-canvas" style={{ objectFit: 'cover' }} />
                  <div className="oracle-synthesis-success">
                    <div className="oracle-synthesis-success-badge">SYNTHESIS COMPLETE</div>
                    <button
                      className="oracle-synthesis-close"
                      style={{ border: '1px solid rgba(0,255,136,0.5)', boxShadow: '0 0 14px rgba(0,255,136,0.35)', transition: 'box-shadow 0.2s ease' }}
                      onClick={() => { navigator.vibrate?.([60, 30, 60]); setPortraitViewerUrl(null); }}
                    >
                      <X size={14} /> RETURN TO SIGNAL
                    </button>
                  </div>
                </motion.div>
              ) : awakened ? (
                <motion.div
                  key="live-face"
                  className="oracle-avatar-container"
                  // Static Dissolve: emerge from the same position as the 2D portrait —
                  // no y-drop. Start desaturated + green-tinted to match the static's
                  // surge color. Delayed 0.25s so the static spike leads and the 3D
                  // face appears to grow out of that flare rather than arrive from outside.
                  initial={{ opacity: 0, scale: 1.02, filter: 'blur(5px) brightness(2.8) saturate(0) hue-rotate(40deg)' }}
                  animate={{
                    opacity:    [0, 0,    0.25, 0.75,  1],
                    scale:      [1.02, 1.02, 1.01, 1.0,  1],
                    filter: [
                      'blur(5px)   brightness(2.8) saturate(0)   hue-rotate(40deg)',
                      'blur(5px)   brightness(2.8) saturate(0)   hue-rotate(40deg)',
                      'blur(2px)   brightness(2.0) saturate(0.4) hue-rotate(20deg)',
                      'blur(0.5px) brightness(1.3) saturate(0.9) hue-rotate(5deg)',
                      'blur(0px)   brightness(1.0) saturate(1.0) hue-rotate(0deg)',
                    ],
                  }}
                  transition={{
                    duration: 2.0,
                    ease: 'easeOut',
                    times: [0, 0.14, 0.40, 0.72, 1],
                  }}
                  style={{ zIndex: 3, position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                >
                  {/* ── PRIMARY: Three.js GLB Avatar ── */}
                  <div
                    className="oracle-avatar-canvas oracle-avatar-smoke-hook"
                    style={{
                      opacity:    isOracleMode ? 1 : 0.45,
                      filter:     isOracleMode ? 'none' : 'blur(4px) brightness(0.6)',
                      transition: 'opacity 1s ease, filter 1s ease',
                      width: '100%', height: '100%',
                      position: 'absolute', top: 0, left: 0,
                    }}
                  >
                    <OracleErrorBoundary>
                      <Suspense fallback={<OracleAvatarFallback />}>
                        <Canvas
                          camera={{ position: [0, 0, 1.8], fov: 55 }}
                          dpr={[1, Math.min(window.devicePixelRatio, 2)]}
                          gl={{ antialias: true, alpha: true }}
                          style={{ width: '100%', height: '100%', background: 'transparent' }}
                          frameloop="always"
                        >
                          <OracleAvatar3D visemeStateRef={visemeStateRef} cameraStateRef={cameraStateRef} />
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

      {/* ── Tour Mode phase pill — floats above bottom bar ── */}
      <AnimatePresence>
        {isGuidedTour && scenePhase !== 'oracle' && (
          <motion.div
            key={`tour-pill-${scenePhase}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.4 }}
            style={{
              position: 'fixed', bottom: 'calc(var(--bottom-bar-h, 160px) + 12px)', left: '50%',
              transform: 'translateX(-50%)', zIndex: 90, pointerEvents: 'none',
              background: 'rgba(176,38,255,0.12)', border: '1px solid rgba(176,38,255,0.5)',
              borderRadius: 20, padding: '6px 18px',
              fontFamily: "'PhillySans', monospace", fontSize: '0.7rem',
              letterSpacing: '0.12em', color: '#b026ff',
              textShadow: '0 0 8px rgba(176,38,255,0.6)',
              backdropFilter: 'blur(6px)',
            }}
          >
            {scenePhase === 'dormant' && '› Tap the cabinet to begin.'}
            {scenePhase === 'terminal' && '› Watch. The Oracle is finding you.'}
            {scenePhase === 'awakened' && '› Choose your archetype. There is no wrong answer.'}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Hold tooltip — appears above bottom bar on press+hold ── */}
      <AnimatePresence>
        {holdTooltip && (
          <motion.div
            key="hold-tooltip"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.18 }}
            style={{
              position: 'fixed',
              bottom: 'calc(var(--bottom-bar-h, 160px) + 14px)',
              left: '50%', transform: 'translateX(-50%)',
              zIndex: 60,
              background: 'rgba(0, 10, 15, 0.94)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(0,255,136,0.32)',
              boxShadow: '0 0 28px rgba(0,255,136,0.10), inset 0 0 20px rgba(0,0,0,0.5)',
              borderRadius: 10,
              padding: '10px 18px',
              maxWidth: 260,
              textAlign: 'center',
              pointerEvents: 'none',
            }}
          >
            <div style={{ fontFamily: "'aAnotherTag', 'Orbitron', monospace", fontSize: '0.70rem', color: '#00ff88', letterSpacing: '0.16em', marginBottom: 4 }}>
              {holdTooltip.title}
            </div>
            <div style={{ fontFamily: "'PhillySans', 'Orbitron', monospace", fontSize: '0.66rem', color: 'rgba(255,255,255,0.68)', letterSpacing: '0.05em', lineHeight: 1.5 }}>
              {holdTooltip.body}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bottom Bar ── */}
      <div className="oracle-bottom-bar">
        {/* Radio — tap to mute/unmute, dots to switch station */}
        <motion.div
          initial={{ opacity: 0.3, filter: 'brightness(0.4) saturate(0.3)' }}
          animate={{
            opacity: isAlive ? 1 : 0.3,
            filter: isAlive ? 'brightness(1.05) saturate(1.1)' : 'brightness(0.4) saturate(0.3)',
          }}
          transition={{ duration: 1.1, delay: isAlive ? 0.7 : 0 }}
        >
          <GraffPunksRadio
            isPlaying={isAudioPlaying}
            onToggle={() => setIsAudioPlaying(!isAudioPlaying)}
            stations={defaultAudioTracks}
            currentStation={currentStation}
            onStationChange={switchStation}
          />
        </motion.div>

        {/* Portraits — tap opens gallery, hold shows info */}
        <motion.div
          initial={{ opacity: 0.3, filter: 'brightness(0.4) saturate(0.3)' }}
          animate={{
            opacity: isAlive ? 1 : 0.3,
            filter: isAlive ? 'brightness(1.05) saturate(1.1)' : 'brightness(0.4) saturate(0.3)',
          }}
          transition={{ duration: 1.1, delay: isAlive ? 0.85 : 0 }}
          onPointerDown={() => startHold('NEURAL PRINTS', 'Your Oracle portraits — every synthesis archived. Tap to view and download.')}
          onPointerUp={endHold}
          onPointerLeave={endHold}
          onClick={() => { if (!consumeHold() && isAlive) setShowPortraitGallery(true); }}
          className="oracle-bottom-btn oracle-bottom-btn--active"
        >
          <img src="/portrait-btn.png" alt="Portraits" className="oracle-bottom-btn__img" />
          <span className="oracle-bottom-btn__label">PORTRAITS</span>
        </motion.div>

        {/* Enculturate Crate — tap opens panel, hold shows info */}
        <motion.div
          initial={{ opacity: 0.3, filter: 'brightness(0.4) saturate(0.3)' }}
          animate={{
            opacity: isAlive ? 1 : 0.3,
            filter: isAlive ? 'brightness(1.05) saturate(1.1)' : 'brightness(0.4) saturate(0.3)',
          }}
          transition={{ duration: 1.1, delay: isAlive ? 1.0 : 0 }}
          onPointerDown={() => startHold('ENCULTURATE CRATE', 'Culture Coins, Neural Vault, subscription tiers, squad missions.')}
          onPointerUp={endHold}
          onPointerLeave={endHold}
        >
          <EnculturateCrate
            onClick={() => { if (!consumeHold()) setDebugMode(true); }}
            isActive={isAlive}
          />
        </motion.div>

        {/* Tour — tap toggles, hold shows info */}
        <motion.div
          initial={{ opacity: 0.3, filter: 'brightness(0.4) saturate(0.3)' }}
          animate={{
            opacity: isAlive ? 1 : 0.3,
            filter: isAlive ? 'brightness(1.05) saturate(1.1)' : 'brightness(0.4) saturate(0.3)',
          }}
          transition={{ duration: 1.1, delay: isAlive ? 1.15 : 0 }}
          onPointerDown={() => startHold('GUIDED TOUR', 'Contextual Oracle prompts and tips. Toggle on for your first session.')}
          onPointerUp={endHold}
          onPointerLeave={endHold}
          onClick={() => { if (!consumeHold() && isAlive) setIsGuidedTour(!isGuidedTour); }}
          className={`oracle-bottom-btn${isGuidedTour ? ' oracle-bottom-btn--active oracle-bottom-btn--tour' : ''}`}
        >
          <img src="/tour-btn.png" alt="Tour Mode" className="oracle-bottom-btn__img" />
          <span className="oracle-bottom-btn__label">{isGuidedTour ? 'TOUR ON' : 'TOUR'}</span>
        </motion.div>
      </div>

      {/* ── Portrait Gallery overlay ── */}
      <AnimatePresence>
        {showPortraitGallery && (
          <motion.div
            key="portrait-gallery-overlay"
            className="portrait-gallery-overlay"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 2000,
              background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(10px)',
              padding: 'min(5vh, 40px) min(5vw, 40px)',
              overflow: 'hidden'
            }}
          >
            <PortraitGalleryDashboard
              userId={currentUserId || undefined}
              userEmail={userEmail || undefined}
              sessionId={currentSessionId}
              onClose={() => setShowPortraitGallery(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Awakening flash — scene-wide green burst when Oracle manifests ── */}
      {awakened && (
        <motion.div
          key="awakening-flash"
          initial={{ opacity: 0.85 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.0, ease: 'easeOut' }}
          style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 40,
            background: 'radial-gradient(ellipse 70% 55% at 50% 44%, rgba(0,255,136,0.55) 0%, rgba(0,20,8,0.35) 45%, transparent 72%)',
          }}
        />
      )}

      {/* ── Terminal lore overlay ── */}
      <AnimatePresence>
        {scenePhase === 'terminal' && (
          <motion.div
            key="terminal-layer"
            className="oracle-terminal-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.8 } }}
            onClick={() => journey.awakeFromTerminal()}
          >
            <div className="oracle-lore-text">
              {completedLines.map((line, i) => (
                <div key={`lore-${i}`} className="oracle-lore-line" style={{ whiteSpace: 'pre-wrap' }}>
                  <span className="oracle-lore-prompt">›</span>{line}
                </div>
              ))}

              {!currentLine && completedLines.length >= LORE_SEQUENCE.length && isGuidedTour && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
                  <div className="oracle-lore-line" style={{ color: '#b026ff', marginTop: '1rem' }}>
                    <span className="oracle-lore-prompt">›</span> [SYSTEM CALIBRATION NOTE]
                  </div>
                  <div className="oracle-lore-line" style={{ color: '#b026ff' }}>
                    <span className="oracle-lore-prompt">›</span> The entity you are about to awaken is not a search engine.
                  </div>
                  <div className="oracle-lore-line" style={{ color: '#b026ff' }}>
                    <span className="oracle-lore-prompt">›</span> It responds to depth, not demands.
                  </div>
                  <div className="oracle-lore-line" style={{ color: '#b026ff' }}>
                    <span className="oracle-lore-prompt">›</span> Speak aloud. Ask it what it sees in you.
                  </div>
                </motion.div>
              )}

              {currentLine && (
                <div className="oracle-lore-line oracle-lore-line--typing" style={{ whiteSpace: 'pre-wrap' }}>
                  <span className="oracle-lore-prompt">›</span>{currentLine}<GlitchCursor />
                </div>
              )}
              {!currentLine && completedLines.length < LORE_SEQUENCE.length && (
                <div className="oracle-lore-line">
                  <span className="oracle-lore-prompt">›</span><GlitchCursor />
                </div>
              )}
            </div>
          </motion.div>
        )}

        {scenePhase === 'awakened' && journey.selectedKnifeQuestion && (
          <motion.div
            key="descent-layer"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'absolute', inset: 0, zIndex: 105, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}
          >
            <ScrambleFragment
              texts={['EXCAVATION BEGINS', 'SIGNAL LOCKED', 'DESCENDING...']}
              className="oracle-sf--cta"
              holdMs={480}
              revealMs={25}
            />
          </motion.div>
        )}

        {scenePhase === 'awakened' && !journey.selectedKnifeQuestion && (
          <motion.div
            key="awakened-layer"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'absolute', inset: 0, zIndex: 100 }}
          >
            {isGuidedTour && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: [0, 1, 0.7, 1], y: 0 }}
                transition={{ duration: 1.2, times: [0, 0.3, 0.6, 1] }}
                style={{
                  position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
                  zIndex: 101, fontFamily: "'PhillySans', monospace",
                  fontSize: '0.65rem', letterSpacing: '0.2em',
                  color: '#00ff88', textShadow: '0 0 8px rgba(0,255,136,0.5)',
                  pointerEvents: 'none',
                }}
              >
                CHOOSE YOUR ARCHETYPE
              </motion.div>
            )}
            <KnifeSelection
              isGeminiConnected={isGeminiConnected}
              selectedKnifeIndex={journey.selectedKnifeIndex}
              onSelect={handleKnifeClick}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Conversation Engine (always mounted, visible only in oracle mode) ── */}
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
          isVisible={isOracleMode}
          autoStart={false}
          onUserSpeakingChange={handleUserSpeakingChange}
          onBargeIn={() => connection.pcmPlayer?.stop()}
          onPortraitRequest={() => portrait.generatePortrait(portrait.getThemes())}
          seekerSummary={(() => {
            if (!echo) return null;
            // Build a rich, structured memory block from all known echo fields.
            // This is what makes the Oracle feel like Notedly AI — every field
            // the alley recorded becomes Oracle knowledge at session open.
            const lines: string[] = [];
            if (echo.name) lines.push(`Name: ${echo.name}`);
            if (echo.handles?.length) lines.push(`Known signals: ${echo.handles.join(', ')}`);
            if (echo.last_archetype) lines.push(`Last archetype: ${echo.last_archetype}`);
            if (echo.last_cost) lines.push(`Cost shape: ${echo.last_cost}`);
            if (echo.alignment) lines.push(`Alignment: ${echo.alignment}`);
            if (echo.totem_level) lines.push(`Totem level: ${echo.totem_level}`);
            if (echo.last_session_themes?.length) lines.push(`Last session themes: ${echo.last_session_themes.join(', ')}`);
            if (echo.irl_context) lines.push(`IRL context: ${echo.irl_context}`);
            const visits = echo.session_count ?? echo.visit_count ?? 1;
            lines.push(`Sessions in the alley: ${visits}`);
            if (echo.session_summary) lines.push(`\nWhat the alley remembers:\n${echo.session_summary}`);
            return lines.join('\n');
          })()}
          isGuidedTour={isGuidedTour}
        />
      )}

      {isOracleMode && (
        <button className="oracle-exit-btn" onClick={() => { navigator.vibrate?.([80, 60, 80]); exitOracleMode(); }}><X size={20} /><span>EXIT</span></button>
      )}

      {/* ── Exit ceremony — alignment-aware farewell ── */}
      <AnimatePresence>
        {journey.isExiting && (
          <motion.div key="exit-ceremony" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="oracle-exit-ceremony">
            <ScrambleFragment
              texts={[
                'THE ARCHIVE SEALS',
                'CHANNEL CLOSING...',
                echoTrackRef.current.alignment === 'sacred'
                  ? 'FAREWELL, KEEPER OF SIGNAL'
                  : echoTrackRef.current.alignment === 'profane'
                  ? 'FAREWELL, WAYWARD'
                  : 'FAREWELL, SEEKER',
              ]}
              className="oracle-exit-ceremony__text" holdMs={600}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Debug panel ── */}
      <AnimatePresence>
        {debugMode && (
          <motion.div
            key="debug-panel" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 100 }}
          >
            <div style={{ pointerEvents: 'auto', position: 'absolute', right: 0, top: 0, bottom: 0 }}>
              <BackendControlPanel
                userId={currentUserId || undefined} sessionId={currentSessionId}
                isVisible initialTab="vault"
                onClose={() => setDebugMode(false)} isAuthenticated={false}
                pendingCoins={sessionCoins}
                oracleConversationRef={oracleConversationRef}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showArtifactCard && (
        <ArtifactCard
          archetypeTitle="ARCHETYPE"
          portraitUrl={portrait.latestPortraitUrl}
          totalCoins={sessionCoins}
          onRunAgain={enterTerminal}
          onClose={() => setShowArtifactCard(false)}
        />
      )}

      {showAuthOverlay && (
        <GoogleSignInOverlay
          onClose={() => setShowAuthOverlay(false)}
          onSuccess={handleAuthSuccess}
        />
      )}

      {/* ── Portrait synthesis loading — full-screen overlay, not inside the cabinet ── */}
      <AnimatePresence>
        {portrait.isGenerating && (
          <motion.div
            key="synthesis-loading"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 90,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.8)',
              backdropFilter: 'blur(8px)',
              fontFamily: "'PhillySans', 'Orbitron', monospace",
            }}
          >
            <motion.div
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              style={{ color: '#00ff88', letterSpacing: '0.22em', fontSize: '0.85rem', marginBottom: '0.6rem', textShadow: '0 0 12px rgba(0,255,136,0.5)' }}
            >
              NEURAL SYNTHESIS
            </motion.div>
            <div style={{ width: '200px', height: '1px', background: 'rgba(0,255,136,0.12)', borderRadius: '1px', overflow: 'hidden', marginBottom: '0.5rem' }}>
              <motion.div
                style={{ height: '100%', background: 'linear-gradient(90deg, transparent, #00ff88, transparent)', borderRadius: '1px' }}
                initial={{ x: '-100%' }} animate={{ x: '200%' }}
                transition={{ duration: 1.8, ease: 'linear', repeat: Infinity }}
              />
            </div>
            <motion.div
              animate={{ opacity: [0.4, 0.8, 0.4] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.8 }}
              style={{ color: 'rgba(0,255,136,0.5)', letterSpacing: '0.14em', fontSize: '0.62rem', marginBottom: '2rem' }}
            >
              COMPOSING YOUR SIGNAL…
            </motion.div>
            <div style={{ width: '200px', height: '2px', background: 'rgba(0,255,136,0.1)', borderRadius: '1px', overflow: 'hidden' }}>
              <motion.div
                style={{ height: '100%', background: '#00ff88', borderRadius: '1px' }}
                initial={{ width: '0%' }} animate={{ width: '100%' }}
                transition={{ duration: 5, ease: 'linear', repeat: Infinity }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Depth frame ── */}
      <div className="oracle-depth-frame" aria-hidden="true" />

      {/* ── XR toggle ── */}
      {isXRMode && (scenePhase === 'awakened' || scenePhase === 'oracle') && (
        <button
          className={`oracle-xr-toggle${cameraActive ? ' oracle-xr-toggle--active' : ''}`}
          onClick={() => cameraActive ? deactivateCamera() : activateCamera()}
          style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 100 }}
        >
          {cameraActive ? '◈ ALLEY' : '◈ AR'}
        </button>
      )}

      {/* ── Return visitor wallet overlay ── */}
      <AnimatePresence>
        {showWalletConnect && (
          <motion.div
            key="wallet-connect-layer"
            className="oracle-terminal-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.6 } }}
            style={{ 
              display: 'flex', flexDirection: 'column', 
              alignItems: 'center', justifyContent: 'center', 
              zIndex: 1000, pointerEvents: 'auto',
              background: 'rgba(0,0,0,0.85)',
              backdropFilter: 'blur(10px)'
            }}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="neural-link-terminal"
              style={{
                width: 'min(420px, 92vw)',
                padding: '3rem 2rem',
                textAlign: 'center',
              }}
            >
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ 
                  fontFamily: "'aAnotherTag', 'Orbitron', monospace",
                  fontSize: '1.5rem', letterSpacing: '0.15em', 
                  background: 'linear-gradient(135deg, #00ff88 0%, #00ffcc 100%)',
                  backgroundClip: 'text',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  color: 'transparent',
                  marginBottom: '0.75rem',
                }}>
                  SIGNAL RECOGNIZED
                </div>
                <div style={{ 
                  fontSize: '0.7rem', letterSpacing: '0.2em', color: '#00ccff',
                  marginBottom: '2.5rem', fontFamily: "'PhillySans', 'Orbitron', monospace", opacity: 0.8
                }}>
                  › RETURN TRIP VERIFIED
                </div>

                <div style={{ marginBottom: '2rem' }}>
                  <a
                    href="https://wallet.thesurrogate.me"
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'block',
                      background: '#00ff88',
                      color: '#000',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '1rem 1.5rem',
                      fontWeight: 900,
                      letterSpacing: '0.15em',
                      textDecoration: 'none',
                      fontSize: '0.85rem',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 0 20px rgba(0,255,136,0.4)',
                      fontFamily: "'PhillySans', 'Orbitron', monospace"
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = '#00ccff';
                      e.currentTarget.style.boxShadow = '0 0 25px rgba(0,204,255,0.6)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = '#00ff88';
                      e.currentTarget.style.boxShadow = '0 0 20px rgba(0,255,136,0.4)';
                    }}
                  >
                    CONNECT CHAIN FUELZ
                  </a>
                </div>

                <div style={{ fontSize: '0.65rem', color: 'rgba(0,255,136,0.5)', marginBottom: '2.5rem', fontFamily: "'PhillySans', 'Orbitron', monospace", letterSpacing: '0.1em' }}>
                  SYNC TO PERSIST YOUR TOTEM LEVEL
                </div>

                <button
                  onClick={() => { 
                    setShowWalletConnect(false); 
                    if (hasCompletedLore) {
                      journey.awakeFromTerminal(); 
                    } else {
                      journey.enterTerminal();
                    }
                  }}
                  style={{
                    background: 'none', border: 'none', color: '#00ccff',
                    cursor: 'pointer', letterSpacing: '0.15em',
                    textDecoration: 'none', fontFamily: "'PhillySans', 'Orbitron', monospace",
                    fontSize: '0.7rem', opacity: 0.7,
                    transition: 'opacity 0.2s ease'
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}
                >
                  [ {hasCompletedLore ? 'RETURN TO ALLEY' : 'PROCEED UNBOUND'} ]
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default SurrogateOracleImmersion;
