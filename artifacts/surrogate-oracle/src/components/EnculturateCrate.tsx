import { useState } from 'react';

interface EnculturateCrateProps {
  onClick: () => void;
  isActive?: boolean;
}

export function EnculturateCrate({ onClick, isActive = false }: EnculturateCrateProps) {
  const [imageError, setImageError] = useState(false);

  return (
    <div
      onClick={onClick}
      data-testid="enculturate-crate"
      className="oracle-bottom-btn"
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px) scale(1.04)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = ''; }}
      onTouchStart={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.96)'; }}
      onTouchEnd={(e) => { (e.currentTarget as HTMLElement).style.transform = ''; }}
      style={{
        cursor: 'pointer',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        userSelect: 'none',
        padding: '10px',
        border: '2px solid #00ff88',
        borderRadius: '16px',
        background: 'rgba(0, 30, 15, 0.5)',
        boxShadow: '0 0 20px rgba(0,255,136,0.5), inset 0 0 8px rgba(0,255,136,0.15)',
        transition: 'all 0.3s ease',
        minWidth: 44, minHeight: 44,
      }}
    >
      {!imageError ? (
        <img
          src="https://sintra-images.s3.eu-north-1.amazonaws.com/3fddfa4f-21d6-4499-8920-9b9b4c304d56/power-ups/remove-background/5658be5f-989d-42d1-a0dd-eef0f4891989/image.png"
          alt="ENCULTURATE Spray Crate"
          style={{ width: '90px', height: '90px', objectFit: 'contain' }}
          onError={() => setImageError(true)}
        />
      ) : (
        <div style={{ fontSize: '3.5rem', lineHeight: 1 }}>🎨</div>
      )}

      <div style={{
        position: 'absolute',
        bottom: 5,
        left: '50%',
        transform: 'translateX(-50%)',
        color: '#00ff88',
        fontSize: '0.6rem',
        fontFamily: "'PhillySans', monospace",
        fontWeight: 'bold',
        letterSpacing: '0.12em',
        textShadow: '0 0 5px #00ff88',
        whiteSpace: 'nowrap',
      }}>
        ENCULTURATE
      </div>
    </div>
  );
}

export default EnculturateCrate;
