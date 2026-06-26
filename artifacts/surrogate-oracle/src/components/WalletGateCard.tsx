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
        background:     'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 18 }}
        animate={{ scale: 1,    opacity: 1, y: 0  }}
        transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        style={{
          background:    'linear-gradient(145deg, rgba(0,255,136,0.07) 0%, rgba(0,180,255,0.05) 100%)',
          border:        '1px solid rgba(0,255,136,0.28)',
          borderRadius:  '2px',
          padding:       '44px 40px 36px',
          maxWidth:      '420px',
          width:         'calc(100% - 48px)',
          textAlign:     'center',
          boxShadow:     '0 0 48px rgba(0,255,136,0.10), inset 0 0 24px rgba(0,0,0,0.4)',
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
          SURROGATE:ORACLE // SESSION LIMIT
        </div>

        <div style={{
          fontFamily:    '"PhillySans", "Courier New", monospace',
          fontSize:      '1.35rem',
          fontWeight:    700,
          color:         '#e8f4ef',
          lineHeight:    1.25,
          marginBottom:  '14px',
          letterSpacing: '0.02em',
        }}>
          Your free session<br />has ended.
        </div>

        <div style={{
          fontFamily:    '"aAnotherTag", "Courier New", monospace',
          fontSize:      '0.8rem',
          color:         'rgba(200,230,215,0.65)',
          lineHeight:    1.6,
          marginBottom:  '32px',
          letterSpacing: '0.04em',
        }}>
          Register your SURROGATE wallet to<br />
          keep engaging with the Oracle.
        </div>

        <button
          onClick={onRegister}
          style={{
            display:       'block',
            width:         '100%',
            padding:       '13px 20px',
            background:    'transparent',
            border:        '1px solid rgba(0,255,136,0.55)',
            borderRadius:  '1px',
            color:         '#00ff88',
            fontFamily:    '"aAnotherTag", "Courier New", monospace',
            fontSize:      '0.75rem',
            letterSpacing: '0.18em',
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
          ◈ Register Wallet
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
