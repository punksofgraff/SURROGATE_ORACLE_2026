/**
 * 🔒 CORE PROTECTED FILE - IMMERSIVE SURROGATE ORACLE EXPERIENCE
 * 
 * This file contains the main immersive cyberpunk Oracle interface
 * Status: CORE COMPONENT - PROTECTED
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import DecartClient, { DecartClientHandle } from './DecartClient';
import { BackendControlPanel } from './BackendControlPanel';
import { GoogleSignInOverlay } from './GoogleSignInOverlay';
import { GraffPunksRadio } from './GraffPunksRadio';
import { EnculturateCrate } from './EnculturateCrate';
import { CultureCoinInlineDisplay } from './CultureCoinInlineDisplay';
import { ConnectingAnimation } from './ConnectingAnimation';
import { OracleConversation } from './OracleConversation';
import './SurrogateOracleImmersion.css';

interface OracleState {
  isConnected: boolean;
  isReady: boolean;
  isProcessing: boolean;
  isListening: boolean;
  currentMode: 'voice' | 'text';
  error: string | null;
  debugMode: boolean;
  activeBackendTab?: 'coins' | 'squad' | 'portraits' | 'debug';
}

const ORACLE_IMAGE_URL = 'https://i.postimg.cc/26pvW2SN/orackle-only-static.png';

export const SurrogateOracleImmersion: React.FC = () => {
  // Core State
  const [oracleState, setOracleState] = useState<OracleState>({
    isConnected: false,
    isReady: false,
    isProcessing: false,
    isListening: false,
    currentMode: 'voice',
    error: null,
    debugMode: false
  });

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentSessionId] = useState<string>(crypto.randomUUID());
  
  // UI State
  const [isOracleMode, setIsOracleMode] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioVolume, setAudioVolume] = useState(0.3);
  const [connectionProgress, setConnectionProgress] = useState(0);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showInlineCoins, setShowInlineCoins] = useState(false);
  const [voiceGender, setVoiceGender] = useState<'male' | 'female'>('male');

  // Refs
  const decartClientRef = useRef<DecartClientHandle | null>(null);
  const avatarCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Environment Validation
  const validateEnvironment = useCallback(() => {
    const required = [
      'VITE_SUPABASE_URL',
      'VITE_SUPABASE_ANON_KEY',
      'VITE_DECART_API_KEY'
    ];
    
    const missing = required.filter(key => !import.meta.env[key]);
    if (missing.length > 0) {
      console.error('❌ Missing environment variables:', missing);
      setOracleState(prev => ({ 
        ...prev, 
        error: `Missing environment: ${missing.join(', ')}` 
      }));
      return false;
    }
    return true;
  }, []);

  // Authentication Check
  useEffect(() => {
    const checkAuth = () => {
      const devSession = localStorage.getItem('dev_user_session');
      
      if (devSession) {
        try {
          const user = JSON.parse(devSession);
          console.log('✅ Dev session found:', user.email);
          setIsAuthenticated(true);
          setCurrentUserId(user.id);
          setShowInlineCoins(true);
        } catch (error) {
          console.warn('Failed to parse dev session:', error);
          setIsAuthenticated(false);
        }
      } else {
        console.log('🔐 No authentication found');
        setIsAuthenticated(false);
      }
    };
    
    checkAuth();
  }, []);

  // Audio Management
  useEffect(() => {
    if (audioRef.current) {
      if (isAudioPlaying) {
        audioRef.current.play().catch(error => {
          console.warn('🔊 Audio autoplay blocked:', error);
        });
      } else {
        audioRef.current.pause();
      }
    }
  }, [isAudioPlaying]);

  useEffect(() => {
    if (audioRef.current) {
      const targetVolume = oracleState.isProcessing ? audioVolume * 0.2 : audioVolume;
      audioRef.current.volume = targetVolume;
    }
  }, [audioVolume, oracleState.isProcessing]);

  // Initialize Oracle (Decart LipSync Live)
  const initializeOracle = async () => {
    if (!validateEnvironment()) return;
    if (!avatarCanvasRef.current) {
      setOracleState(prev => ({ ...prev, error: 'Oracle canvas not ready' }));
      return;
    }

    setIsConnecting(true);
    setConnectionProgress(0);

    try {
      console.log('🚀 Initializing SURROGATE Oracle via Decart...');

      // Progress animation
      const progressInterval = setInterval(() => {
        setConnectionProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 500);

      // Set Decart callbacks
      decartClientRef.current?.setCallbacks({
        onConnected: () => {
          console.log('✅ Decart WebSocket connected');
          setOracleState(prev => ({ ...prev, isConnected: true }));
          setConnectionProgress(95);
        },
        onStreamReady: () => {
          console.log('✅ Decart stream ready');
          setOracleState(prev => ({ ...prev, isReady: true, error: null }));
          setConnectionProgress(100);
          setTimeout(() => {
            setIsConnecting(false);
            setIsOracleMode(true);
          }, 800);
        },
        onTalkStarted: () => {
          console.log('🎤 Oracle speaking (Decart)...');
          setOracleState(prev => ({ ...prev, isProcessing: true }));
        },
        onTalkEnded: () => {
          console.log('🎤 Oracle finished speaking (Decart)');
          setOracleState(prev => ({ ...prev, isProcessing: false }));
        },
        onDisconnected: (state) => {
          console.log('❌ Decart disconnected:', state);
          setOracleState(prev => ({ 
            ...prev, 
            isConnected: false, 
            isReady: false,
            error: `Connection lost: ${state}`
          }));
          setIsOracleMode(false);
          setIsConnecting(false);
        },
        onError: (err) => {
          console.error('❌ Decart error:', err);
          setOracleState(prev => ({ ...prev, error: err }));
        }
      });

      const result = await decartClientRef.current?.initializeStream(
        ORACLE_IMAGE_URL,
        avatarCanvasRef.current
      );

      if (!result?.success) {
        throw new Error(result?.error || 'Failed to initialize Decart stream');
      }

      console.log('✅ Oracle (Decart) stream initialized');
    } catch (error: any) {
      console.error('❌ Oracle initialization failed:', error);
      setOracleState(prev => ({ ...prev, error: error.message }));
      setIsConnecting(false);
      setIsOracleMode(false);
    }
  };

  // Oracle Response Handler
  // NOTE: OracleConversation MUST now provide an audio URL (e.g. from ElevenLabs)
  const handleOracleResponse = async (audioUrl: string) => {
    if (!decartClientRef.current?.isStreamActive()) return;

    try {
      console.log('🎤 Sending audio to Decart for lip-sync:', audioUrl);
      const result = await decartClientRef.current.sendAudio(audioUrl);

      if (!result.success) {
        const errorMsg = `Decart LipSync error: ${result.error}`;
        console.error('❌', errorMsg);
        setOracleState(prev => ({ ...prev, error: errorMsg }));
      } else {
        console.log('✅ Audio sent to Decart successfully');
        setOracleState(prev => ({ ...prev, error: null }));
      }
    } catch (error: any) {
      const errorMsg = `Oracle/Decart response error: ${error.message}`;
      console.error('❌', errorMsg);
      setOracleState(prev => ({ ...prev, error: errorMsg }));
    }
  };

  // Exit Oracle Mode
  const exitOracleMode = async () => {
    console.log('🚪 Exiting Oracle mode...');
    
    if (decartClientRef.current) {
      await decartClientRef.current.closeStream();
    }
    
    setIsOracleMode(false);
    setOracleState({
      isConnected: false,
      isReady: false,
      isProcessing: false,
      isListening: false,
      currentMode: 'voice',
      error: null,
      debugMode: false
    });
  };

  // Backend Panel Controls - LEARN2EARN Integration
  const openBackendPanel = (tab: 'coins' | 'squad' | 'portraits' | 'debug' = 'coins') => {
    console.log('🎨 ENCULTURATE crate activated - Opening LEARN2EARN backend panel...');
    
    if (!isAuthenticated && (tab === 'coins' || tab === 'squad')) {
      console.log('🔐 Authentication required for Culture Coins features');
      setShowAuthOverlay(true);
    }
    setOracleState(prev => ({ 
      ...prev, 
      debugMode: true,
      activeBackendTab: tab 
    }));
  };

  const closeBackendPanel = () => {
    setOracleState(prev => ({ ...prev, debugMode: false }));
  };

  // Audio Controls - GraffPunks Radio Integration
  const toggleAudio = () => {
    console.log('📻 GraffPunks radio toggled:', !isAudioPlaying);
    setIsAudioPlaying(!isAudioPlaying);
  };

  // Authentication Handlers
  const handleAuthSuccess = (user: any) => {
    console.log('✅ Authentication successful:', user.email);
    setIsAuthenticated(true);
    setShowAuthOverlay(false);
    setCurrentUserId(user.id);
    setShowInlineCoins(true);
    setOracleState(prev => ({ ...prev, debugMode: true }));
  };

  const handleAuthClose = () => {
    console.log('🚪 Authentication overlay closed');
    setShowAuthOverlay(false);
  };

  // Handle Culture Coins Update
  const handleCoinsUpdate = (updateFunction: (amount: number) => void) => {
    (window as any).updateInlineCultureCoins = updateFunction;
  };

  // Error Handler
  const clearError = () => {
    setOracleState(prev => ({ ...prev, error: null }));
  };

  return (
    <div className="oracle-immersion-container">
      {/* Decart LipSync client (no UI) */}
      <DecartClient ref={decartClientRef} />

      {/* Direct Audio Element for GraffPunks Radio */}
      <audio
        ref={audioRef}
        loop
        crossOrigin="anonymous"
        style={{ display: 'none' }}
      >
        <source src="https://stream.radiojar.com/2qm1fc5kb" type="audio/mpeg" />
      </audio>

      {/* Graffiti Alley Background */}
      <div 
        className="alley-background-tilt"
        style={{
          backgroundImage: 'url(https://i.postimg.cc/jSJRRRk2/7-D633-B70-4-C62-4326-92-A8-3-B8790-C9-B3-B0.png)',
          filter: isOracleMode ? 'brightness(0.4) blur(2px)' : 'brightness(0.7) contrast(1.2)'
        }}
      />

      {/* SNEAKAR Branding */}
      <div className="sneakar-branding">
        <motion.h1 
          className="oracle-title sneakar-title"
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, delay: 0.5 }}
        >
          SURROGATE:ORACLE
        </motion.h1>
        <motion.p 
          className="accent-text sneakar-subtitle"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.2 }}
        >
          SNEAKAR AI Immersion
        </motion.p>
      </div>

      {/* Oracle Image / Canvas Container */}
      <motion.div
        className="oracle-image-container"
        onClick={!isOracleMode ? initializeOracle : undefined}
        style={{
          position: 'absolute',
          top: '45%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          transformOrigin: 'center',
          width: '280px',
          height: '280px',
          backgroundImage: `url(${ORACLE_IMAGE_URL})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          cursor: isOracleMode ? 'default' : 'pointer',
          borderRadius: '15%',
          zIndex: 90
        }}
      >
        {/* Static Oracle image (visible until Decart stream is active) */}
        <img 
          src={ORACLE_IMAGE_URL} 
          alt="SURROGATE Oracle" 
          className="static-oracle-image"
          style={{ opacity: isOracleMode ? 0 : 1 }}
        />

        {/* Decart-rendered avatar canvas */}
        <canvas
          ref={avatarCanvasRef}
          className="oracle-canvas"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderRadius: '15%',
            opacity: isOracleMode ? 1 : 0,
            transition: 'opacity 0.5s ease'
          }}
        />
      </motion.div>

      {/* Bottom Centered Controls - Radio & Crate */}
      <div className="bottom-controls-center">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 1.5 }}
        >
          <GraffPunksRadio 
            isPlaying={isAudioPlaying}
            onToggle={toggleAudio}
            volume={audioVolume}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 1.7 }}
        >
          <EnculturateCrate 
            onClick={openBackendPanel}
            isActive={oracleState.debugMode}
          />
        </motion.div>
      </div>

      {/* Culture Coin Inline Display - Only when authenticated */}
      <AnimatePresence>
        {showInlineCoins && isAuthenticated && currentUserId && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <CultureCoinInlineDisplay 
              userId={currentUserId}
              onUpgradeClick={() => openBackendPanel()}
              showUpgradePrompt={true}
              onCoinsUpdated={handleCoinsUpdate}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Connecting Animation */}
      <AnimatePresence>
        {isConnecting && (
          <ConnectingAnimation 
            connectionProgress={connectionProgress}
            onCancel={() => {
              setIsConnecting(false);
              setConnectionProgress(0);
            }}
          />
        )}
      </AnimatePresence>

      {/* Oracle Mode Overlay */}
      <AnimatePresence>
        {isOracleMode && (
          <motion.div 
            className="oracle-mode-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button 
              className="oracle-exit-btn"
              onClick={exitOracleMode}
              aria-label="Exit Oracle mode"
            >
              <X size={24} />
            </button>

            <OracleConversation
              userId={currentUserId || currentSessionId}
              sessionId={currentSessionId}
              // IMPORTANT: OracleConversation must call this with an audio URL,
              // not with plain text, after generating TTS via ElevenLabs/etc.
              onOracleResponse={handleOracleResponse}
              onCoinsEarned={handleCoinsUpdate}
              onClose={exitOracleMode}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Backend Control Panel - LEARN2EARN */}
      <AnimatePresence>
        {oracleState.debugMode && (
          <motion.div
            className="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="panel"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              style={{ maxWidth: '90vw', maxHeight: '90vh', overflow: 'auto' }}
            >
              <BackendControlPanel 
                isVisible={oracleState.debugMode}
                initialTab="coins"
                onClose={closeBackendPanel}
                userId={currentUserId}
                sessionId={currentSessionId}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Authentication Overlay - Only when triggered */}
      <AnimatePresence>
        {showAuthOverlay && (
          <GoogleSignInOverlay 
            onClose={handleAuthClose} 
            onSuccess={handleAuthSuccess} 
          />
        )}
      </AnimatePresence>

      {/* Error Display */}
      <AnimatePresence>
        {oracleState.error && (
          <motion.div 
            className="error-display"
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
          >
            <span className="info-text">{oracleState.error}</span>
            <button 
              onClick={clearError}
              className="error-close-btn"
              aria-label="Dismiss error"
            >
              ×
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SurrogateOracleImmersion;