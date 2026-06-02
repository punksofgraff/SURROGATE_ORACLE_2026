/**
 * OracleHaloRing — holographic text ring orbiting above the Oracle.
 *
 * Revolving door mechanic: two arcs of text at 0° and 180° offset so one
 * is always sweeping INTO view as the other sweeps OUT. No dead zones,
 * no "stuck" feeling — continuous 360° rotation at all times.
 */

const LABEL   = 'SURROGATE:ORACLE  ·  SNEAKAR XR ANTHROPOLOGY AI  ·  ';
const RADIUS  = 160;   // px — ring radius
const DURATION = '10s'; // one full revolution

// Build one arc from the label characters
function Arc({ chars, offsetDeg }: { chars: string[]; offsetDeg: number }) {
  const n    = chars.length;
  const step = 180 / n; // spread over 180° so two arcs fill the full circle

  return (
    <>
      {chars.map((ch, i) => (
        <span
          key={i}
          style={{
            position:   'absolute',
            left: 0,
            top:  0,
            display:    'block',
            transform:  `rotateY(${offsetDeg + i * step}deg) translateZ(${RADIUS}px)`,
            fontFamily: "'PhillySans', 'Share Tech Mono', monospace",
            fontSize:   '0.7rem',
            fontWeight: 800,
            letterSpacing: '0.08em',
            color: ch === '·' ? 'rgba(176,38,255,0.95)' : 'rgba(0,255,136,0.90)',
            textShadow: ch === '·'
              ? '0 0 10px rgba(176,38,255,0.9), 0 0 24px rgba(176,38,255,0.4)'
              : '0 0 10px rgba(0,255,136,1.0), 0 0 24px rgba(0,255,136,0.4)',
            whiteSpace:  'pre',
            userSelect:  'none',
            pointerEvents: 'none',
          }}
        >
          {ch}
        </span>
      ))}
    </>
  );
}

interface OracleHaloRingProps {
  active: boolean;
}

export function OracleHaloRing({ active }: OracleHaloRingProps) {
  const chars = LABEL.split('');

  if (!active) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position:      'absolute',
        top:           '2%',
        left:          '50%',
        width:         0,
        height:        0,
        zIndex:        25,
        pointerEvents: 'none',
        perspective:   '500px',
      }}
    >
      {/* Single rotating wrapper — both arcs ride together, 360° continuous */}
      <div
        style={{
          position:       'absolute',
          width:          0,
          height:         0,
          transformStyle: 'preserve-3d',
          animation:      `oracle-halo-orbit ${DURATION} linear infinite`,
        }}
      >
        {/* Arc A — front half (0°–180°) */}
        <Arc chars={chars} offsetDeg={0} />
        {/* Arc B — back half (180°–360°) — always in view when A is edge-on */}
        <Arc chars={chars} offsetDeg={180} />
      </div>
    </div>
  );
}
