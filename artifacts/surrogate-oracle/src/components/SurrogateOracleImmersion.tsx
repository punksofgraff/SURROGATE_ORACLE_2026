/**
 * SURROGATE Oracle — Immersive Cyberpunk XR Experience
 *
 * UX Flow:
 *   DORMANT  → User lands in a dark graffiti alley. Oracle glows in a cabinet.
 *   AWAKENED → One tap: lore plays, knife chosen, branding types in, Oracle greets.
 *   ORACLE   → Real-time conversation active.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

// Components
import DecartClient, { DecartClientHandle } from './DecartClient';
import { BackendControlPanel } from './BackendControlPanel';
import { GoogleSignInOverlay } from './GoogleSignInOverlay';
import { GraffPunksRadio } from './GraffPunksRadio';
import { EnculturateCrate } from './EnculturateCrate';
import OracleConversation, { OracleConversationHandle } from './OracleConversation';
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

// Hooks
import { useIpCheck } from '../hooks/useIpCheck';
import { useAtmosphere } from '../hooks/useAtmosphere';
import { useParallax } from '../hooks/useParallax';
import { useXRMode } from '../hooks/useXRMode';
import { useTypewriter } from '../hooks/useTypewriter';
import { useLoreSequence, LORE_SEQUENCE } from '../hooks/useLoreSequence';
import { useOracleConnection } from '../hooks/useOracleConnection';
import { usePortraitPipeline } from '../hooks/usePortraitPipeline';
import { useOracleJourney } from '../hooks/useOracleJourney';

// Libs/Utils
import { getAudioContext } from '../lib/oracleSfx';
import { OracleFaceRenderer } from '../lib/OracleFaceRenderer';
import './SurrogateOracleImmersion.css';

// Constants
const ORACLE_STATIC_URL  = '/oracle-static.png';
const ORACLE_AVATAR_URL  = '/oracle-avatar-live.png';
const ALLEY_BG_URL       = 'https://i.postimg.cc/jSJRRRk2/7D633B70-4C62-4326-92A8-3B8790C9B3B0.png';
const AUDIO_STREAM_URL   = 'https://stream.radiojar.com/2qm1fc5kb';
const ORACLE_PLAYBACK_RATE = 1.0;

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

export function SurrogateOracleImmersion() {
  const [oracleAvatarDataUrl] = useState<string>(ORACLE_AVATAR_URL);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentSessionId] = useState(() => crypto.randomUUID());
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [sessionCoins, setSessionCoins] = useState(0);
  const [showArtifactCard, setShowArtifactCard] = useState(false);
  const [portraitViewerUrl, setPortraitViewerUrl] = useState<string | null>(null);
  const [showConversation, setShowConversation] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isGeminiConnected, setIsGeminiConnected] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [oracleAlignment] = useState<'sacred' | 'profane' | 'neutral' | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isOracleSpeaking, setIsOracleSpeaking] = useState(false);
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);
  const [showWalletConnect, setShowWalletConnect] = useState(false);
  const [currentViseme, setCurrentViseme] = useState('X');
  const [currentAmplitude, setCurrentAmplitude] = useState(0);
  const [isGuidedTour, setIsGuidedTour] = useState(false);

  // Refs
  const decartClientRef = useRef<DecartClientHandle | null>(null);
  const avatarVideoRef = useRef<HTMLVideoElement | null>(null);
  const oracleFaceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const oracleFaceRendererRef = useRef<OracleFaceRenderer | null>(null);
  const oracleFaceMapRef = useRef<import('../lib/OracleVisionCalibrator').OracleFaceMap | null>(null);
  const oracleConversationRef = useRef<OracleConversationHandle | null>(null);
  const pcmAmplitudeRef = useRef(0);
  const atmosphereCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const staticAvatarRef = useRef<HTMLImageElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const radioGainRef = useRef<GainNode | null>(null);
  const targetVolRef = useRef(0.22);

  const { isReturning, markVisited } = useIpCheck();

  // ── Audio Spine setup — must be called inside user gesture ──
  const setupAudioSpine = useCallback(async () => {
    if (radioGainRef.current || !audioRef.current) return;

    try {
      const ctx = getAudioContext();
      // MediaElementSource can only be created once per element
      const source = ctx.createMediaElementSource(audioRef.current);
      const gain   = ctx.createGain();
      gain.gain.value = targetVolRef.current;
      source.connect(gain);
      gain.connect(ctx.destination);
      radioGainRef.current = gain;

      setIsAudioPlaying(true);
      logStep('AUDIO SPINE INITIALIZED', 'ok');
    } catch (e) {
      console.warn('[Audio] Spine setup failed:', e);
    }
  }, []);

  // ── Connection Hook ──
  const handleViseme = useCallback((state: any) => {
    setCurrentAmplitude(state.amplitude);
    setCurrentViseme(state.viseme);

    // Keep the 2D renderer updated if it's still being used as a fallback
    const renderer = oracleFaceRendererRef.current;
    if (renderer && renderer.isReady()) {
      // Direct drive from worklet state
      const amp = state.amplitude;
      pcmAmplitudeRef.current = amp;
      
      if (amp < 0.05) {
        renderer.drawIdle();
      } else {
        renderer.drawViseme(state);
      }
    }
  }, []);

  const handleProcessingChange = useCallback((proc: boolean) => {
    setIsOracleSpeaking(proc);
  }, []);

  const connection = useOracleConnection({
    oracleAvatarDataUrl,
    oracleAvatarUrl: ORACLE_AVATAR_URL,
    playbackRate: ORACLE_PLAYBACK_RATE,
    decartClientRef,
    avatarVideoRef,
    onViseme: handleViseme,
    onProcessingChange: handleProcessingChange,
  });

  const connectionRef = useRef(connection);
  useEffect(() => { connectionRef.current = connection; }, [connection]);

  // ── Journey Hook ──
  const handleStartSession = useCallback(() => {
    oracleConversationRef.current?.startSession();
  }, []);

  const handleCleanup = useCallback(() => {
    connection.cleanup();
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
    
    // Proactively initialize the mic channel to decouple it from the "Open Frequency" button
    // and satisfy iOS gesture requirements.
    if (oracleConversationRef.current) {
        oracleConversationRef.current.startMic().catch(e => console.warn('Mic pre-warm failed:', e));
    }

    markVisited();
    if (isReturning) {
      setShowWalletConnect(true);
      logStep('RETURN TRIP: SHOWING WALLET OVERLAY', 'ok');
    } else {
      enterTerminal();
    }
  }, [scenePhase, setupAudioSpine, enterTerminal, isReturning, markVisited]);

  // ── VRF materialize timing ──
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

  // ── RAF Loop for Amplitude Decay & Renderer Updates ──
  useEffect(() => {
    let rafId: number;
    let lastTime = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastTime) / 1000; // delta time in seconds
      lastTime = now;
      
      // Time-independent decay: factor^(dt * 60)
      const decay = Math.pow(0.80, dt * 60); // Faster decay (0.80 instead of 0.88)
      pcmAmplitudeRef.current *= decay;
      
      const renderer = oracleFaceRendererRef.current;
      const faceCanvas = oracleFaceCanvasRef.current;
      
      if (faceCanvas) {
        faceCanvas.dataset.amplitude = pcmAmplitudeRef.current.toFixed(3);
        faceCanvas.dataset.visemeActive = pcmAmplitudeRef.current > 0.05 ? 'true' : 'false';
      }

      // If we've decayed to silence, ensure elements are reset
      if (pcmAmplitudeRef.current < 0.05 && renderer && renderer.isReady()) {
        renderer.drawIdle();
      }
      
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // fadeToVolume — operates on GainNode when available (iOS-proof), falls back to
  // HTMLAudioElement.volume before the first user gesture.
  const fadeToVolume = useCallback((target: number) => {
    const safeTarget = Math.max(0.0001, target);
    targetVolRef.current = target;
    
    if (radioGainRef.current) {
      const gain = radioGainRef.current;
      const ctx  = getAudioContext();
      const now  = ctx.currentTime;
      const isDucking = target < gain.gain.value;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.exponentialRampToValueAtTime(safeTarget, now + (isDucking ? 0.02 : 0.40));
    } else if (audioRef.current) {
      audioRef.current.volume = target;
    }
  }, []);

  // ── Tab visibility — protecting the ritual ──────────────────────────────
  useEffect(() => {
    const handleVisibilityChange = () => {
      const ctx = getAudioContext();
      if (document.hidden) {
        ctx.suspend().then(() => {
          logStep('TAB BACKGROUNDED — AUDIO SUSPENDED', 'warn');
        });
      } else {
        // Only resume if we are past the dormant phase (user has interacted)
        if (scenePhase !== 'dormant') {
          ctx.resume().then(() => {
            logStep('TAB FOREGROUNDED — AUDIO RESUMED', 'ok');
          });
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [scenePhase]);

  // ── Music control — kill radio on oracle start ────────────────────────────
  useEffect(() => {
    // We let the ducking logic handle the volume shift to maintain atmospheric hum.
  }, [scenePhase, isAudioPlaying]);

  // ── Music ducking — production-grade XD ducking table ─────────────────────
  useEffect(() => {
    let target = 0.22; // Default: The alley breathes (DORMANT/TERMINAL)
    
    if (scenePhase === 'awakened') target = 0.12; // Atmosphere stirs
    
    // In oracle mode, keep the ambient hum at 0.02 instead of killing it completely
    if (scenePhase === 'oracle') target = 0.02;
    
    // During identity selection, if user manually toggles radio, we still duck if they speak
    // (though usually they won't speak yet in awakened)
    if ((isMicActive || isUserSpeaking) && scenePhase !== 'oracle') target = 0.15;
    
    if (target !== targetVolRef.current) {
      targetVolRef.current = target;
      fadeToVolume(target);
    }
  }, [scenePhase, isMicActive, isUserSpeaking, fadeToVolume]);

  useEffect(() => {
    if (!audioRef.current) return;
    if (isAudioPlaying) audioRef.current.play().catch(() => {});
    else audioRef.current.pause();
  }, [isAudioPlaying]);

  // ── XR Mode ──
  const { isXRMode, cameraActive, activateCamera, deactivateCamera, cameraVideoRef } = useXRMode(() => enterTerminal());

  // ── Portrait Hook ──
  const handlePortraitGenerated = useCallback((url: string) => {
    setPortraitViewerUrl(url);
  }, []);

  const portrait = usePortraitPipeline({
    currentUserId,
    userEmail: userEmail,
    currentSessionId,
    onPortraitGenerated: handlePortraitGenerated,
  });

  const isOracleMode = scenePhase === 'oracle';
  const awakened = scenePhase === 'awakened' || scenePhase === 'oracle';
  const isAlive = scenePhase !== 'dormant';

  // ── Atmosphere & Motion ──
  useAtmosphere(atmosphereCanvasRef, scenePhase, oracleAlignment);
  
  const handleParallaxUpdate = useCallback((x: number, y: number) => {
    if (oracleFaceRendererRef.current) {
      oracleFaceRendererRef.current.setTilt(x, y);
    }
    // Restore HRTF Head Tracking — Oracle voice follows movement
    if (connectionRef.current.pcmPlayer) {
      connectionRef.current.pcmPlayer.updateHeadOrientation(x, y);
    }
  }, []);
  
  useParallax(scenePhase, handleParallaxUpdate);

  // ── Renderer Lifecycle ──
  const [isRendererReady, setIsRendererReady] = useState(false);

  useEffect(() => {
    if (!awakened || connection.isDecartActive) {
      setIsRendererReady(false);
      return;
    }
    const canvas = oracleFaceCanvasRef.current;
    if (!canvas) return;

    const renderer = new OracleFaceRenderer(canvas);
    oracleFaceRendererRef.current = renderer;

    const resize = () => {
      const p = canvas.parentElement;
      if (p) {
        canvas.width = p.clientWidth * window.devicePixelRatio;
        canvas.height = p.clientHeight * window.devicePixelRatio;
        renderer.onResize();
      }
    };
    window.addEventListener('resize', resize);
    resize();

    renderer.loadFace(oracleAvatarDataUrl).then(() => {
      if (connection.oracleFaceMap) renderer.calibrate(connection.oracleFaceMap);
      renderer.startIdleAnimation();
      setIsRendererReady(true);
      logStep('LIVING FACE RENDERER READY', 'ok');
    }).catch(err => {
      console.error('Face load failed:', err);
      logStep('FACE LOAD FAILED', 'err');
    });

    return () => {
      window.removeEventListener('resize', resize);
      renderer.destroy();
      oracleFaceRendererRef.current = null;
      setIsRendererReady(false);
    };
  }, [awakened, connection.isDecartActive, connection.oracleFaceMap, oracleAvatarDataUrl]);

  const { completedLines, currentLine } = useLoreSequence(scenePhase === 'terminal', () => journey.awakeFromTerminal());

  // ── Typewriter title ──
  const titleText = useTypewriter('SURROGATE:ORACLE', awakened, 60);
  const subtitleText = useTypewriter('SNEAKAR XR AI IMMERSION', awakened && titleText.length >= 16, 35);

  // ── Handshake/Pre-Warm ──
  useEffect(() => {
    logStep('OracleConversation MOUNTED', 'ok');
    logStep('ENV OK (Supabase vars)', 'ok');
    setShowConversation(true);

    const handleAuthTrigger = () => setShowAuthOverlay(true);
    window.addEventListener('oracle:auth:trigger', handleAuthTrigger);
    
    // Wire up Portrait Unlocks triggered by the Oracle LLM score block
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

  // ── Journey Transition Handler ──
  useEffect(() => {
    if (scenePhase === 'awakened') {
      // Connect and warm up Gemini precisely once upon awakening.
      // This allows the Oracle to greet and announce territories while the knives show.
      connection.initializeOracle();
      
      // Attempt to retrieve user email for portrait persistence if authenticated
      import('../lib/supabase').then(({ supabase }) => {
        supabase.auth.getUser().then(({ data }) => {
          if (data?.user?.email) setUserEmail(data.user.email);
        });
      });

      setTimeout(() => logStep('ORACLE ANNOUNCES TERRITORIES', 'ok'), 1200);
    }
    
    // Once full Oracle mode is entered (after knife selection), ensure session is robust
    if (scenePhase === 'oracle') {
      oracleConversationRef.current?.startSession();
    }
  }, [scenePhase, connection.initializeOracle]);

  // ── DEV hooks ──
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

  // Handlers
  const handleKnifeClick = (q: string, i: number) => {
    selectKnifeQuestion(q, i);
    portrait.addThemes(KNIFE_QUESTIONS[i].themes);
    setTimeout(() => {
      oracleConversationRef.current?.sendTextMessage(q, true);
    }, 1200);
  };

  return (
    <div 
      className="oracle-stage"
      data-oracle-state={scenePhase}
      data-decart-active={connection.isDecartActive}
      data-camera-active={cameraActive ? 'true' : undefined}
      data-audio-target-vol={targetVolRef.current}
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
        onError={(e) => {
          console.error('[Radio] Error:', e);
          logStep('RADIO STREAM ERROR', 'err');
        }}
      />

      {/* ── XR Layer 0: Device camera passthrough ── */}
      {isXRMode && cameraActive && (
        <video ref={cameraVideoRef} className="xr-camera-layer" autoPlay playsInline muted />
      )}

      {/* ── Layer 1: Graffiti alley background + Vignette ── */}
      <div
        className="oracle-alley"
        style={{ '--bg-url': `url('${ALLEY_BG_URL}')` } as React.CSSProperties}
      />

      {/* ── Depth layer: mid-ground haze ── */}
      <div className="oracle-mid-haze" />

      {/* ── Depth layer: side neon bleeds ── */}
      <div className="oracle-side-bleeds" />

      {/* ── Depth layer: light rays ── */}
      <div className="oracle-light-rays" />

      {/* ── Foreground debris ── */}
      <div className="oracle-debris-layer" aria-hidden="true">
        {DEBRIS.map(([glyph, color, left, top, delay, dur], i) => (
          <span
            key={i}
            className="oracle-debris-piece"
            style={{ left, top, color, animationDelay: delay, animationDuration: dur } as any}
          >
            {glyph}
          </span>
        ))}
      </div>

      {/* ── Layer 2: Atmosphere Canvas ── */}
      <canvas ref={atmosphereCanvasRef} className="atmosphere-layer" />

      {/* ── Layer 2a: Matrix Rain ── */}
      <MatrixRain />

      {/* ── Layer 2b: Ground Fog ── */}
      <div className="oracle-ground-fog" />

      {/* ── Depth layer: floor reflection ── */}
      <div className="oracle-floor-reflection" />

      <GlitchCursor />
      
      {/* ── Layer 1: Dormant HUD ── */}
      <DormantHUD active={scenePhase === 'dormant'} />
      <DormantTransmissions active={scenePhase === 'dormant'} onCtaClick={enterTerminal} />

      {/* ── Layer 3: Top branding ── */}
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

      {/* ── Layer 4: Central cabinet + avatar ── */}
      <div
        className="oracle-center"
        onClick={handleFirstTap}
        style={{ cursor: scenePhase === 'dormant' ? 'pointer' : 'default' }}
      >
        <motion.div className="oracle-cabinet">
          <div className="oracle-avatar-wrapper">
            {/* ── Monitor cast ── */}
            {isOracleMode && <div className="oracle-monitor-cast" />}

            {/* ── CRT scanline overlay ── */}
            <div className="oracle-scanlines" />

            {/* ── Dormant pulse rings ── */}
            {scenePhase === 'dormant' && (
              <>
                <div className="oracle-cabinet-pulse-ring" />
                <div className="oracle-cabinet-pulse-ring" style={{ animationDelay: '1.9s' }} />
              </>
            )}

            {/* ── Static arcade cabinet display ── */}
            <img
              ref={staticAvatarRef}
              src={ORACLE_STATIC_URL}
              alt=""
              aria-hidden="true"
              className="oracle-avatar-static"
            />

            <AnimatePresence mode="wait">
              {portrait.isGenerating ? (
                <motion.div 
                  key="synthesis-loading"
                  className="oracle-avatar-container oracle-synthesis-loading"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  style={{ zIndex: 10, background: 'rgba(0,0,0,0.85)' }}
                >
                  <div className="oracle-synthesis-label">NEURAL SYNTHESIS</div>
                  <div className="oracle-synthesis-status">SCANNING FREQUENCY...</div>
                  <div className="oracle-synthesis-progress">
                    <motion.div 
                      className="oracle-synthesis-progress-fill"
                      initial={{ width: '0%' }} animate={{ width: '100%' }}
                      transition={{ duration: 4, ease: "linear", repeat: Infinity }}
                    />
                  </div>
                </motion.div>
              ) : portraitViewerUrl ? (
                <motion.div 
                  key="minted-portrait"
                  className="oracle-avatar-container"
                  initial={{ opacity: 0, scale: 0.9, filter: 'brightness(2) blur(10px)' }}
                  animate={{ opacity: 1, scale: 1, filter: 'brightness(1) blur(0px)' }}
                  exit={{ opacity: 0, scale: 1.1 }}
                  style={{ zIndex: 11 }}
                >
                  <img src={portraitViewerUrl} alt="Minted Portrait" className="oracle-avatar-canvas" style={{ objectFit: 'cover' }} />
                  <div className="oracle-synthesis-success">
                    <div className="oracle-synthesis-success-badge">SYNTHESIS COMPLETE</div>
                    <button className="oracle-synthesis-close" onClick={() => setPortraitViewerUrl(null)}>
                      <X size={14} /> RETURN TO SIGNAL
                    </button>
                  </div>
                </motion.div>
              ) : (awakened || isOracleMode) ? (
                <motion.div key="live-face" className="oracle-avatar-container" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ zIndex: 3 }}>
                  <div
                    className="oracle-avatar-canvas"
                    style={{ 
                      opacity: isOracleMode ? 1 : 0.45,
                      filter: isOracleMode ? 'none' : 'blur(4px) brightness(0.6)',
                      transition: 'opacity 1s ease, filter 1s ease',
                      width: '100%',
                      height: '100%',
                      position: 'absolute',
                      top: 0,
                      left: 0
                    }}
                  >
                    <Canvas>
                      <OracleAvatar3D amplitude={currentAmplitude} viseme={currentViseme} />
                    </Canvas>
                  </div>
                  {/* Keep the 2D canvas around hidden just in case, or we can safely remove it later */}
                  <canvas 
                    ref={oracleFaceCanvasRef} 
                    style={{ display: 'none' }}
                  />
                  <video ref={avatarVideoRef} className="oracle-avatar-video" autoPlay playsInline muted />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      {/* ── Layer 6: Bottom Bar ── */}
      <div className="oracle-bottom-bar">
        <motion.div
          initial={{ opacity: 0.3, filter: 'brightness(0.4) saturate(0.3)' }}
          animate={{
            opacity: isAlive ? 1 : 0.3,
            filter: isAlive
              ? 'brightness(1.1) saturate(1.2) drop-shadow(0 0 16px rgba(0, 255, 136, 0.5))'
              : 'brightness(0.4) saturate(0.3)',
          }}
          transition={{ duration: 1.1, delay: isAlive ? 0.7 : 0 }}
        >
          <GraffPunksRadio isPlaying={isAudioPlaying} onToggle={() => setIsAudioPlaying(!isAudioPlaying)} />
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
          <EnculturateCrate onClick={() => setDebugMode(true)} isActive={isAlive} />
        </motion.div>
        
        {/* Guided Tour Toggle */}
        <motion.button
            initial={{ opacity: 0.3 }}
            animate={{ opacity: isAlive ? 1 : 0.3 }}
            onClick={() => setIsGuidedTour(!isGuidedTour)}
            style={{
                background: 'none',
                border: '1px solid ' + (isGuidedTour ? '#b026ff' : 'rgba(255,255,255,0.2)'),
                color: isGuidedTour ? '#b026ff' : 'rgba(255,255,255,0.5)',
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '0.7rem',
                letterSpacing: '0.1em',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                boxShadow: isGuidedTour ? '0 0 10px rgba(176,38,255,0.3)' : 'none'
            }}
        >
            {isGuidedTour ? 'TOUR: ON' : 'TOUR: OFF'}
        </motion.button>
      </div>

      <AnimatePresence>
        {scenePhase === 'terminal' && (
          <motion.div
            key="terminal-layer"
            className="oracle-terminal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.6 } }}
            onClick={() => journey.awakeFromTerminal()}
          >
            <div className="oracle-lore-text">
              {completedLines.map((line, i) => (
                <div key={`lore-${i}`} className="oracle-lore-line" style={{ whiteSpace: 'pre-wrap' }}>
                  <span className="oracle-lore-prompt">›</span>{line}
                </div>
              ))}
              
              {/* Inject Guided Tour Script after standard lore completes but before knife selection */}
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

        {scenePhase === 'awakened' && !journey.selectedKnifeQuestion && (
          <motion.div
            key="awakened-layer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: 'absolute', inset: 0, zIndex: 100 }}
          >
            <KnifeSelection
              isGeminiConnected={isGeminiConnected}
              selectedKnifeIndex={journey.selectedKnifeIndex}
              onSelect={handleKnifeClick}
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
          onSessionEnd={() => journey.exitOracleMode()}
          onConnected={() => setIsGeminiConnected(true)}
          onDisconnected={() => setIsGeminiConnected(false)}
          onListeningChange={setIsMicActive}
          isVisible={isOracleMode}
          autoStart={false}
          onUserSpeakingChange={setIsUserSpeaking}
          onBargeIn={() => connection.pcmPlayer?.stop()}
          onPortraitRequest={() => portrait.generatePortrait(portrait.getThemes())}
          isGuidedTour={isGuidedTour}
        />
      )}

      {isOracleMode && (
        <button className="oracle-exit-btn" onClick={exitOracleMode}><X size={20} /><span>EXIT</span></button>
      )}

      <AnimatePresence>
        {journey.isExiting && (
          <motion.div key="exit-ceremony" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="oracle-exit-ceremony">
            <ScrambleFragment
              texts={['THE ARCHIVE SEALS', 'CHANNEL CLOSING...', 'FAREWELL, SEEKER']}
              className="oracle-exit-ceremony__text" holdMs={600}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {debugMode && (
          <motion.div
            key="debug-panel" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 100 }}
          >
            <div style={{ pointerEvents: 'auto', position: 'absolute', right: 0, top: 0, bottom: 0 }}>
              <BackendControlPanel
                userId={currentUserId || undefined} sessionId={currentSessionId} isVisible initialTab="vault"
                onClose={() => setDebugMode(false)} isAuthenticated={false} pendingCoins={sessionCoins}
                decartClientRef={decartClientRef} oracleConversationRef={oracleConversationRef}
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

      <DecartClient ref={decartClientRef} />

      {/* ── High-Engagement Lip Warp Filter ── */}
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
      
      {/* ── Layer 7: Foreground Depth Frame ── */}
      <div className="oracle-depth-frame" aria-hidden="true" />
      
      {/* ── XR Immersion Toggle ── */}
      {isXRMode && (scenePhase === 'awakened' || scenePhase === 'oracle') && (
        <button
          className={`oracle-xr-toggle${cameraActive ? ' oracle-xr-toggle--active' : ''}`}
          onClick={() => cameraActive ? deactivateCamera() : activateCamera()}
          style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 100 }}
        >
          {cameraActive ? '◈ ALLEY' : '◈ AR'}
        </button>
      )}

      <AnimatePresence>
        {showWalletConnect && (
          <motion.div
            key="wallet-connect-layer"
            className="oracle-terminal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.6 } }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          >
            <div className="oracle-lore-text" style={{ textAlign: 'center' }}>
              <div style={{ marginBottom: '2rem', fontSize: '1.2rem', letterSpacing: '0.1em', color: '#00ff88' }}>
                <span className="oracle-lore-prompt">›</span> SIGNAL RECOGNIZED. RETURN TRIP VERIFIED.
              </div>
              <a 
                href="https://wallet.thesurrogate.me" 
                target="_blank" 
                rel="noreferrer"
                style={{
                  display: 'inline-block',
                  background: 'rgba(0, 255, 136, 0.1)',
                  border: '1px solid #00ff88',
                  color: '#00ff88',
                  padding: '1rem 2rem',
                  textDecoration: 'none',
                  letterSpacing: '0.15em',
                  marginBottom: '1.5rem',
                  transition: 'all 0.3s ease',
                  fontFamily: 'monospace'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0, 255, 136, 0.3)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(0, 255, 136, 0.1)'}
              >
                CONNECT CHAIN FUELZ WALLET
              </a>
              <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '2rem', fontFamily: 'monospace' }}>
                START EARNING CULTURE COINS ON-CHAIN
              </div>
              <button 
                onClick={() => {
                  setShowWalletConnect(false);
                  journey.awakeFromTerminal();
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#00ccff',
                  cursor: 'pointer',
                  letterSpacing: '0.1em',
                  textDecoration: 'underline',
                  fontFamily: 'monospace'
                }}
              >
                SKIP TO ARCHIVE
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default SurrogateOracleImmersion;
