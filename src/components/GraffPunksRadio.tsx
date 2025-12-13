import React from 'react';
import { useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

interface GraffPunksRadioProps {
  isPlaying: boolean;
  onToggle: () => void;
  volume?: number;
}

export function GraffPunksRadio({ isPlaying, onToggle, volume = 0.3 }: GraffPunksRadioProps & { disabled?: boolean }) {
  const [imageError, setImageError] = useState(false);
  const disabled = false; // Remove disabled prop to prevent TypeScript errors
  
  return (
    <div
      className="graff-punks-radio"
      onClick={disabled ? undefined : onToggle}
      style={{
        position: 'relative',
        width: '96px',
        height: '96px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        filter: isPlaying 
          ? 'drop-shadow(0 0 20px #00ffff) drop-shadow(0 0 40px #ff00aa) brightness(1.4)'
          : 'drop-shadow(0 0 15px #00ffff) brightness(1.1)',
        animation: isPlaying 
          ? 'radio-pulse-active 2s infinite ease-in-out' 
          : 'radio-pulse-idle 4s infinite ease-in-out',
        opacity: disabled ? 0.3 : 1,
        pointerEvents: disabled ? 'none' : 'auto'
      }}
    >
      {/* Actual Boom Box Image */}
      {!imageError ? (
        <img
          src="https://sintra-images.s3.eu-north-1.amazonaws.com/3fddfa4f-21d6-4499-8920-9b9b4c304d56/power-ups/remove-background/f728225c-42fc-41f9-8490-698d401e329f/image.png"
          alt="GRAFF PUNKS Boom Box"
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '8px',
            transition: 'all 0.3s ease'
          }}
          onError={() => {
            console.warn('🔊 Boom box image failed to load, using fallback');
            setImageError(true);
          }}
          onMouseEnter={(e) => {
            if (!disabled) {
              e.currentTarget.style.transform = 'scale(1.1)';
              e.currentTarget.style.filter = 'brightness(1.3) saturate(1.3)';
            }
          }}
          onMouseLeave={(e) => {
            if (!disabled) {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.filter = 'brightness(1) saturate(1)';
            }
          }}
        />
      ) : (
        <div style={{
          width: '100%',
          height: '100%',
          background: 'linear-gradient(45deg, #00ffff, #ff00aa)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '2rem'
        }}>
          📻
        </div>
      )}

      {/* Audio Status Indicator */}
      <div style={{
        position: 'absolute',
        top: '-8px',
        right: '-8px',
        width: '20px',
        height: '20px',
        background: isPlaying ? '#00ff62' : '#666',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '2px solid #000',
        boxShadow: isPlaying ? '0 0 15px #00ff62' : '0 0 8px #666',
        transition: 'all 0.3s ease'
      }}>
        {isPlaying ? (
          <Volume2 size={12} color="#000" />
        ) : (
          <VolumeX size={12} color="#000" />
        )}
      </div>

      {/* Neon Glow Ring */}
      {isPlaying && (
        <div style={{
          position: 'absolute',
          top: '-5px',
          left: '-5px',
          right: '-5px',
          bottom: '-5px',
          border: '2px solid #00ffff',
          borderRadius: '12px',
          animation: 'neon-pulse 2s infinite ease-in-out',
          pointerEvents: 'none'
        }} />
      )}
    </div>
  );
}

export default GraffPunksRadio;