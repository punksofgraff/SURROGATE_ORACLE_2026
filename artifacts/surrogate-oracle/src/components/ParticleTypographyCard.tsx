/**
 * ParticleTypographyCard.tsx
 *
 * Pre-Baked Holographic Particle Typography Engine for Knife Questions.
 *
 * Rather than static 2D HTML text spans, words assemble from glowing quantum
 * particle quarks as the Oracle speaks each question, locking into crisp
 * illuminated typography and shattering upon Seeker selection.
 */

import React, { useEffect, useRef } from 'react';
import { KNIFE_PARTICLE_DATA, type KnifeParticleQuestion } from '../data/knifeParticleData';

interface ParticleTypographyCardProps {
  questionIndex: number;
  landedChars: number;
  isEmitting?: boolean;
  isSelected: boolean;
  isThisSelected: boolean;
  onClick?: () => void;
  accentColor?: string;
  territory: string;
  question: string;
}

interface Particle {
  x: number;
  y: number;
  tx: number; // target x (0..1)
  ty: number; // target y (0..1)
  vx: number;
  vy: number;
  wordIdx: number;
  charIdx: number;
  isTitle: boolean;
  color: string;
  radius: number;
  alpha: number;
  phase: number;
}

export function ParticleTypographyCard({
  questionIndex,
  landedChars,
  isEmitting = false,
  isSelected,
  isThisSelected,
  onClick,
  accentColor = '#00ff88',
  territory,
  question,
}: ParticleTypographyCardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const shatteredRef = useRef(false);
  const landedCharsRef = useRef(landedChars);
  const isThisSelectedRef = useRef(isThisSelected);
  const isSelectedRef = useRef(isSelected);

  landedCharsRef.current = landedChars;
  isThisSelectedRef.current = isThisSelected;
  isSelectedRef.current = isSelected;

  // Initialize particles from pre-baked coordinate data
  useEffect(() => {
    const data: KnifeParticleQuestion | undefined = KNIFE_PARTICLE_DATA[questionIndex];
    if (!data) return;

    const list: Particle[] = [];

    // 1. Territory title header points
    for (const [nx, ny, wordIdx, charIdx] of data.territoryPoints) {
      list.push({
        x: nx + (Math.random() - 0.5) * 0.15,
        y: ny + (Math.random() - 0.5) * 0.15,
        tx: nx,
        ty: ny,
        vx: 0,
        vy: 0,
        wordIdx,
        charIdx,
        isTitle: true,
        color: '#00ffcc',
        radius: 1.4 + Math.random() * 0.6,
        alpha: 0.85,
        phase: Math.random() * Math.PI * 2,
      });
    }

    // 2. Question body points
    const totalChars = data.totalChars;
    for (const [nx, ny, wordIdx, charIdx] of data.questionPoints) {
      const gradT = totalChars > 1 ? charIdx / (totalChars - 1) : 0;
      const b = Math.round(136 + 68 * gradT);
      const col = `rgb(0, 255, ${b})`;

      list.push({
        x: nx + (Math.random() - 0.5) * 0.35,
        y: ny + (Math.random() - 0.5) * 0.25,
        tx: nx,
        ty: ny,
        vx: (Math.random() - 0.5) * 0.002,
        vy: (Math.random() - 0.5) * 0.002,
        wordIdx,
        charIdx,
        isTitle: false,
        color: col,
        radius: 1.3 + Math.random() * 0.8,
        alpha: 0.2,
        phase: Math.random() * Math.PI * 2,
      });
    }

    particlesRef.current = list;
    shatteredRef.current = false;
  }, [questionIndex]);

  // Main high-performance render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animId: number;
    let lastT = performance.now();

    const render = (now: number) => {
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;

      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const rect = canvas.getBoundingClientRect();
      const w = Math.floor(rect.width * dpr);
      const h = Math.floor(rect.height * dpr);

      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      ctx.clearRect(0, 0, w, h);

      const particles = particlesRef.current;
      const curLanded = landedCharsRef.current;
      const isSel = isSelectedRef.current;
      const isThisSel = isThisSelectedRef.current;

      // Shatter explosion trigger
      if (isSel && isThisSel && !shatteredRef.current) {
        shatteredRef.current = true;
        for (const p of particles) {
          const dx = p.x - 0.5;
          const dy = p.y - 0.5;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
          const force = (0.8 + Math.random() * 1.4);
          p.vx = (dx / dist) * force;
          p.vy = (dy / dist) * force - 0.2;
        }
      }

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        if (shatteredRef.current) {
          // Shatter physics: fly outward & fade
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.alpha = Math.max(0, p.alpha - dt * 0.9);
        } else {
          // Normal state physics
          const isRevealed = p.isTitle || p.charIdx < curLanded;

          if (isRevealed) {
            // Spring toward target glyph position
            const targetX = p.tx;
            const targetY = p.ty;

            const dx = targetX - p.x;
            const dy = targetY - p.y;

            // Elastic spring
            const spring = p.isTitle ? 32 : 24;
            const damping = 7.5;

            p.vx += (dx * spring - p.vx * damping) * dt;
            p.vy += (dy * spring - p.vy * damping) * dt;

            p.x += p.vx * dt;
            p.y += p.vy * dt;

            // Target alpha
            const targetAlpha = p.isTitle ? 0.95 : (0.85 + Math.sin(now * 0.003 + p.phase) * 0.12);
            p.alpha += (targetAlpha - p.alpha) * Math.min(1, dt * 10);
          } else {
            // Ambient drift waiting for word to be spoken
            const noise = Math.sin(now * 0.0015 + p.phase);
            p.x += (Math.cos(now * 0.001 + p.phase) * 0.02 - (p.x - p.tx) * 0.8) * dt;
            p.y += (noise * 0.02 - (p.y - p.ty) * 0.8) * dt;

            const targetAlpha = 0.18 + Math.sin(now * 0.002 + p.phase) * 0.08;
            p.alpha += (targetAlpha - p.alpha) * Math.min(1, dt * 4);
          }
        }

        if (p.alpha <= 0.01) continue;

        // Draw particle
        const px = p.x * w;
        const py = p.y * h;
        const r = p.radius * dpr;

        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();

        // Extra glow on formed/active particles
        if (p.alpha > 0.7) {
          ctx.beginPath();
          ctx.arc(px, py, r * 2.2, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = p.alpha * 0.25;
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1.0;
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <div
      className="oracle-particle-typography-card"
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`${territory}: ${question}`}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: '220px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: isSelected ? 'default' : 'pointer',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          pointerEvents: 'none',
        }}
      />
      {/* Invisible screen-reader text for accessibility */}
      <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}>
        {territory}: {question}
      </span>
    </div>
  );
}
