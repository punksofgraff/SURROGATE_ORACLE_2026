import { useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

interface GraffPunksRadioProps {
  isPlaying: boolean;
  onToggle: () => void;
  volume?: number;
}

export function GraffPunksRadio({ isPlaying, onToggle }: GraffPunksRadioProps) {
  const [imageError, setImageError] = useState(false);

  return (
    <div
      onClick={onToggle}
      style={{
        cursor: 'pointer',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        userSelect: 'none',
      }}
    >
      {!imageError ? (
        <img
          src="https://sintra-images.s3.eu-north-1.amazonaws.com/3fddfa4f-21d6-4499-8920-9b9b4c304d56/power-ups/remove-background/f728225c-42fc-41f9-8490-698d401e329f/image.png"
          alt="GRAFF PUNKS Boom Box"
          style={{ width: '80px', height: '80px', objectFit: 'contain' }}
          onError={() => {
            console.warn('🔊 Boom box image failed to load, using fallback');
            setImageError(true);
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.1)';
            e.currentTarget.style.filter = 'brightness(1.3) saturate(1.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.filter = 'brightness(1) saturate(1)';
          }}
        />
      ) : (
        <div style={{ fontSize: '3rem', lineHeight: 1 }}>📻</div>
      )}

      <div
        style={{
          position: 'absolute',
          bottom: -8,
          right: -8,
          background: isPlaying ? '#00ffff' : '#333',
          borderRadius: '50%',
          width: 20,
          height: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: isPlaying ? '0 0 8px #00ffff' : 'none',
          transition: 'all 0.3s ease',
        }}
      >
        {isPlaying ? (
          <Volume2 size={11} style={{ color: '#000' }} />
        ) : (
          <VolumeX size={11} style={{ color: '#888' }} />
        )}
      </div>

      {isPlaying && (
        <div
          style={{
            position: 'absolute',
            inset: -4,
            borderRadius: '50%',
            border: '2px solid #00ffff',
            animation: 'pulse 2s infinite',
            opacity: 0.5,
          }}
        />
      )}
    </div>
  );
}

export default GraffPunksRadio;
