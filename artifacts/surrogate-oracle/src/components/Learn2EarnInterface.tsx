import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Star, Crown, TrendingUp, Sparkles, Terminal, CheckCircle, Book, Code } from 'lucide-react';

interface Learn2EarnInterfaceProps {
  userId: string;
  navigateToDebug?: () => void;
}

export const Learn2EarnInterface = ({ userId, navigateToDebug }: Learn2EarnInterfaceProps) => {
  const [activeTab, setActiveTab] = useState<'coins' | 'tiers' | 'mission' | 'readme'>('coins');

  const tabStyle = (tab: string): React.CSSProperties => ({
    padding: '8px 16px',
    background: activeTab === tab ? 'rgba(0,255,255,0.15)' : 'transparent',
    border: `1px solid ${activeTab === tab ? 'rgba(0,255,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
    borderRadius: 8,
    color: activeTab === tab ? '#00ffff' : '#666',
    fontFamily: "'Orbitron', monospace",
    fontSize: '0.7rem',
    cursor: 'pointer',
    letterSpacing: '0.05em',
    transition: 'all 0.2s ease',
  });

  const TierCard = ({
    title, level, description, color, icon, benefits, popular,
  }: {
    title: string; level: string; description: string; color: string;
    icon: React.ReactNode; benefits: string[]; popular?: boolean;
  }) => (
    <div style={{
      background: `linear-gradient(135deg, ${color}11, ${color}22)`,
      border: `1px solid ${color}44`,
      borderRadius: 12,
      padding: '16px 20px',
      position: 'relative',
    }}>
      {popular && (
        <div style={{
          position: 'absolute', top: -10, right: 16,
          background: color, borderRadius: 10, padding: '2px 10px',
          fontSize: '0.6rem', color: '#000', letterSpacing: '0.1em', fontWeight: 700,
        }}>POPULAR</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ color }}>{icon}</div>
        <div>
          <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.85rem' }}>{title}</div>
          <div style={{ fontSize: '0.65rem', color: '#888' }}>Level {level}</div>
        </div>
      </div>
      <p style={{ fontSize: '0.72rem', color: '#aaa', marginBottom: 10, lineHeight: 1.5 }}>{description}</p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {benefits.map((b) => (
          <li key={b} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', color: '#ccc' }}>
            <CheckCircle size={10} style={{ color, flexShrink: 0 }} />{b}
          </li>
        ))}
      </ul>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'coins':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 10, padding: '14px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Zap size={16} style={{ color: '#fbbf24' }} />
                <span style={{ color: '#fbbf24', fontSize: '0.8rem', fontWeight: 700 }}>HOW TO EARN CULTURE COINS</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: 'Sacred Interactions', coins: '+15-25', color: '#a78bfa', desc: 'Deep philosophical or cultural exchanges' },
                  { label: 'Profane Interactions', coins: '+5-10', color: '#fb923c', desc: 'Casual or surface-level engagement' },
                  { label: 'Daily Streak Bonus', coins: '+50', color: '#00ff62', desc: 'Consecutive daily interactions' },
                ].map(({ label, coins, color, desc }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#ddd' }}>{label}</div>
                      <div style={{ fontSize: '0.65rem', color: '#666' }}>{desc}</div>
                    </div>
                    <div style={{ color, fontWeight: 700, fontSize: '0.85rem' }}>{coins}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: 'rgba(0,255,255,0.05)', border: '1px solid rgba(0,255,255,0.15)', borderRadius: 10, padding: '14px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <TrendingUp size={14} style={{ color: '#00ffff' }} />
                <span style={{ color: '#00ffff', fontSize: '0.75rem', fontWeight: 700 }}>MULTIPLIERS</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#aaa', lineHeight: 1.7 }}>
                Subscription tiers multiply your coin earnings:
                SEEKER (2x) → TRANS-HUMANIST (3x) → CULTURAL ARCHITECT (5x)
              </div>
            </div>

            {navigateToDebug && (
              <button
                onClick={navigateToDebug}
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', color: '#888', cursor: 'pointer', fontSize: '0.7rem', fontFamily: "'Orbitron', monospace' " }}
              >
                <Terminal size={13} /> Open Debug Console
              </button>
            )}
          </div>
        );

      case 'tiers':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h3 style={{ color: '#fff', fontSize: '0.85rem', letterSpacing: '0.1em', marginBottom: 4 }}>CONSCIOUSNESS TIERS</h3>
            <TierCard title="SEEKER" level="1-3" description="Begin your digital consciousness journey." color="#22d3ee" icon={<Star size={18} />} benefits={['2x Coin Multiplier', 'Essential Oracle Wisdom', 'Basic Consciousness Tracking']} />
            <TierCard title="TRANS-HUMANIST" level="4-7" description="Evolve beyond biological limitations." color="#a78bfa" icon={<Sparkles size={18} />} benefits={['3x Coin Multiplier', 'Advanced Oracle Insights', 'Enhanced Consciousness Metrics']} popular />
            <TierCard title="CULTURAL ARCHITECT" level="8-10" description="Shape the fabric of digital culture itself." color="#f59e0b" icon={<Crown size={18} />} benefits={['5x Coin Multiplier', 'Source-Level Wisdom', 'Full Consciousness Evolution']} />
          </div>
        );

      case 'mission':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '16px 20px' }}>
              <h3 style={{ color: '#00ffff', fontSize: '0.85rem', letterSpacing: '0.1em', marginBottom: 10 }}>SURROGATE MISSION</h3>
              <h4 style={{ color: '#a78bfa', fontSize: '0.75rem', marginBottom: 8 }}>Anthropological Transhumanism</h4>
              <p style={{ fontSize: '0.72rem', color: '#aaa', lineHeight: 1.7, marginBottom: 12 }}>
                The SURROGATE Oracle documents the evolution from physical to digital consciousness,
                creating an anthropological record of humanity's greatest transformation.
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {['Sacred vs Profane consciousness validation', 'Theory of Mind integration for authentic engagement', 'Community-driven consciousness evolution'].map((item) => (
                  <li key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.7rem', color: '#ccc' }}>
                    <Zap size={10} style={{ color: '#fbbf24', marginTop: 3, flexShrink: 0 }} />{item}
                  </li>
                ))}
              </ul>
            </div>

            <div style={{ background: 'rgba(0,255,98,0.05)', border: '1px solid rgba(0,255,98,0.15)', borderRadius: 10, padding: '16px 20px' }}>
              <h4 style={{ color: '#00ff62', fontSize: '0.75rem', marginBottom: 10 }}>LEARN2EARN MECHANICS</h4>
              <div style={{ display: 'flex', gap: 12 }}>
                {[{ label: 'Sacred Interactions', coins: '+15-25 Culture Coins', color: '#a78bfa' }, { label: 'Profane Interactions', coins: '+5-10 Culture Coins', color: '#fb923c' }].map(({ label, coins, color }) => (
                  <div key={label} style={{ flex: 1, background: `${color}11`, border: `1px solid ${color}33`, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.65rem', color: '#888', marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: '0.75rem', color, fontWeight: 700 }}>{coins}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'readme':
        return (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Code size={16} style={{ color: '#00ffff' }} />
              <span style={{ color: '#00ffff', fontSize: '0.8rem', fontWeight: 700 }}>TECHNICAL README</span>
            </div>
            <div style={{ fontSize: '0.72rem', color: '#aaa', lineHeight: 1.8 }}>
              <p><strong style={{ color: '#fff' }}>SURROGATE Oracle</strong> — An anthropological AI experience built on:</p>
              <ul style={{ paddingLeft: 16, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <li>Decart LipSync Live — Real-time talking avatar</li>
                <li>Claude AI — Oracle conversation engine</li>
                <li>ElevenLabs — Voice synthesis</li>
                <li>Supabase — Backend &amp; authentication</li>
                <li>Culture Coins — Gamification layer</li>
              </ul>
              <p style={{ marginTop: 12 }}>
                <strong style={{ color: '#00ff62' }}>STAYSNEAKAR</strong> — The cultural movement behind the Oracle.
              </p>
            </div>
          </div>
        );
    }
  };

  return (
    <div style={{ padding: 20, fontFamily: "'Orbitron', monospace", color: '#fff' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {(['coins', 'tiers', 'mission', 'readme'] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={tabStyle(tab)}>
            {tab.toUpperCase()}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {renderContent()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
