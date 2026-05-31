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
      className={`oracle-bottom-btn${isPlaying ? ' oracle-bottom-btn--active' : ''}`}
    >
      {!imageError ? (
        <img
          src="https://sintra-images.s3.eu-north-1.amazonaws.com/3fddfa4f-21d6-4499-8920-9b9b4c304d56/power-ups/remove-background/f728225c-42fc-41f9-8490-698d401e329f/image.png"
          alt="GRAFF PUNKS Boom Box"
          className="oracle-bottom-btn__img"
          style={{
            opacity: isPlaying ? 1 : 0.4,
            filter: isPlaying ? 'none' : 'grayscale(0.5)',
            transition: 'opacity 0.3s ease, filter 0.3s ease',
          }}
          onError={() => setImageError(true)}
        />
      ) : (
        <div style={{ fontSize: '2rem', lineHeight: 1, opacity: isPlaying ? 1 : 0.4 }}>📻</div>
      )}
      <span className="oracle-bottom-btn__label">{isPlaying ? 'LIVE' : 'MUTED'}</span>
    </div>
  );
}

export default GraffPunksRadio;
