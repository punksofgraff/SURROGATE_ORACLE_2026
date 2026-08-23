import { ChevronDown, ChevronUp, Volume2, VolumeX } from 'lucide-react';

interface OracleAudioControlsProps {
  volume: number;
  muted: boolean;
  voiceActive: boolean;
  musicActive: boolean;
  onToggleMute: () => void;
  onVolumeChange: (volume: number) => void;
}

export function OracleAudioControls({
  volume,
  muted,
  voiceActive,
  musicActive,
  onToggleMute,
  onVolumeChange,
}: OracleAudioControlsProps) {
  const mode = voiceActive && musicActive ? 'ORACLE + MUSIC' : voiceActive ? 'ORACLE VOICE' : musicActive ? 'LYRIA SIGNAL' : 'AUDIO READY';

  return (
    <details className="oracle-audio-controls">
      <summary aria-label="Open audio controls">
        {muted ? <VolumeX size={16} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}
        <span className="oracle-audio-controls__summary-label">{muted ? 'AUDIO MUTED' : mode}</span>
        <ChevronDown className="oracle-audio-controls__open" size={14} aria-hidden="true" />
        <ChevronUp className="oracle-audio-controls__close" size={14} aria-hidden="true" />
      </summary>
      <div className="oracle-audio-controls__body">
        <div className="oracle-audio-controls__heading">
          <span>ORACLE VOICE</span>
          <span>{muted ? 'MUTED' : `${Math.round(volume * 100)}%`}</span>
        </div>
        <div className="oracle-audio-controls__row">
          <button
            type="button"
            className="oracle-audio-controls__mute"
            onClick={onToggleMute}
            aria-pressed={muted}
            aria-label={muted ? 'Unmute Oracle audio' : 'Mute Oracle audio'}
          >
            {muted ? <VolumeX size={17} aria-hidden="true" /> : <Volume2 size={17} aria-hidden="true" />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={muted ? 0 : volume}
            onChange={(event) => onVolumeChange(Number(event.target.value))}
            aria-label="Oracle voice volume"
          />
        </div>
        <div className="oracle-audio-controls__modes" aria-live="polite">
          <span className={voiceActive ? 'is-active' : ''}>VOICE</span>
          <span className={musicActive ? 'is-active' : ''}>MUSIC</span>
          <span className="oracle-audio-controls__mic-note">MIC UNCHANGED</span>
        </div>
      </div>
    </details>
  );
}

export default OracleAudioControls;