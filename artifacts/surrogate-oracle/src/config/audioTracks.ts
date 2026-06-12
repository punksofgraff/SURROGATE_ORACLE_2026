export interface AudioTrack {
  title: string;      // short display name shown on dot hover / active label
  url: string;
  color: string;      // brand dot color for this station
  gain: number;       // per-station gain multiplier (1.0 = reference level)
}

// Station 0: Graff Punks — the Oracle's home frequency. Single station.
export const defaultAudioTracks: AudioTrack[] = [
  {
    title: 'GRAFF PUNKS',
    url:   'https://stream.radiojar.com/2qm1fc5kb',
    color: '#00ff88',
    gain:  0.65,
  },
];
