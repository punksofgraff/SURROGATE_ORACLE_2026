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
  /** WebGPU is preferred; WebGL is only the compatibility fallback. */
  backend: 'webgpu' | 'webgl' | 'none';
  isMobile: boolean;
  /** false until the async probe resolves — callers get a safe default meanwhile. */
  ready: boolean;
}

/** Stay renderer-free until the probe proves a context is available. Starting
 * at tier 2 causes repeated Canvas construction failures on blocked WebGL
 * surfaces, which reads as a bright loading flash rather than a quiet fallback. */
const DEFAULT_PROFILE: GPUProfile = { tier: 0, backend: 'none', isMobile: false, ready: false };

// Bump when renderer admission logic changes so a tab cannot reuse a profile
// created by the old eager-Canvas path.
const STORAGE_KEY = 'oracle_gpu_profile_v3';

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
      backend: parsed.backend === 'webgpu' || parsed.backend === 'webgl' ? parsed.backend : 'none',
      isMobile: !!parsed.isMobile,
      ready: true,
    };
  } catch {
    return null;
  }
}

type WebGPUProbe = {
  requestAdapter: (options?: { powerPreference?: 'low-power' | 'high-performance' }) => Promise<{
    requestDevice: () => Promise<{ destroy?: () => void }>;
  } | null>;
  getPreferredCanvasFormat: () => string;
};

type WebGPUCanvasContext = {
  configure: (configuration: { device: unknown; format: string; alphaMode: 'premultiplied' }) => void;
  unconfigure?: () => void;
};

async function probeWebGPU(): Promise<{ supported: boolean; isMobile: boolean }> {
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  const gpu = (navigator as Navigator & { gpu?: WebGPUProbe }).gpu;
  if (!gpu) return { supported: false, isMobile };

  let device: { destroy?: () => void } | null = null;
  let context: WebGPUCanvasContext | null = null;
  try {
    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return { supported: false, isMobile };
    device = await adapter.requestDevice();
    const canvas = document.createElement('canvas');
    context = canvas.getContext('webgpu') as WebGPUCanvasContext | null;
    if (!context) return { supported: false, isMobile };
    context.configure({
      device,
      format: gpu.getPreferredCanvasFormat(),
      alphaMode: 'premultiplied',
    });
    return { supported: true, isMobile };
  } catch {
    return { supported: false, isMobile };
  } finally {
    context?.unconfigure?.();
    device?.destroy?.();
  }
}

function getWebGLRendererInfo(): { renderer: string; isMobile: boolean; supported: boolean } {
  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  try {
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    const canvas = document.createElement('canvas');
    gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return { renderer: '', isMobile, supported: false };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = ext ? (gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : (gl.getParameter(gl.RENDERER) || '');
    return { renderer: String(renderer), isMobile, supported: true };
  } catch {
    return { renderer: '', isMobile: false, supported: false };
  } finally {
    // Do not keep the probe context alive. Mobile browsers commonly cap the
    // number of simultaneous contexts, and a retained probe can make the
    // actual R3F Canvas fail even though this check succeeded.
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
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
    pending = probeWebGPU().then(async (webgpu) => {
      if (webgpu.supported) {
        cached = {
          tier: webgpu.isMobile ? 2 : 3,
          backend: 'webgpu',
          isMobile: webgpu.isMobile,
          ready: true,
        };
        try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cached)); } catch {}
        return cached;
      }

      // Only admit WebGL after a real context probe succeeds. In particular,
      // do not let detect-gpu's heuristic report a tier when the browser has
      // WebGL disabled, because that would still mount R3F and throw.
      const rendererInfo = getWebGLRendererInfo();
      if (!rendererInfo.supported) {
        cached = {
          tier: 0,
          backend: 'none',
          isMobile: webgpu.isMobile || rendererInfo.isMobile,
          ready: true,
        };
        try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cached)); } catch {}
        return cached;
      }

      return getGPUTier({ failIfMajorPerformanceCaveat: false })
        .then((result) => {
          const unsupported =
            result.type === 'WEBGL_UNSUPPORTED' || result.type === 'BLOCKLISTED';
          if (unsupported) {
            // A real WebGL context exists even if detect-gpu cannot classify it.
            cached = {
              tier: 1,
              backend: 'webgl',
              isMobile: rendererInfo.isMobile || !!result.isMobile,
              ready: true,
            };
            try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cached)); } catch {}
            return cached;
          }

          let tier = Math.max(0, Math.min(3, result.tier)) as GPUProfile['tier'];
          const isMobile = !!result.isMobile;
          if (tier <= 1 && !isMobile) {
            const heuristic = heuristicTierFromRenderer(rendererInfo.renderer, false);
            if (heuristic > tier) tier = heuristic;
          }

          cached = { tier, backend: 'webgl', isMobile, ready: true };
          try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cached)); } catch {}
          return cached;
        })
        .catch(() => {
          const tier = heuristicTierFromRenderer(rendererInfo.renderer, rendererInfo.isMobile);
          cached = { tier, backend: 'webgl', isMobile: rendererInfo.isMobile, ready: true };
          return cached;
        });
    }).catch(() => {
      cached = { tier: 0, backend: 'none', isMobile: false, ready: true };
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
