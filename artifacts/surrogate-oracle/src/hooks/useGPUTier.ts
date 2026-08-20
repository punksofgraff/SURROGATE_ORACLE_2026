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
  /** WebGPU is admitted only after adapter/device initialization succeeds. */
  webgpu: 'admitted' | 'unavailable' | 'pending';
  webgpuReason?: string;
}

/** Stay renderer-free until the probe proves a context is available. Starting
 * at tier 2 causes repeated Canvas construction failures on blocked WebGL
 * surfaces, which reads as a bright loading flash rather than a quiet fallback. */
const DEFAULT_PROFILE: GPUProfile = {
  tier: 0,
  isMobile: false,
  ready: false,
  webgpu: 'pending',
};

// Bump when renderer admission logic changes so a tab cannot reuse a profile
// created by the old eager-Canvas path.
const STORAGE_KEY = 'oracle_gpu_profile_v2';

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
      webgpu: parsed.webgpu === 'admitted' ? 'admitted' : 'unavailable',
      webgpuReason: typeof parsed.webgpuReason === 'string' ? parsed.webgpuReason : undefined,
    };
  } catch {
    return null;
  }
}

function getWebGLRendererInfo(): { renderer: string; isMobile: boolean; supported: boolean } {
  try {
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return { renderer: '', isMobile, supported: false };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = ext ? (gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : (gl.getParameter(gl.RENDERER) || '');
    return { renderer: String(renderer), isMobile, supported: true };
  } catch {
    return { renderer: '', isMobile: false, supported: false };
  }
}

async function probeWebGPU(): Promise<Pick<GPUProfile, 'webgpu' | 'webgpuReason'>> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
    return { webgpu: 'unavailable', webgpuReason: 'navigator.gpu unavailable' };
  }

  try {
    const canvas = document.createElement('canvas');
    const context = (canvas as unknown as {
      getContext: (contextId: string) => unknown;
    }).getContext('webgpu');
    if (!context) {
      return { webgpu: 'unavailable', webgpuReason: 'no WebGPU canvas context' };
    }
    const gpu = (navigator as Navigator & {
      gpu?: {
        requestAdapter: (options?: { powerPreference?: 'low-power' | 'high-performance' }) => Promise<{
        requestDevice: () => Promise<{ destroy?: () => void }>;
        } | null>;
      };
    }).gpu;
    const adapter = await gpu?.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return { webgpu: 'unavailable', webgpuReason: 'no WebGPU adapter' };
    const device = await adapter.requestDevice();
    device.destroy?.();
    return { webgpu: 'admitted' };
  } catch (error) {
    return {
      webgpu: 'unavailable',
      webgpuReason: error instanceof Error ? error.message : 'WebGPU device initialization failed',
    };
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
    pending = Promise.all([
      getGPUTier({ failIfMajorPerformanceCaveat: false }),
      probeWebGPU(),
    ]).then(([result, webgpu]) => {
        const unsupported =
          result.type === 'WEBGL_UNSUPPORTED' || result.type === 'BLOCKLISTED';
        if (unsupported) {
          // Safari can create and render a WebGL canvas while detect-gpu's
          // lookup reports a blocklisted/unknown renderer. Do not let that
          // delayed lookup turn the entrance field into a one-shot effect:
          // a proven WebGL context gets our lightest particle tier. A browser
          // that truly cannot create WebGL still receives the bare fallback.
          const { isMobile, supported } = getWebGLRendererInfo();
          cached = { tier: supported ? 1 : 0, isMobile: isMobile || !!result.isMobile, ready: true, ...webgpu };
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

        cached = { tier, isMobile, ready: true, ...webgpu };
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
        cached = { tier, isMobile, ready: true, webgpu: 'unavailable', webgpuReason: 'GPU capability probe failed' };
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
