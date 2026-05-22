/**
 * useAtmosphere — phase-aware environmental particle system.
 *
 * Three particle archetypes paint the alley as a living space:
 *   dust   — slow rising motes, the default environmental haze
 *   steam  — large, semi-transparent columns rising from ground level
 *   spark  — fast, tiny, bright — electrical interference / energy surge
 *
 * Phase configs drive density, speed, and dominant colour so the
 * atmosphere evolves in lockstep with the UX state machine.
 */
import { useEffect, useRef } from 'react';

type Phase = 'dormant' | 'terminal' | 'awakened' | 'oracle';
type Alignment = 'sacred' | 'profane' | 'neutral' | null;
type ParticleKind = 'dust' | 'steam' | 'spark';

interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  opacity: number;
  life: number;
  maxLife: number;
  r: number; g: number; b: number;
}

interface PhaseConfig {
  dustCount:  number;
  steamCount: number;
  sparkCount: number;
  speedMult:  number;
  masterOpacity: number; // canvas globalAlpha envelope
}

const PHASE_CONFIGS: Record<Phase, PhaseConfig> = {
  dormant:  { dustCount: 18, steamCount:  8, sparkCount:  0, speedMult: 0.45, masterOpacity: 0.55 },
  terminal: { dustCount: 35, steamCount: 14, sparkCount:  6, speedMult: 0.75, masterOpacity: 0.80 },
  awakened: { dustCount: 55, steamCount: 20, sparkCount: 22, speedMult: 1.20, masterOpacity: 1.00 },
  oracle:   { dustCount: 42, steamCount: 16, sparkCount:  8, speedMult: 0.90, masterOpacity: 0.90 },
};

function alignmentColor(alignment: Alignment): [number, number, number] {
  if (alignment === 'sacred')  return [234, 179,   8];  // gold
  if (alignment === 'profane') return [176,  38, 255];  // purple
  return [0, 255, 136];                                  // neon green
}

function createParticle(
  kind: ParticleKind,
  w: number, h: number,
  r: number, g: number, b: number,
  fromBottom = false,
): Particle {
  if (kind === 'steam') {
    const x = Math.random() * w;
    const baseY = h * (0.65 + Math.random() * 0.35); // bottom 35% of screen
    return {
      kind, x,
      y: fromBottom ? h + 10 : baseY,
      size:   Math.random() * 22 + 10,
      speedX: (Math.random() - 0.5) * 0.28,
      speedY: -(Math.random() * 0.55 + 0.18),
      opacity: Math.random() * 0.12 + 0.05,
      life: Math.random() * 260 + 140,
      maxLife: 400,
      r: 200, g: 230, b: 255, // cool blue-white steam
    };
  }

  if (kind === 'spark') {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 3.5 + 1.5;
    return {
      kind,
      x: Math.random() * w,
      y: fromBottom ? h + 5 : Math.random() * h,
      size:   Math.random() * 1.6 + 0.6,
      speedX: Math.cos(angle) * speed,
      speedY: Math.sin(angle) * speed - 1.2, // slight upward bias
      opacity: Math.random() * 0.7 + 0.3,
      life: Math.random() * 45 + 15,
      maxLife: 60,
      r, g, b,
    };
  }

  // dust
  return {
    kind,
    x: Math.random() * w,
    y: fromBottom ? h + 20 : Math.random() * h,
    size:   Math.random() * 3.5 + 1,
    speedX: (Math.random() - 0.5) * 0.45,
    speedY: -(Math.random() * 1.2 + 0.15),
    opacity: Math.random() * 0.38 + 0.08,
    life: Math.random() * 200 + 100,
    maxLife: 300,
    r, g, b,
  };
}

function buildPool(
  config: PhaseConfig,
  w: number, h: number,
  r: number, g: number, b: number,
): Particle[] {
  const pool: Particle[] = [];
  for (let i = 0; i < config.dustCount;  i++) pool.push(createParticle('dust',  w, h, r, g, b));
  for (let i = 0; i < config.steamCount; i++) pool.push(createParticle('steam', w, h, r, g, b));
  for (let i = 0; i < config.sparkCount; i++) pool.push(createParticle('spark', w, h, r, g, b));
  return pool;
}

export function useAtmosphere(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  phase: Phase,
  alignment: Alignment,
) {
  const particlesRef        = useRef<Particle[]>([]);
  const rafRef              = useRef<number>(0);
  const masterOpacityRef    = useRef(0);
  const configRef           = useRef<PhaseConfig>(PHASE_CONFIGS[phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const p = canvas.parentElement;
      if (p) { canvas.width = p.clientWidth; canvas.height = p.clientHeight; }
    };
    window.addEventListener('resize', resize);
    resize();

    const w = () => canvas.width;
    const h = () => canvas.height;

    const [r, g, b] = alignmentColor(alignment);
    const config = PHASE_CONFIGS[phase] ?? PHASE_CONFIGS.dormant;
    configRef.current = config;

    // Rebuild particle pool on phase change — splice to desired counts
    // (avoid full clear to prevent popping)
    const current = particlesRef.current;
    const desired = config.dustCount + config.steamCount + config.sparkCount;
    if (current.length === 0) {
      particlesRef.current = buildPool(config, w(), h(), r, g, b);
    } else if (current.length < desired) {
      const extra = desired - current.length;
      for (let i = 0; i < extra; i++) {
        const kind = i < config.sparkCount ? 'spark' : i < config.sparkCount + config.steamCount ? 'steam' : 'dust';
        current.push(createParticle(kind, w(), h(), r, g, b, true));
      }
    } else if (current.length > desired + 20) {
      particlesRef.current = current.slice(0, desired);
    }

    const render = () => {
      const cfg = configRef.current;
      // Smooth master opacity
      masterOpacityRef.current += (cfg.masterOpacity - masterOpacityRef.current) * 0.025;

      ctx.clearRect(0, 0, w(), h());
      ctx.save();
      ctx.globalAlpha = masterOpacityRef.current;

      const speed = cfg.speedMult;

      particlesRef.current.forEach((p, idx) => {
        p.x += p.speedX * speed;
        p.y += p.speedY * speed;
        p.life--;

        const lifeFrac = p.life / p.maxLife;
        // Fade in for first 15% of life, hold, fade out last 20%
        let alpha = p.opacity;
        if (lifeFrac > 0.85) alpha *= (1 - lifeFrac) / 0.15;
        else if (lifeFrac < 0.20) alpha *= lifeFrac / 0.20;

        if (p.kind === 'spark') {
          // Sparks: tiny bright dot, no gradient needed
          ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Dust + steam: soft radial glow
          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
          grad.addColorStop(0, `rgba(${p.r},${p.g},${p.b},${alpha.toFixed(3)})`);
          grad.addColorStop(1, `rgba(${p.r},${p.g},${p.b},0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }

        // Reset when dead or OOB
        if (p.life <= 0 || p.y < -60 || p.x < -60 || p.x > w() + 60) {
          const kind = idx < cfg.sparkCount ? 'spark' : idx < cfg.sparkCount + cfg.steamCount ? 'steam' : 'dust';
          particlesRef.current[idx] = createParticle(kind, w(), h(), r, g, b, true);
        }
      });

      // Occasional scanline glitch in awakened/oracle
      if ((phase === 'awakened' || phase === 'oracle') && Math.random() > 0.97) {
        ctx.fillStyle = `rgba(${r},${g},${b},${(Math.random() * 0.04).toFixed(3)})`;
        ctx.fillRect(0, Math.random() * h(), w(), Math.random() * 3 + 1);
      }

      ctx.restore();
      rafRef.current = requestAnimationFrame(render);
    };

    cancelAnimationFrame(rafRef.current);
    render();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, [canvasRef, phase, alignment]);
}
