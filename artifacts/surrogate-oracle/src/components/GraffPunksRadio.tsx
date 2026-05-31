import { useState } from 'react';

interface GraffPunksRadioProps {
  isPlaying: boolean;
  onToggle: () => void;
}

export function GraffPunksRadio({ isPlaying, onToggle }: GraffPunksRadioProps) {
  const [imageError, setImageError] = useState(false);

  return (
    <div
      onClick={onToggle}
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
        border: isPlaying ? '2px solid #00ff88' : '2px solid rgba(0,255,136,0.25)',
        borderRadius: '16px',
        background: isPlaying ? 'rgba(0,30,15,0.5)' : 'rgba(0,10,5,0.4)',
        boxShadow: isPlaying
          ? '0 0 20px rgba(0,255,136,0.5), inset 0 0 8px rgba(0,255,136,0.15)'
          : '0 0 6px rgba(0,255,136,0.08)',
        transition: 'all 0.3s ease',
        minWidth: 44, minHeight: 44,
      }}
    >
      {!imageError ? (
        <img
          src="https://sintra-images.s3.eu-north-1.amazonaws.com/3fddfa4f-21d6-4499-8920-9b9b4c304d56/power-ups/remove-background/f728225c-42fc-41f9-8490-698d401e329f/image.png"
          alt="GRAFF PUNKS Boom Box"
          style={{
            width: '90px', height: '90px', objectFit: 'contain',
            opacity: isPlaying ? 1 : 0.4,
            filter: isPlaying ? 'none' : 'grayscale(0.6)',
            transition: 'opacity 0.3s ease, filter 0.3s ease',
          }}
          onError={() => setImageError(true)}
        />
      ) : (
        <div style={{ fontSize: '3.5rem', lineHeight: 1, opacity: isPlaying ? 1 : 0.4 }}>📻</div>
      )}

      <div style={{
        position: 'absolute',
        bottom: 5,
        left: '50%',
        transform: 'translateX(-50%)',
        color: isPlaying ? '#00ff88' : 'rgba(0,255,136,0.35)',
        fontSize: '0.6rem',
        fontFamily: "'PhillySans', monospace",
        fontWeight: 'bold',
        letterSpacing: '0.12em',
        textShadow: isPlaying ? '0 0 5px #00ff88' : 'none',
        whiteSpace: 'nowrap',
      }}>
        {isPlaying ? 'LIVE' : 'MUTED'}
      </div>
    </div>
  );
}

export default GraffPunksRadio;
