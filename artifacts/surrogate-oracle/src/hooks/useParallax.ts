/**
 * useParallax — gyro/mouse/touch depth parallax + pinch zoom with phase-aware intensity.
 *
 * Input sources (auto-detected, priority order):
 *   1. Gyro (DeviceOrientationEvent) — mobile physical tilt
 *   2. Touch drag (1 finger) — mobile touch look-around when no gyro
 *   3. Mouse move — desktop look-around
 *
 * Zoom inputs (independent, additive):
 *   • Pinch (2-finger touch) — zoom in/out on the 3D avatar
 *   • Scroll wheel (desktop) — zoom in/out
 *
 * Depth order (near → far):
 *   depth-frame   0.058×  foreground CRT border — feels closest, moves most
 *   side-bleeds   0.040×  near-mid off-screen neon
 *   branding      0.018×  near glass — title floats slightly in front
 *   cabinet       0.010× + rotateX/Y — mid, the stable focal point
 *   mid-haze      0.022×  mid-ground haze separator
 *   alley         0.028×  far background — barely moves, depth anchor
 *   floor-refl    0.014×  floor (less parallax = feels grounded)
 */
import { useEffect } from 'react';
import { needsDeviceOrientationPermission, requestDeviceOrientationPermission } from '../lib/browserCapabilities';

type Phase = 'dormant' | 'terminal' | 'tour' | 'awakened' | 'oracle';

const LERP           = 0.09;
const GYRO_LERP      = 0.10; // more responsive gyro tracking on phone
const ZOOM_LERP      = 0.09; // zoom catches up slightly faster than look-around
const GYRO_MAX_GAMMA = 25;
const GYRO_MAX_BETA  = 20;
const ZOOM_MIN       = 1.0;
const ZOOM_MAX       = 4.0;

const PHASE_INTENSITY: Record<Phase, number> = {
  dormant:  0.48,
  terminal: 0.70,
  tour:     0.85,
  awakened: 1.00,
  oracle:   1.20,
};

const clamp = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v));

export function useParallax(
  phase: Phase,
  onUpdate?: (x: number, y: number) => void,
  onZoom?:   (zoom: number) => void,
) {
  useEffect(() => {
    const intensity = PHASE_INTENSITY[phase] ?? 1.0;

    // Entrance settle: when the Oracle materializes, ramp parallax from 0 → full over
    // ~1.5s. A phone held at a resting tilt otherwise feeds a non-zero gyro offset the
    // instant the avatar appears, shoving it sideways in the cabinet on manifestation.
    // The ramp guarantees the avatar arrives dead-center, then eases the Mona Lisa
    // follow in. Only the oracle phase needs it — earlier phases are static/ghostly.
    const ENTRANCE_SETTLE_MS = 1500;
    const settleStart = performance.now();
    const settleGate = () => {
      if (phase !== 'oracle') return 1;
      const p = Math.min(1, (performance.now() - settleStart) / ENTRANCE_SETTLE_MS);
      // easeOutCubic — quick to reach near-full, gentle final approach
      return 1 - Math.pow(1 - p, 3);
    };

    let targetX = 0, targetY = 0;
    let currentX = 0, currentY = 0;
    let targetZoom = 1.0, currentZoom = 1.0;
    let rafId = 0;
    let usingGyro = false;
    let gyroActive = false;

    // Pinch tracking
    let pinchInitialDist = 0;
    let pinchBaseZoom    = 1.0;

    // Touch drag tracking (single finger, non-gyro fallback)
    let touchDragStart: { x: number; y: number } | null = null;

    // ── Gyro input ────────────────────────────────────────────────────────────
    const onDeviceOrientation = (e: DeviceOrientationEvent) => {
      if (e.alpha === null && e.gamma === null) return;
      if (!gyroActive) {
        gyroActive = true;
        usingGyro = true;
      }
      const gamma = Math.max(-GYRO_MAX_GAMMA, Math.min(GYRO_MAX_GAMMA, e.gamma ?? 0));
      const beta  = Math.max(-GYRO_MAX_BETA,  Math.min(GYRO_MAX_BETA,  (e.beta ?? 0) - 45));
      targetX =  gamma / GYRO_MAX_GAMMA;
      targetY =  beta  / GYRO_MAX_BETA;
    };

    // Capability check — more reliable than UA sniffing (catches iPads in desktop mode,
    // iOS Chrome, and any future UA changes).
    const needsPermission = needsDeviceOrientationPermission();

    if (!needsPermission) {
      // Android / desktop — gyro fires without a permission dialog
      window.addEventListener('deviceorientation', onDeviceOrientation, { passive: true });
    }

    // Request gyro permission on first touch (iOS Safari requires a user-gesture call)
    const requestGyroOnTouch = async () => {
      if (!needsPermission || gyroActive) return;
      const granted = await requestDeviceOrientationPermission('[Parallax]');
      if (granted) {
        gyroActive = true;
        usingGyro = true;
        window.addEventListener('deviceorientation', onDeviceOrientation, { passive: true });
      }
    };

    // ── Mouse fallback (desktop) ──────────────────────────────────────────────
    const onMouseMove = (e: MouseEvent) => {
      if (usingGyro) return;
      targetX = (e.clientX - window.innerWidth  / 2) / (window.innerWidth  / 2);
      targetY = (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2);
    };

    // ── Scroll wheel zoom (desktop) ───────────────────────────────────────────
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      targetZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, targetZoom - e.deltaY * 0.0015));
    };

    // ── Touch events (mobile) ─────────────────────────────────────────────────
    const onTouchStart = (e: TouchEvent) => {
      if (needsPermission && e.touches.length === 1) {
        requestGyroOnTouch();
      }

      if (e.touches.length === 2) {
        pinchInitialDist = Math.hypot(
          e.touches[1].clientX - e.touches[0].clientX,
          e.touches[1].clientY - e.touches[0].clientY,
        );
        pinchBaseZoom = targetZoom;
        touchDragStart = null;
      } else if (e.touches.length === 1 && !usingGyro) {
        touchDragStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchInitialDist > 0) {
        e.preventDefault();
        const dist  = Math.hypot(
          e.touches[1].clientX - e.touches[0].clientX,
          e.touches[1].clientY - e.touches[0].clientY,
        );
        const scale = dist / pinchInitialDist;
        targetZoom  = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, pinchBaseZoom * scale));
      } else if (e.touches.length === 1 && touchDragStart && !usingGyro) {
        const dx = e.touches[0].clientX - touchDragStart.x;
        const dy = e.touches[0].clientY - touchDragStart.y;
        targetX   = Math.max(-1, Math.min(1, dx / (window.innerWidth  * 0.4)));
        targetY   = Math.max(-1, Math.min(1, dy / (window.innerHeight * 0.4)));
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        pinchInitialDist = 0;
        if (e.touches.length === 0) touchDragStart = null;
      }
    };

    const el = (sel: string) => document.querySelector(sel) as HTMLElement | null;

    const tick = () => {
      const lerpXY = usingGyro ? GYRO_LERP : LERP;
      currentX    += (targetX    - currentX)    * lerpXY;
      currentY    += (targetY    - currentY)    * lerpXY;
      currentZoom += (targetZoom - currentZoom) * ZOOM_LERP;

      const gate = settleGate();
      const ix = currentX * intensity * gate;
      const iy = currentY * intensity * gate;

      if (onUpdate) onUpdate(ix, iy);
      if (onZoom && Math.abs(currentZoom - 1) > 0.001) onZoom(currentZoom);

      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // ── Far background (alley) ────────────────────────────────────────────
      const alley = el('.oracle-alley');
      if (alley) {
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
      // Clamp the envelope so the face NEVER tilts/shifts far enough to clip
      // out of the cabinet frame ("wing clipping" during Oracle speech). The
      // old rotation multiplied by intensity twice (ix/iy already carry it),
      // which at oracle intensity (1.2) pushed tilt past ±20°. Parallax stays
      // on at every phase — it just can't throw the face off-center anymore.
      const cabinet = el('.oracle-center');
      if (cabinet) {
        // Keep the hero's measured center locked to the cabinet/stage center.
        // Horizontal depth motion remains visible in the alley, branding, and
        // side-bleed layers; moving the hero itself makes a resting iPhone
        // gyro tilt read as a persistent right-shift rather than parallax.
        const dx   = 0;
        const dy   = clamp(iy * vh * 0.010, vh * 0.012);
        const rotX = clamp(-iy * 14, 9);
        const rotY = clamp( ix * 16, 10);
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

    const isTouchDevice = window.matchMedia('(hover: none)').matches;
    if (!isTouchDevice) {
      window.addEventListener('mousemove', onMouseMove, { passive: true });
      window.addEventListener('wheel', onWheel, { passive: false });
    }
    window.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove',  onTouchMove,  { passive: false });
    window.addEventListener('touchend',   onTouchEnd,   { passive: true });
    rafId = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('deviceorientation', onDeviceOrientation);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove',  onTouchMove);
      window.removeEventListener('touchend',   onTouchEnd);
      cancelAnimationFrame(rafId);
      ['.oracle-alley', '.oracle-floor-reflection', '.oracle-mid-haze',
       '.oracle-center', '.oracle-branding', '.oracle-side-bleeds',
       '.oracle-depth-frame', '.oracle-light-rays'].forEach(sel => {
        const node = el(sel);
        if (node) node.style.transform = '';
      });
    };
  }, [phase]);
}