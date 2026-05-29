import { useState, useEffect } from 'react';

const GLYPH_POOL = ['▌', '▍', '█', '▓', '◈', '┊', '╫', '╋', '▮', '░'];

export function GlitchCursor() {
  const [glyph, setGlyph] = useState('▌');
  useEffect(() => {
    const tick = setInterval(() => {
      if (Math.random() > 0.78) {
        const pick = GLYPH_POOL[Math.floor(Math.random() * GLYPH_POOL.length)];
        setGlyph(pick);
        setTimeout(() => setGlyph(g => g === pick ? '▌' : g), 80 + Math.random() * 100);
      } else {
        setGlyph(g => g === '' ? '▌' : '');
      }
    }, 510);
    return () => clearInterval(tick);
  }, []);
  return <span className="oracle-cursor oracle-cursor--glitch">{glyph}</span>;
}
