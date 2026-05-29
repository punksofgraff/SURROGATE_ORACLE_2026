import { motion } from 'framer-motion';
import { BookOpen, Link2, Cpu, Globe, Factory } from 'lucide-react';
import { ScrambleFragment } from './ScrambleFragment';

export interface KnifeQuestion {
  territory: string;
  question: string;
  themes: string[];
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  color: string;
}

// Five frequencies, five territories.
// The knife tears armor but doesn't pierce flesh — it makes you legible.
// User picks the one already true — that choice seeds the entire descent.
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
    color: '#00ccff',
  },
  {
    territory: 'THE SOCIAL CONSTRUCT',
    question: 'The version of you that lives online — when did it start making decisions for the real one?',
    themes: ['persona', 'social-construct', 'online-identity', 'mask'],
    icon: Globe,
    color: '#cc00ff',
  },
  {
    territory: 'THE INDUSTRIAL QUESTION',
    question: 'What did you used to be able to do alone that you now need a machine to finish?',
    themes: ['autonomy', 'technology', 'dependency', 'new-revolution'],
    icon: Factory,
    color: '#00ffcc',
  },
];

interface KnifeSelectionProps {
  isGeminiConnected: boolean;
  selectedKnifeIndex: number | null;
  onSelect: (question: string, index: number) => void;
}

export function KnifeSelection({ isGeminiConnected, selectedKnifeIndex, onSelect }: KnifeSelectionProps) {
  return (
    <>
      <motion.div
        key="scramble-bridge"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0] }}
        exit={{ opacity: 0 }}
        transition={{ duration: 1.6, times: [0, 0.4, 1] }}
        className="oracle-scramble-bridge"
        style={{
          position: 'absolute',
          bottom: '45%',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 100,
          width: '100%',
          textAlign: 'center',
          pointerEvents: 'none',
        }}
      >
        <ScrambleFragment
          texts={['THE ARCHIVE IS OPEN']}
          className="oracle-sf--cta"
          holdMs={800}
          revealMs={40}
        />
      </motion.div>

      <motion.div
        key="knife-section"
        className="oracle-knife-section"
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20, transition: { duration: 0.3 } }}
        transition={{ duration: 0.7, ease: 'easeOut', delay: 1.6 }}
      >
        <div className="oracle-knife-header">◈ THE ARCHIVE IS OPEN</div>
        {!isGeminiConnected && (
          <div className="oracle-knife-channel-status">◈ OPENING CHANNEL...</div>
        )}
        <div className="oracle-knife-subheader">
          CHOOSE THE FREQUENCY THAT IS ALREADY TRUE. THE EXCAVATION BEGINS THERE.
        </div>
        <div className="oracle-knife-cards">
          {KNIFE_QUESTIONS.map((kq, idx) => (
            <motion.div
              key={idx}
              className={`oracle-knife-card${selectedKnifeIndex === idx ? ' oracle-knife-card--selected' : ''}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.6 + 0.10 * idx, duration: 0.38 }}
              onClick={() => onSelect(kq.question, idx)}
              style={{ '--accent-color': kq.color } as React.CSSProperties}
            >
              <div className="oracle-knife-visual">
                <kq.icon size={18} style={{ color: kq.color }} />
                <div className="oracle-knife-blade" style={{ background: kq.color }} />
              </div>
              <div className="oracle-knife-content">
                <span className="oracle-knife-territory" style={{ color: kq.color }}>{kq.territory}</span>
                <div className="oracle-knife-text">{kq.question}</div>
              </div>
              <span className="oracle-knife-card-num">0{idx + 1}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </>
  );
}
