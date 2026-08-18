/**
 * useGPUTier — one-shot GPU capability probe with graceful WebGL fallback.
 *
 * Wraps detect-gpu's benchmark lookup and collapses the result into a simple
 * 0–3 tier the render stack can key off:
 *
 *   0 — WebGL unsupported / blocklisted / runtime-degraded. Bare avatar only.
 *   1 — weak GPU (old mobile). Avatar + faint dust + light bloom.
 *   2 — mid GPU. Full particle set, physics debris, full post stack.
 *   3 — strong GPU. Higher counts, higher DPR ceiling.
 *
 * The probe runs once per tab (module-level cache + sessionStorage) so
 * re-entering seekers never pay the benchmark fetch twice. If the benchmark
 * CDN is unreachable, we fall back to a conservative tier rather than failing.
 */
import { useEffect, useState } from 'react';
import { getGPUTier } from 'detect-gpu';

export interface GPUProfile {
  /** 0 (no effects) → 3 (everything, high DPR). */
  tier: 0 | 1 | 2 | 3;
  isMobile: boolean;
  /** false until the async probe resolves — callers get a safe default meanwhile. */
  ready: boolean;
}

/** Safe default while probing: mid-tier so the initial mount matches the
 *  pre-existing renderer settings (antialias on, standard DPR). */
const DEFAULT_PROFILE: GPUProfile = { tier: 2, isMobile: false, ready: false };

const STORAGE_KEY = 'oracle_gpu_profile_v1';

let cached: GPUProfile | null = null;
let pending: Promise<GPUProfile> | null = null;

function readSessionCache(): GPUProfile | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.tier !== 'number') return null;
    return {
      tier: Math.max(0, Math.min(3, parsed.tier)) as GPUProfile['tier'],
      isMobile: !!parsed.isMobile,
      ready: true,
    };
  } catch {
    return null;
  }
}

function getWebGLRendererInfo(): { renderer: string; isMobile: boolean } {
  try {
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return { renderer: '', isMobile };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = ext ? (gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : (gl.getParameter(gl.RENDERER) || '');
    return { renderer: String(renderer), isMobile };
  } catch {
    return { renderer: '', isMobile: false };
  }
}

function heuristicTierFromRenderer(renderer: string, isMobile: boolean): GPUProfile['tier'] {
  const r = renderer.toLowerCase();
  if (!r) return isMobile ? 1 : 2;
  // Software / headless emulation
  if (r.includes('swiftshader') || r.includes('llvmpipe') || r.includes('softpipe') || r.includes('software')) {
    return 1;
  }
  // High-end desktop / Apple Silicon / modern discrete
  if (
    r.includes('rtx') ||
    r.includes('geforce') ||
    r.includes('radeon') ||
    r.includes('apple m') ||
    r.includes('apple gpu') ||
    r.includes('quadro') ||
    r.includes('arc') ||
    r.includes('gtx')
  ) {
    return isMobile ? 2 : 3;
  }
  // Modern integrated / mid-range
  if (r.includes('iris') || r.includes('intel') || r.includes('mali') || r.includes('adreno')) {
    return 2;
  }
  return isMobile ? 1 : 2;
}

function probe(): Promise<GPUProfile> {
  if (cached) return Promise.resolve(cached);

  const fromSession = readSessionCache();
  if (fromSession) {
    cached = fromSession;
    return Promise.resolve(cached);
  }

  if (!pending) {
    pending = getGPUTier({ failIfMajorPerformanceCaveat: false })
      .then((result) => {
        const unsupported =
          result.type === 'WEBGL_UNSUPPORTED' || result.type === 'BLOCKLISTED';
        if (unsupported) {
          cached = { tier: 0, isMobile: !!result.isMobile, ready: true };
          try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cached)); } catch {}
          return cached;
        }

        let tier = Math.max(0, Math.min(3, result.tier)) as GPUProfile['tier'];
        const isMobile = !!result.isMobile;

        // If detect-gpu returned tier 1 on a capable desktop (e.g. unknown GPU string / missing benchmark),
        // use fast hardware heuristic to prevent stranding strong machines at tier 1.
        if (tier <= 1 && !isMobile) {
          const { renderer } = getWebGLRendererInfo();
          const heuristic = heuristicTierFromRenderer(renderer, false);
          if (heuristic > tier) {
            tier = heuristic;
          }
        }

        cached = { tier, isMobile, ready: true };
        try {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
        } catch { /* storage full / private mode — probe again next tab */ }
        return cached;
      })
      .catch(() => {
        // Benchmark fetch failed (offline / CDN blocked).
        // Fall back to hardware heuristic instead of blindly sticking to tier 1.
        // DO NOT write network-failure fallback to sessionStorage so reload can retry detect-gpu.
        const { renderer, isMobile } = getWebGLRendererInfo();
        const tier = heuristicTierFromRenderer(renderer, isMobile);
        cached = { tier, isMobile, ready: true };
        return cached;
      });
  }
  return pending;
}

export function useGPUTier(): GPUProfile {
  const [profile, setProfile] = useState<GPUProfile>(() => cached ?? DEFAULT_PROFILE);

  useEffect(() => {
    if (cached) { setProfile(cached); return; }
    let mounted = true;
    probe().then((p) => { if (mounted) setProfile(p); });
    return () => { mounted = false; };
  }, []);

  return profile;
}
