import { motion } from 'framer-motion';
import { BookOpen, Link2, Cpu, Globe, Factory } from 'lucide-react';

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
    color: '#00ccff',
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
        key="knife-section"
        className="oracle-knife-section"
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 30, transition: { duration: 0.4 } }}
        transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
      >
        <div className="oracle-knife-header">◈ CHOOSE YOUR FREQUENCY</div>
        {!isGeminiConnected && (
          <div className="oracle-knife-channel-status">◈ OPENING CHANNEL...</div>
        )}
        <div className="oracle-knife-subheader">
          THE ONE ALREADY TRUE. THE EXCAVATION BEGINS THERE.
        </div>

        <div className="oracle-knife-scroll-container">
          <div className="oracle-knife-cards">
            {KNIFE_QUESTIONS.map((kq, idx) => (
              <motion.div
                key={idx}
                className={`oracle-knife-card${selectedKnifeIndex === idx ? ' oracle-knife-card--selected' : ''}`}
                initial={{ opacity: 0, x: 60, filter: 'blur(8px) brightness(1.8)' }}
                animate={{ opacity: 1, x: 0, filter: 'blur(0px) brightness(1)' }}
                transition={{ delay: 0.5 + 0.08 * idx, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                whileHover={{ scale: 1.03, y: -8, transition: { duration: 0.2 } }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onSelect(kq.question, idx)}
                style={{ '--accent-color': kq.color } as React.CSSProperties}
              >
                <div className="oracle-knife-card-top">
                  <kq.icon size={18} style={{ color: kq.color, filter: `drop-shadow(0 0 8px ${kq.color})`, flexShrink: 0 }} />
                  <span className="oracle-knife-territory">{kq.territory}</span>
                </div>
                <div className="oracle-knife-card-question">{kq.question}</div>
                <div className="oracle-knife-card-accent" style={{ background: `linear-gradient(to right, ${kq.color}, transparent)` }} />
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>
    </>
  );
}
