/**
 * ScrambleFragment — Cheshire Cat materialisation for the dormant signal layer.
 *
 * The cycle:
 *   1. All positions show random glyphs (pure noise — the cat hasn't arrived yet)
 *   2. Characters crystallise from RANDOM positions until the text resolves
 *      (not left-to-right — letters pop into existence unpredictably, like a
 *       face assembling itself from fog)
 *   3. Text holds — fully present, slightly drifting (CSS keyframe)
 *   4. Characters vanish in random order, the last ~25% linger and shimmer
 *      longest — the GRIN IS THE LAST THING TO DISAPPEAR
 *   5. Smoke CSS: opacity + blur transition during exit = ethereal wisps
 *   6. Dark gap → next text in the pool → repeat
 *
 * No Three.js / WebGL required. The katakana glyph pool + random-order
 * crystallisation gives the GPU-shader feel in pure React.
 */
import { useState, useEffect, useRef } from 'react';

// ── Glyph pool ────────────────────────────────────────────────────────────
// Katakana (alien/digital) + block elements (noise texture) + hex (system)
const GLYPHS =
  'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモ' +
  'ヤユヨラリルレロワヲン' +
  '0123456789ABCDEF' +
  '░▒▓█▌▍▎▏┊╫◈▮╬╪═║▐▀▄╱╲╳∆∇∞⌖⌗';

function randGlyph(): string {
  return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
}

/** Fisher-Yates shuffle — returns a new shuffled copy */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface ScrambleFragmentProps {
  /** Rotating pool of texts — each one gets its own Cheshire cycle */
  texts: string[];
  /** CSS class(es) added alongside oracle-sf for positioning + colour */
  className?: string;
  /** ms delay before the very first text starts appearing */
  initialDelay?: number;
  /** ms between each character crystallisation tick */
  revealMs?: number;
  /** ms to hold the fully-revealed text before dissolving */
  holdMs?: number;
  /** ms between each character vanish tick (exit phase) */
  exitMs?: number;
  /** ms dark gap between text cycles */
  pauseMs?: number;
  /** 0-1 opacity for the crystallised (fully-visible) state */
  peakOpacity?: number;
}

export function ScrambleFragment({
  texts,
  className = '',
  initialDelay = 0,
  revealMs     = 52,
  holdMs       = 3000,
  exitMs       = 30,
  pauseMs      = 1000,
  peakOpacity  = 1,
}: ScrambleFragmentProps) {
  const [display,   setDisplay]   = useState<string>('');
  const [shown,     setShown]     = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const textsRef   = useRef(texts);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => { textsRef.current = texts; }, [texts]);

  useEffect(() => {
    mountedRef.current = true;

    const clear = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const runPhrase = (idx: number) => {
      if (!mountedRef.current) return;

      const phrase = textsRef.current[idx % textsRef.current.length];
      const chars  = [...phrase];
      const len    = chars.length;

      // Positions that are actual characters (skip spaces and newlines)
      const charPositions = chars
        .map((c, i) => i)
        .filter(i => chars[i] !== ' ' && chars[i] !== '\n');

      // Shuffle for random crystallisation order
      const revealOrder = shuffle(charPositions);
      const resolved    = new Set<number>();
      let   revealIdx   = 0;

      // ── Phase 1: Crystallise ─────────────────────────────────────────────
      // Start with all chars as noise; resolve one random position per tick
      const scrambleIn = () => {
        if (!mountedRef.current) return;

        // Reveal the next character in the random order
        if (revealIdx < revealOrder.length) {
          resolved.add(revealOrder[revealIdx++]);
        }

        const out = chars.map((c, i) => {
          if (c === '\n' || c === ' ') return c;
          if (resolved.has(i)) return c;         // crystallised — locked in
          return randGlyph();                    // still noise
        }).join('');

        setDisplay(out);
        setShown(true);
        setIsExiting(false);

        if (revealIdx <= revealOrder.length) {
          timerRef.current = setTimeout(scrambleIn, revealMs);
        } else {
          // Clean settle: no random chars left
          setDisplay(phrase);
          timerRef.current = setTimeout(startExit, holdMs);
        }
      };

      // ── Phase 2: Dissolve (the grin lingers) ─────────────────────────────
      const startExit = () => {
        if (!mountedRef.current) return;
        setIsExiting(true);  // triggers CSS smoke-drift transition

        // Vanish order is a fresh shuffle — random, but the LAST 25% exit slower
        const vanishOrder = shuffle(charPositions);
        const vanished    = new Set<number>();
        let   vanishIdx   = 0;

        const scrambleOut = () => {
          if (!mountedRef.current) return;

          if (vanishIdx < vanishOrder.length) {
            vanished.add(vanishOrder[vanishIdx++]);
          }

          const remaining   = vanishOrder.length - vanishIdx;
          const isLastGrin  = remaining < Math.ceil(vanishOrder.length * 0.25);

          const out = chars.map((c, i) => {
            if (c === '\n') return '\n';
            if (c === ' ')  return c;
            if (vanished.has(i)) return '';
            // Shimmer: chars near vanishing alternate between real + noise
            return Math.random() > 0.5 ? randGlyph() : c;
          }).join('');

          setDisplay(out);

          if (vanishIdx <= vanishOrder.length) {
            // Last quarter exits at 2.5× slower — the lingering grin
            timerRef.current = setTimeout(
              scrambleOut,
              isLastGrin ? exitMs * 2.5 : exitMs
            );
          } else {
            // Fully gone
            setDisplay('');
            setShown(false);
            setIsExiting(false);
            const next = (idx + 1) % textsRef.current.length;
            timerRef.current = setTimeout(() => runPhrase(next), pauseMs);
          }
        };

        scrambleOut();
      };

      scrambleIn();
    };

    timerRef.current = setTimeout(() => runPhrase(0), initialDelay);
    return () => {
      mountedRef.current = false;
      clear();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // stable — cycling loop manages itself internally

  if (!shown && !display) return null;

  return (
    <div
      className={`oracle-sf ${className}${isExiting ? ' oracle-sf--exiting' : ''}`}
      style={{
        whiteSpace: 'pre-line',
        // Opacity: crystallised state uses peakOpacity; smoke exit fades to near-transparent.
        // NOTE: transform is intentionally NOT set here — the CSS drift animations (sf-a through
        // sf-f) own the transform property. If we set it via inline style it would win in the
        // cascade and kill the continuous slow-drift effect entirely.
        opacity: isExiting ? 0.08 : peakOpacity,
        // Smoke: blur + desaturate on exit — the text becomes spectral vapour
        filter: isExiting ? 'blur(3px) saturate(0.3)' : 'none',
        transition: isExiting
          ? 'opacity 1.1s ease, filter 1.0s ease'
          : 'opacity 0.25s ease',
      }}
      aria-hidden="true"
    >
      {display}
    </div>
  );
}
