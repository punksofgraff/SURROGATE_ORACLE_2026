import { useEffect, useRef } from 'react';

interface OracleSpectrumRingProps {
  getAnalyser: () => AnalyserNode | null;
  isActive: boolean;
  // Latest turn's read — biases the ring warmer-green (sacred) or cooler-purple (profane),
  // so the Seeker *feels* witnessed without a score popping up.
  alignment?: 'sacred' | 'profane' | null;
}

const BAR_COUNT = 32;
const INNER_RADIUS_RATIO = 0.40; // bar starts this fraction of canvas half-width
const MAX_BAR_HEIGHT_RATIO = 0.22; // max bar length as fraction of canvas half-width

const SACRED_RGB: [number, number, number] = [0, 255, 136];
const PROFANE_RGB: [number, number, number] = [176, 38, 255];

// Green → Purple gradient mapped across frequency bins, optionally blended toward the
// current alignment colour by `bias` (0..1) so a sacred turn warms the whole ring green.
function barColor(index: number, alpha: number, align: 'sacred' | 'profane' | null, bias: number): string {
  const t = index / (BAR_COUNT - 1);
  let r = 0   + t * 176;
  let g = 255 - t * 217;
  let b = 136 + t * 119;
  if (align && bias > 0) {
    const [tr, tg, tb] = align === 'sacred' ? SACRED_RGB : PROFANE_RGB;
    r += (tr - r) * bias;
    g += (tg - g) * bias;
    b += (tb - b) * bias;
  }
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${alpha})`;
}

export function OracleSpectrumRing({ getAnalyser, isActive, alignment = null }: OracleSpectrumRingProps) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const rafRef      = useRef<number>(0);
  const opacityRef  = useRef<number>(0);
  const dataRef     = useRef<Uint8Array<ArrayBuffer> | null>(null);
  // Read in the draw loop without re-subscribing the effect; bias eases toward target.
  const alignmentRef = useRef<'sacred' | 'profane' | null>(alignment);
  const biasRef      = useRef<number>(0);
  useEffect(() => { alignmentRef.current = alignment; }, [alignment]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width  = parent.offsetWidth;
      canvas.height = parent.offsetHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);

      // Fade in/out
      const target = isActive ? 1 : 0;
      opacityRef.current += (target - opacityRef.current) * 0.03;
      if (opacityRef.current < 0.005 && !isActive) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }

      // Ease the alignment bias toward the latest read (0.55 = clearly felt, still subtle).
      const align = alignmentRef.current;
      const biasTarget = align ? 0.55 : 0;
      biasRef.current += (biasTarget - biasRef.current) * 0.04;
      const bias = biasRef.current;

      const analyser = getAnalyser();
      if (analyser) {
        if (!dataRef.current || dataRef.current.length !== analyser.frequencyBinCount) {
          dataRef.current = new Uint8Array(analyser.frequencyBinCount);
        }
        analyser.getByteFrequencyData(dataRef.current);
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const cx   = canvas.width  / 2;
      const cy   = canvas.height / 2;
      const half = Math.min(cx, cy);
      const innerR = half * INNER_RADIUS_RATIO;
      const maxBar = half * MAX_BAR_HEIGHT_RATIO;

      for (let i = 0; i < BAR_COUNT; i++) {
        const angle = (i / BAR_COUNT) * Math.PI * 2 - Math.PI / 2;

        // Map frequency bin — use first ~60% of bins (voice range)
        let magnitude = 0;
        if (dataRef.current) {
          const binIndex = Math.floor((i / BAR_COUNT) * (dataRef.current.length * 0.55));
          magnitude = dataRef.current[binIndex] / 255;
        }

        const barLength = magnitude * maxBar;
        const alpha     = opacityRef.current * (0.35 + magnitude * 0.65);
        const color     = barColor(i, alpha, align, bias);

        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        ctx.beginPath();
        ctx.moveTo(cx + cos * innerR, cy + sin * innerR);
        ctx.lineTo(cx + cos * (innerR + barLength), cy + sin * (innerR + barLength));
        ctx.strokeStyle = color;
        ctx.lineWidth   = 2;
        ctx.lineCap     = 'round';
        ctx.stroke();

        // Outer glow dot at bar tip
        if (magnitude > 0.15) {
          ctx.beginPath();
          ctx.arc(
            cx + cos * (innerR + barLength),
            cy + sin * (innerR + barLength),
            1.5, 0, Math.PI * 2
          );
          ctx.fillStyle = barColor(i, alpha * 0.9, align, bias);
          ctx.fill();
        }
      }

      // Subtle inner ring — tints with the same alignment bias as the bars.
      ctx.beginPath();
      ctx.arc(cx, cy, innerR - 2, 0, Math.PI * 2);
      ctx.strokeStyle = barColor(0, opacityRef.current * 0.12, align, bias);
      ctx.lineWidth   = 1;
      ctx.stroke();
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [getAnalyser, isActive]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
}
