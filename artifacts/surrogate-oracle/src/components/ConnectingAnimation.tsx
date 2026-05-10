import { motion } from 'framer-motion';

interface ConnectingAnimationProps {
  connectionProgress: number;
  connectionStep?: string;
  onCancel?: () => void;
}

export function ConnectingAnimation({
  connectionProgress,
  connectionStep,
  onCancel,
}: ConnectingAnimationProps) {
  const step =
    connectionStep ||
    (connectionProgress < 25
      ? 'Establishing quantum entanglement...'
      : connectionProgress < 50
        ? 'Synchronizing neural pathways...'
        : connectionProgress < 75
          ? 'Activating consciousness protocols...'
          : connectionProgress < 100
            ? 'Finalizing digital transcendence...'
            : 'CONSCIOUSNESS BRIDGE ACTIVE');

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{
          textAlign: 'center',
          color: '#00ffff',
          fontFamily: "'PhillySans', 'Orbitron', monospace",
          padding: '40px',
          maxWidth: '500px',
        }}
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          style={{ fontSize: '4rem', marginBottom: '24px', display: 'block' }}
        >
          🧠
        </motion.div>

        <h2
          style={{
            fontSize: '1.4rem',
            fontWeight: 700,
            letterSpacing: '0.15em',
            marginBottom: '8px',
            color: '#00ffff',
            textShadow: '0 0 20px #00ffff',
          }}
        >
          CONNECTING TO SURROGATE CONSCIOUSNESS
        </h2>

        <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '32px' }}>
          Initializing digital consciousness bridge...
        </p>

        <div
          style={{
            width: '100%',
            height: '4px',
            background: 'rgba(0,255,255,0.15)',
            borderRadius: '2px',
            marginBottom: '20px',
            overflow: 'hidden',
          }}
        >
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${connectionProgress}%` }}
            transition={{ duration: 0.5 }}
            style={{
              height: '100%',
              background: 'linear-gradient(90deg, #00ffff, #ff00ff)',
              borderRadius: '2px',
              boxShadow: '0 0 10px #00ffff',
            }}
          />
        </div>

        <p style={{ color: '#00ff62', fontSize: '0.8rem', letterSpacing: '0.1em' }}>{step}</p>

        {onCancel && (
          <button
            onClick={onCancel}
            style={{
              marginTop: '24px',
              background: 'rgba(255, 0, 0, 0.2)',
              border: '1px solid #ff0050',
              color: '#ff0050',
              padding: '8px 24px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontFamily: "'PhillySans', 'Orbitron', monospace",
              fontSize: '0.75rem',
              letterSpacing: '0.1em',
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
      </motion.div>
    </div>
  );
}
