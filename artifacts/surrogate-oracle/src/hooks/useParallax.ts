/**
 * useParallax — mouse-driven depth parallax for XR immersion.
 *
 * Writes CSS transforms directly to DOM elements via RAF (no re-renders).
 *
 * Depth model (all elements shift in the same direction as the cursor,
 * but at different magnitudes — more movement = "closer" to viewer):
 *
 *   oracle-alley    0.028×  far background — barely moves, creates depth anchor
 *   oracle-center   0.010×  mid — the Oracle cabinet is the stable focal point
 *   oracle-branding 0.018×  near glass — letterforms float slightly in front
 */
import { useEffect } from 'react';

const LERP = 0.06; // interpolation speed — lower = smoother/lazier

export function useParallax(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    if (window.matchMedia('(hover: none)').matches) return; // skip touch

    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let rafId = 0;

    const onMouseMove = (e: MouseEvent) => {
      // Normalise to [-1, 1] relative to viewport centre
      targetX = (e.clientX - window.innerWidth  / 2) / (window.innerWidth  / 2);
      targetY = (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2);
    };

    const tick = () => {
      currentX += (targetX - currentX) * LERP;
      currentY += (targetY - currentY) * LERP;

      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // ── Alley (far) ── full-viewport element, no centering offset
      const alley = document.querySelector('.oracle-alley') as HTMLElement | null;
      if (alley) {
        const dx = (currentX * vw * 0.028).toFixed(2);
        const dy = (currentY * vh * 0.016).toFixed(2);
        // scale(1.07) ensures edges stay hidden as the image shifts
        alley.style.transform = `translate(${dx}px, ${dy}px) scale(1.07)`;
      }

      // ── Cabinet (mid) ── positioned with translate(-50%, -50%) in CSS
      const cabinet = document.querySelector('.oracle-center') as HTMLElement | null;
      if (cabinet) {
        const dx = (currentX * vw * 0.010).toFixed(2);
        const dy = (currentY * vh * 0.006).toFixed(2);
        cabinet.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      }

      // ── Branding (near glass) ── positioned with translateX(-50%) in CSS
      const branding = document.querySelector('.oracle-branding') as HTMLElement | null;
      if (branding) {
        const dx = (currentX * vw * 0.018).toFixed(2);
        const dy = (currentY * vh * 0.008).toFixed(2);
        branding.style.transform = `translate(calc(-50% + ${dx}px), ${dy}px)`;
      }

      rafId = requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    rafId = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      cancelAnimationFrame(rafId);
      // Reset transforms to CSS defaults
      const alley = document.querySelector('.oracle-alley') as HTMLElement | null;
      if (alley) alley.style.transform = '';
      const cabinet = document.querySelector('.oracle-center') as HTMLElement | null;
      if (cabinet) cabinet.style.transform = '';
      const branding = document.querySelector('.oracle-branding') as HTMLElement | null;
      if (branding) branding.style.transform = '';
    };
  }, [enabled]);
}
