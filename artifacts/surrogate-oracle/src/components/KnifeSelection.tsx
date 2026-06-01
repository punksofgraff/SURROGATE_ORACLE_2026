import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Link2, Cpu, Globe, Factory } from 'lucide-react';
import { getAudioContext } from '../lib/oracleSfx';

// ── Territory chord tones (on select) ────────────────────────────────────────
const TERRITORY_CHORDS: [number, number, number][] = [
  [440, 550, 660],
  [370, 466, 554],
  [528, 660, 792],
  [349, 440, 523],
  [396, 495, 594],
];

function playKnifeChord(idx: number) {
  try {
    const actx = getAudioContext();
    const freqs = TERRITORY_CHORDS[idx] ?? TERRITORY_CHORDS[0];
    const now = actx.currentTime;
    freqs.forEach((freq, i) => {
      const osc = actx.createOscillator();
      const gain = actx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.08 - i * 0.015, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(gain);
      gain.connect(actx.destination);
      osc.start(now);
      osc.stop(now + 0.30);
    });
  } catch { /* no gesture yet */ }
}

// ── Transmission sound — "what the fuck did I just find?" ────────────────────
// Formant synthesis: pink noise + two bandpass filters at vocal frequencies
// + sawtooth carrier. Each territory has a distinct vocal register.
// Sounds like an intercepted signal — voice-like but uncertain who it is.
const EMISSION_F1 = [350, 270, 430, 310, 250];   // chest resonance
const EMISSION_F2 = [1850, 2100, 1700, 2000, 2300]; // voice character
const EMISSION_PITCH = [110, 98, 120, 105, 92];     // fundamental

function playCardEmissionSound(idx: number) {
  try {
    const actx = getAudioContext();
    const now = actx.currentTime;
    const dur = 0.58;

    // Pink noise buffer — more natural texture than white noise
    const buf = actx.createBuffer(1, Math.ceil(actx.sampleRate * dur), actx.sampleRate);
    const d = buf.getChannelData(0);
    let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
    for (let i = 0; i < d.length; i++) {
      const wn = Math.random() * 2 - 1;
      b0 = 0.99886*b0 + wn*0.0555179; b1 = 0.99332*b1 + wn*0.0750759;
      b2 = 0.96900*b2 + wn*0.1538520; b3 = 0.86650*b3 + wn*0.3104856;
      b4 = 0.55000*b4 + wn*0.5329522; b5 = -0.7616*b5 - wn*0.0168980;
      d[i] = (b0+b1+b2+b3+b4+b5+b6+wn*0.5362) * 0.11;
      b6 = wn * 0.115926;
    }
    const src = actx.createBufferSource();
    src.buffer = buf;

    // F1 — throat resonance
    const bpF1 = actx.createBiquadFilter();
    bpF1.type = 'bandpass';
    bpF1.frequency.value = EMISSION_F1[idx];
    bpF1.Q.value = 2.8;

    // F2 — mouth/voice character
    const bpF2 = actx.createBiquadFilter();
    bpF2.type = 'bandpass';
    bpF2.frequency.value = EMISSION_F2[idx];
    bpF2.Q.value = 4.5;

    // Sawtooth carrier — gives voice-like harmonics
    const osc = actx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = EMISSION_PITCH[idx];
    // Slight frequency drift: makes it feel alive, not synthetic
    osc.frequency.setValueAtTime(EMISSION_PITCH[idx], now);
    osc.frequency.linearRampToValueAtTime(EMISSION_PITCH[idx] * 0.94, now + dur);
    const oscGain = actx.createGain();
    oscGain.gain.value = 0.032;

    // Envelope: fast attack, hold, decay — like a word starting
    const env = actx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(0.16, now + 0.055);
    env.gain.setValueAtTime(0.14, now + 0.20);
    env.gain.exponentialRampToValueAtTime(0.001, now + dur);

    // Soft saturation — "breaking through" signal quality
    const wave = actx.createWaveShaper();
    const k = 100;
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i * 2 / 256) - 1;
      curve[i] = (1 + k / 30) * x / (1 + k / 30 * Math.abs(x));
    }
    wave.curve = curve;

    src.connect(bpF1); src.connect(bpF2);
    osc.connect(oscGain);
    bpF1.connect(env); bpF2.connect(env); oscGain.connect(env);
    env.connect(wave);
    wave.connect(actx.destination);

    src.start(now); src.stop(now + dur);
    osc.start(now); osc.stop(now + dur);
  } catch { /* AudioContext not yet available */ }
}

// ── Gradient color per letter position ───────────────────────────────────────
// t=0 → #00ff88, t=1 → #b026ff
function gradientChar(i: number, total: number): string {
  const t = total > 1 ? i / (total - 1) : 0;
  const r = Math.round(176 * t);
  const g = Math.round(255 - 217 * t);
  const b = Math.round(136 + 119 * t);
  return `rgb(${r},${g},${b})`;
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
}

export function KnifeSelection({ isGeminiConnected, selectedKnifeIndex, onSelect }: KnifeSelectionProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [isEmitting, setIsEmitting] = useState(false);
  const [landedChars, setLandedChars] = useState(0);
  const landingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Transmission sound + emission glow on every card cycle
  useEffect(() => {
    if (selectedKnifeIndex !== null) return;
    playCardEmissionSound(activeIdx);
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
      let count = 0;
      landingTimerRef.current = setInterval(() => {
        count++;
        setLandedChars(count);
        if (count >= question.length) {
          clearInterval(landingTimerRef.current!);
          landingTimerRef.current = null;
        }
      }, 68); // ~68ms per char — meditative pace, not too slow
    }, 1350); // 1.35s: right after glitch frame, question begins forming

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
    }, 12000);  // 12s per territory — let the knife pierce, let the seeker breathe
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
      <div className="oracle-knife-header">◈ CHOOSE YOUR FREQUENCY</div>
      <div className="oracle-knife-subheader">THE ONE ALREADY TRUE. THE EXCAVATION BEGINS THERE.</div>
      {!isGeminiConnected && (
        <div className="oracle-knife-channel-status">◈ OPENING CHANNEL...</div>
      )}

      {/* Card stage — cards project from Oracle's screen above */}
      <div className="oracle-knife-stage">
        {/* Beam connecting to Oracle screen above */}
        <div className={`oracle-knife-origin-beam${isEmitting ? ' oracle-knife-origin-beam--active' : ''}`} />

        <AnimatePresence mode="wait">
          <motion.div
            key={isSelected ? `sel-${selectedKnifeIndex}` : `card-${activeIdx}`}
            className="oracle-knife-card"
            // Origin above the card = Oracle's screen position
            style={{ transformOrigin: '50% -22%' }}
            initial={{
              scale: 0.02,
              opacity: 0,
              filter: 'blur(20px) brightness(4.5) saturate(3)',
            }}
            animate={isSelected && selectedKnifeIndex === activeIdx
              // Selected: surge upward back toward Oracle
              ? {
                  scale: 1.14,
                  opacity: 0,
                  filter: 'blur(14px) brightness(5) saturate(4)',
                }
              // Materializing: GLITCH into full read, then settle holographic
              : {
                  scale:   [0.02, 0.65, 1.06, 1.00, 1.00],
                  opacity: [0,    0.55, 1.00, 1.00, 0.91],   // spike to 1.0 = glitch frame
                  filter: [
                    'blur(20px) brightness(4.5) saturate(3)',
                    'blur(5px)  brightness(2.0) saturate(2)',
                    'blur(0px)  brightness(1.0) saturate(1)', // ← full read glitch
                    'blur(0px)  brightness(1.0) saturate(1)',
                    'blur(0px)  brightness(1.0) saturate(1)',
                  ],
                }
            }
            exit={isSelected
              ? {}
              : {
                  scale: 0.88,
                  opacity: 0,
                  filter: 'blur(10px) brightness(0.5)',
                  transition: { duration: 0.55, ease: [0.4, 0, 1, 1] },
                }
            }
            transition={isSelected && selectedKnifeIndex === activeIdx
              ? { duration: 1.5, ease: [0.4, 0, 1, 1] }
              : {
                  duration: 2.4,
                  ease: 'easeOut',
                  times: [0, 0.38, 0.52, 0.58, 1.0],  // glitch at 38-52%
                }
            }
            onClick={() => {
              if (isSelected) return;
              navigator.vibrate?.([40]);
              playKnifeChord(activeIdx);
              onSelect(kq.question, activeIdx);
            }}
            style={{ transformOrigin: '50% -22%', cursor: isSelected ? 'default' : 'pointer' }}
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

            {/* Territory -- STAB. Solid Oracle green. Always. */}
            <div className="oracle-knife-territory">{kq.territory}</div>

            {/* Gradient divider */}
            <div className="oracle-knife-divider" />

            {/* Question pontif -- letter by letter gradient landing.
                The read IS the animation. Deep think forms as letters arrive. */}
            <div className="oracle-knife-card-question" aria-label={kq.question}>
              {kq.question.split('').map((char, i) => (
                <span
                  key={i}
                  className="oracle-knife-letter"
                  style={{
                    opacity: i < landedChars ? 1 : 0,
                    color: gradientChar(i, kq.question.length),
                    transition: i < landedChars ? 'opacity 0.22s ease' : 'none',
                  }}
                >
                  {char}
                </span>
              ))}
            </div>

            {/* CTA */}
            {!isSelected && (
              <div className="oracle-knife-cta">◈ SELECT FREQUENCY</div>
            )}
          </motion.div>
        </AnimatePresence>
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
