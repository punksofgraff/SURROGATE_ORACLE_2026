/**
 * ParticleTypographyCard.tsx
 *
 * Holographic Particle Typography Engine for Knife Questions.
 *
 * Combines crystal-clear, full-scale typography (clamp(1.44rem, 4.2vw, 1.75rem))
 * with live GPU-style quantum particle sparks, ambient dust motes, and
 * a high-velocity radial kinetic shatter on Seeker selection.
 */

import React, { useEffect, useRef, useMemo, useState } from 'react';

interface ParticleTypographyCardProps {
  questionIndex: number;
  landedChars: number;
  isEmitting?: boolean;
  isSelected: boolean;
  isThisSelected: boolean;
  accentColor?: string;
  territory: string;
  question: string;
  /** Ghost transmissions reuse the particle engine without knife selection chrome. */
  variant?: 'knife' | 'ghost';
  /** Let non-interactive gates use the same letter-by-letter landing as knife cards. */
  autoType?: boolean;
  typingSpeedMs?: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  decay: number;
}

function gradientChar(i: number, total: number): string {
  const t = total > 1 ? i / (total - 1) : 0;
  // Sacred Green (#00ff88) -> Brand Cyan (#00ffcc)
  return `rgb(0, 255, ${Math.round(136 + 68 * t)})`;
}

export function ParticleTypographyCard({
  questionIndex,
  landedChars,
  isEmitting = false,
  isSelected,
  isThisSelected,
  accentColor = '#00ff88',
  territory,
  question,
  variant = 'knife',
  autoType = false,
  typingSpeedMs = 38,
}: ParticleTypographyCardProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sparksRef = useRef<Spark[]>([]);
  const prevLandedRef = useRef(0);
  const shatteredRef = useRef(false);
  const [autoLandedChars, setAutoLandedChars] = useState(autoType ? 0 : landedChars);
  const effectiveLandedChars = autoType ? autoLandedChars : landedChars;

  useEffect(() => {
    if (!autoType) {
      setAutoLandedChars(landedChars);
      return;
    }

    setAutoLandedChars(0);
    const timer = window.setInterval(() => {
      setAutoLandedChars(current => {
        if (current >= question.length) {
          window.clearInterval(timer);
          return current;
        }
        return current + 1;
      });
    }, typingSpeedMs);

    return () => window.clearInterval(timer);
  }, [autoType, landedChars, question, typingSpeedMs]);

  // Break question into words and characters
  const wordsData = useMemo(() => {
    const words = question.split(' ');
    let globalCharIdx = 0;
    const total = question.length;

    return words.map((word, wordIdx) => {
      const chars = word.split('');
      const wordStart = globalCharIdx;
      globalCharIdx += chars.length + 1; // +1 space

      return {
        word,
        wordIdx,
        wordStart,
        chars: chars.map((char, charIdx) => ({
          char,
          charIdx: wordStart + charIdx,
          color: gradientChar(wordStart + charIdx, total),
        })),
      };
    });
  }, [question]);

  // Spawn particle sparks when new letters land
  useEffect(() => {
    if (shatteredRef.current) return;
    if (effectiveLandedChars > prevLandedRef.current && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      for (let i = prevLandedRef.current; i < effectiveLandedChars; i++) {
        const el = containerRef.current.querySelector(`[data-char-idx="${i}"]`) as HTMLElement | null;
        if (el) {
          const rect = el.getBoundingClientRect();
          const relX = rect.left - containerRect.left + rect.width / 2;
          const relY = rect.top - containerRect.top + rect.height / 2;

           // Ghost lettering is viewed against a very dark, moving alley.
           // Give each landed character a readable burst instead of a
           // one-frame pinprick that disappears into the background.
           const count = variant === 'ghost'
             ? 8 + Math.floor(Math.random() * 5)
             : 3 + Math.floor(Math.random() * 3);
          for (let s = 0; s < count; s++) {
            const angle = Math.random() * Math.PI * 2;
             const speed = variant === 'ghost'
               ? 18 + Math.random() * 42
               : 25 + Math.random() * 45;
            sparksRef.current.push({
              x: relX + (Math.random() - 0.5) * 6,
              y: relY + (Math.random() - 0.5) * 6,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed - 15,
               radius: variant === 'ghost'
                 ? 1.8 + Math.random() * 2.2
                 : 1.2 + Math.random() * 1.6,
              color: Math.random() > 0.3 ? '#00ff88' : '#00ffcc',
              alpha: 1.0,
               decay: variant === 'ghost'
                 ? 0.65 + Math.random() * 0.45
                 : 1.8 + Math.random() * 1.2,
            });
          }
        }
      }
    }
    prevLandedRef.current = effectiveLandedChars;
  }, [effectiveLandedChars]);

  // Selection shatter explosion
  useEffect(() => {
    if (isSelected && isThisSelected && !shatteredRef.current && containerRef.current) {
      shatteredRef.current = true;
      const containerRect = containerRef.current.getBoundingClientRect();
      const charEls = containerRef.current.querySelectorAll(`[data-char-idx]`);

      // Explode all characters into a cloud of quantum particle shards
      charEls.forEach((el) => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        const relX = rect.left - containerRect.left + rect.width / 2;
        const relY = rect.top - containerRect.top + rect.height / 2;

        const centerX = containerRect.width / 2;
        const centerY = containerRect.height / 2;
        const dx = relX - centerX;
        const dy = relY - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;

        // Spawn 4-6 explosive shards per letter
        for (let s = 0; s < 5; s++) {
          const spreadAngle = (Math.random() - 0.5) * 0.8;
          const baseAngle = Math.atan2(dy, dx) + spreadAngle;
          const speed = 120 + Math.random() * 220;

          sparksRef.current.push({
            x: relX + (Math.random() - 0.5) * 8,
            y: relY + (Math.random() - 0.5) * 8,
            vx: Math.cos(baseAngle) * speed,
            vy: Math.sin(baseAngle) * speed - 30,
            radius: 1.5 + Math.random() * 2.2,
            color: Math.random() > 0.5 ? '#00ff88' : '#00ffcc',
            alpha: 1.0,
            decay: 0.85 + Math.random() * 0.45,
          });
        }
      });
    }
  }, [isSelected, isThisSelected]);

  // Canvas particle render loop
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
      ctx.save();
      ctx.scale(dpr, dpr);

      const sparks = sparksRef.current;
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vx *= 0.96;
        s.vy *= 0.96;
        s.alpha -= s.decay * dt;

        if (s.alpha <= 0.01) {
          sparks.splice(i, 1);
          continue;
        }

        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        ctx.fillStyle = s.color;
        ctx.globalAlpha = Math.max(0, s.alpha);
        ctx.fill();

        // Glow
        if (s.alpha > 0.4) {
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.radius * 2.2, 0, Math.PI * 2);
          ctx.fillStyle = s.color;
          ctx.globalAlpha = Math.max(0, s.alpha * 0.25);
          ctx.fill();
        }
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`oracle-knife-card-question${variant === 'ghost' ? ' oracle-ghost-particle-question' : ''}`}
      aria-label={question}
      style={{
        position: 'relative',
         width: variant === 'ghost' ? '100%' : '100%',
         minWidth: variant === 'ghost' ? '12rem' : undefined,
         minHeight: variant === 'ghost' ? '3.2rem' : undefined,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      {/* Dynamic Quantum Particle Canvas Overlay */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 12,
           display: 'block',
           overflow: 'visible',
           mixBlendMode: 'screen',
        }}
      />

      {/* Crystal-Clear, Full-Scale Typography Spans */}
      <div
        className={variant === 'ghost' ? 'oracle-ghost-particle-copy' : undefined}
        style={{
          fontFamily: "'PhillySans', 'Share Tech Mono', monospace",
          fontSize: 'clamp(1.44rem, 4.2vw, 1.75rem)',
          lineHeight: 1.72,
          letterSpacing: '0.02em',
          textAlign: 'center',
          maxWidth: '28ch',
          color: 'rgba(255, 255, 255, 0.95)',
          textShadow: '0 1px 14px rgba(0, 0, 0, 0.98), 0 0 24px rgba(0, 255, 136, 0.25)',
           opacity: isSelected && isThisSelected ? 0 : 1,
          transition: 'opacity 0.4s ease-out',
        }}
      >
        {wordsData.map(({ word, wordIdx, wordStart, chars }) => (
          <span
            key={wordIdx}
            style={{ display: 'inline-block', whiteSpace: 'nowrap', margin: '0 3px' }}
          >
            {chars.map(({ char, charIdx, color }) => {
              const isLanded = charIdx < effectiveLandedChars;
              return (
                <span
                  key={charIdx}
                  data-char-idx={charIdx}
                  className="oracle-knife-letter"
                  style={{
                    opacity: isLanded ? 1 : 0.08,
                    filter: isLanded ? 'none' : 'blur(2px)',
                    color: isLanded ? color : 'rgba(0, 255, 136, 0.25)',
                    textShadow: isLanded ? `0 0 12px ${color}88, 0 1px 14px rgba(0,0,0,0.98)` : 'none',
                    display: 'inline-block',
                    transition: 'opacity 0.35s ease-out, filter 0.35s ease-out, color 0.35s ease-out',
                  }}
                >
                  {char}
                </span>
              );
            })}
          </span>
        ))}
      </div>
    </div>
  );
}
