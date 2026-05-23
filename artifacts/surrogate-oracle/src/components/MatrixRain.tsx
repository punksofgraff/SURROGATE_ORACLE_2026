/**
 * MatrixRain — Falling-character canvas effect
 *
 * Renders a sparse stream of katakana + digits + braille glyphs falling
 * vertically. Used as a dormant-state atmosphere layer behind the alley.
 *
 * Opacity is controlled by CSS (.matrix-rain-canvas) keyed to data-oracle-state
 * so it fades as the Oracle rises into terminal/awakened phase.
 *
 * Performance: a single requestAnimationFrame loop updates the canvas in-place.
 * No React re-renders in the hot path.
 */
import { useEffect, useRef } from 'react';

// Character pools — katakana gives the canonical "matrix" feel;
// braille + block chars add an alien / digital-DNA texture.
const KANA = 'ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ';
const DIGITS = '01234567890101';
const BLOCKS = '░▒▓▌▐▄▀█◈◆▮┊╫';
const ALL_CHARS = KANA + DIGITS + BLOCKS;

const FONT_SIZE = 12; // px — smaller = denser, more background texture
const SPEED_MIN = 0.5;  // cells per frame (fractional for slow drift)
const SPEED_MAX = 1.4;
const DROP_INTERVAL = 3; // frames between spawning a new column's drop
const HEAD_BRIGHTNESS = 1.0; // leading char is bright white
const TRAIL_COLOR_R = 0;
const TRAIL_COLOR_G = 200;
const TRAIL_COLOR_B = 100;

interface Drop {
  col: number;      // column index
  y: number;        // current y position in px (fractional)
  speed: number;    // px per frame
  length: number;   // trail length in cells
  chars: string[];  // snapshot chars for this column trail
}

export function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width  = 0;
    let height = 0;
    let cols   = 0;
    let drops: Drop[] = [];
    let frameCount = 0;
    let rafId = 0;

    const resize = () => {
      width  = canvas.width  = window.innerWidth;
      height = canvas.height = window.innerHeight;
      cols   = Math.floor(width / FONT_SIZE);
      // Keep existing drops; drop y resets naturally as they fall off-screen
    };

    const randomChar = () => ALL_CHARS[Math.floor(Math.random() * ALL_CHARS.length)];

    const spawnDrop = (col: number): Drop => {
      const len = 6 + Math.floor(Math.random() * 14);
      return {
        col,
        y: -FONT_SIZE * len,
        speed: SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN),
        length: len,
        chars: Array.from({ length: len }, randomChar),
      };
    };

    const draw = () => {
      // Fade the canvas — partial clear creates the trail glow effect
      ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
      ctx.fillRect(0, 0, width, height);

      ctx.font = `${FONT_SIZE}px 'Share Tech Mono', monospace`;

      frameCount++;
      // Occasionally spawn a new drop on a random column
      if (frameCount % DROP_INTERVAL === 0) {
        const col = Math.floor(Math.random() * cols);
        const alreadyActive = drops.some((d) => d.col === col && d.y < height);
        if (!alreadyActive) drops.push(spawnDrop(col));
      }

      // Update + draw each drop
      for (let i = drops.length - 1; i >= 0; i--) {
        const drop = drops[i];
        drop.y += drop.speed;

        const headCell = Math.floor(drop.y / FONT_SIZE);

        for (let j = 0; j < drop.length; j++) {
          const cellY = headCell - j;
          if (cellY < 0) continue;
          const px = drop.col * FONT_SIZE;
          const py = cellY * FONT_SIZE;
          if (py > height) continue;

          const ratio = 1 - j / drop.length; // 1 at head, 0 at tail

          if (j === 0) {
            // Leading character — bright near-white
            ctx.fillStyle = `rgba(220, 255, 230, ${HEAD_BRIGHTNESS * 0.85})`;
          } else {
            // Trail fades to deep green
            const alpha = Math.pow(ratio, 1.6) * 0.6;
            ctx.fillStyle = `rgba(${TRAIL_COLOR_R}, ${TRAIL_COLOR_G}, ${TRAIL_COLOR_B}, ${alpha})`;
          }

          // Occasionally mutate a trail char for the "flickering data" effect
          if (Math.random() < 0.015) drop.chars[j] = randomChar();

          ctx.fillText(drop.chars[j] ?? '0', px, py);
        }

        // Cull drops that have scrolled fully off-screen
        if (drop.y - drop.length * FONT_SIZE > height) {
          drops.splice(i, 1);
        }
      }

      rafId = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener('resize', resize, { passive: true });
    rafId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="matrix-rain-canvas"
      aria-hidden="true"
    />
  );
}

export default MatrixRain;
