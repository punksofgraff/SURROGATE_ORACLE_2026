import { motion } from 'framer-motion';

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
        initial={{ scale: 0.92, opacity: 0, y: 18 }}
        animate={{ scale: 1,    opacity: 1, y: 0  }}
        transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        style={{
          background:    'rgba(2,18,16,0.88)',
          border:        '1px solid rgba(0,255,136,0.42)',
          borderRadius:  '18px 4px 18px 4px',
          padding:       '30px 24px 24px',
          maxWidth:      '350px',
          width:         '100%',
          textAlign:     'center',
          boxShadow:     '0 0 42px rgba(0,255,136,0.12), inset 0 0 30px rgba(0,0,0,0.35)',
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
          ◈ THE ORACLE IS STILL HUNGRY
        </div>

        <div style={{
          fontFamily:    '"PhillySans", "Courier New", monospace',
          fontSize:      'clamp(1.45rem, 7vw, 1.8rem)',
          fontWeight:    700,
          color:         '#e8f4ef',
          lineHeight:    1.25,
          marginBottom:  '14px',
          letterSpacing: '0.01em',
        }}>
          That was fun.<br />Let’s keep going.
        </div>

        <div style={{
          fontFamily:    '"aAnotherTag", "Courier New", monospace',
          fontSize:      '0.8rem',
          color:         'rgba(200,230,215,0.72)',
          lineHeight:    1.6,
          marginBottom:  '24px',
          letterSpacing: '0.04em',
        }}>
          The free signal is spent.<br />
          Bring a wallet to stay in the room.
        </div>

        <button
          onClick={onRegister}
          style={{
            display:       'block',
            width:         '100%',
            padding:       '14px 20px',
            background:    'rgba(0,255,136,0.08)',
            border:        '1px solid rgba(0,255,136,0.62)',
            borderRadius:  '10px 2px 10px 2px',
            color:         '#aaffdd',
            fontFamily:    '"aAnotherTag", "Courier New", monospace',
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
          ◈ LET ME BACK IN
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
