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
      style={{
        cursor: 'pointer',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        filter: 'drop-shadow(0 0 20px #00ff62) drop-shadow(0 0 40px #00ff62)',
        transition: 'all 0.3s ease',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-8px) scale(1.08)';
        e.currentTarget.style.filter =
          'drop-shadow(0 0 30px #00ff62) drop-shadow(0 0 60px #00ff62) brightness(1.3)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0) scale(1)';
        e.currentTarget.style.filter =
          'drop-shadow(0 0 20px #00ff62) drop-shadow(0 0 40px #00ff62)';
      }}
    >
      {!imageError ? (
        <img
          src="https://sintra-images.s3.eu-north-1.amazonaws.com/3fddfa4f-21d6-4499-8920-9b9b4c304d56/power-ups/remove-background/5658be5f-989d-42d1-a0dd-eef0f4891989/image.png"
          alt="ENCULTURATE Spray Crate"
          style={{ width: '80px', height: '80px', objectFit: 'contain' }}
          onError={() => {
            console.warn('🎨 Spray crate image failed to load, using fallback');
            setImageError(true);
          }}
        />
      ) : (
        <div style={{ fontSize: '3rem', lineHeight: 1 }}>🎨</div>
      )}

      {isActive && (
        <div
          style={{
            position: 'absolute',
            inset: -4,
            borderRadius: '50%',
            border: '2px solid #00ff62',
            animation: 'pulse 2s infinite',
            opacity: 0.7,
          }}
        />
      )}

      <div
        style={{
          position: 'absolute',
          bottom: -12,
          background: 'rgba(0, 255, 98, 0.2)',
          border: '1px solid #00ff62',
          borderRadius: '10px',
          padding: '1px 8px',
          fontSize: '0.6rem',
          color: '#00ff62',
          letterSpacing: '0.1em',
          fontFamily: "'PhillySans', 'Orbitron', monospace",
          whiteSpace: 'nowrap',
        }}
      >
        ENCULTURATE
      </div>
    </div>
  );
}

export default EnculturateCrate;
