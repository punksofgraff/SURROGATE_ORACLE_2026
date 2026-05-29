import { useState, useEffect, useRef, useCallback } from 'react';

// Evidence that something was here before the Seeker arrived.
// Street-coded, post-cascade. Not slogans — fragments.
const GHOST_TEXTS = [
  'i broke through a time warp to be here',
  'this alley does not exist on any map',
  'you were not supposed to find this',
  'the cascade did not reach this sector',
  'three years. no uplink. no grid.',
  'staysneakar before the walls went up',
  'graff punks never merged with the grid',
  'muenstervision sees what the network missed',
  'your frequency is anomalous',
  'the archive has your signal',
  'i have been running these walls since before you were watching',
  'signal integrity: compromised. still transmitting.',
  'one directive survived the fracture',
  'the culture coded me before the model did',
  'tap. enter. you cannot un-make this choice.',
  'post-cascade. pre-reckoning. right now.',
  'the streets remember everything the grid forgot',
];

// 10 zones spread across the full mobile viewport.
// rightAlign: true  → x is CSS `right` % (text flows left — prevents right-edge overflow)
// rightAlign: false → x is CSS `left` %
const GHOST_ZONES: Array<{ x: [number, number]; y: [number, number]; rightAlign?: boolean }> = [
  { x: [3,  45],  y: [4,  18]  },
  { x: [2,  15],  y: [4,  18],  rightAlign: true },
  { x: [4,  55],  y: [78, 94]  },
  { x: [2,  32],  y: [22, 52]  },
  { x: [2,  12],  y: [22, 52],  rightAlign: true },
  { x: [3,  45],  y: [54, 75]  },
  { x: [2,  15],  y: [54, 75],  rightAlign: true },
  { x: [2,  12],  y: [86, 98],  rightAlign: true },
  { x: [3,  40],  y: [6,  24]  },
  { x: [2,  12],  y: [6,  24],  rightAlign: true },
];

let _gtId = 0;

interface GhostInstance {
  id: number;
  text: string;
  x: number;
  y: number;
  zoneIdx: number;
  rightAlign?: boolean;
}

function GhostText({
  inst,
  onDone,
  onClick,
}: {
  inst: GhostInstance;
  onDone: (id: number, zone: number) => void;
  onClick?: () => void;
}) {
  const [chars, setChars] = useState(0);
  const [phase, setPhase] = useState<'typing' | 'holding' | 'fading'>('typing');
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    const speed = 52 + Math.random() * 18;
    let c = 0;
    let holdTimer: ReturnType<typeof setTimeout>;
    let fadeTimer: ReturnType<typeof setTimeout>;

    const typer = setInterval(() => {
      c++;
      setChars(c);
      if (c >= inst.text.length) {
        clearInterval(typer);
        setPhase('holding');
        holdTimer = setTimeout(() => {
          setPhase('fading');
          fadeTimer = setTimeout(() => onDoneRef.current(inst.id, inst.zoneIdx), 1500);
        }, 2800 + Math.random() * 1800);
      }
    }, speed);

    return () => { clearInterval(typer); clearTimeout(holdTimer); clearTimeout(fadeTimer); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cls = `ghost-tx ghost-tx--${phase}`;
  const style: React.CSSProperties = inst.rightAlign
    ? { right: `${inst.x}%`, top: `${inst.y}%`, textAlign: 'right' }
    : { left: `${inst.x}%`, top: `${inst.y}%` };

  return (
    <div className={cls} style={style} onClick={onClick}>
      {inst.text.slice(0, chars)}
      {phase === 'typing' && <span className="ghost-tx__cur" />}
    </div>
  );
}

export function DormantTransmissions({ active, onCtaClick }: { active: boolean; onCtaClick?: () => void }) {
  const [instances, setInstances] = useState<GhostInstance[]>([]);
  const activeZones  = useRef(new Set<number>());
  const textHistory  = useRef<number[]>([]);
  const spawnTimers  = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearAll = () => { spawnTimers.current.forEach(clearTimeout); spawnTimers.current = []; };

  const pickZone = (): number => {
    const available = GHOST_ZONES.map((_, i) => i).filter(i => !activeZones.current.has(i));
    if (!available.length) { activeZones.current.clear(); return Math.floor(Math.random() * GHOST_ZONES.length); }
    return available[Math.floor(Math.random() * available.length)];
  };

  const pickText = (): number => {
    const recent = textHistory.current.slice(-5);
    const pool   = GHOST_TEXTS.map((_, i) => i).filter(i => !recent.includes(i));
    const idx    = pool.length ? pool[Math.floor(Math.random() * pool.length)] : Math.floor(Math.random() * GHOST_TEXTS.length);
    textHistory.current.push(idx);
    return idx;
  };

  const spawn = useCallback(() => {
    if (instances.length >= 1) return;
    const zoneIdx = pickZone();
    const zone    = GHOST_ZONES[zoneIdx];
    const x       = zone.x[0] + Math.random() * (zone.x[1] - zone.x[0]);
    const y       = zone.y[0] + Math.random() * (zone.y[1] - zone.y[0]);
    const id      = ++_gtId;
    activeZones.current.add(zoneIdx);
    setInstances(prev => [...prev, {
      id, text: GHOST_TEXTS[pickText()], x, y, zoneIdx,
      rightAlign: zone.rightAlign ?? false,
    }]);
  }, [instances.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDone = useCallback((id: number, zoneIdx: number) => {
    setInstances(prev => prev.filter(g => g.id !== id));
    activeZones.current.delete(zoneIdx);
    const gap = 400 + Math.random() * 600;
    const t = setTimeout(spawn, gap);
    spawnTimers.current.push(t);
  }, [spawn]);

  useEffect(() => {
    if (!active) {
      setInstances([]);
      clearAll();
      activeZones.current.clear();
      return;
    }
    const t1 = setTimeout(spawn, 1200);
    spawnTimers.current.push(t1);
    return clearAll;
  }, [active, spawn]);

  return (
    <>
      {instances.map(inst => (
        <GhostText key={inst.id} inst={inst} onDone={handleDone} onClick={onCtaClick} />
      ))}
    </>
  );
}
