import React from 'react';
import { motion } from 'framer-motion';

interface ConnectingAnimationProps {
  connectionProgress: number;
  connectionStep?: string;
  onCancel?: () => void;
}

export function ConnectingAnimation({ 
  connectionProgress, 
  connectionStep = 'Establishing quantum entanglement...', 
  onCancel 
}: ConnectingAnimationProps) {
  return (
    <motion.div
      className="connecting-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0, 0, 0, 0.9)',
        backdropFilter: 'blur(8px)',
        zIndex: 500,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {/* Epic Connecting Animation */}
      <div style={{ textAlign: 'center', zIndex: 501 }}>
        <motion.div
          animate={{ 
            rotate: 360,
            scale: [1, 1.2, 1],
            filter: [
              'drop-shadow(0 0 20px #00ffff)',
              'drop-shadow(0 0 40px #ff00aa)',
              'drop-shadow(0 0 20px #00ffff)'
            ]
          }}
          transition={{ 
            rotate: { duration: 4, repeat: Infinity, ease: "linear" },
            scale: { duration: 2, repeat: Infinity, ease: "easeInOut" },
            filter: { duration: 3, repeat: Infinity, ease: "easeInOut" }
          }}
          style={{
            width: '120px',
            height: '120px',
            borderRadius: '50%',
            background: 'linear-gradient(45deg, #00ffff, #ff00aa, #00ff62)',
            margin: '0 auto 30px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '3rem'
          }}
        >
          🧠
        </motion.div>

        <motion.h2
          className="oracle-title connecting-text"
          animate={{ 
            opacity: [0.6, 1, 0.6],
            textShadow: [
              '0 0 10px #00ffff',
              '0 0 30px #00ffff, 0 0 40px #ff00aa',
              '0 0 10px #00ffff'
            ]
          }}
          transition={{ 
            duration: 1.5, 
            repeat: Infinity, 
            ease: "easeInOut" 
          }}
          style={{
            fontSize: '2rem',
            color: '#00ffff',
            marginBottom: '20px',
            letterSpacing: '0.1em',
            textAlign: 'center'
          }}
        >
          CONNECTING TO SURROGATE CONSCIOUSNESS
        </motion.h2>

        <motion.div
          className="info-text"
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
          style={{
            color: '#00ff62',
            fontSize: '1.2rem',
            marginBottom: '30px'
          }}
        >
          Initializing digital consciousness bridge...
        </motion.div>

        {/* Progress Bar */}
        <div style={{
          width: '400px',
          height: '8px',
          background: 'rgba(0, 0, 0, 0.5)',
          border: '2px solid #00ffff',
          borderRadius: '10px',
          overflow: 'hidden',
          margin: '20px auto',
          position: 'relative'
        }}>
          <motion.div
            animate={{ width: `${connectionProgress}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            style={{
              height: '100%',
              background: 'linear-gradient(90deg, #00ffff, #ff00aa, #00ff62)',
              borderRadius: '8px'
            }}
          />
          
          {/* Animated particle effect */}
          <motion.div
            animate={{ x: [-20, 420] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            style={{
              position: 'absolute',
              top: '-4px',
              width: '16px',
              height: '16px',
              background: '#ffffff',
              borderRadius: '50%',
              boxShadow: '0 0 15px #ffffff',
              opacity: 0.8
            }}
          />
        </div>

        <div className="info-text" style={{
          color: '#a855f7',
          fontSize: '1rem',
          opacity: 0.8,
          minHeight: '24px',
          textAlign: 'center'
        }}>
          {connectionStep || (
            connectionProgress < 25 ? 'Establishing quantum entanglement...' :
            connectionProgress < 50 ? 'Synchronizing neural pathways...' :
            connectionProgress < 75 ? 'Activating consciousness protocols...' :
            connectionProgress < 100 ? 'Finalizing digital transcendence...' :
            'CONSCIOUSNESS BRIDGE ACTIVE'
          )}
        </div>
        
        {/* Optional Cancel Button */}
        {onCancel && (
          <button 
            onClick={onCancel}
            className="btn info-text"
            style={{
              marginTop: '30px',
              background: 'rgba(255, 0, 0, 0.2)',
              borderColor: 'rgba(255, 0, 0, 0.5)',
              color: '#ff6666',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 0, 0, 0.4)';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 0, 0, 0.2)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            Cancel Connection
          </button>
        )}
      </div>
    </motion.div>
  );
}