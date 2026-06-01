/**
 * OracleHaloRing — holographic text ring orbiting above the Oracle.
 *
 * CSS 3D: characters placed around a cylinder (rotateY + translateZ),
 * the whole ring rotates 360° on Y axis continuously.
 * Looks like a hologram label in AR mode, atmospheric in standard mode.
 */
import { useMemo } from 'react';

const LABEL = 'SURROGATE:ORACLE  ·  SNEAKAR XR ANTHROPOLOGY AI  ·  ';
const RADIUS = 110; // px — ring radius in 3D space
const RPM    = 12;  // rotations per minute → 5s per rotation

interface OracleHaloRingProps {
  active: boolean; // only render in oracle / awakened phase
}

export function OracleHaloRing({ active }: OracleHaloRingProps) {
  // Repeat label until we have enough characters to fill 360°
  const chars = useMemo(() => {
    const full = LABEL.repeat(3);
    return full.split('');
  }, []);

  const n    = chars.length;
  const step = 360 / n;          // degrees per character
  const dur  = (60 / RPM) + 's'; // CSS animation duration

  if (!active) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: '2%',            // sits above the Oracle's head
        left: '50%',
        width: 0,
        height: 0,
        zIndex: 25,
        pointerEvents: 'none',
        perspective: '600px',
      }}
    >
      {/* Orbit wrapper — rotates the whole ring on Y axis */}
      <div
        style={{
          position: 'absolute',
          width: 0,
          height: 0,
          transformStyle: 'preserve-3d',
          animation: `oracle-halo-orbit ${dur} linear infinite`,
        }}
      >
        {chars.map((ch, i) => (
          <span
            key={i}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              display: 'block',
              transformStyle: 'preserve-3d',
              transform: `rotateY(${i * step}deg) translateZ(${RADIUS}px)`,
              fontFamily: "'PhillySans', 'Share Tech Mono', monospace",
              fontSize: '0.52rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
              color: ch === '·' ? 'rgba(176,38,255,0.9)' : 'rgba(0,255,136,0.85)',
              textShadow: ch === '·'
                ? '0 0 8px rgba(176,38,255,0.8), 0 0 20px rgba(176,38,255,0.4)'
                : '0 0 8px rgba(0,255,136,0.9), 0 0 20px rgba(0,255,136,0.4)',
              whiteSpace: 'pre',
              userSelect: 'none',
            }}
          >
            {ch}
          </span>
        ))}
      </div>
    </div>
  );
}
