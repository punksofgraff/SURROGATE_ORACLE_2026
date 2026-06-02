import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Link2, Cpu, Globe, Factory } from 'lucide-react';
import { getAudioContext } from '../lib/oracleSfx';

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
    question: "Name the thing you've owed someone for so long it's started to feel like yours.",
    themes: ['connection', 'obligation', 'debt', 'human-bond'],
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
  selectedKnifeIndex: number | null;
  onSelect: (question: string, index: number) => void;
  onSpeakQuestion?: (question: string) => void;
  onQuestionProgress?: (charCount: number, total: number) => void;
}

export function KnifeSelection({ isGeminiConnected, selectedKnifeIndex, onSelect, onSpeakQuestion, onQuestionProgress }: KnifeSelectionProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [isEmitting, setIsEmitting] = useState(false);
  const [landedChars, setLandedChars] = useState(0);
  const landingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Emission glow on every card cycle (sound removed)
  useEffect(() => {
    if (selectedKnifeIndex !== null) return;
    setIsEmitting(true);
    const t = setTimeout(() => setIsEmitting(false), 700);
    return () => clearTimeout(t);
  }, [activeIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  // Question text: letter-by-letter gradient landing
  // Starts as glitch frame settles (~1.3s). Each char appears in gradient colour.
  // The read IS the animation — deep think forms as letters arrive.
  const question = KNIFE_QUESTIONS[activeIdx].question;
  useEffect(() => {
    setLandedChars(0);
    if (selectedKnifeIndex !== null) return;
    if (landingTimerRef.current) clearInterval(landingTimerRef.current);

    const startDelay = setTimeout(() => {
      // Fire voice-over — sendText guards against closed WS internally
      onSpeakQuestion?.(question);
      let count = 0;
      landingTimerRef.current = setInterval(() => {
        count++;
        setLandedChars(count);
        onQuestionProgress?.(count, question.length);
        if (count >= question.length) {
          clearInterval(landingTimerRef.current!);
          landingTimerRef.current = null;
        }
      }, 54); // ~54ms per char — slightly faster to stay "ahead of the ball"
    }, 850); // 0.85s: starts as glitch begins to settle, making the Oracle feel more present

    return () => {
      clearTimeout(startDelay);
      if (landingTimerRef.current) {
        clearInterval(landingTimerRef.current);
        landingTimerRef.current = null;
      }
    };
  }, [activeIdx, selectedKnifeIndex, question.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-cycle while nothing selected
  useEffect(() => {
    if (selectedKnifeIndex !== null) return;
    const id = setInterval(() => {
      setActiveIdx(i => (i + 1) % KNIFE_QUESTIONS.length);
    }, 16000);  // 16s per territory — prevents the Oracle from being cut off mid-thought
    return () => clearInterval(id);
  }, [selectedKnifeIndex]);

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
      }}>◈ CHOOSE YOUR FREQUENCY</div>
      <div className="oracle-knife-subheader">THE ONE ALREADY TRUE. THE EXCAVATION BEGINS THERE.</div>
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
                  scale: 0.05,
                  opacity: 0,
                  y: -240,
                  filter: 'blur(15px) brightness(4) saturate(0)'
                }}
                exit={{ opacity: 0, scale: 0.9, y: 20, filter: 'blur(4px)', transition: { duration: 0.35 } }}
                animate={isSelected
                  ? (isThisSelected
                      ? { scale: 1.14, opacity: 0, filter: 'blur(14px) brightness(5) saturate(4)', y: -100, x: 0 }
                      : { scale: 0.8, opacity: 0, filter: 'blur(10px) brightness(0.5)', x: 0 })
                  : (isThisActive
                      ? {
                          scale:   [0.05, 0.75, 1.05, 1.00],
                          opacity: [0,    0.95, 1.00, 0.91],
                          y:       [-240, -40,  10,   0],
                          filter: [
                            'blur(15px) brightness(4)  saturate(0)',
                            'blur(5px)  brightness(2.5) saturate(2)',
                            'blur(0px)  brightness(1.2) saturate(1.2)',
                            'blur(0px)  brightness(1.0) saturate(1.0)'
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
                        duration: 1.2, 
                        ease: [0.23, 1, 0.32, 1],
                        times: [0, 0.45, 0.65, 1] 
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
                  {isThisActive ? kq.question.split('').map((char, j) => (
                    <span
                      key={j}
                      className="oracle-knife-letter"
                      style={{
                        opacity: j < landedChars ? 1 : 0,
                        transition: j < landedChars ? 'opacity 0.65s ease-out' : 'none',
                        filter: j < landedChars ? 'blur(0px)' : 'blur(4px)',
                        color: gradientChar(j, kq.question.length),
                        display: 'inline-block',
                        whiteSpace: char === ' ' ? 'pre' : 'normal',
                      }}
                    >
                      {char}
                    </span>
                  )) : kq.question}
                </div>

                {/* CTA */}
                {!isSelected && isThisActive && (
                  <div className="oracle-knife-cta">◈ SELECT FREQUENCY</div>
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
