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
        boxShadow: '0 0 20px rgba(0, 255, 136, 0.5), inset 0 0 10px rgba(0, 255, 136, 0.2)',
        transition: 'all 0.3s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px) scale(1.05)';
        e.currentTarget.style.filter = 'brightness(1.2)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0) scale(1)';
        e.currentTarget.style.filter = 'brightness(1)';
      }}
    >
      {!imageError ? (
        <img
          src="https://sintra-images.s3.eu-north-1.amazonaws.com/3fddfa4f-21d6-4499-8920-9b9b4c304d56/power-ups/remove-background/5658be5f-989d-42d1-a0dd-eef0f4891989/image.png"
          alt="ENCULTURATE Spray Crate"
          style={{ width: '120px', height: '120px', objectFit: 'contain' }}
          onError={() => {
            console.warn('🎨 Spray crate image failed to load, using fallback');
            setImageError(true);
          }}
        />
      ) : (
        <div style={{ fontSize: '4rem', lineHeight: 1 }}>🎨</div>
      )}

      <div
        style={{
          position: 'absolute',
          bottom: 6,
          background: 'rgba(0,255,136,0.15)',
          border: '1px solid #00ff88',
          borderRadius: '10px',
          padding: '1px 8px',
          fontSize: '0.65rem',
          color: '#ffffff',
          letterSpacing: '0.1em',
          fontFamily: "'aAnotherTag', 'Orbitron', monospace",
          whiteSpace: 'nowrap',
          textShadow: '0 0 5px #00ff88',
        }}
      >
        ENCULTURATE
      </div>
    </div>
  );
}

export default EnculturateCrate;
