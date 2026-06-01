export interface AudioTrack {
  title: string;      // short display name shown on dot hover / active label
  url: string;
  color: string;      // brand dot color for this station
  gain: number;       // per-station gain multiplier (1.0 = reference level)
}

// Station 0 is always Graff Punks — the Oracle's home frequency.
// Stations 1+ are atmospheric instrumentals that complement the Oracle experience.
// SomaFM streams are free / no-auth public radio.
// gain: Graff Punks radiojar stream is hotter than SomaFM — pulled down to match.
export const defaultAudioTracks: AudioTrack[] = [
  {
    title: 'GRAFF PUNKS',
    url:   'https://stream.radiojar.com/2qm1fc5kb',
    color: '#00ff88',
    gain:  0.45,
  },
  {
    title: 'DRONE ZONE',
    url:   'https://ice1.somafm.com/dronezone-128-mp3',
    color: '#00ffcc',
    gain:  1.0,
  },
  {
    title: 'CHILL HOP',
    url:   'https://stream.zeno.fm/0r0xa792kwzuv',
    color: '#b026ff',
    gain:  1.0,
  },
];
