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
      className={`oracle-bottom-btn${isActive ? ' oracle-bottom-btn--active' : ''}`}
    >
      {!imageError ? (
        <img
          src="https://sintra-images.s3.eu-north-1.amazonaws.com/3fddfa4f-21d6-4499-8920-9b9b4c304d56/power-ups/remove-background/5658be5f-989d-42d1-a0dd-eef0f4891989/image.png"
          alt="ENCULTURATE Spray Crate"
          className="oracle-bottom-btn__img"
          onError={() => setImageError(true)}
        />
      ) : (
        <div style={{ fontSize: '2rem', lineHeight: 1 }}>🎨</div>
      )}
      <span className="oracle-bottom-btn__label">ENCULTURATE</span>
    </div>
  );
}

export default EnculturateCrate;
