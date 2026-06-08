import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Link2, Cpu, Globe, Factory } from 'lucide-react';
import { getAudioContext } from '../lib/oracleSfx';
import { ScrambleFragment } from './ScrambleFragment';

// ── Transmission sound — "what the fuck did I just find?" ────────────────────
// Formant synthesis: pink noise + two bandpass filters at vocal frequencies
// + sawtooth carrier. Each territory has a distinct vocal register.
// Sounds like an intercepted signal — voice-like but uncertain who it is.
const EMISSION_F1 = [350, 270, 430, 310, 250];   // chest resonance
const EMISSION_F2 = [1850, 2100, 1700, 2000, 2300]; // voice character
const EMISSION_PITCH = [110, 98, 120, 105, 92];     // fundamental

// ── Gradient colour per letter (Sacred Green → Brand Cyan) ───────────────────
// Used by letter-by-letter reveal so each char has explicit color — avoids the
// background-clip:text parent leaking gradient through opacity:0 children.
function gradientChar(i: number, total: number): string {
  const t = total > 1 ? i / (total - 1) : 0;
  // #00ff88 → #00ffcc  (r:0, g:255, b:136→204)
  return `rgb(0,255,${Math.round(136 + 68 * t)})`;
}

// ─────────────────────────────────────────────────────────────────────────────

export interface KnifeQuestion {
  territory: string;
  question: string;
  themes: string[];
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  color: string;
}

export const KNIFE_QUESTIONS: KnifeQuestion[] = [
  {
    territory: 'THE LIBRARY OF ME',
    question: 'Who are you when the network goes dark and no one is watching?',
    themes: ['solitude', 'identity', 'authentic-self'],
    icon: BookOpen,
    color: '#00ff88',
  },
  {
    territory: 'CONNECTION & DEBT',
    question: 'What do we owe to each other as our digital and physical selves and those around us?',
    themes: ['connection', 'obligation', 'debt', 'human-bond', 'digital-self'],
    icon: Link2,
    color: '#b026ff',
  },
  {
    territory: 'THE MACHINE MIRROR',
    question: "What would you ask this system to confirm that you already know but won't say out loud?",
    themes: ['man-machine', 'singularity', 'consciousness', 'digital-self'],
    icon: Cpu,
    color: '#00ff88',
  },
  {
    territory: 'THE SOCIAL CONSTRUCT',
    question: 'The version of you that lives online — when did it start making decisions for the real one?',
    themes: ['persona', 'social-construct', 'online-identity', 'mask'],
    icon: Globe,
    color: '#b026ff',
  },
  {
    territory: 'THE INDUSTRIAL QUESTION',
    question: 'What did you used to be able to do alone that you now need a machine to finish?',
    themes: ['autonomy', 'technology', 'dependency', 'new-revolution'],
    icon: Factory,
    color: '#b026ff',
  },
];

interface KnifeSelectionProps {
  isGeminiConnected: boolean;
  isOracleSpeaking: boolean;
  selectedKnifeIndex: number | null;
  onSelect: (question: string, index: number) => void;
  onSpeakQuestion?: (question: string) => void;
  onQuestionProgress?: (charCount: number, total: number) => void;
  // Audio-sync hooks — when provided, the typewriter follows actual PCM playback position.
  onStartTracking?: () => void;
  onActiveCardChange?: () => void;
}

export function KnifeSelection({ isGeminiConnected, isOracleSpeaking, selectedKnifeIndex, onSelect, onSpeakQuestion, onQuestionProgress, onStartTracking, onActiveCardChange }: KnifeSelectionProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [isEmitting, setIsEmitting] = useState(false);
  const [landedChars, setLandedChars] = useState(0);
  const rafRef                 = useRef<number | null>(null);
  const intervalRef            = useRef<ReturnType<typeof setInterval> | null>(null);
  const spokenQuestionRef      = useRef<string | null>(null);
  const prevOracleSpeakingRef  = useRef(false);

  // Emission glow on every card cycle (sound removed)
  useEffect(() => {
    if (selectedKnifeIndex !== null) return;
    setIsEmitting(true);
    const t = setTimeout(() => setIsEmitting(false), 700);
    return () => clearTimeout(t);
  }, [activeIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  // Question text: letter-by-letter reveal driven by actual PCM playback position.
  // Typewriter runs at fixed 54ms/char; Oracle is triggered at 2/3 of chars revealed.
  // appears proportionally to how far through the audio Oracle has spoken — word-perfect.
  // Falls back to fixed 54ms/char interval when hooks are absent.
  const question = KNIFE_QUESTIONS[activeIdx].question;
  useEffect(() => {
    if (selectedKnifeIndex !== null) {
      spokenQuestionRef.current = null;
      return;
    }

    if (spokenQuestionRef.current === question) return;

    setLandedChars(0);
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }

    onActiveCardChange?.();

    // Wait for any ongoing Oracle speech (e.g. territories announcement on first card)
    if (isOracleSpeaking) return;

    const total = question.length;
    let count = 0;

    // Fire Oracle immediately (before typing starts) to absorb Gemini's ~3s response latency.
    // Voice arrives mid-type rather than seconds after the card finishes.
    spokenQuestionRef.current = question;
    onStartTracking?.();
    onSpeakQuestion?.(question);

    const startDelay = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        count++;
        setLandedChars(count);
        onQuestionProgress?.(count, total);
        if (count >= total) {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
        }
      }, 54);
    }, 400);

    return () => {
      clearTimeout(startDelay);
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };
  }, [activeIdx, selectedKnifeIndex, question, isOracleSpeaking]); // eslint-disable-line react-hooks/exhaustive-deps

  // Advance to next card after Oracle finishes speaking the current question.
  // Detects the isOracleSpeaking falling edge and only cycles if this card was actually spoken.
  useEffect(() => {
    if (selectedKnifeIndex !== null) return;
    const justFinished = prevOracleSpeakingRef.current && !isOracleSpeaking;
    prevOracleSpeakingRef.current = isOracleSpeaking;
    if (!justFinished || spokenQuestionRef.current !== question) return;
    const id = setTimeout(() => {
      setActiveIdx(i => (i + 1) % KNIFE_QUESTIONS.length);
    }, 3000);
    return () => clearTimeout(id);
  }, [isOracleSpeaking, selectedKnifeIndex, question]);

  const kq = KNIFE_QUESTIONS[activeIdx];
  const isSelected = selectedKnifeIndex !== null;

  return (
    <motion.div
      key="knife-section"
      className="oracle-knife-section"
      data-emitting={isEmitting ? 'true' : undefined}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.6 } }}
      transition={{ duration: 1.2, delay: 0.4 }}
    >
      <div className="oracle-knife-header" style={{
        background: 'linear-gradient(135deg, #00ff88 0%, #00ffcc 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        display: 'inline-block',
      }}>
        <ScrambleFragment
          texts={['◈ CHOOSE YOUR FREQUENCY']}
          mode="typewriter"
          revealMs={40}
          holdMs={999999}
          pauseMs={0}
        />
      </div>
      <div className="oracle-knife-subheader">
        <ScrambleFragment
          texts={['TAP THE ONE ALREADY TRUE. THE EXCAVATION BEGINS THERE.']}
          mode="typewriter"
          revealMs={20}
          holdMs={999999}
          pauseMs={0}
        />
      </div>
      {!isGeminiConnected && (
        <div className="oracle-knife-channel-status">◈ OPENING CHANNEL...</div>
      )}

      {/* Card stage — cards project from Oracle's screen above */}
      <div className="oracle-knife-stage">
        {/* Beam connecting to Oracle screen above */}
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
          {KNIFE_QUESTIONS.map((kq, i) => {
            const isThisActive = i === activeIdx;
            const isThisSelected = selectedKnifeIndex === i;
            // Key changes each time this card becomes active → Framer remounts it
            // with fresh y:-240 initial so the "drops from above" entrance fires
            // every cycle, not just on first mount.
            const cardKey = isThisActive ? `knife-active-${activeIdx}` : `knife-${i}`;

            return (
              <motion.div
                key={cardKey}
                className="oracle-knife-card"
                initial={{
                  scale: 0.4,
                  opacity: 0,
                  y: -120,
                  filter: 'blur(8px) brightness(1.8) saturate(0.6)'
                }}
                exit={{ opacity: 0, scale: 0.9, y: 20, filter: 'blur(4px)', transition: { duration: 0.35 } }}
                animate={isSelected
                  ? (isThisSelected
                      ? { scale: 1.14, opacity: 0, filter: 'blur(14px) brightness(5) saturate(4)', y: -100, x: 0 }
                      : { scale: 0.8, opacity: 0, filter: 'blur(10px) brightness(0.5)', x: 0 })
                  : (isThisActive
                      ? {
                          // Softened entrance — settles in ~0.9s with no brightness flash
                          // or scale overshoot, so the question is readable sooner.
                          scale:   [0.4, 0.92, 1.0],
                          opacity: [0,   1,    0.94],
                          y:       [-120, 0,   0],
                          filter: [
                            'blur(8px) brightness(1.8) saturate(0.6)',
                            'blur(0px) brightness(1.1) saturate(1.05)',
                            'blur(0px) brightness(1.0) saturate(1.0)'
                          ],
                          x: 0,
                          zIndex: 10
                        }
                      : {
                          scale: 0.85,
                          opacity: 0,
                          filter: 'blur(4px)',
                          x: 0,
                          y: 0,
                          zIndex: 5
                        })
                }
                transition={isThisSelected
                  ? { duration: 1.5, ease: [0.4, 0, 1, 1] }
                  : (isThisActive && !isSelected)
                    ? {
                        duration: 0.9,
                        ease: [0.23, 1, 0.32, 1],
                        times: [0, 0.6, 1]
                      }
                    : { duration: 0.8, ease: 'easeOut' }
                }
                onClick={() => {
                  if (isSelected) return;
                  navigator.vibrate?.([40]);
                  onSelect(kq.question, i);
                }}
                style={{ 
                  transformOrigin: '50% 50%', 
                  cursor: isSelected ? 'default' : 'pointer',
                  position: isThisActive ? 'relative' : 'absolute',
                  display: (!isSelected || isThisSelected) ? 'flex' : 'none',
                }}
              >
                {/* Icon */}
                <kq.icon
                  size={28}
                  style={{
                    color: kq.color,
                    filter: `drop-shadow(0 0 14px ${kq.color})`,
                    flexShrink: 0,
                  }}
                />

                {/* Territory -- STAB. Brand Kit Gradient. */}
                <div className="oracle-knife-territory" style={{
                  background: 'linear-gradient(135deg, #00ff88 0%, #00ffcc 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}>{kq.territory}</div>

                {/* Gradient divider */}
                <div className="oracle-knife-divider" />

                {/* Question pontif -- letter by letter gradient landing.
                    Per-letter explicit color avoids background-clip:text leaking
                    gradient through opacity:0 spans on the parent div. */}
                <div className="oracle-knife-card-question" aria-label={kq.question}>
                  {isThisActive ? (() => {
                    const words = kq.question.split(' ');
                    let globalCharIdx = 0;
                    return words.map((word, wordIdx) => {
                      const chars = word.split('');
                      const wordStartIdx = globalCharIdx;
                      globalCharIdx += chars.length + 1; // +1 for the space

                      return (
                        <span
                          key={wordIdx}
                          style={{ display: 'inline-block', whiteSpace: 'nowrap' }}
                        >
                          {chars.map((char, charIdx) => {
                            const j = wordStartIdx + charIdx;
                            return (
                              <span
                                key={charIdx}
                                className="oracle-knife-letter"
                                style={{
                                  opacity: j < landedChars ? 1 : 0,
                                  transition: j < landedChars ? 'opacity 0.65s ease-out' : 'none',
                                  filter: j < landedChars ? 'blur(0px)' : 'blur(4px)',
                                  color: gradientChar(j, kq.question.length),
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
                  })() : kq.question}
                </div>

                {/* CTA — "DRAW THIS ONE" reads as an unambiguous choice of THIS card
                    (and nods to drawing the blade), where "SELECT FREQUENCY" read as abstract. */}
                {!isSelected && isThisActive && (
                  <div className="oracle-knife-cta">◈ DRAW THIS ONE</div>
                )}
              </motion.div>
            );
          })}
          </AnimatePresence>
        </div>
      </div>

      {/* Nav dots */}
      {!isSelected && (
        <nav className="oracle-knife-nav">
          {KNIFE_QUESTIONS.map((_, i) => (
            <button
              key={i}
              className={`oracle-knife-dot${i === activeIdx ? ' oracle-knife-dot--active' : ''}`}
              onClick={() => setActiveIdx(i)}
              aria-label={`Territory ${i + 1}: ${KNIFE_QUESTIONS[i].territory}`}
            />
          ))}
        </nav>
      )}
    </motion.div>
  );
}
