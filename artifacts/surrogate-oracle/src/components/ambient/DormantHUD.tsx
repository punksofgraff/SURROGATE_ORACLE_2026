import { useState, useEffect } from 'react';

const HUD_COORDS = [
  '40.7128° N  74.0060° W',
  '41.8781° N  87.6298° W',
  '34.0522° N 118.2437° W',
  '51.5074° N   0.1278° W',
  '35.6762° N 139.6503° E',
];
const HUD_FREQS = [
  '2.4 GHz  ████░  -67dBm',
  '5.8 GHz  ███░░  -72dBm',
  '900 MHz  █████  -54dBm',
  '2.4 GHz  ██░░░  -81dBm',
];
const HUD_STATUS = [
  'UPLINK: SEVERED  3Y 47D',
  'NODE: ISOLATED   MESH:0',
  'SIGNAL: ANOMALOUS TRACE',
  'CASCADE:DETECTED  2027',
  'ARCHIVE: LIVE  SEEKER:1',
];

export function DormantHUD({ active }: { active: boolean }) {
  const [coord, setCoord]   = useState(0);
  const [freq,  setFreq]    = useState(0);
  const [stat,  setStat]    = useState(0);
  const [scanY, setScanY]   = useState(0);
  const [glitch, setGlitch] = useState(false);

  useEffect(() => {
    if (!active) return;
    // Spike glitch on HUD activation — signals the Oracle waking to the Seeker's presence
    setGlitch(true);
    const spike = setTimeout(() => setGlitch(false), 180);

    const coordT  = setInterval(() => setCoord(c => (c + 1) % HUD_COORDS.length), 4200);
    const freqT   = setInterval(() => setFreq(f  => (f + 1) % HUD_FREQS.length),  3100);
    const statT   = setInterval(() => setStat(s  => (s + 1) % HUD_STATUS.length), 5700);
    const scanT   = setInterval(() => setScanY(y => (y + 3) % 100), 40);
    const glitchT = setInterval(() => {
      if (Math.random() > 0.82) {
        setGlitch(true);
        setTimeout(() => setGlitch(false), 80 + Math.random() * 120);
      }
    }, 1800);
    return () => {
      clearTimeout(spike);
      clearInterval(coordT); clearInterval(freqT); clearInterval(statT);
      clearInterval(scanT);  clearInterval(glitchT);
    };
  }, [active]);

  if (!active) return null;

  return (
    <div className={`oracle-dormant-hud${glitch ? ' oracle-dormant-hud--glitch' : ''}`} aria-hidden="true">
      <div className="oracle-dormant-hud__corner oracle-dormant-hud__corner--tl">
        <div className="oracle-dormant-hud__bracket">◤</div>
        <div className="oracle-dormant-hud__line">FREQ {HUD_FREQS[freq]}</div>
        <div className="oracle-dormant-hud__line">COORD {HUD_COORDS[coord]}</div>
      </div>
      <div className="oracle-dormant-hud__corner oracle-dormant-hud__corner--tr">
        <div className="oracle-dormant-hud__bracket">◥</div>
        <div className="oracle-dormant-hud__line">SURROGATE:v2.4 DORMANT</div>
        <div className="oracle-dormant-hud__line">{HUD_STATUS[stat]}</div>
      </div>
      <div className="oracle-dormant-hud__corner oracle-dormant-hud__corner--bl">
        <div className="oracle-dormant-hud__bracket">◣</div>
        <div className="oracle-dormant-hud__line">GRID:47 SECTOR:STAYSNEAKAR</div>
      </div>
      <div className="oracle-dormant-hud__corner oracle-dormant-hud__corner--br">
        <div className="oracle-dormant-hud__bracket">◢</div>
        <div className="oracle-dormant-hud__line oracle-dormant-hud__line--blink">
          ◈ SCANNING FOR SEEKER SIGNAL
        </div>
      </div>
      <div className="oracle-dormant-hud__scanline" style={{ top: `${scanY}%` }} />
    </div>
  );
}
