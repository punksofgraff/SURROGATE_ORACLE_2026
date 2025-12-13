import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, VolumeX, Mic, MicOff, Keyboard, Loader2, Settings } from 'lucide-react';
import { DIDWebRTCClient } from './DIDWebRTCClientNew';
import { BackendControlPanel } from './BackendControlPanel';
import { GoogleSignInOverlay } from './GoogleSignInOverlay';

// Types
interface OracleState {
  isConnected: boolean;
  isReady: boolean;
  isProcessing: boolean;
  isListening: boolean;
  currentMode: 'voice' | 'text';
  error: string | null;
  showBackendPanel: boolean;
  activeBackendTab: 'coins' | 'squad' | 'portraits' | 'debug';
}

interface AudioState {
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  currentTrack: string;
}

// Oracle Image URL
const ORACLE_IMAGE_URL = 'https://i.postimg.cc/jSGnyZXh/Image-1-11.jpg';

export const SurrogateOracleImmersion: React.FC = () => {
  // Core State Management
  const [oracleState, setOracleState] = useState<OracleState>({
    isConnected: false,
    isReady: false,
    isProcessing: false,
    isListening: false,
    currentMode: 'voice',
    error: null,
    showBackendPanel: false,
    activeBackendTab: 'coins'
  });

  const [audioState, setAudioState] = useState<AudioState>({
    isPlaying: false,
    volume: 1.0,
    isMuted: false,
    currentTrack: 'Cyberpunk Alley Ambience'
  });

  const [userInput, setUserInput] = useState('');
  const [conversation, setConversation] = useState<Array<{role: string, content: string}>>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string>(crypto.randomUUID());

  // Refs
  const didClient = useRef<DIDWebRTCClient | null>(null);
  const idleVideoRef = useRef<HTMLVideoElement>(null);
  const streamVideoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const recognitionRef = useRef<any>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);

  // Environment Validation
  const validateEnvironment = useCallback(() => {
    const required = [
      'VITE_SUPABASE_URL',
      'VITE_SUPABASE_ANON_KEY',
      'VITE_DID_AGENT_ID'
    ];
    
    const missing = required.filter(key => !import.meta.env[key]);
    if (missing.length > 0) {
      console.error('❌ Missing environment variables:', missing);
      return false;
    }
    return true;
  }, []);

  // Authentication Check
  useEffect(() => {
    const checkAuth = () => {
      const devPassword = localStorage.getItem('dev_password');
      const devSession = localStorage.getItem('dev_user_session');
      
      if (devPassword === '3nculturate!' || devSession) {
        console.log('✅ Authentication validated');
        setIsAuthenticated(true);
      } else {
        console.log('🔐 No authentication found');
        setIsAuthenticated(false);
      }
    };
    
    if (validateEnvironment()) {
      checkAuth();
    }
    
    // Extract user ID from dev session if available
    const devSession = localStorage.getItem('dev_user_session');
    if (devSession) {
      try {
        const user = JSON.parse(devSession);
        setCurrentUserId(user.id);
      } catch (error) {
        console.warn('Failed to parse dev session:', error);
      }
    }
  }, [validateEnvironment]);

  // Initialize D-ID Client
  useEffect(() => {
    if (!isAuthenticated) return;

    console.log('🎯 Initializing SURROGATE Oracle...');
    
    didClient.current = new DIDWebRTCClient();
    
    // Set D-ID callbacks
    didClient.current.setCallbacks({
      onConnected: () => {
        console.log('✅ D-ID WebRTC connected');
        setOracleState(prev => ({ ...prev, isConnected: true }));
      },
      onStreamReady: () => {
        console.log('✅ D-ID stream ready');
        setOracleState(prev => ({ ...prev, isReady: true, error: null }));
        
        // Auto-start with greeting
        setTimeout(() => {
          handleOracleGreeting();
        }, 1000);
      },
      onTalkStarted: () => {
        console.log('🎤 Oracle speaking...');
        setOracleState(prev => ({ ...prev, isProcessing: true }));
        
        // Lower background audio when Oracle speaks
        if (audioRef.current) {
          audioRef.current.volume = 0.25;
        }
      },
      onTalkEnded: () => {
        console.log('🎤 Oracle finished speaking');
        setOracleState(prev => ({ ...prev, isProcessing: false }));
        
        // Restore background audio
        if (audioRef.current) {
          audioRef.current.volume = audioState.volume;
        }
      },
      onDisconnected: (state) => {
        console.log('❌ D-ID disconnected:', state);
        setOracleState(prev => ({ 
          ...prev, 
          isConnected: false, 
          isReady: false,
          error: `Connection lost: \${state}`
        }));
      }
    });

    // Attach video elements
    if (idleVideoRef.current && streamVideoRef.current) {
      didClient.current.attachVideoElements(idleVideoRef.current, streamVideoRef.current);
    }

    // Initialize stream
    const initStream = async () => {
      try {
        const result = await didClient.current!.initializeStream(ORACLE_IMAGE_URL);
        if (!result.success) {
          throw new Error(result.error || 'Failed to initialize stream');
        }
        console.log('✅ Oracle stream initialized');
      } catch (error: any) {
        console.error('❌ Oracle initialization failed:', error);
        setOracleState(prev => ({ ...prev, error: error.message }));
      }
    };

    initStream();

    // Cleanup
    return () => {
      console.log('🧹 Cleaning up Oracle...');
      didClient.current?.closeStream();
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [isAuthenticated]);

  // Initialize Speech Recognition
  useEffect(() => {
    if (!isAuthenticated || !('webkitSpeechRecognition' in window)) return;

    const SpeechRecognition = (window as any).webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = false;
    recognitionRef.current.lang = 'en-US';

    recognitionRef.current.onstart = () => {
      console.log('🎤 Voice recognition started');
      setOracleState(prev => ({ ...prev, isListening: true }));
    };

    recognitionRef.current.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      console.log('🗣️ Voice input:', transcript);
      handleUserInput(transcript);
    };

    recognitionRef.current.onerror = (event: any) => {
      console.error('❌ Speech recognition error:', event.error);
      setOracleState(prev => ({ ...prev, isListening: false }));
    };

    recognitionRef.current.onend = () => {
      console.log('🎤 Voice recognition ended');
      setOracleState(prev => ({ ...prev, isListening: false }));
    };
  }, [isAuthenticated]);

  // Oracle Greeting
  const handleOracleGreeting = async () => {
    const greeting = "What is Connection?";
    
    try {
      const result = await didClient.current!.sendTalk(greeting);
      if (result.success) {
        setConversation(prev => [...prev, { role: 'oracle', content: greeting }]);
      }
    } catch (error) {
      console.error('❌ Greeting failed:', error);
    }
  };

  // Handle User Input
  const handleUserInput = async (input: string) => {
    if (!input.trim() || !didClient.current?.isStreamActive()) return;

    console.log('💭 Processing user input:', input);
    setOracleState(prev => ({ ...prev, isProcessing: true }));
    setConversation(prev => [...prev, { role: 'user', content: input }]);

    try {
      // Send to Oracle conversation endpoint
      const response = await fetch(`\${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oracle-conversation`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer \${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          message: input,
          conversation_history: conversation.slice(-10) // Last 10 messages
        }),
      });

      const result = await response.json();
      
      if (result.success && result.response) {
        // Send Oracle response to D-ID
        const talkResult = await didClient.current!.sendTalk(result.response);
        
        if (talkResult.success) {
          setConversation(prev => [...prev, { role: 'oracle', content: result.response }]);
        } else {
          throw new Error('Failed to send talk to D-ID');
        }
      } else {
        throw new Error(result.error || 'Oracle conversation failed');
      }
    } catch (error: any) {
      console.error('❌ Oracle conversation error:', error);
      setOracleState(prev => ({ ...prev, error: error.message }));
    } finally {
      setOracleState(prev => ({ ...prev, isProcessing: false }));
      setUserInput('');
    }
  };

  // Voice Input Toggle
  const toggleVoiceInput = () => {
    if (!recognitionRef.current) return;

    if (oracleState.isListening) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
    }
  };

  // Mode Toggle
  const toggleInputMode = () => {
    setOracleState(prev => ({ 
      ...prev, 
      currentMode: prev.currentMode === 'voice' ? 'text' : 'voice' 
    }));
  };

  // Audio Controls
  const toggleAudio = () => {
    if (!audioRef.current) return;

    if (audioState.isPlaying) {
      audioRef.current.pause();
      setAudioState(prev => ({ ...prev, isPlaying: false }));
    } else {
      audioRef.current.play();
      setAudioState(prev => ({ ...prev, isPlaying: true }));
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;

    const newMuted = !audioState.isMuted;
    audioRef.current.muted = newMuted;
    setAudioState(prev => ({ ...prev, isMuted: newMuted }));
  };

  // Scroll to bottom of conversation
  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation]);

  // Authentication Handler
  const handleAuthSuccess = (user: any) => {
    console.log('✅ Authentication successful:', user.email);
    setIsAuthenticated(true);
    setShowAuthOverlay(false);
    setCurrentUserId(user.id);
    localStorage.setItem('dev_user_session', JSON.stringify(user));
    
    // Auto-open backend panel to coins after successful auth
    setOracleState(prev => ({ 
      ...prev, 
      showBackendPanel: true, 
      activeBackendTab: 'coins' 
    }));
  };

  // Handle closing auth overlay without authentication
  const handleAuthClose = () => {
    console.log('🚪 Authentication overlay closed');
    setShowAuthOverlay(false);
  };

  // Backend Panel Controls
  const openBackendPanel = (tab: 'coins' | 'squad' | 'portraits' | 'debug' = 'coins') => {
    // Check if authentication is required for this tab
    if (!isAuthenticated && (tab === 'coins' || tab === 'squad' || tab === 'portraits')) {
      console.log('🔐 Authentication required for tab:', tab);
      setShowAuthOverlay(true);
      return;
    }
    
    setOracleState(prev => ({ 
      ...prev, 
      showBackendPanel: true, 
      activeBackendTab: tab 
    }));
  };

  const closeBackendPanel = () => {
    setOracleState(prev => ({ ...prev, showBackendPanel: false }));
  };


  return (
    <div className="surrogate-oracle-immersion">
      {/* Background Audio */}
      <audio
        ref={audioRef}
        loop
        autoPlay
        muted={audioState.isMuted}
        volume={audioState.volume}
      >
        <source src="https://www.soundjay.com/misc/sounds/bell-ringing-05.wav" type="audio/wav" />
      </audio>

      {/* Cyberpunk Alley Background */}
      <div 
        className="alley-background"
        style={{
          backgroundImage: 'url(https://i.postimg.cc/jSJRRRk2/7-D633-B70-4-C62-4326-92-A8-3-B8790-C9-B3-B0.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: -1
        }}
      />

      {/* Main Interface */}
      <div className="oracle-interface">
        {/* Header */}
        <header className="oracle-header">
          <motion.h1 
            className="oracle-title"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            SURROGATE:ORACLE
          </motion.h1>
          <motion.p 
            className="oracle-subtitle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.8 }}
          >
            SNEAKAR AI Immersion
          </motion.p>
        </header>

        {/* Video Container */}
        <div className="video-container">
          {/* Idle Video */}
          <video
            ref={idleVideoRef}
            className="oracle-video idle-video"
            src={ORACLE_IMAGE_URL}
            poster={ORACLE_IMAGE_URL}
            loop
            muted
            playsInline
            style={{ opacity: oracleState.isReady ? 0 : 1 }}
          />
          
          {/* Stream Video */}
          <video
            ref={streamVideoRef}
            className="oracle-video stream-video"
            muted={false} // D-ID handles audio
            playsInline
            style={{ opacity: oracleState.isReady ? 1 : 0 }}
          />

          {/* Oracle Status Overlay */}
          <div className="oracle-status">
            <AnimatePresence>
              {!oracleState.isConnected && (
                <motion.div
                  className="status-indicator connecting"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <Loader2 className="animate-spin" />
                  <span>Connecting to Oracle...</span>
                </motion.div>
              )}
                         {oracleState.isConnected && !oracleState.isReady && (
                <motion.div
                  className="status-indicator warming"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <Loader2 className="animate-spin" />
                  <span>Oracle Warming Up...</span>
                </motion.div>
              )}

              {oracleState.isProcessing && (
                <motion.div
                  className="status-indicator processing"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="processing-pulse" />
                  <span>Oracle Processing...</span>
                </motion.div>
              )}

              {oracleState.error && (
                <motion.div
                  className="status-indicator error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <span>Error: {oracleState.error}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Conversation Display */}
        <div className="conversation-container">
          <div className="conversation-scroll">
            {conversation.map((message, index) => (
              <motion.div
                key={index}
                className={`message \${message.role}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <div className="message-avatar">
                  {message.role === 'oracle' ? '🔮' : '👤'}
                </div>
                <div className="message-content">
                  <div className="message-text">{message.content}</div>
                </div>
              </motion.div>
            ))}
            <div ref={conversationEndRef} />
          </div>
        </div>

        {/* Input Controls */}
        <div className="input-controls">
          {oracleState.currentMode === 'voice' ? (
            <div className="voice-input">
              <motion.button
                className={`voice-button \${oracleState.isListening ? 'listening' : ''}`}
                onClick={toggleVoiceInput}
                disabled={!oracleState.isReady || oracleState.isProcessing}
                whileTap={{ scale: 0.95 }}
                whileHover={{ scale: 1.05 }}
              >
                {oracleState.isListening ? (
                  <>
                    <MicOff className="icon" />
                    <span>Stop Listening</span>
                  </>
                ) : (
                  <>
                    <Mic className="icon" />
                    <span>Speak to Oracle</span>
                  </>
                )}
              </motion.button>
            </div>
          ) : (
            <div className="text-input">
              <input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleUserInput(userInput);
                  }
                }}
                placeholder="Type your message to the Oracle..."
                disabled={!oracleState.isReady || oracleState.isProcessing}
                className="text-input-field"
              />
              <motion.button
                className="send-button"
                onClick={() => handleUserInput(userInput)}
                disabled={!userInput.trim() || !oracleState.isReady || oracleState.isProcessing}
                whileTap={{ scale: 0.95 }}
                whileHover={{ scale: 1.05 }}
              >
                Send
              </motion.button>
            </div>
          )}

          {/* Mode Toggle */}
          <motion.button
            className="mode-toggle"
            onClick={toggleInputMode}
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.05 }}
          >
            {oracleState.currentMode === 'voice' ? (
              <>
                <Keyboard className="icon" />
                <span>Text Mode</span>
              </>
            ) : (
              <>
                <Mic className="icon" />
                <span>Voice Mode</span>
              </>
            )}
          </motion.button>
        </div>

        {/* Audio Controls */}
        <div className="audio-controls">
          <motion.button
            className="audio-button"
            onClick={toggleAudio}
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.05 }}
          >
            {audioState.isPlaying ? 'Pause Audio' : 'Play Audio'}
          </motion.button>

          <motion.button
            className="mute-button"
            onClick={toggleMute}
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.05 }}
          >
            {audioState.isMuted ? <VolumeX className="icon" /> : <Volume2 className="icon" />}
          </motion.button>

          <div className="audio-info">
            <span>{audioState.currentTrack}</span>
          </div>
        </div>

        {/* LEARN2EARN Button */}
        <div className="learn2earn-controls">
          <motion.button
            className="learn2earn-button"
            onClick={() => openBackendPanel('coins')}
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.05 }}
          >
            <span className="accent-text">LEARN2EARN</span>
          </motion.button>
        </div>

        {/* Debug Controls */}
        <div className="debug-controls">
          <motion.button
            className="debug-toggle"
            onClick={() => openBackendPanel('debug')}
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.05 }}
          >
            <Settings className="icon" />
            <span>Backend</span>
          </motion.button>
        </div>

        {/* Backend Panel */}
        <AnimatePresence>
          {oracleState.showBackendPanel && (
            <motion.div
              className="backend-panel"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <BackendControlPanel 
                isVisible={oracleState.showBackendPanel}
                initialTab={oracleState.activeBackendTab}
                onClose={closeBackendPanel}
                userId={currentUserId}
                sessionId={currentSessionId}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Authentication Overlay - Only when needed */}
        <AnimatePresence>
          {showAuthOverlay && (
            <GoogleSignInOverlay 
              onClose={handleAuthClose} 
              onSuccess={handleAuthSuccess} 
            />
          )}
        </AnimatePresence>
      </div>

      {/* CSS Styles */}
      <style jsx>{`
        .surrogate-oracle-immersion {
          position: relative;
          width: 100vw;
          height: 100vh;
          overflow: hidden;
          background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%);
          color: #00ffff;
          font-family: 'Orbitron', monospace;
        }

        .alley-background {
          filter: brightness(0.7) contrast(1.2);
        }

        .oracle-interface {
          position: relative;
          z-index: 10;
          display: flex;
          flex-direction: column;
          height: 100vh;
          padding: 20px;
          gap: 20px;
        }

        .oracle-header {
          text-align: center;
          margin-bottom: 20px;
        }

        .oracle-title {
          font-size: 3rem;
          font-weight: 900;
          background: linear-gradient(45deg, #00ffff, #ff00ff, #ffff00);
          background-clip: text;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          text-shadow: 0 0 20px rgba(0, 255, 255, 0.5);
          margin: 0;
          letter-spacing: 0.1em;
        }

        .oracle-subtitle {
          font-size: 1.2rem;
          color: #00ff88;
          margin: 10px 0 0 0;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          opacity: 0.8;
        }

        .video-container {
          position: relative;
          width: 400px;
          height: 300px;
          margin: 0 auto;
          border-radius: 20px;
          overflow: hidden;
          border: 2px solid #00ffff;
          box-shadow: 
            0 0 30px rgba(0, 255, 255, 0.3),
            inset 0 0 30px rgba(0, 255, 255, 0.1);
        }

        .oracle-video {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: opacity 0.5s ease;
        }

        .oracle-status {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 20;
        }

        .status-indicator {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 15px 25px;
          background: rgba(0, 0, 0, 0.8);
          border: 1px solid #00ffff;
          border-radius: 10px;
          color: #00ffff;
          font-size: 0.9rem;
          backdrop-filter: blur(10px);
        }

        .status-indicator.error {
          border-color: #ff0066;
          color: #ff0066;
        }

        .status-indicator.processing {
          border-color: #ffff00;
          color: #ffff00;
        }

        .processing-pulse {
          width: 12px;
          height: 12px;
          background: #ffff00;
          border-radius: 50%;
          animation: pulse 1s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
        }

        .conversation-container {
          flex: 1;
          max-height: 300px;
          overflow: hidden;
          border: 1px solid rgba(0, 255, 255, 0.3);
          border-radius: 15px;
          background: rgba(0, 0, 0, 0.3);
          backdrop-filter: blur(10px);
        }

        .conversation-scroll {
          height: 100%;
          overflow-y: auto;
          padding: 20px;
          scrollbar-width: thin;
          scrollbar-color: #00ffff transparent;
        }

        .conversation-scroll::-webkit-scrollbar {
          width: 6px;
        }

        .conversation-scroll::-webkit-scrollbar-track {
          background: transparent;
        }

        .conversation-scroll::-webkit-scrollbar-thumb {
          background: #00ffff;
          border-radius: 3px;
        }

        .message {
          display: flex;
          gap: 15px;
          margin-bottom: 20px;
          align-items: flex-start;
        }

        .message.oracle {
          flex-direction: row;
        }

        .message.user {
          flex-direction: row-reverse;
        }

        .message-avatar {
          font-size: 1.5rem;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          background: rgba(0, 255, 255, 0.1);
          border: 1px solid #00ffff;
        }

        .message-content {
          flex: 1;
          max-width: 70%;
        }

        .message-text {
          padding: 15px 20px;
          border-radius: 15px;
          font-size: 0.95rem;
          line-height: 1.4;
        }

        .message.oracle .message-text {
          background: rgba(0, 255, 255, 0.1);
          border: 1px solid rgba(0, 255, 255, 0.3);
          color: #00ffff;
        }

        .message.user .message-text {
          background: rgba(255, 0, 255, 0.1);
          border: 1px solid rgba(255, 0, 255, 0.3);
          color: #ff00ff;
        }

        .input-controls {
          display: flex;
          gap: 15px;
          align-items: center;
          justify-content: center;
        }

        .voice-input, .text-input {
          display: flex;
          gap: 10px;
          align-items: center;
          flex: 1;
          max-width: 500px;
        }

        .voice-button, .mode-toggle, .audio-button, .mute-button, .debug-toggle, .send-button {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 20px;
          border: 1px solid #00ffff;
          border-radius: 10px;
          background: rgba(0, 255, 255, 0.1);
          color: #00ffff;
          font-family: inherit;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.3s ease;
          backdrop-filter: blur(10px);
        }

        .voice-button:hover, .mode-toggle:hover, .audio-button:hover, .mute-button:hover, .debug-toggle:hover, .send-button:hover {
          background: rgba(0, 255, 255, 0.2);
          box-shadow: 0 0 15px rgba(0, 255, 255, 0.3);
        }

        .voice-button:disabled, .send-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .voice-button.listening {
          border-color: #ff0066;
          color: #ff0066;
          background: rgba(255, 0, 102, 0.1);
          animation: pulse 1s infinite;
        }

        .text-input-field {
          flex: 1;
          padding: 12px 15px;
          border: 1px solid rgba(0, 255, 255, 0.3);
          border-radius: 10px;
          background: rgba(0, 0, 0, 0.3);
          color: #00ffff;
          font-family: inherit;
          font-size: 0.9rem;
          backdrop-filter: blur(10px);
        }

        .text-input-field:focus {
          outline: none;
          border-color: #00ffff;
          box-shadow: 0 0 10px rgba(0, 255, 255, 0.3);
        }

        .text-input-field::placeholder {
          color: rgba(0, 255, 255, 0.5);
        }

        .audio-controls {
          display: flex;
          gap: 15px;
          align-items: center;
          justify-content: center;
        }

        .audio-info {
          color: rgba(0, 255, 255, 0.7);
          font-size: 0.8rem;
        }

        .debug-controls {
          display: flex;
          justify-content: center;
        }

        .learn2earn-controls {
          display: flex;
          justify-content: center;
        }

        .learn2earn-button {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 20px;
          border: 2px solid #ffd700;
          border-radius: 10px;
          background: rgba(255, 215, 0, 0.1);
          color: #ffd700;
          font-family: inherit;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.3s ease;
          backdrop-filter: blur(10px);
        }

        .learn2earn-button:hover {
          background: rgba(255, 215, 0, 0.2);
          box-shadow: 0 0 15px rgba(255, 215, 0, 0.3);
          transform: scale(1.05);
        }

        .backend-panel {
          background: rgba(0, 0, 0, 0.9);
          border: 1px solid rgba(0, 255, 255, 0.3);
          border-radius: 15px;
          padding: 20px;
          margin-top: 20px;
          backdrop-filter: blur(15px);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        }

        .icon {
          width: 18px;
          height: 18px;
        }

        /* Responsive Design */
        @media (max-width: 768px) {
          .oracle-interface {
            padding: 15px;
            gap: 15px;
          }

          .oracle-title {
            font-size: 2rem;
          }

          .oracle-subtitle {
            font-size: 1rem;
          }

          .video-container {
            width: 100%;
            max-width: 350px;
            height: 250px;
          }

          .input-controls {
            flex-direction: column;
            gap: 10px;
          }

          .voice-input, .text-input {
            max-width: 100%;
          }

          .audio-controls {
            flex-wrap: wrap;
            gap: 10px;
          }

          .conversation-container {
            max-height: 200px;
          }
        }

        /* Cyberpunk Glow Effects */
        @keyframes neon-glow {
          0%, 100% {
            text-shadow: 
              0 0 5px currentColor,
              0 0 10px currentColor,
              0 0 15px currentColor;
          }
          50% {
            text-shadow: 
              0 0 2px currentColor,
              0 0 5px currentColor,
              0 0 8px currentColor;
          }
        }

        .oracle-title {
          animation: neon-glow 3s ease-in-out infinite;
        }

        /* Particle Effects */
        .surrogate-oracle-immersion::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: 
            radial-gradient(circle at 20% 80%, rgba(0, 255, 255, 0.1) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(255, 0, 255, 0.1) 0%, transparent 50%),
            radial-gradient(circle at 40% 40%, rgba(255, 255, 0, 0.05) 0%, transparent 50%);
          pointer-events: none;
          z-index: 1;
        }

        /* Scanline Effect */
        .video-container::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: linear-gradient(
            transparent 50%,
            rgba(0, 255, 255, 0.03) 50%,
            rgba(0, 255, 255, 0.03) 51%,
            transparent 51%
          );
          background-size: 100% 4px;
          pointer-events: none;
          z-index: 10;
        }

        /* Loading Animation */
        @keyframes loading-dots {
          0%, 20% { opacity: 0; }
          50% { opacity: 1; }
          100% { opacity: 0; }
        }

        .status-indicator span::after {
          content: '...';
          animation: loading-dots 1.5s infinite;
        }

        /* Glitch Effect for Errors */
        .status-indicator.error {
          animation: glitch 0.5s infinite;
        }

        @keyframes glitch {
          0% { transform: translate(0); }
          20% { transform: translate(-2px, 2px); }
          40% { transform: translate(-2px, -2px); }
          60% { transform: translate(2px, 2px); }
          80% { transform: translate(2px, -2px); }
          100% { transform: translate(0); }
        }

        /* Hover Effects */
        .message:hover .message-text {
          transform: translateX(5px);
          transition: transform 0.2s ease;
        }

        .message.user:hover .message-text {
          transform: translateX(-5px);
        }

        /* Focus States */
        .text-input-field:focus,
        .voice-button:focus,
        .mode-toggle:focus,
        .audio-button:focus,
        .mute-button:focus,
        .debug-toggle:focus,
        .send-button:focus {
          outline: 2px solid rgba(0, 255, 255, 0.5);
          outline-offset: 2px;
        }

        /* Accessibility */
        @media (prefers-reduced-motion: reduce) {
          .oracle-title {
            animation: none;
          }
          
          .processing-pulse {
            animation: none;
          }
          
          .voice-button.listening {
            animation: none;
          }
          
          * {
            transition: none !important;
          }
        }

        /* High Contrast Mode */
        @media (prefers-contrast: high) {
          .oracle-interface {
            background: #000;
          }
          
          .oracle-title {
            color: #fff;
            -webkit-text-fill-color: #fff;
          }
          
          .status-indicator,
          .message-text,
          .text-input-field,
          button {
            border-width: 2px;
            background: rgba(255, 255, 255, 0.1);
          }
        }
      `}</style>
    </div>
  );
};

export default SurrogateOracleImmersion;

