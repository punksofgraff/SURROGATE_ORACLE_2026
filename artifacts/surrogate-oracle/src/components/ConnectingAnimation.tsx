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
        zIndex: 'var(--z-system)' as any,
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
          color: '#00ff88',
          fontFamily: 'inherit',
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
            color: '#00ff88',
            textShadow: '0 0 20px rgba(0,255,136,0.8)',
          }}
        >
          CONNECTING TO SURROGATE CONSCIOUSNESS
        </h2>

        <p style={{ color: '#ffffff', fontSize: '0.85rem', marginBottom: '32px' }}>
          Initializing digital consciousness bridge...
        </p>

        <div
          style={{
            width: '100%',
            height: '4px',
            background: 'rgba(0,255,136,0.15)',
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
              background: 'linear-gradient(90deg, #00ff88, #b026ff)',
              borderRadius: '2px',
              boxShadow: '0 0 10px rgba(0,255,136,0.8)',
            }}
          />
        </div>

        <p style={{ color: '#00ccff', fontSize: '0.8rem', letterSpacing: '0.1em' }}>{step}</p>

        {onCancel && (
          <button
            onClick={onCancel}
            style={{
              marginTop: '24px',
              background: 'rgba(176,38,255,0.2)',
              border: '1px solid #b026ff',
              color: '#b026ff',
              padding: '8px 24px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '0.75rem',
              letterSpacing: '0.1em',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(176,38,255,0.4)';
              e.currentTarget.style.color = '#ffffff';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(176,38,255,0.2)';
              e.currentTarget.style.color = '#b026ff';
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
