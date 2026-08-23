import { motion } from 'framer-motion';
import { ParticleTypographyCard } from './ParticleTypographyCard';

interface WalletGateCardProps {
  onRegister: () => void;
}

export default function WalletGateCard({ onRegister }: WalletGateCardProps) {
  return (
    <motion.div
      key="wallet-gate"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      style={{
        position:       'fixed',
        inset:          0,
        zIndex:         9800,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        '24px',
        background:     'rgba(0,4,5,0.58)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
      }}
    >
      <motion.div
        className="oracle-knife-card"
        initial={{ scale: 0.92, opacity: 0, y: 18 }}
        animate={{ scale: 1,    opacity: 1, y: 0  }}
        transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        style={{
          padding:       '30px 24px 24px',
          maxWidth:      '390px',
          width:         '100%',
          textAlign:     'center',
          position:      'relative',
          overflow:      'hidden',
        }}
      >
        <div style={{
          position:      'absolute',
          top:           0,
          left:          0,
          right:         0,
          height:        '1px',
          background:    'linear-gradient(90deg, transparent, rgba(0,255,136,0.5), transparent)',
        }} />

        <div style={{
          fontFamily:    '"aAnotherTag", "Courier New", monospace',
          fontSize:      '0.65rem',
          letterSpacing: '0.22em',
          color:         'rgba(0,255,136,0.55)',
          marginBottom:  '16px',
          textTransform: 'uppercase',
        }}>
          SURROGATE:ORACLE // SIGNAL PAUSED
        </div>

        <div style={{ width: '100%', margin: '0 auto 8px' }}>
          <ParticleTypographyCard
            questionIndex={0}
            landedChars={'YOUR FREE SESSION HAS ENDED'.length}
            isEmitting
            isSelected={false}
            isThisSelected={false}
            accentColor="#00ff88"
            territory="THE NEXT SIGNAL"
            question="YOUR FREE SESSION HAS ENDED"
            variant="knife"
          />
        </div>

        <div style={{
          fontFamily:    "'PhillySans', sans-serif",
          fontSize:      '0.94rem',
          color:         'rgba(200,230,215,0.72)',
          lineHeight:    1.45,
          marginBottom:  '24px',
          letterSpacing: '0.01em',
        }}>
          The free signal is spent.<br />
          Register your wallet and keep playing.
        </div>

        <button
          onClick={onRegister}
          style={{
            display:       'block',
            width:         '100%',
            padding:       '14px 20px',
            background:    'rgba(0,255,136,0.07)',
            border:        '1px solid rgba(0,255,136,0.62)',
            borderRadius:  '10px 2px 10px 2px',
            color:         '#aaffdd',
            fontFamily:    "'PhillySans', sans-serif",
            fontSize:      '0.72rem',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            cursor:        'pointer',
            transition:    'background 0.2s, box-shadow 0.2s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background  = 'rgba(0,255,136,0.10)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow   = '0 0 16px rgba(0,255,136,0.20)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background  = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.boxShadow   = 'none';
          }}
        >
          ◈ KEEP GOING
        </button>

        <div style={{
          position:      'absolute',
          bottom:        0,
          left:          0,
          right:         0,
          height:        '1px',
          background:    'linear-gradient(90deg, transparent, rgba(0,180,255,0.3), transparent)',
        }} />
      </motion.div>
    </motion.div>
  );
}
