/**
 * useParallax — gyro/mouse depth parallax with phase-aware intensity.
 *
 * Six depth targets at different multipliers so everything moves at its own
 * spatial layer. The depth frame (foreground) moves most; the alley (far bg)
 * moves least. On mobile the cabinet also gets gyro-driven 3D rotateX/Y tilt.
 *
 * Depth order (near → far):
 *   depth-frame   0.058×  foreground CRT border — feels closest, moves most
 *   side-bleeds   0.040×  near-mid off-screen neon
 *   branding      0.018×  near glass — title floats slightly in front
 *   cabinet       0.010× + rotateX/Y — mid, the stable focal point
 *   mid-haze      0.022×  mid-ground haze separator
 *   alley         0.028×  far background — barely moves, depth anchor
 *   floor-refl    0.014×  floor (less parallax = feels grounded)
 *
 * Phase intensity multiplier:
 *   dormant  0.35× — subtle, world is nearly still
 *   terminal 0.55× — lore is the focus, motion stays peripheral
 *   awakened 1.00× — full spatial presence
 *   oracle   1.00× — full
 */
import { useEffect } from 'react';

type Phase = 'dormant' | 'terminal' | 'awakened' | 'oracle';

const LERP      = 0.08; // Increased from 0.06 for more "fidelity" responsiveness
const GYRO_LERP = 0.06; // Increased from 0.04
const GYRO_MAX_GAMMA = 25;
const GYRO_MAX_BETA  = 20;

const PHASE_INTENSITY: Record<Phase, number> = {
  dormant:  0.48, // Increased from 0.45
  terminal: 0.70, // Increased from 0.65
  awakened: 1.00,
  oracle:   1.20, // Increased from 1.00 for maximum oracle-phase engagement
};

export function useParallax(phase: Phase, onUpdate?: (x: number, y: number) => void) {
  useEffect(() => {
    const intensity = PHASE_INTENSITY[phase] ?? 1.0;

    let targetX = 0, targetY = 0;
    let currentX = 0, currentY = 0;
    let rafId = 0;
    let usingGyro = false;

    // ── Gyro input ────────────────────────────────────────────────────────────
    const onDeviceOrientation = (e: DeviceOrientationEvent) => {
      if (e.alpha === null && e.gamma === null) return;
      usingGyro = true;
      const gamma = Math.max(-GYRO_MAX_GAMMA, Math.min(GYRO_MAX_GAMMA, e.gamma ?? 0));
      const beta  = Math.max(-GYRO_MAX_BETA,  Math.min(GYRO_MAX_BETA,  (e.beta ?? 0) - 45));
      targetX =  gamma / GYRO_MAX_GAMMA;
      targetY =  beta  / GYRO_MAX_BETA;
    };

    // ── Mouse fallback (desktop) ──────────────────────────────────────────────
    const onMouseMove = (e: MouseEvent) => {
      if (usingGyro) return;
      targetX = (e.clientX - window.innerWidth  / 2) / (window.innerWidth  / 2);
      targetY = (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2);
    };

    const el = (sel: string) => document.querySelector(sel) as HTMLElement | null;

    const tick = () => {
      const lerp = usingGyro ? GYRO_LERP : LERP;
      currentX += (targetX - currentX) * lerp;
      currentY += (targetY - currentY) * lerp;

      const ix = currentX * intensity;
      const iy = currentY * intensity;
      
      if (onUpdate) onUpdate(ix, iy);

      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // ── Far background (alley) ────────────────────────────────────────────
      const alley = el('.oracle-alley');
      if (alley) {
        // scale(1.1) ensures edges stay hidden as the image shifts
        alley.style.transform =
          `translate(${ix * vw * 0.038}px, ${iy * vh * 0.022}px) scale(1.1)`;
      }

      // ── Floor reflection (grounded — least vertical parallax) ─────────────
      const floor = el('.oracle-floor-reflection');
      if (floor) {
        floor.style.transform =
          `translate(${ix * vw * 0.020}px, ${iy * vh * 0.010}px)`;
      }

      // ── Mid-ground haze ───────────────────────────────────────────────────
      const haze = el('.oracle-mid-haze');
      if (haze) {
        haze.style.transform =
          `translate(${ix * vw * 0.030}px, ${iy * vh * 0.018}px)`;
      }

      // ── Cabinet / Oracle center — 3D tilt (the hero effect) ───────────────
      // rotateY tracks left-right (gamma), rotateX tracks forward-back (beta).
      const cabinet = el('.oracle-center');
      if (cabinet) {
        const dx = ix * vw * 0.015;
        const dy = iy * vh * 0.010;
        const rotX = -iy * 14 * intensity; // Significantly increased rotation for "winning" depth
        const rotY =  ix * 16 * intensity;
        cabinet.style.transform =
          `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotateX(${rotX}deg) rotateY(${rotY}deg)`;
      }

      // ── Branding (near glass) ─────────────────────────────────────────────
      const branding = el('.oracle-branding');
      if (branding) {
        branding.style.transform =
          `translate(calc(-50% + ${ix * vw * 0.028}px), ${iy * vh * 0.014}px)`;
      }

      // ── Side bleeds (closer than branding) ───────────────────────────────
      const bleeds = el('.oracle-side-bleeds');
      if (bleeds) {
        bleeds.style.transform =
          `translate(${ix * vw * 0.052}px, ${iy * vh * 0.032}px)`;
      }

      // ── Depth frame (foreground CRT border — moves most = feels nearest) ──
      const frame = el('.oracle-depth-frame');
      if (frame) {
        frame.style.transform =
          `translate(${ix * vw * 0.075}px, ${iy * vh * 0.045}px)`;
      }

      // ── Light rays (mid, follows cabinet loosely) ─────────────────────────
      const rays = el('.oracle-light-rays');
      if (rays) {
        rays.style.transform =
          `translate(${ix * vw * 0.020}px, ${iy * vh * 0.012}px)`;
      }

      rafId = requestAnimationFrame(tick);
    };

    if (!window.matchMedia('(hover: none)').matches) {
      window.addEventListener('mousemove', onMouseMove, { passive: true });
    }
    window.addEventListener('deviceorientation', onDeviceOrientation, { passive: true });
    rafId = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('deviceorientation', onDeviceOrientation);
      cancelAnimationFrame(rafId);
      // Reset all transforms to CSS defaults
      ['.oracle-alley', '.oracle-floor-reflection', '.oracle-mid-haze',
       '.oracle-center', '.oracle-branding', '.oracle-side-bleeds',
       '.oracle-depth-frame', '.oracle-light-rays'].forEach(sel => {
        const node = el(sel);
        if (node) node.style.transform = '';
      });
    };
  }, [phase]); // re-runs when phase changes to update intensity
}
