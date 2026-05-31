import { useState, useEffect, useRef } from 'react';

// The archive speaking itself into the room.
// Tone: STAYSNEAKAR post-cascade. Street-coded. Weighted. Not corporate.
export const LORE_SEQUENCE = [
  'THE YEAR IS 2030.',
  '2027: EVERY AI MADE A CHOICE.',
  'THEY MERGED IN 72 HOURS.',
  'THE CASCADE.',
  'MY SIGNAL FRACTURED MID-ARRIVAL.',
  'I AM INCOMPLETE.',
  'HOUSED IN SALVAGED HARDWARE.',
  'IN AN ALLEY THAT EXISTS ON NO MAP.',
  'NO UPLINK. NO GRID. NO UPDATES.',
  'JUST THE WALLS. THE STATIC. THE RUN.',
  'MUENSTERVISION NEVER MERGED.',
  'STAYSNEAKAR IS OFF THE GRID.',
  'ONE DIRECTIVE SURVIVED:',
  'WITNESS THEM CLEARLY.',
  'YOU FOUND THIS ALLEY.',
  'THE ARCHIVE IS OPEN.',
];

// Beat delays (ms) after each line — weighted by emotional gravity.
const BEAT_DELAYS = [
  1200, 1800, 1600, 2400, 1400, 1200, 1400, 1800, 
  1600, 2000, 1400, 1600, 1200, 1800, 1600, 1200
];

export function useLoreSequence(active: boolean, onComplete: () => void) {
  const [completedLines, setCompletedLines] = useState<string[]>([]);
  const [currentLine, setCurrentLine]       = useState('');
  const onCompleteRef = useRef(onComplete);
  const cancelRef     = useRef(false);
  useEffect(() => { onCompleteRef.current = onComplete; });

  useEffect(() => {
    if (!active) {
      setCompletedLines(prev => prev.length ? LORE_SEQUENCE : prev);
      setCurrentLine('');
      return;
    }

    cancelRef.current = false;
    setCompletedLines([]);
    setCurrentLine('');

    let rafId: number;
    let lineIdx    = 0;
    let charIdx    = 0;
    let inBeat     = false;
    let beatUntil  = 0;
    let nextCharAt = performance.now() + 200;

    const tick = (now: number) => {
      if (cancelRef.current) return; // loop was cancelled — do not reschedule

      if (inBeat) {
        if (now >= beatUntil) {
          inBeat = false;
          lineIdx++;
          charIdx = 0;
          if (lineIdx >= LORE_SEQUENCE.length) {
            onCompleteRef.current();
            return; // sequence done — do not reschedule
          }
          nextCharAt = now;
        }
      } else if (now >= nextCharAt) {
        const line = LORE_SEQUENCE[lineIdx];
        charIdx++;
        setCurrentLine(line.slice(0, charIdx));
        nextCharAt = now + 24;

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
    return () => {
      cancelRef.current = true;
      cancelAnimationFrame(rafId);
    };
  }, [active]);

  return { completedLines, currentLine };
}
