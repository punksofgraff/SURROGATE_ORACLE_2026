import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Single floating data fragment ─────────────────────────────────────────────
// Cycles: hidden → glitch-in → hold → glitch-out → hidden (long gap, repeat)
// Appears only when `value` is non-empty.
interface FragmentProps {
  label: string;
  value: string;
  color?: string;
  style: React.CSSProperties;
  side?: 'left' | 'right' | 'center';
  startDelay: number;   // ms before first appearance
  holdMs: number;       // ms visible
  gapMs: number;        // ms hidden between cycles
}

function PhaseFragment({ label, value, color, style, side = 'left', startDelay, holdMs, gapMs }: FragmentProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!value) return;
    let running = true;
    let timer: ReturnType<typeof setTimeout>;

    const cycle = (delay: number) => {
      timer = setTimeout(() => {
        if (!running) return;
        setVisible(true);
        timer = setTimeout(() => {
          if (!running) return;
          setVisible(false);
          // Jitter so it never feels mechanical
          cycle(gapMs + (Math.random() - 0.5) * gapMs * 0.4);
        }, holdMs);
      }, delay);
    };

    cycle(startDelay);
    return () => { running = false; clearTimeout(timer); };
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!value) return null;

  const dx = side === 'left' ? -10 : side === 'right' ? 10 : 0;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="oracle-phase-fragment"
          style={{ ...style, color: color ?? 'rgba(0,255,136,0.55)' }}
          initial={{ opacity: 0, x: dx, filter: 'blur(8px) brightness(3.5)' }}
          animate={{
            opacity: [0, 0.70, 0.48, 0.55],
            x:       [dx, dx * 0.3, 0, 0],
            filter:  [
              'blur(8px) brightness(3.5)',
              'blur(0px) brightness(1.5)',
              'blur(0.5px) brightness(1.05)',
              'blur(0px) brightness(1)',
            ],
          }}
          exit={{
            opacity: [0.55, 0.80, 0, 0.15, 0],
            x:       [0, dx * -0.4, dx * -1],
            filter:  [
              'blur(0px) brightness(1)',
              'blur(0px) brightness(2.8)',
              'blur(6px) brightness(0.3)',
            ],
          }}
          transition={{ duration: 0.42, times: [0, 0.22, 0.62, 1] }}
        >
          <div className="oracle-phase-fragment__label">{label}</div>
          <div className="oracle-phase-fragment__value">{value}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface OracleHUDProps {
  active: boolean;
  coins: number;
}

export function OracleHUD({ active, coins }: OracleHUDProps) {
  const [alignment, setAlignment]       = useState<'sacred' | 'profane' | null>(null);
  const [sessionPhase, setSessionPhase] = useState('');
  const [archetypeTitle, setArchetype]  = useState<string | null>(null);
  const [totemLevel, setTotemLevel]     = useState(0);
  const [emotionalWeight, setEmotional] = useState('');

  useEffect(() => {
    if (!active) return;
    const onAlignment = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (d.alignment === 'sacred' || d.alignment === 'profane') setAlignment(d.alignment);
    };
    const onScore = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (d.sessionPhase) setSessionPhase(d.sessionPhase);
      if (typeof d.totemLevel === 'number') setTotemLevel(d.totemLevel);
      if (d.archetypeTitle) setArchetype(d.archetypeTitle);
      if (d.emotionalWeight) setEmotional(d.emotionalWeight);
    };
    const onTotem = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (typeof d.totemLevel === 'number') setTotemLevel(d.totemLevel);
    };
    window.addEventListener('oracle:alignment', onAlignment);
    window.addEventListener('oracle:score', onScore);
    window.addEventListener('oracle:totem:ascend', onTotem);
    return () => {
      window.removeEventListener('oracle:alignment', onAlignment);
      window.removeEventListener('oracle:score', onScore);
      window.removeEventListener('oracle:totem:ascend', onTotem);
    };
  }, [active]);

  if (!active) return null;

  const alignColor = alignment === 'sacred'
    ? 'rgba(0,255,136,0.60)'
    : alignment === 'profane'
    ? 'rgba(176,38,255,0.60)'
    : undefined;

  const phaseStr = ({ claim: 'CLAIM', evidence: 'EVIDENCE', cost: 'COST', mirror: 'MIRROR' } as Record<string, string>)[sessionPhase] ?? '';
  const totemStr = totemLevel > 0 ? `${Array(totemLevel).fill('◈').join('')}` : '';

  // All fragments positioned in alley space AROUND the Oracle (z-index 6 = atmosphere layer)
  // Sparse timing — most of the time nothing is visible. Just every once in a while.
  return (
    <div className="oracle-oracle-hud" aria-hidden="true">

      {/* Alignment — left of Oracle at face level */}
      <PhaseFragment
        label="SIGNAL"
        value={alignment ? alignment.toUpperCase() : ''}
        color={alignColor}
        style={{ position: 'absolute', top: '37%', left: '3%' }}
        side="left"
        startDelay={4000}
        holdMs={4500}
        gapMs={22000}
      />

      {/* Archetype identity — right of Oracle */}
      <PhaseFragment
        label="IDENTITY"
        value={archetypeTitle ?? ''}
        style={{ position: 'absolute', top: '37%', right: '3%' }}
        side="right"
        startDelay={9000}
        holdMs={5000}
        gapMs={26000}
      />

      {/* Session phase — upper left, behind Oracle's shoulder */}
      <PhaseFragment
        label="PHASE"
        value={phaseStr}
        style={{ position: 'absolute', top: '13%', left: '5%' }}
        side="left"
        startDelay={6000}
        holdMs={3500}
        gapMs={20000}
      />

      {/* Totem — upper right */}
      <PhaseFragment
        label="TOTEM"
        value={totemStr}
        style={{ position: 'absolute', top: '13%', right: '5%' }}
        side="right"
        startDelay={14000}
        holdMs={4000}
        gapMs={28000}
      />

      {/* Emotional register — below Oracle, barely visible */}
      <PhaseFragment
        label="REGISTER"
        value={emotionalWeight ? emotionalWeight.toUpperCase() : ''}
        style={{
          position: 'absolute', top: '63%',
          left: '50%', transform: 'translateX(-50%)',
        }}
        side="center"
        startDelay={18000}
        holdMs={3200}
        gapMs={30000}
      />

      {/* Coins — very sparse, lower right */}
      <PhaseFragment
        label="CULTURE"
        value={coins > 0 ? `${coins}c` : ''}
        style={{ position: 'absolute', top: '62%', right: '4%' }}
        side="right"
        startDelay={22000}
        holdMs={3000}
        gapMs={35000}
      />

    </div>
  );
}
