import { useEffect, useRef } from 'react';

interface OracleSpectrumRingProps {
  getAnalyser: () => AnalyserNode | null;
  isActive: boolean;
}

const BAR_COUNT = 32;
const INNER_RADIUS_RATIO = 0.40; // bar starts this fraction of canvas half-width
const MAX_BAR_HEIGHT_RATIO = 0.22; // max bar length as fraction of canvas half-width

// Green → Purple gradient mapped across frequency bins
function barColor(index: number, alpha: number): string {
  const t = index / (BAR_COUNT - 1);
  const r = Math.round(0   + t * 176);
  const g = Math.round(255 - t * 217);
  const b = Math.round(136 + t * 119);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function OracleSpectrumRing({ getAnalyser, isActive }: OracleSpectrumRingProps) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const rafRef      = useRef<number>(0);
  const opacityRef  = useRef<number>(0);
  const dataRef     = useRef<Uint8Array<ArrayBuffer> | null>(null);

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
        const color     = barColor(i, alpha);

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
          ctx.fillStyle = barColor(i, alpha * 0.9);
          ctx.fill();
        }
      }

      // Subtle inner ring
      ctx.beginPath();
      ctx.arc(cx, cy, innerR - 2, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(0,255,136,${opacityRef.current * 0.12})`;
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
