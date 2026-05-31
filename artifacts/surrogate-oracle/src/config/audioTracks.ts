export interface AudioTrack {
  title: string;      // short display name shown on dot hover / active label
  url: string;
  color: string;      // brand dot color for this station
}

// Station 0 is always Graff Punks — the Oracle's home frequency.
// Stations 1+ are atmospheric instrumentals that complement the Oracle experience.
// SomaFM streams are free / no-auth public radio.
export const defaultAudioTracks: AudioTrack[] = [
  {
    title: 'GRAFF PUNKS',
    url:   'https://stream.radiojar.com/2qm1fc5kb',
    color: '#00ff88',
  },
  {
    title: 'DRONE ZONE',
    url:   'https://ice1.somafm.com/dronezone-128-mp3',
    color: '#00ffcc',
  },
  {
    title: 'GROOVE SALAD',
    url:   'https://ice1.somafm.com/groovesalad-128-mp3',
    color: '#b026ff',
  },
];
