/**
 * OracleInfoCard — a shared, full-viewport reading beat for the archive.
 *
 * This is intentionally a primitive rather than a page section. Put several
 * cards in a scroll container to create a scrollytelling sequence. The copy
 * itself is handed to the existing ParticleTypographyCard so informational
 * text resolves with the same particulate language as the knife encounter.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ParticleTypographyCard } from './ParticleTypographyCard';
import './OracleInfoCard.css';

export type OracleInfoCardAccent = 'green' | 'cyan' | 'violet';

export interface OracleInfoCardProps {
  /** Small archive label. Kept visible in reduced motion mode. */
  eyebrow: string;
  /** Graffiti-scale title for this beat. */
  title: string;
  /** One paragraph or several ordered paragraphs of reading copy. */
  copy: string | string[];
  /** Optional machine-readable sequence marker, e.g. "03 / 05". */
  index?: string;
  /** Optional signal note below the reading copy. */
  signal?: string;
  /** Optional content for a small, non-interactive footer rail. */
  footer?: React.ReactNode;
  /** Brand accent for the frame and archive markers. */
  accent?: OracleInfoCardAccent;
  /** Delay before particulate copy begins to resolve. */
  revealDelayMs?: number;
  /** Characters resolved per particulate tick. */
  revealStep?: number;
  /** Additional class names for placement in an existing story. */
  className?: string;
  /** Region id, useful when a parent provides in-page navigation. */
  id?: string;
}

const ACCENT_COLORS: Record<OracleInfoCardAccent, string> = {
  green: '#00ff88',
  cyan: '#00ffcc',
  violet: '#b026ff',
};

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mediaQuery.matches);
    update();
    mediaQuery.addEventListener?.('change', update);
    return () => mediaQuery.removeEventListener?.('change', update);
  }, []);

  return reduced;
}

export function OracleInfoCard({
  eyebrow,
  title,
  copy,
  index,
  signal,
  footer,
  accent = 'green',
  revealDelayMs = 220,
  revealStep = 2,
  className = '',
  id,
}: OracleInfoCardProps) {
  const paragraphs = useMemo(
    () => (Array.isArray(copy) ? copy : [copy]).filter(Boolean),
    [copy],
  );
  const totalCharacters = useMemo(
    () => paragraphs.reduce((total, paragraph) => total + [...paragraph].length, 0),
    [paragraphs],
  );
  const reducedMotion = usePrefersReducedMotion();
  const [landedCharacters, setLandedCharacters] = useState(
    reducedMotion ? totalCharacters : 0,
  );

  useEffect(() => {
    if (reducedMotion) {
      setLandedCharacters(totalCharacters);
      return;
    }

    setLandedCharacters(0);
    let timer: number | undefined;
    const start = window.setTimeout(() => {
      timer = window.setInterval(() => {
        setLandedCharacters((current) => {
          const next = Math.min(totalCharacters, current + Math.max(1, revealStep));
          if (next >= totalCharacters && timer !== undefined) {
            window.clearInterval(timer);
          }
          return next;
        });
      }, 34);
    }, Math.max(0, revealDelayMs));

    return () => {
      window.clearTimeout(start);
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [reducedMotion, revealDelayMs, revealStep, totalCharacters]);

  const accentColor = ACCENT_COLORS[accent];
  const style = {
    '--oracle-info-accent': accentColor,
    '--oracle-info-accent-soft':
      accent === 'violet' ? 'rgba(176, 38, 255, 0.18)' :
      accent === 'cyan' ? 'rgba(0, 255, 204, 0.16)' :
      'rgba(0, 255, 136, 0.16)',
  } as React.CSSProperties;

  let paragraphOffset = 0;

  return (
    <article
      id={id}
      className={`oracle-info-card oracle-info-card--${accent}${className ? ` ${className}` : ''}`}
      style={style}
      aria-labelledby={id ? `${id}-title` : undefined}
    >
      <div className="oracle-info-card__shell">
        <div className="oracle-info-card__topline" aria-hidden="true">
          <span className="oracle-info-card__eyebrow">{eyebrow}</span>
          {index && <span className="oracle-info-card__index">{index}</span>}
        </div>

        <div className="oracle-info-card__marker" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>

        <h2 id={id ? `${id}-title` : undefined} className="oracle-info-card__title">
          {title}
        </h2>

        <div className="oracle-info-card__rule" aria-hidden="true" />

        <div className="oracle-info-card__copy">
          {paragraphs.map((paragraph, paragraphIndex) => {
            const paragraphLength = [...paragraph].length;
            const paragraphLanded = Math.max(
              0,
              Math.min(paragraphLength, landedCharacters - paragraphOffset),
            );
            paragraphOffset += paragraphLength;

            return (
              <div className="oracle-info-card__paragraph" key={`${paragraphIndex}-${paragraph}`}>
                <div aria-hidden="true">
                  <ParticleTypographyCard
                    questionIndex={paragraphIndex}
                    landedChars={paragraphLanded}
                    isSelected={false}
                    isThisSelected={false}
                    isEmitting={!reducedMotion && paragraphLanded < paragraphLength}
                    accentColor={accentColor}
                    territory={eyebrow}
                    question={paragraph}
                  />
                </div>
                <p className="oracle-info-card__sr-copy">{paragraph}</p>
              </div>
            );
          })}
        </div>

        {(signal || footer) && (
          <div className="oracle-info-card__foot">
            {signal && <p className="oracle-info-card__signal">{signal}</p>}
            {footer && <div className="oracle-info-card__footer">{footer}</div>}
          </div>
        )}
      </div>
    </article>
  );
}

export default OracleInfoCard;