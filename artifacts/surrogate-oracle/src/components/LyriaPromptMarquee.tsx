import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ParticleTypographyCard } from './ParticleTypographyCard';

interface LyriaPromptMarqueeProps {
  prompt: string;
}

export function LyriaPromptMarquee({ prompt }: LyriaPromptMarqueeProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [scrollDistance, setScrollDistance] = useState(0);

  useEffect(() => {
    const measure = () => {
      const viewport = viewportRef.current;
      const track = trackRef.current;
      if (!viewport || !track) return;
      setScrollDistance(Math.max(0, track.scrollWidth - viewport.clientWidth));
    };

    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (observer) {
      if (viewportRef.current) observer.observe(viewportRef.current);
      if (trackRef.current) observer.observe(trackRef.current);
    }
    return () => observer?.disconnect();
  }, [prompt]);

  return (
    <div
      ref={viewportRef}
      className={`oracle-lyria-card__prompt-viewport${scrollDistance > 0 ? ' is-scrollable' : ''}`}
      aria-label={`Lyria brief: ${prompt}`}
    >
      <div
        ref={trackRef}
        className="oracle-lyria-card__prompt-track"
        style={{
          '--lyria-prompt-distance': `${scrollDistance}px`,
          '--lyria-prompt-duration': `${Math.max(8, Math.min(24, scrollDistance / 18))}s`,
        } as CSSProperties}
      >
        <ParticleTypographyCard
          questionIndex={0}
          landedChars={prompt.length}
          isSelected={false}
          isThisSelected={false}
          accentColor="#00ffcc"
          territory="LYRIA BRIEF"
          question={prompt}
          variant="ghost"
        />
      </div>
      <span className="oracle-lyria-card__prompt-sr">{prompt}</span>
    </div>
  );
}

export default LyriaPromptMarquee;