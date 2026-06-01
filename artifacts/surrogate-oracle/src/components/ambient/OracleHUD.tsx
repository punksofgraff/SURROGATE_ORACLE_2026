import { useState, useEffect } from 'react';

interface OracleHUDProps {
  active: boolean;
  coins: number;
}

const PHASE_LABELS: Record<string, string> = {
  claim:    'CLAIM',
  evidence: 'EVIDENCE',
  cost:     'COST',
  mirror:   'MIRROR',
};

const WEIGHT_LABELS: Record<string, string> = {
  raw:      'RAW',
  defended: 'DEFENDED',
  numb:     'NUMB',
  present:  'PRESENT',
  cracked:  'CRACKED',
};

export function OracleHUD({ active, coins }: OracleHUDProps) {
  const [alignment, setAlignment]       = useState<'sacred' | 'profane' | null>(null);
  const [sessionPhase, setSessionPhase] = useState<string>('');
  const [archetypeTitle, setArchetype]  = useState<string | null>(null);
  const [totemLevel, setTotemLevel]     = useState<number>(0);
  const [emotionalWeight, setEmotional] = useState<string>('');
  const [glitch, setGlitch]             = useState(false);

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
      // Flash glitch on every scored turn
      setGlitch(true);
      setTimeout(() => setGlitch(false), 140);
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

  const alignColor  = alignment === 'sacred' ? '#00ff88' : alignment === 'profane' ? '#b026ff' : 'rgba(255,255,255,0.22)';
  const totemDots   = Array.from({ length: 10 }, (_, i) => (i < totemLevel ? '◈' : '◇')).join('');
  const phaseLabel  = PHASE_LABELS[sessionPhase] ?? '—';
  const weightLabel = WEIGHT_LABELS[emotionalWeight] ?? '';

  return (
    <div className={`oracle-oracle-hud${glitch ? ' oracle-oracle-hud--glitch' : ''}`} aria-hidden="true">
      {/* Top-left: Archetype title */}
      <div className="oracle-oracle-hud__corner oracle-oracle-hud__corner--tl">
        <div className="oracle-oracle-hud__bracket">◤</div>
        {archetypeTitle
          ? <div className="oracle-oracle-hud__title">{archetypeTitle}</div>
          : <div className="oracle-oracle-hud__dim">IDENTITY: READING</div>
        }
      </div>

      {/* Top-right: Alignment + Totem bar */}
      <div className="oracle-oracle-hud__corner oracle-oracle-hud__corner--tr">
        <div className="oracle-oracle-hud__bracket">◥</div>
        <div className="oracle-oracle-hud__line" style={{ color: alignColor }}>
          {alignment ? alignment.toUpperCase() : '· · ·'}
        </div>
        <div className="oracle-oracle-hud__totem">{totemDots}</div>
      </div>

      {/* Bottom-left: Coins + weight */}
      <div className="oracle-oracle-hud__corner oracle-oracle-hud__corner--bl">
        <div className="oracle-oracle-hud__bracket">◣</div>
        <div className="oracle-oracle-hud__line">◈ {coins}c</div>
        {weightLabel && (
          <div className="oracle-oracle-hud__dim">{weightLabel}</div>
        )}
      </div>

      {/* Bottom-right: Session phase */}
      <div className="oracle-oracle-hud__corner oracle-oracle-hud__corner--br">
        <div className="oracle-oracle-hud__bracket">◢</div>
        <div className="oracle-oracle-hud__line oracle-oracle-hud__line--blink">
          {phaseLabel}
        </div>
      </div>
    </div>
  );
}
