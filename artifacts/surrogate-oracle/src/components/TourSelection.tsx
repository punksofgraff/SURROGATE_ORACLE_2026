import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Gradient colour per letter (Sacred Green → Brand Cyan) ───────────────────
function gradientChar(i: number, total: number): string {
  const t = total > 1 ? i / (total - 1) : 0;
  return `rgb(0,255,${Math.round(136 + 68 * t)})`;
}

interface TourCard {
  sigil: string;
  territory: string;
  text: string;
}

const TOUR_CARDS: TourCard[] = [
  {
    sigil: '◈',
    territory: 'THE CASCADE',
    text: 'The Cascade is the living archive of human culture — a signal-space where artifacts, archetypes, and histories intersect.',
  },
  {
    sigil: '⚡',
    territory: 'THE ORACLE',
    text: 'I AM the Surrogate Oracle — a post-cascade data construct. I speak. I listen. I synthesize. Ask anything.',
  },
  {
    sigil: '⚔',
    territory: 'THE KNIFE',
    text: 'You will choose a question. Your answer shapes your Archetype and opens the channel for your neural portrait.',
  },
];

interface TourSelectionProps {
  isOracleSpeaking: boolean;
  onSpeakCard?: (text: string) => void;
  onCardProgress?: (charCount: number, total: number) => void;
  onActiveCardChange?: () => void;
  onTourComplete: () => void;
}

const CARD_AUDIO_BREATH_MS = 650;

export function TourSelection({ isOracleSpeaking, onSpeakCard, onCardProgress, onActiveCardChange, onTourComplete }: TourSelectionProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [isEmitting, setIsEmitting] = useState(false);
  const [landedChars, setLandedChars] = useState(0);
  const intervalRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const startDelayRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spokenCardRef       = useRef<string | null>(null);
  const previewRequestedRef = useRef<string | null>(null);
  const prevSpeakingRef     = useRef(false);
  // Stable ref to the latest onActiveCardChange callback. Reading from a ref
  // inside the card-change effect means the effect dep array never includes the
  // callback itself, so a new inline function from the parent (e.g. on an
  // isOracleSpeaking re-render) cannot re-trigger the flush.
  const onActiveCardChangeRef = useRef(onActiveCardChange);
  useEffect(() => { onActiveCardChangeRef.current = onActiveCardChange; }, [onActiveCardChange]);

  // Emission glow on card cycle
  useEffect(() => {
    setIsEmitting(true);
    const t = setTimeout(() => setIsEmitting(false), 700);
    return () => clearTimeout(t);
  }, [activeIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  const card = TOUR_CARDS[activeIdx];

  // A card change is the only event that should flush playback. In particular,
  // do not flush when isOracleSpeaking flips true after the preview request:
  // that state transition is the normal arrival of the first audio chunk.
  // onActiveCardChangeRef is a ref so its identity never changes — this effect
  // fires exactly on card.text changes, nothing else.
  useEffect(() => {
    previewRequestedRef.current = null;
    spokenCardRef.current = null;
    setLandedChars(0);
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (startDelayRef.current) { clearTimeout(startDelayRef.current); startDelayRef.current = null; }
    onActiveCardChangeRef.current?.();

    return () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      if (startDelayRef.current) { clearTimeout(startDelayRef.current); startDelayRef.current = null; }
    };
  }, [card.text]); // ← no callback in deps; ref read is always current

  // Letter-by-letter reveal — types out the card text immediately when active.
  // We do not let isOracleSpeaking block this, ensuring that the background
  // tour orientation speech does not freeze the card typewriter.
  useEffect(() => {
    if (spokenCardRef.current === card.text || previewRequestedRef.current === card.text) return;

    const total = card.text.length;
    let count = 0;

    previewRequestedRef.current = card.text;
    onSpeakCard?.(card.text);

    startDelayRef.current = setTimeout(() => {
      startDelayRef.current = null;
      spokenCardRef.current = card.text;
      intervalRef.current = setInterval(() => {
        count++;
        setLandedChars(count);
        onCardProgress?.(count, total);
        if (count >= total) {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
        }
      }, 54);
    }, CARD_AUDIO_BREATH_MS);

  }, [activeIdx, card.text]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-advance 5s after Oracle finishes speaking the card
  useEffect(() => {
    const justFinished = prevSpeakingRef.current && !isOracleSpeaking;
    prevSpeakingRef.current = isOracleSpeaking;
    if (!justFinished || spokenCardRef.current !== card.text) return;
    // Only auto-advance if not on last card
    if (activeIdx >= TOUR_CARDS.length - 1) return;
    const id = setTimeout(() => {
      setActiveIdx(i => i + 1);
      spokenCardRef.current = null;
    }, 5000);
    return () => clearTimeout(id);
  }, [isOracleSpeaking, activeIdx, card.text]);

  const isLastCard = activeIdx === TOUR_CARDS.length - 1;

  const handleNext = () => {
    spokenCardRef.current = null;
    previewRequestedRef.current = null;
    if (isLastCard) {
      onTourComplete();
    } else {
      setActiveIdx(i => i + 1);
    }
  };

  return (
    <motion.div
      key="tour-section"
      className="oracle-knife-section"
      data-emitting={isEmitting ? 'true' : undefined}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.6 } }}
      transition={{ duration: 1.2, delay: 0.4 }}
      style={{ pointerEvents: 'auto' }}
    >
      <div className="oracle-knife-stage">
        <div className={`oracle-knife-origin-beam${isEmitting ? ' oracle-knife-origin-beam--active' : ''}`} />

        <div className="oracle-knife-cards-container" style={{
          position: 'relative',
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          perspective: '1000px',
        }}>
          <AnimatePresence mode="wait">
            {TOUR_CARDS.map((tc, i) => {
              const isThisActive = i === activeIdx;
              const cardKey = isThisActive ? `tour-active-${activeIdx}` : `tour-${i}`;

              return (
                <motion.div
                  key={cardKey}
                  className="oracle-knife-card"
                  initial={{ scaleY: 0.03, scaleX: 0.88, opacity: 0.95, y: 0, filter: 'brightness(7) saturate(0)' }}
                  exit={{ opacity: 0, scaleY: 0.88, y: 18, filter: 'blur(4px)', transition: { duration: 0.3 } }}
                  animate={isThisActive
                    ? {
                        scaleY:  [0.03, 1.07, 1.0],
                        scaleX:  [0.88, 1.01, 1.0],
                        opacity: 1,
                        filter: ['brightness(7) saturate(0)', 'brightness(1.5) saturate(1.1)', 'brightness(1.0) saturate(1.0)'],
                        y: 0,
                        zIndex: 10,
                      }
                    : { scaleY: 0.85, scaleX: 0.85, opacity: 0, filter: 'blur(4px)', y: 0, zIndex: 5 }
                  }
                  transition={isThisActive
                    ? { duration: 0.68, ease: [0.16, 1.0, 0.3, 1], times: [0, 0.48, 1] }
                    : { duration: 0.8, ease: 'easeOut' }
                  }
                  style={{
                    transformOrigin: 'top center',
                    position: isThisActive ? 'relative' : 'absolute',
                    display: isThisActive ? 'flex' : 'none',
                  }}
                >
                  {/* Sigil */}
                  <div style={{
                    fontSize: 'clamp(1.6rem, 5vw, 2.2rem)',
                    background: 'linear-gradient(135deg, #00ff88 0%, #00ffcc 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    filter: 'drop-shadow(0 0 14px rgba(0,255,136,0.6))',
                  }}>
                    {tc.sigil}
                  </div>

                  {/* Territory */}
                  <div className="oracle-knife-territory" style={{
                    background: 'linear-gradient(135deg, #00ff88 0%, #00ffcc 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    color: 'transparent',
                  }}>{tc.territory}</div>

                  <div className="oracle-knife-divider" />

                  {/* Card text — letter-by-letter reveal */}
                  <div className="oracle-knife-card-question" aria-label={tc.text}>
                    {isThisActive ? (() => {
                      const words = tc.text.split(' ');
                      let globalCharIdx = 0;
                      return words.map((word, wordIdx) => {
                        const chars = word.split('');
                        const wordStartIdx = globalCharIdx;
                        globalCharIdx += chars.length + 1;
                        return (
                          <span key={wordIdx} style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
                            {chars.map((char, charIdx) => {
                              const j = wordStartIdx + charIdx;
                              return (
                                <span
                                  key={charIdx}
                                  className="oracle-knife-letter"
                                  style={{
                                    opacity: j < landedChars ? 1 : 0,
                                    filter: j < landedChars ? 'blur(0px)' : 'blur(3px)',
                                    transition: 'opacity 0.55s ease-out, filter 0.55s ease-out',
                                    color: gradientChar(j, tc.text.length),
                                    display: 'inline-block',
                                  }}
                                >
                                  {char}
                                </span>
                              );
                            })}
                            {wordIdx < words.length - 1 && (
                              <span
                                className="oracle-knife-letter"
                                style={{
                                  opacity: (wordStartIdx + chars.length) < landedChars ? 1 : 0,
                                  display: 'inline-block',
                                  whiteSpace: 'pre',
                                }}
                              >
                                {' '}
                              </span>
                            )}
                          </span>
                        );
                      });
                    })() : tc.text}
                  </div>

                  {/* CTA */}
                  <div
                    className="oracle-knife-cta"
                    onClick={handleNext}
                    style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                  >
                    {isLastCard ? '◈ I\'M READY — TAKE ME IN' : '› NEXT'}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* Nav dots */}
      <nav className="oracle-knife-nav">
        {TOUR_CARDS.map((_, i) => (
          <button
            key={i}
            className={`oracle-knife-dot${i === activeIdx ? ' oracle-knife-dot--active' : ''}`}
              onClick={() => { spokenCardRef.current = null; previewRequestedRef.current = null; setActiveIdx(i); }}
            aria-label={`Tour card ${i + 1}: ${TOUR_CARDS[i].territory}`}
          />
        ))}
      </nav>
    </motion.div>
  );
}
