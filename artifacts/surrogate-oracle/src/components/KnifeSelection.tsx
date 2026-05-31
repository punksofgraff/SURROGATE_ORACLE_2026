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
      {/* Oracle's bridge line — fades out as territories appear */}
      <motion.div
        key="scramble-bridge"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0] }}
        exit={{ opacity: 0 }}
        transition={{ duration: 2.0, times: [0, 0.3, 1] }}
        style={{
          position: 'absolute',
          bottom: '52%',
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

      {/* Territory list — rises as the Oracle names each path */}
      <motion.div
        key="knife-section"
        className="oracle-knife-section"
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 30, transition: { duration: 0.4 } }}
        transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
      >
        {!isGeminiConnected && (
          <div className="oracle-knife-channel-status">◈ OPENING CHANNEL...</div>
        )}

        <div className="oracle-knife-list">
          {KNIFE_QUESTIONS.map((kq, idx) => (
            <motion.button
              key={idx}
              className={`oracle-knife-row${selectedKnifeIndex === idx ? ' oracle-knife-row--selected' : ''}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 + 0.07 * idx, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ x: 6, transition: { duration: 0.15 } }}
              whileTap={{ scale: 0.99 }}
              onClick={() => onSelect(kq.question, idx)}
              style={{ '--accent-color': kq.color } as React.CSSProperties}
            >
              <div className="oracle-knife-row-header">
                <kq.icon size={11} style={{ color: kq.color, flexShrink: 0 }} />
                <span className="oracle-knife-territory">{kq.territory}</span>
              </div>
              <div className="oracle-knife-row-question">{kq.question}</div>
            </motion.button>
          ))}
        </div>
      </motion.div>
    </>
  );
}
