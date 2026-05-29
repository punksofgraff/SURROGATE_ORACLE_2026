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
import { logStep } from './OracleStepLogger';
import { DormantHUD } from './ambient/DormantHUD';
import { DormantTransmissions } from './ambient/GhostTransmissions';
import { GlitchCursor } from './ambient/GlitchCursor';
import { KnifeSelection, KNIFE_QUESTIONS } from './KnifeSelection';

// Hooks
import { useAtmosphere } from '../hooks/useAtmosphere';
import { useParallax } from '../hooks/useParallax';
import { useXRMode } from '../hooks/useXRMode';
import { useTypewriter } from '../hooks/useTypewriter';
import { useLoreSequence } from '../hooks/useLoreSequence';
import { useOracleConnection } from '../hooks/useOracleConnection';
import { usePortraitPipeline } from '../hooks/usePortraitPipeline';
import { useOracleJourney } from '../hooks/useOracleJourney';

// Libs/Utils
import { getAudioContext } from '../lib/oracleSfx';
import './SurrogateOracleImmersion.css';

// ─── PIXEL-MAPPED MOUTH DRAWING ──────────────────────────────────────────────
function drawMouthOnCanvas(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: any,
) {
  ctx.clearRect(0, 0, w, h);
  const { openness, rounded, spread, amplitude } = state;

  if (amplitude < 0.04) return; // silence — nothing to draw

  const cx = w / 2;
  const cornerY = h * 0.46;
  const halfW = w * (0.32 + spread * 0.25);
  const leftX  = cx - halfW;
  const rightX = cx + halfW;
  const opening = h * Math.max(0.02, openness * 0.58) * (0.7 + amplitude * 0.3);
  const ulPeak = cornerY - opening * 0.38;
  const llBase = cornerY + opening * 0.62;
  const cornerDrop = h * 0.055 * (1 - rounded * 0.4);
  const leftCornerY  = cornerY + cornerDrop;
  const rightCornerY = cornerY + cornerDrop;
  const bowDepth = h * 0.08 * (1 - rounded * 0.7);

  if (openness > 0.06) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(leftX, leftCornerY);
    ctx.bezierCurveTo(leftX  + halfW * 0.3, ulPeak, rightX - halfW * 0.3, ulPeak, rightX, rightCornerY);
    ctx.bezierCurveTo(rightX - halfW * 0.3, llBase, leftX  + halfW * 0.3, llBase, leftX, leftCornerY);
    ctx.closePath();
    const cavGrad = ctx.createLinearGradient(cx, ulPeak, cx, llBase);
    cavGrad.addColorStop(0, `rgba(0, 15, 8, ${0.88 + amplitude * 0.1})`);
    cavGrad.addColorStop(0.5, `rgba(0, 6, 3, ${0.94})`);
    cavGrad.addColorStop(1, `rgba(0, 20, 10, ${0.85})`);
    ctx.fillStyle = cavGrad;
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(leftX, leftCornerY);
  ctx.bezierCurveTo(leftX + halfW * 0.22, ulPeak - h * 0.12, cx - halfW * 0.16, ulPeak + bowDepth, cx, ulPeak - bowDepth * 0.3);
  ctx.bezierCurveTo(cx + halfW * 0.16, ulPeak + bowDepth, rightX - halfW * 0.22, ulPeak - h * 0.12, rightX, rightCornerY);
  ctx.bezierCurveTo(rightX - halfW * 0.28, cornerY - opening * 0.22, leftX + halfW * 0.28, cornerY - opening * 0.22, leftX, leftCornerY);
  ctx.closePath();
  const alpha = 0.72 + amplitude * 0.22;
  const ulGrad = ctx.createLinearGradient(cx, ulPeak - h * 0.12, cx, cornerY);
  ulGrad.addColorStop(0, `rgba(15, 120, 70, ${alpha})`);
  ulGrad.addColorStop(0.6, `rgba(8,  90, 50, ${alpha})`);
  ulGrad.addColorStop(1,   `rgba(4,  60, 32, ${alpha * 0.9})`);
  ctx.fillStyle = ulGrad;
  ctx.shadowColor = `rgba(0, 255, 136, ${0.18 + amplitude * 0.22})`;
  ctx.shadowBlur  = 4 + amplitude * 5;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(leftX, leftCornerY);
  ctx.bezierCurveTo(leftX + halfW * 0.25, llBase + h * 0.1, rightX - halfW * 0.25, llBase + h * 0.1, rightX, rightCornerY);
  ctx.bezierCurveTo(rightX - halfW * 0.3, cornerY + opening * 0.3, leftX + halfW * 0.3, cornerY + opening * 0.3, leftX, leftCornerY);
  ctx.closePath();
  const llGrad = ctx.createLinearGradient(cx, cornerY, cx, llBase + h * 0.1);
  llGrad.addColorStop(0,   `rgba(10,  90, 52, ${alpha * 0.95})`);
  llGrad.addColorStop(0.5, `rgba(12, 110, 62, ${alpha})`);
  llGrad.addColorStop(1,   `rgba(6,   70, 38, ${alpha * 0.88})`);
  ctx.fillStyle = llGrad;
  ctx.shadowColor = `rgba(0, 255, 136, ${0.12 + amplitude * 0.18})`;
  ctx.shadowBlur  = 3 + amplitude * 4;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(leftX, leftCornerY);
  ctx.bezierCurveTo(leftX + halfW * 0.22, ulPeak - h * 0.12, cx - halfW * 0.16, ulPeak + bowDepth, cx, ulPeak - bowDepth * 0.3);
  ctx.bezierCurveTo(cx + halfW * 0.16, ulPeak + bowDepth, rightX - halfW * 0.22, ulPeak - h * 0.12, rightX, rightCornerY);
  ctx.bezierCurveTo(rightX - halfW * 0.25, llBase + h * 0.1, leftX + halfW * 0.25, llBase + h * 0.1, leftX, leftCornerY);
  ctx.strokeStyle = `rgba(0, 255, 136, ${0.25 + amplitude * 0.30})`;
  ctx.lineWidth   = 1.2;
  ctx.shadowColor = `rgba(0, 255, 136, ${0.35 + amplitude * 0.35})`;
  ctx.shadowBlur  = 5 + amplitude * 8;
  ctx.stroke();
  ctx.restore();
}

// Constants
const ORACLE_STATIC_URL  = 'https://i.postimg.cc/26pvW2SN/orackle-only-static.png';
const ORACLE_AVATAR_URL  = 'https://i.postimg.cc/jSGnyZXh/Image-1-(11).jpg';
const ALLEY_BG_URL       = 'https://i.postimg.cc/jSJRRRk2/7D633B70-4C62-4326-92A8-3B8790C9B3B0.png';
const AUDIO_STREAM_URL   = 'https://stream.radiojar.com/2qm1fc5kb';
const ORACLE_PLAYBACK_RATE = 1.0;

const DEBRIS = [
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

  // Refs
  const decartClientRef = useRef<DecartClientHandle | null>(null);
  const avatarVideoRef = useRef<HTMLVideoElement | null>(null);
  const oracleFaceRef = useRef<HTMLImageElement | null>(null);
  const mouthCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const oracleFaceMapRef = useRef<import('../lib/OracleVisionCalibrator').OracleFaceMap | null>(null);
  const oracleConversationRef = useRef<OracleConversationHandle | null>(null);
  const pcmAmplitudeRef = useRef(0);
  const atmosphereCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const staticAvatarRef = useRef<HTMLImageElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const radioGainRef = useRef<GainNode | null>(null);
  const targetVolRef = useRef(0.22);

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
    const face = oracleFaceRef.current;
    const canvas = mouthCanvasRef.current;

    // Ignore background noise from the worklet
    const amp = state.amplitude > 0.02 ? state.amplitude : 0;
    if (amp > pcmAmplitudeRef.current) pcmAmplitudeRef.current = amp;

    if (face) {
      const { openness } = state;
      if (amp < 0.04) {
        face.style.filter = '';
        face.style.transform = 'scale(0.92)';
      } else {
        const scale  = (0.92 + openness * 0.04).toFixed(3);
        const bright = (1.1  + openness * 0.25).toFixed(3);
        const alpha  = (0.45 + openness * 0.35).toFixed(3);
        const glow   = (18   + openness * 14).toFixed(1);

        face.style.filter = `url(#oracle-lip-warp) brightness(${bright}) drop-shadow(0 0 ${glow}px rgba(0,255,136,${alpha}))`;
        face.style.transform = `scale(${scale})`;
        face.style.transition = 'none';
      }
    }

    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const dpr = window.devicePixelRatio || 1;
        const displayW = canvas.offsetWidth;
        const displayH = canvas.offsetHeight;
        if (canvas.width !== Math.round(displayW * dpr) || canvas.height !== Math.round(displayH * dpr)) {
          canvas.width  = Math.round(displayW * dpr);
          canvas.height = Math.round(displayH * dpr);
          ctx.scale(dpr, dpr);
        }
        drawMouthOnCanvas(ctx, displayW, displayH, state);
        canvas.style.opacity = amp < 0.04 ? '0' : '1';
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
    enterTerminal();
  }, [scenePhase, setupAudioSpine, enterTerminal]);

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
      const decay = Math.pow(0.92, dt * 60);
      pcmAmplitudeRef.current *= decay;
      
      const face = oracleFaceRef.current;
      const canvas = mouthCanvasRef.current;
      
      if (face) {
        face.dataset.amplitude = pcmAmplitudeRef.current.toFixed(3);
        face.dataset.visemeActive = pcmAmplitudeRef.current > 0.01 ? 'true' : 'false';
      }

      // If we've decayed to silence, ensure elements are reset
      if (pcmAmplitudeRef.current < 0.01) {
        if (face) {
          face.style.filter = '';
          face.style.transform = 'scale(0.92)';
        }
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
          canvas.style.opacity = '0';
        }
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
      gain.gain.exponentialRampToValueAtTime(safeTarget, now + (isDucking ? 0.06 : 0.40));
    } else if (audioRef.current) {
      audioRef.current.volume = target;
    }
  }, []);

  // ── Music ducking — three clean levels ────────────────────────────────────
  useEffect(() => {
    let target = 0.22; // Default (dormant/lore)
    if (scenePhase !== 'dormant') target = 0.06;
    if (scenePhase === 'oracle')  target = 0.04; // Oracle ready
    
    // Additional ducking for user/oracle speaking
    if (isUserSpeaking)   target = 0.15;
    if (isOracleSpeaking) target = 0.02; // Oracle speaking (~7%)
    
    fadeToVolume(target);
  }, [scenePhase, isUserSpeaking, isOracleSpeaking, fadeToVolume]);

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
    // Restore HRTF Head Tracking — Oracle voice follows movement
    if (connectionRef.current.pcmPlayer) {
      connectionRef.current.pcmPlayer.updateHeadOrientation(x, y);
    }
  }, []);
  
  useParallax(scenePhase, handleParallaxUpdate);
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
    return () => window.removeEventListener('oracle:auth:trigger', handleAuthTrigger);
  }, []);

  useEffect(() => {
    if (scenePhase === 'awakened') {
      // Connect and warm up Gemini precisely once upon awakening
      connection.initializeOracle();
      
      // Attempt to retrieve user email for portrait persistence if authenticated
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
  }, [scenePhase, connection.initializeOracle]);

  // ── DEV hooks ──
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as any).__oracle_handleAudio = (url: string) => connection.handleOracleResponse(url);
    (window as any).__oracle_skipLore = () => {
      logStep('LORE SKIPPED (DEV HOOK)', 'ok');
      if (journey.scenePhase === 'dormant') journey.enterTerminal();
      setTimeout(() => journey.awakeFromTerminal(), 800);
    };
    return () => {
      delete (window as any).__oracle_handleAudio;
      delete (window as any).__oracle_skipLore;
    };
  }, [connection.handleOracleResponse, journey.scenePhase, journey.enterTerminal, journey.awakeFromTerminal]);

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

            {isOracleMode && (
              <img
                ref={oracleFaceRef}
                src={portrait.latestPortraitUrl || ORACLE_AVATAR_URL}
                alt="SURROGATE Oracle"
                className="oracle-avatar-img"
                style={{
                  opacity: connection.isDecartActive ? 0 : 1,
                  transform: 'scale(0.92)',
                  filter: 'brightness(1.1) drop-shadow(0 0 18px rgba(0,255,136,0.45))',
                }}
              />
            )}
            
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
              ) : isOracleMode ? (
                <motion.div key="live-face" className="oracle-avatar-container" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ zIndex: 3 }}>
                  {!connection.isDecartActive && (
                    <canvas
                      ref={mouthCanvasRef}
                      className="oracle-mouth-canvas"
                      aria-hidden="true"
                      style={{ position: 'absolute', top: '57%', left: '50%', transform: 'translateX(-50%)', width: '20%', height: '15%', pointerEvents: 'none', zIndex: 4 }}
                    />
                  )}
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
              ? 'brightness(1.1) saturate(1.2) drop-shadow(0 0 16px rgba(176,38,255,0.5))'
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
      </div>

      <AnimatePresence>
        {isAlive && !isOracleMode && (
          <motion.div
            key="lore-overlay"
            className="oracle-terminal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.4 } }}
            onClick={() => journey.scenePhase === 'terminal' && journey.awakeFromTerminal()}
          >
            <div className="oracle-lore-text">
              {completedLines.map((line, i) => (
                <div key={`lore-${i}`} className="oracle-lore-line" style={{ whiteSpace: 'pre-wrap' }}>
                  <span className="oracle-lore-prompt">›</span>{line}
                </div>
              ))}
              {journey.scenePhase === 'terminal' && (
                <>
                  {currentLine && (
                    <div className="oracle-lore-line oracle-lore-line--typing" style={{ whiteSpace: 'pre-wrap' }}>
                      <span className="oracle-lore-prompt">›</span>{currentLine}<GlitchCursor />
                    </div>
                  )}
                  {!currentLine && completedLines.length < 10 && (
                    <div className="oracle-lore-line">
                      <span className="oracle-lore-prompt">›</span><GlitchCursor />
                    </div>
                  )}
                </>
              )}
            </div>
            {completedLines.length >= 2 && journey.scenePhase === 'terminal' && (
              <div className="oracle-lore-skip">TAP TO SKIP ARCHIVE FRAGMENT</div>
            )}
          </motion.div>
        )}
        {scenePhase === 'awakened' && !journey.selectedKnifeQuestion && (
          <KnifeSelection
            key="knife-selection"
            isGeminiConnected={isGeminiConnected}
            selectedKnifeIndex={journey.selectedKnifeIndex}
            onSelect={handleKnifeClick}
          />
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
    </div>
  );
}

export default SurrogateOracleImmersion;
