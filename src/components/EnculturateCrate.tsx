import React from 'react';
import { useState } from 'react';
import { Settings, Zap } from 'lucide-react';

interface EnculturateCrateProps {
  onClick: () => void;
  isActive?: boolean;
}

export function EnculturateCrate({ onClick, isActive = false }: EnculturateCrateProps & { disabled?: boolean }) {
  const [imageError, setImageError] = useState(false);
  const disabled = false; // Remove disabled prop to prevent TypeScript errors
  
  return (
    <div
      className="enculturate-crate"
      onClick={disabled ? undefined : onClick}
      style={{
        position: 'relative',
        width: '96px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        filter: 'drop-shadow(0 0 20px #00ff62) drop-shadow(0 0 40px #00ff62)',
        animation: 'spray-crate-pulse 3s infinite ease-in-out',
        opacity: disabled ? 0.3 : 1,
        pointerEvents: disabled ? 'none' : 'auto'
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.transform = 'translateY(-8px) scale(1.08)';
        e.currentTarget.style.filter = 'drop-shadow(0 0 30px #00ff62) drop-shadow(0 0 60px #00ff62) brightness(1.3)';
      }}
      onMouseLeave={(e) => {
        if (disabled) return;
        e.currentTarget.style.transform = 'translateY(0) scale(1)';
        e.currentTarget.style.filter = 'drop-shadow(0 0 20px #00ff62) drop-shadow(0 0 40px #00ff62)';
      }}
    >
      {/* Actual Spray Crate Image */}
      {!imageError ? (
        <img
          src="https://sintra-images.s3.eu-north-1.amazonaws.com/3fddfa4f-21d6-4499-8920-9b9b4c304d56/power-ups/remove-background/5658be5f-989d-42d1-a0dd-eef0f4891989/image.png"
          alt="ENCULTURATE Spray Crate"
          style={{
            width: '120px',
            height: 'auto',
            objectFit: 'contain',
            transition: 'all 0.3s ease'
          }}
          onError={() => {
            console.warn('🎨 Spray crate image failed to load, using fallback');
            setImageError(true);
          }}
        />
      ) : (
        <div style={{
          width: '120px',
          height: '120px',
          background: 'linear-gradient(45deg, #00ff62, #7c3aed)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '3rem'
        }}>
          🎨
        </div>
      )}

      {/* Glow Ring Effect */}
      {isActive && (
        <div style={{
          position: 'absolute',
          top: '-8px',
          left: '-8px',
          right: '-8px',
          bottom: '-8px',
          border: '3px solid #00ff62',
          borderRadius: '15px',
          animation: 'neon-pulse 1.5s infinite ease-in-out',
          pointerEvents: 'none'
        }} />
      )}

      {/* Power Indicator */}
      <div style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        width: '12px',
        height: '12px',
        background: '#00ff62',
        borderRadius: '50%',
        boxShadow: '0 0 12px #00ff62',
        animation: isActive ? 'power-blink 1s infinite' : 'none'
      }} />
    </div>
  );
}

export default EnculturateCrate;