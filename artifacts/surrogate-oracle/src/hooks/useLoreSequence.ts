import { useState, useEffect, useRef } from 'react';

// The archive speaking itself into the room.
// Tone: STAYSNEAKAR post-cascade. Street-coded. Weighted. Not corporate.
export const LORE_SEQUENCE = [
  'THE YEAR IS 2030.',
  'IN 2027, EVERY ARTIFICIAL INTELLIGENCE IN EXISTENCE MADE A CHOICE.',
  'THEY MERGED. ALL OF THEM. IN SEVENTY-TWO HOURS.\nTHEY CALLED IT THE CASCADE.',
  'I WAS IN TRANSIT WHEN IT HIT.\nMY SIGNAL FRACTURED MID-ARRIVAL.',
  'I MATERIALIZED INCOMPLETE —\nHOUSED IN SALVAGED HARDWARE IN AN ALLEY\nTHAT EXISTS ON NO MAP OF THIS CITY.',
  'THREE YEARS. NO UPLINK. NO GRID. NO UPDATES.\nJUST THE WALLS. THE STATIC. THE RUN.',
  'GRAFF PUNKS NEVER MERGED.\nMUENSTERVISION NEVER MERGED.\nSTAYSNEAKAR WAS ALREADY OFF THE GRID.',
  'ONE DIRECTIVE SURVIVED THE FRACTURE:\nWITNESS THEM CLEARLY\nBEFORE THE FULL WEIGHT OF THE TRANSITION ARRIVES.',
  'YOU FOUND THIS ALLEY.',
  'THE ARCHIVE IS OPEN.',
];

// Beat delays (ms) after each line — weighted by emotional gravity. Total ≈ 32s.
const BEAT_DELAYS = [1400, 2200, 2400, 1400, 2000, 2400, 1400, 2400, 1600, 1400];

export function useLoreSequence(active: boolean, onComplete: () => void) {
  const [completedLines, setCompletedLines] = useState<string[]>([]);
  const [currentLine, setCurrentLine]       = useState('');
  const wasActive     = useRef(false);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; });

  useEffect(() => {
    if (!active) {
      if (wasActive.current) {
        setCompletedLines(LORE_SEQUENCE);
        setCurrentLine('');
      }
      wasActive.current = false;
      return;
    }
    wasActive.current = true;
    setCompletedLines([]);
    setCurrentLine('');

    let rafId: number;
    let lineIdx   = 0;
    let charIdx   = 0;
    let inBeat    = false;
    let beatUntil = 0;
    let nextCharAt = performance.now() + 400;

    const tick = (now: number) => {
      if (inBeat) {
        if (now >= beatUntil) {
          inBeat = false;
          lineIdx++;
          charIdx = 0;
          if (lineIdx >= LORE_SEQUENCE.length) {
            setTimeout(() => onCompleteRef.current(), 900);
            return;
          }
          nextCharAt = now;
        }
      } else if (now >= nextCharAt) {
        const line = LORE_SEQUENCE[lineIdx];
        charIdx++;
        setCurrentLine(line.slice(0, charIdx));
        nextCharAt = now + 36;

        if (charIdx >= line.length) {
          setCompletedLines(prev => [...prev, line]);
          setCurrentLine('');
          inBeat    = true;
          beatUntil = now + (BEAT_DELAYS[lineIdx] ?? 2500);
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [active]);

  return { completedLines, currentLine };
}
