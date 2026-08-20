/**
 * usePerformanceGuard — Rolling FPS monitor that trips a degraded mode.
 * 
 * If average FPS drops below 28 for a sustained period, it notifies
 * the atmosphere and rendering systems to reduce texture quality
 * to protect the core ritual.
 */
import { useState, useEffect, useRef } from 'react';
import { trackOracleEvent } from '../lib/analytics';

export function usePerformanceGuard(isActive: boolean) {
  const [isDegraded, setIsDegraded] = useState(false);
  const samplesRef = useRef<number[]>([]);
  const lastTimeRef = useRef(performance.now());
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!isActive) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    const tick = () => {
      const now = performance.now();
      const delta = now - lastTimeRef.current;
      lastTimeRef.current = now;

      if (delta > 0) {
        const fps = 1000 / delta;
        samplesRef.current.push(fps);
        if (samplesRef.current.length > 60) samplesRef.current.shift();

        const avgFps = samplesRef.current.reduce((a, b) => a + b, 0) / samplesRef.current.length;

        if (samplesRef.current.length >= 60 && avgFps < 28 && !isDegraded) {
          setIsDegraded(true);
          trackOracleEvent({ 
            event: 'oracle_performance_guard', 
            avg_fps: avgFps, 
            degraded: true, 
            counts_reduced: true 
          });
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isActive, isDegraded]);

  return isDegraded;
}
