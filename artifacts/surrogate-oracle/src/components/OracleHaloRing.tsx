/**
 * OracleHaloRing — holographic text ring floating above the Oracle.
 *
 * Ring lies on a tilted horizontal plane (rotateX tilt) so it reads as
 * a 3D halo above the Oracle's head, not a flat spinning wheel.
 *
 * Two arcs at 0° and 180° offset — revolving door mechanic ensures one
 * arc is always readable while the other sweeps behind. No dead zones.
 *
 * In XR/AR mode: boosted opacity + stronger glow for real-world contrast.
 */

interface OracleHaloRingProps {
  active: boolean;
  isXRMode?: boolean;
}

const LABEL    = 'SURROGATE:ORACLE  ·  SNEAKAR XR ANTHROPOLOGY AI  ·  ';
const RADIUS   = 170;    // px — ring radius (distance from centre to each char)
const TILT     = -28;    // degrees — rotateX tilt: negative = leaning back into scene
const DURATION = '11s';  // one full revolution

function Arc({
  chars,
  offsetDeg,
  xrMode = false,
}: {
  chars: string[];
  offsetDeg: number;
  xrMode?: boolean;
}) {
  const n    = chars.length;
  const step = 180 / n;

  return (
    <>
      {chars.map((ch, i) => {
        const isPurple = ch === '·';
        const baseColor  = isPurple ? 'rgba(176,38,255,0.92)' : 'rgba(0,255,136,0.88)';
        const glowColor  = isPurple ? 'rgba(176,38,255,0.9)' : 'rgba(0,255,136,1.0)';
        const glowFar    = isPurple ? 'rgba(176,38,255,0.35)' : 'rgba(0,255,136,0.35)';
        const xrGlow     = isPurple
          ? '0 0 14px rgba(176,38,255,1), 0 0 32px rgba(176,38,255,0.6)'
          : '0 0 14px rgba(0,255,136,1), 0 0 32px rgba(0,255,136,0.6)';

        return (
          <span
            key={i}
            style={{
              position:      'absolute',
              left:          0,
              top:           0,
              display:       'block',
              transform:     `rotateY(${offsetDeg + i * step}deg) translateZ(${RADIUS}px)`,
              fontFamily:    "'PhillySans', 'Share Tech Mono', monospace",
              fontSize:      '0.6rem',
              fontWeight:    800,
              letterSpacing: '0.06em',
              color:         baseColor,
              textShadow:    xrMode
                ? xrGlow
                : `0 0 8px ${glowColor}, 0 0 20px ${glowFar}`,
              whiteSpace:    'pre',
              userSelect:    'none',
              pointerEvents: 'none',
              opacity:       xrMode ? 1 : 0.88,
            }}
          >
            {ch}
          </span>
        );
      })}
    </>
  );
}

export function OracleHaloRing({ active, isXRMode = false }: OracleHaloRingProps) {
  const chars = LABEL.split('');

  if (!active) return null;

  return (
    <div
      aria-hidden="true"
      className="oracle-halo-ring"
      style={{
        // Anchored at 50% left, centred horizontally above the avatar.
        // Negative top pushes ring above the oracle-avatar-wrapper.
        position:      'absolute',
        top:           '-12%',
        left:          '50%',
        width:         0,
        height:        0,
        zIndex:        30,
        pointerEvents: 'none',
        // Perspective here creates depth for direct children only —
        // the ring wrapper uses preserve-3d to pass it through to chars.
        perspective:   '800px',
      }}
    >
      <div
        style={{
          position:       'absolute',
          width:          0,
          height:         0,
          // Tilt the ring plane: rotateX makes it lay at an angle above the
          // Oracle — reads as a horizontal halo, not a vertical wheel.
          transform:      `rotateX(${TILT}deg)`,
          transformStyle: 'preserve-3d',
        }}
      >
        {/* Rotating inner — both arcs ride together */}
        <div
          style={{
            position:       'absolute',
            width:          0,
            height:         0,
            transformStyle: 'preserve-3d',
            animation:      `oracle-halo-orbit ${DURATION} linear infinite`,
          }}
        >
          <Arc chars={chars} offsetDeg={0}   xrMode={isXRMode} />
          <Arc chars={chars} offsetDeg={180} xrMode={isXRMode} />
        </div>
      </div>
    </div>
  );
}
