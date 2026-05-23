/**
 * useParallax — depth parallax for XR immersion.
 *
 * Writes CSS transforms directly to DOM elements via RAF (no re-renders).
 * Input sources (whichever is available, gyro takes precedence on mobile):
 *   - DeviceOrientation API (gamma/beta tilt) — real gyroscope on mobile
 *   - mousemove — desktop fallback
 *
 * Depth model (all elements shift in the same direction as the input,
 * but at different magnitudes — more movement = "closer" to viewer):
 *
 *   oracle-alley    0.028×  far background — barely moves, creates depth anchor
 *   oracle-center   0.010×  mid — the Oracle cabinet is the stable focal point
 *   oracle-branding 0.018×  near glass — letterforms float slightly in front
 */
import { useEffect } from 'react';

const LERP = 0.06; // interpolation speed — lower = smoother/lazier
const GYRO_LERP = 0.04; // gyro is noisier — smoother interpolation
// Max tilt angle (degrees) mapped to [-1, 1] output
const GYRO_MAX_GAMMA = 25; // left-right
const GYRO_MAX_BETA  = 20; // front-back

export function useParallax(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let rafId = 0;
    let usingGyro = false;

    // ── Gyro input (mobile) ──────────────────────────────────────────────────
    // Guard: DeviceOrientationEvent.alpha being non-null indicates real sensor data.
    const onDeviceOrientation = (e: DeviceOrientationEvent) => {
      if (e.alpha === null && e.gamma === null) return; // simulated / unsupported
      usingGyro = true;
      // gamma: left-right tilt (-90° to +90°). beta: front-back (-180° to +180°).
      // Clamp to reasonable tilt range, normalise to [-1, 1].
      const gamma = Math.max(-GYRO_MAX_GAMMA, Math.min(GYRO_MAX_GAMMA, e.gamma ?? 0));
      const beta  = Math.max(-GYRO_MAX_BETA,  Math.min(GYRO_MAX_BETA,  (e.beta ?? 0) - 45));
      targetX =  gamma / GYRO_MAX_GAMMA;
      targetY =  beta  / GYRO_MAX_BETA;
    };

    // ── Mouse input (desktop) ────────────────────────────────────────────────
    const onMouseMove = (e: MouseEvent) => {
      if (usingGyro) return; // gyro wins when both are present
      targetX = (e.clientX - window.innerWidth  / 2) / (window.innerWidth  / 2);
      targetY = (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2);
    };

    const tick = () => {
      const lerp = usingGyro ? GYRO_LERP : LERP;
      currentX += (targetX - currentX) * lerp;
      currentY += (targetY - currentY) * lerp;

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

    // Mouse: only register on non-touch (hover capable) devices, but always
    // allow gyro so mobile gets motion without hover capability check.
    if (!window.matchMedia('(hover: none)').matches) {
      window.addEventListener('mousemove', onMouseMove, { passive: true });
    }
    window.addEventListener('deviceorientation', onDeviceOrientation, { passive: true });
    rafId = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('deviceorientation', onDeviceOrientation);
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
