import { useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

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
      style={{
        cursor: 'pointer',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        userSelect: 'none',
        padding: '10px',
        border: isPlaying ? '2px solid #00ff88' : '2px solid rgba(0, 255, 136, 0.3)',
        borderRadius: '16px',
        background: 'rgba(0, 30, 15, 0.5)',
        boxShadow: isPlaying ? '0 0 20px rgba(0, 255, 136, 0.5), inset 0 0 10px rgba(0, 255, 136, 0.2)' : 'none',
        transition: 'all 0.3s ease',
      }}
    >
      {!imageError ? (
        <img
          src="https://sintra-images.s3.eu-north-1.amazonaws.com/3fddfa4f-21d6-4499-8920-9b9b4c304d56/power-ups/remove-background/f728225c-42fc-41f9-8490-698d401e329f/image.png"
          alt="GRAFF PUNKS Boom Box"
          style={{ width: '120px', height: '120px', objectFit: 'contain' }}
          onError={() => {
            console.warn('🔊 Boom box image failed to load, using fallback');
            setImageError(true);
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.filter = 'brightness(1.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.filter = 'brightness(1)';
          }}
        />
      ) : (
        <div style={{ fontSize: '4rem', lineHeight: 1 }}>📻</div>
      )}

      <div
        style={{
          position: 'absolute',
          bottom: 6,
          right: 10,
          color: isPlaying ? '#00ff88' : '#666',
          fontSize: '0.65rem',
          fontFamily: 'monospace',
          fontWeight: 'bold',
          letterSpacing: '0.1em',
          textShadow: isPlaying ? '0 0 5px #00ff88' : 'none',
        }}
      >
        {isPlaying ? 'LIVE' : 'MUTE'}
      </div>
    </div>
  );
}

export default GraffPunksRadio;
