import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Link2, Cpu, Globe, Factory } from 'lucide-react';
import { getAudioContext } from '../lib/oracleSfx';
import { ScrambleFragment } from './ScrambleFragment';
import { ParticleTypographyCard } from './ParticleTypographyCard';

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
  onTauntStart?: () => void;
  onQuestionProgress?: (charCount: number, total: number) => void;
  // Audio-sync hooks — when provided, the typewriter follows actual PCM playback position.
  onStartTracking?: () => void;
  onActiveCardChange?: () => void;
}

// How long the new card's audio has to breathe before the typewriter starts.
// Gemini's first PCM chunk typically arrives 1.5–3s after the request; 650ms
// lets the opening word land audibly before text begins revealing.
const CARD_AUDIO_BREATH_MS = 650;

export function KnifeSelection({ isGeminiConnected, isOracleSpeaking, selectedKnifeIndex, onSelect, onSpeakQuestion, onTauntStart, onQuestionProgress, onStartTracking, onActiveCardChange }: KnifeSelectionProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [isEmitting, setIsEmitting] = useState(false);
  const [landedChars, setLandedChars] = useState(0);
  const rafRef                 = useRef<number | null>(null);
  const intervalRef            = useRef<ReturnType<typeof setInterval> | null>(null);
  const startDelayRef          = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spokenQuestionRef      = useRef<string | null>(null);
  // Latched as soon as the preview request fires — prevents a duplicate request
  // if isOracleSpeaking later flips true (first audio chunk arrival).
  const previewRequestedRef    = useRef<string | null>(null);
  const prevOracleSpeakingRef  = useRef(false);
  // Stable ref to the latest onActiveCardChange callback. Storing in a ref
  // means the card-change effect dep array never includes the callback identity,
  // so a new inline function from the parent on an isOracleSpeaking re-render
  // cannot re-trigger the flush and cut off opening audio.
  const onActiveCardChangeRef  = useRef(onActiveCardChange);
  useEffect(() => { onActiveCardChangeRef.current = onActiveCardChange; }, [onActiveCardChange]);

  // Emission glow on every card cycle (sound removed)
  useEffect(() => {
    if (selectedKnifeIndex !== null) return;
    setIsEmitting(true);
    const t = setTimeout(() => setIsEmitting(false), 700);
    return () => clearTimeout(t);
  }, [activeIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Effect 1: card/selection change — stop stale timers and flush ────────────
  // Fires only when the active question or selection state changes, NOT when
  // isOracleSpeaking toggles. That separation is the key fix: the old single
  // effect ran on every isOracleSpeaking flip, so the first audio chunk arriving
  // (which sets isOracleSpeaking=true) re-entered the effect and called
  // onActiveCardChange() → flushPlayback(), cutting off the opening syllables.
  const question = KNIFE_QUESTIONS[activeIdx].question;
  useEffect(() => {
    previewRequestedRef.current = null;
    spokenQuestionRef.current = null;
    setLandedChars(0);
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (startDelayRef.current) { clearTimeout(startDelayRef.current); startDelayRef.current = null; }

    if (selectedKnifeIndex === null) {
      // Read from ref — never from the dep array — so a new inline callback from
      // the parent on an isOracleSpeaking re-render cannot re-trigger this flush.
      onActiveCardChangeRef.current?.();
    }

    return () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      if (startDelayRef.current) { clearTimeout(startDelayRef.current); startDelayRef.current = null; }
    };
  }, [question, selectedKnifeIndex]); // ← no callback in deps; ref read is always current

  // ── Effect 2: fire preview request + typewriter ───────────────────────────
  // Depends on isOracleSpeaking to retry when Oracle finishes any prior speech,
  // but the latch (previewRequestedRef) prevents double-firing once requested.
  // startDelay is CARD_AUDIO_BREATH_MS so the typewriter starts only after the
  // opening words have had a chance to arrive and play.
  useEffect(() => {
    if (selectedKnifeIndex !== null) return;
    if (isOracleSpeaking) return;
    if (previewRequestedRef.current === question || spokenQuestionRef.current === question) return;

    const total = question.length;
    let count = 0;

    // Latch immediately so no re-entry happens while we wait for audio.
    previewRequestedRef.current = question;

    // Fire Oracle immediately to absorb Gemini's ~3s response latency —
    // voice arrives during or after the breath window, never after the text.
    onStartTracking?.();
    onTauntStart?.();
    onSpeakQuestion?.(question);

    startDelayRef.current = setTimeout(() => {
      startDelayRef.current = null;
      // Mark typewriter started; auto-advance effect uses this to confirm the
      // card was actually spoken before cycling.
      spokenQuestionRef.current = question;
      intervalRef.current = setInterval(() => {
        count++;
        setLandedChars(count);
        onQuestionProgress?.(count, total);
        if (count >= total) {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
        }
      }, 54);
    }, CARD_AUDIO_BREATH_MS);
    // No cleanup here: intervalRef lifecycle is managed by Effect 1 (card change)
    // and the interval's own self-stop. Cleaning up here on every isOracleSpeaking
    // transition was the original source of mid-word typewriter death.
  }, [question, selectedKnifeIndex, isOracleSpeaking]); // eslint-disable-line react-hooks/exhaustive-deps

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
            // with fresh scaleY:0.03 initial so the saber-extension entrance fires
            // every cycle, not just on first mount.
            const cardKey = isThisActive ? `knife-active-${activeIdx}` : `knife-${i}`;

            return (
              <motion.div
                key={cardKey}
                className="oracle-knife-card"
                initial={{
                  scaleY: 0.03,
                  scaleX: 0.88,
                  opacity: 0.95,
                  y: 0,
                  filter: 'brightness(7) saturate(0)',
                }}
                exit={{ opacity: 0, scaleY: 0.88, y: 18, filter: 'blur(4px)', transition: { duration: 0.3 } }}
                animate={isSelected
                  ? (isThisSelected
                      ? { y: -110, opacity: 0, filter: 'blur(14px) brightness(5) saturate(4)', transition: { duration: 1.5, ease: [0.4, 0, 1, 1] } }
                      : { scaleY: 0.8, scaleX: 0.8, opacity: 0, filter: 'blur(10px) brightness(0.5)' })
                  : (isThisActive
                      ? {
                          // Saber extension — blade extends downward from the cabinet screen.
                          // scaleY drives the "igniting" feel; transformOrigin: top pins the hilt.
                          scaleY:  [0.03, 1.07, 1.0],
                          scaleX:  [0.88, 1.01, 1.0],
                          opacity: 1,
                          filter: [
                            'brightness(7) saturate(0)',
                            'brightness(1.5) saturate(1.1)',
                            'brightness(1.0) saturate(1.0)',
                          ],
                          y: 0,
                          zIndex: 10,
                        }
                      : {
                          scaleY: 0.85,
                          scaleX: 0.85,
                          opacity: 0,
                          filter: 'blur(4px)',
                          y: 0,
                          zIndex: 5,
                        })
                }
                transition={isThisActive && !isSelected
                  ? { duration: 0.68, ease: [0.16, 1.0, 0.3, 1], times: [0, 0.48, 1] }
                  : { duration: 0.8, ease: 'easeOut' }
                }
                onClick={() => {
                  if (isSelected) return;
                  navigator.vibrate?.([40]);
                  onSelect(kq.question, i);
                }}
                style={{
                  transformOrigin: 'top center',
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

                {/* Pre-Baked Holographic Particle Typography Question */}
                <ParticleTypographyCard
                  questionIndex={i}
                  landedChars={isThisActive ? landedChars : (isSelected ? 999 : 0)}
                  isEmitting={isEmitting}
                  isSelected={isSelected}
                  isThisSelected={isThisSelected}
                  accentColor={kq.color}
                  territory={kq.territory}
                  question={kq.question}
                />

                {/* CTA — "DRAW THIS ONE" reads as an unambiguous choice of THIS card
                    (and nods to drawing the blade), where "SELECT FREQUENCY" read as abstract. */}
                {!isSelected && isThisActive && (
                  <div className="oracle-knife-cta" style={{ marginTop: 8 }}>◈ DRAW THIS ONE</div>
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
