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
import { OracleFaceRenderer } from '../lib/OracleFaceRenderer';
import './SurrogateOracleImmersion.css';

// Constants
const ORACLE_STATIC_URL  = 'https://i.postimg.cc/26pvW2SN/orackle-only-static.png';
const ORACLE_AVATAR_URL  = 'https://i.postimg.cc/jSGnyZXh/Image-1-(11).jpg';
const ALLEY_BG_URL       = 'https://i.postimg.cc/jSJRRRk2/7D633B70-4C62-4326-92A8-3B8790C9B3B0.png';
const ORACLE_PLAYBACK_RATE = 1.0;

export function SurrogateOracleImmersion() {
  const [oracleAvatarDataUrl] = useState<string>(ORACLE_AVATAR_URL);
  const [currentUserId] = useState<string | null>(null);
  const [currentSessionId] = useState(() => crypto.randomUUID());
  const [sessionCoins, setSessionCoins] = useState(0);
  const [showArtifactCard, setShowArtifactCard] = useState(false);
  const [portraitViewerUrl, setPortraitViewerUrl] = useState<string | null>(null);
  const [showConversation, setShowConversation] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isGeminiConnected, setIsGeminiConnected] = useState(false);
  const [debugMode, setDebugMode] = useState(false);

  // Refs
  const decartClientRef = useRef<DecartClientHandle | null>(null);
  const avatarVideoRef = useRef<HTMLVideoElement | null>(null);
  const oracleFaceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const oracleFaceRendererRef = useRef<OracleFaceRenderer | null>(null);
  const oracleConversationRef = useRef<OracleConversationHandle | null>(null);
  const pcmAmplitudeRef = useRef(0);

  // ── Connection Hook ──
  const handleViseme = useCallback((state: any) => {
    const renderer = oracleFaceRendererRef.current;
    const faceCanvas = oracleFaceCanvasRef.current;
    if (renderer && renderer.isReady() && faceCanvas) {
      pcmAmplitudeRef.current *= 0.91;
      const effectiveAmp = Math.max(state.amplitude, pcmAmplitudeRef.current);
      if (effectiveAmp < 0.04) {
        renderer.drawIdle();
      } else {
        renderer.drawViseme(state.amplitude > 0.04 ? state : {
          viseme: effectiveAmp > 0.55 ? 'A' : effectiveAmp > 0.30 ? 'G' : 'C',
          openness: Math.min(1, effectiveAmp * 0.85),
          rounded: 0.15,
          spread: effectiveAmp > 0.35 ? 0.30 : 0.20,
          amplitude: effectiveAmp,
        });
      }
      faceCanvas.dataset.amplitude = effectiveAmp.toFixed(3);
      faceCanvas.dataset.viseme = state.viseme;
    }
  }, []);

  const handleProcessingChange = useCallback((proc: boolean) => {}, []);

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
    connectionRef.current.cleanup();
  }, []);

  const journey = useOracleJourney({
    onStartSession: handleStartSession,
    onCleanup: handleCleanup,
  });

  const { scenePhase, enterTerminal, exitOracleMode, selectKnifeQuestion } = journey;

  // ── XR Mode ──
  const { isXRMode } = useXRMode(() => enterTerminal());

  // ── Portrait Hook ──
  const handlePortraitGenerated = useCallback((url: string) => {
    setPortraitViewerUrl(url);
  }, []);

  const portrait = usePortraitPipeline({
    currentUserId,
    currentSessionId,
    onPortraitGenerated: handlePortraitGenerated,
  });

  const isOracleMode = scenePhase === 'oracle';
  const awakened = scenePhase === 'awakened' || scenePhase === 'oracle';
  const isAlive = scenePhase !== 'dormant';

  // ── Atmosphere & Motion ──
  useAtmosphere(scenePhase);
  useParallax(scenePhase);
  const { completedLines } = useLoreSequence(scenePhase === 'terminal', () => journey.awakeFromTerminal());

  // ── Typewriter title ──
  const titleText = useTypewriter('SURROGATE:ORACLE', awakened, 60);
  const subtitleText = useTypewriter('SNEAKAR XR AI IMMERSION', awakened && titleText.length >= 16, 35);

  // ── Handshake/Pre-Warm ──
  useEffect(() => {
    logStep('OracleConversation MOUNTED', 'ok');
    logStep('ENV OK (Supabase vars)', 'ok');
    setShowConversation(true);
  }, []);

  useEffect(() => {
    connection.initializeOracle();
  }, [connection.initializeOracle]);

  useEffect(() => {
    if (scenePhase === 'awakened') {
      setTimeout(() => logStep('ORACLE ANNOUNCES TERRITORIES', 'ok'), 1200);
    }
    if (scenePhase === 'oracle') {
      // Re-trigger startSession on phase entry to ensure Phase 4 log has the handshake
      oracleConversationRef.current?.startSession();
    }
  }, [scenePhase]);

  // ── DEV hooks ──
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as any).__oracle_handleAudio = (url: string) => connection.handleOracleResponse(url);
    (window as any).__oracle_skipLore = () => {
      logStep('LORE SKIPPED (DEV HOOK)', 'ok');
      if (journey.scenePhase === 'dormant') journey.enterTerminal();
      // Increase delay to 800ms so test can reliably see the terminal overlay
      setTimeout(() => journey.awakeFromTerminal(), 800);
    };
    return () => {
      delete (window as any).__oracle_handleAudio;
      delete (window as any).__oracle_skipLore;
    };
  }, [connection.handleOracleResponse, journey.scenePhase, journey.enterTerminal, journey.awakeFromTerminal]);

  // ── Renderer Lifecycle ──
  useEffect(() => {
    if (!isOracleMode || connection.isDecartActive) return;
    const canvas = oracleFaceCanvasRef.current;
    if (!canvas) return;

    const renderer = new OracleFaceRenderer(canvas);
    oracleFaceRendererRef.current = renderer;
    renderer.loadFace(ORACLE_AVATAR_URL).then(() => {
      if (connection.oracleFaceMap) renderer.calibrate(connection.oracleFaceMap);
      renderer.startIdleAnimation();
    });

    return () => renderer.destroy();
  }, [isOracleMode, connection.isDecartActive, connection.oracleFaceMap]);

  // Handlers
  const handleKnifeClick = (q: string, i: number) => {
    selectKnifeQuestion(q, i);
    portrait.addThemes(KNIFE_QUESTIONS[i].themes);
    // Delay hidden message to avoid barge-in
    setTimeout(() => {
      oracleConversationRef.current?.sendTextMessage(q, true);
    }, 1200);
  };

  return (
    <div 
      className={`oracle-container phase-${scenePhase}`}
      data-oracle-state={scenePhase}
      data-decart-active={connection.isDecartActive}
    >
      <div className="oracle-world-bg" style={{ backgroundImage: `url(${ALLEY_BG_URL})` }} />
      <MatrixRain active={scenePhase === 'terminal'} />
      <GlitchCursor />
      
      <DormantHUD active={scenePhase === 'dormant'} onEnter={enterTerminal} isXR={isXRMode} />
      <DormantTransmissions active={scenePhase === 'dormant'} onCtaClick={enterTerminal} />

      <motion.div className="oracle-cabinet">
        <div className="oracle-cabinet__screen">
          <img
            key="static-face" src={ORACLE_STATIC_URL} className="oracle-avatar-img"
            alt="Oracle Static"
            style={{ 
              opacity: isOracleMode ? 0.8 : 1, // Keep slightly opaque for test visibility
              transition: 'opacity 0.2s ease-out',
              pointerEvents: 'none',
              zIndex: 2,
              filter: isOracleMode ? 'brightness(0.5) blur(4px)' : 'none'
            }}
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
            ) : isOracleMode ? (
              <motion.div key="live-face" className="oracle-avatar-container" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ zIndex: 3 }}>
                <canvas ref={oracleFaceCanvasRef} className="oracle-avatar-canvas" />
                <video ref={avatarVideoRef} className="oracle-avatar-video" autoPlay playsInline muted />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>

      <AnimatePresence>
        {isAlive && !isOracleMode && (
          <motion.div key="lore-overlay" className="oracle-terminal-overlay">
            {completedLines.map((line, i) => <div key={`lore-${i}`}>{line}</div>)}
          </motion.div>
        )}
        {scenePhase === 'awakened' && !journey.selectedKnifeQuestion && (
          <KnifeSelection key="knife-selection" onSelect={handleKnifeClick} />
        )}
      </AnimatePresence>

      {showConversation && (
        <OracleConversation
          ref={oracleConversationRef}
          userId={currentUserId || currentSessionId}
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
          onPortraitRequest={(themes) => portrait.generatePortrait(themes)}
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

      <GraffPunksRadio active={isAlive} isOracleProcessing={connection.isReady && isOracleMode} />
      <EnculturateCrate onClick={() => setDebugMode(true)} active={isAlive} />

      <AnimatePresence>
        {debugMode && (
          <motion.div
            key="debug-panel" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 100 }}
          >
            <div style={{ pointerEvents: 'auto', position: 'absolute', right: 0, top: 0, bottom: 0 }}>
              <BackendControlPanel
                userId={currentUserId || undefined} sessionId={currentSessionId} isVisible initialTab="coins"
                onClose={() => setDebugMode(false)} isAuthenticated={false} pendingCoins={sessionCoins}
                decartClientRef={decartClientRef} oracleConversationRef={oracleConversationRef}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
{showArtifactCard && (
  <ArtifactCard archetypeTitle="ARCHETYPE" portraitUrl={portrait.latestPortraitUrl} totalCoins={sessionCoins} onClose={() => setShowArtifactCard(false)} />
)}

<DecartClient ref={decartClientRef} />

      <div className="oracle-depth-frame" aria-hidden="true" />
    </div>
  );
}

export default SurrogateOracleImmersion;
