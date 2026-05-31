import { useState } from 'react';
import type { AudioTrack } from '../config/audioTracks';

interface GraffPunksRadioProps {
  isPlaying: boolean;
  onToggle: () => void;
  stations: AudioTrack[];
  currentStation: number;
  onStationChange: (index: number) => void;
}

export function GraffPunksRadio({
  isPlaying,
  onToggle,
  stations,
  currentStation,
  onStationChange,
}: GraffPunksRadioProps) {
  const [imageError, setImageError] = useState(false);
  const station = stations[currentStation] ?? stations[0];

  return (
    <div className={`oracle-bottom-btn${isPlaying ? ' oracle-bottom-btn--active' : ''}`}
      style={{ gap: 4 }}
    >
      {/* Main tap area — mute / unmute only */}
      <div onClick={onToggle} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        {!imageError ? (
          <img
            src="https://sintra-images.s3.eu-north-1.amazonaws.com/3fddfa4f-21d6-4499-8920-9b9b4c304d56/power-ups/remove-background/f728225c-42fc-41f9-8490-698d401e329f/image.png"
            alt="Radio"
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
        <span className="oracle-bottom-btn__label" style={{ color: isPlaying ? station.color : undefined }}>
          {isPlaying ? station.title : 'MUTED'}
        </span>
      </div>

      {/* Station dots — only when playing and more than one station */}
      {isPlaying && stations.length > 1 && (
        <div style={{ display: 'flex', gap: 5, justifyContent: 'center', paddingBottom: 2 }}>
          {stations.map((s, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); onStationChange(i); }}
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                background: i === currentStation ? s.color : 'rgba(255,255,255,0.18)',
                boxShadow: i === currentStation ? `0 0 6px ${s.color}` : 'none',
                transition: 'background 0.2s, box-shadow 0.2s',
                flexShrink: 0,
              }}
              aria-label={s.title}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default GraffPunksRadio;
