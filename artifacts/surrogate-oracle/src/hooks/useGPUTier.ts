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
        const tier = (unsupported
          ? 0
          : Math.max(0, Math.min(3, result.tier))) as GPUProfile['tier'];
        cached = { tier, isMobile: !!result.isMobile, ready: true };
        try {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
        } catch { /* storage full / private mode — probe again next tab */ }
        return cached;
      })
      .catch(() => {
        // Benchmark fetch failed (offline / CDN blocked). WebGL context creation
        // is still guarded by the OracleErrorBoundary, so assume a modest GPU.
        cached = { tier: 1, isMobile: false, ready: true };
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
