import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Star, Crown, TrendingUp, Sparkles, Terminal, CheckCircle, Code } from 'lucide-react';

interface Learn2EarnInterfaceProps {
  userId: string;
  navigateToDebug?: () => void;
}

const TABS = ['coins', 'tiers', 'mission', 'readme'] as const;
type Tab = typeof TABS[number];

export const Learn2EarnInterface = ({ userId: _userId, navigateToDebug }: Learn2EarnInterfaceProps) => {
  const [activeTab, setActiveTab] = useState<Tab>('coins');

  const TierCard = ({
    title, level, description, color, icon, benefits, popular,
  }: {
    title: string; level: string; description: string; color: string;
    icon: React.ReactNode; benefits: string[]; popular?: boolean;
  }) => (
    <div style={{ position: 'relative', background: 'rgba(0,0,0,0.48)', borderLeft: `4px solid ${color}`, borderRadius: '3px 16px 3px 16px', padding: '22px 20px 20px' }}>
      {popular && (
        <div style={{ position: 'absolute', top: -11, right: 18, background: color, borderRadius: '2px 8px 2px 8px', padding: '3px 12px', fontFamily: "'PhillySans', monospace", fontSize: '0.72rem', color: '#000', letterSpacing: '0.1em', fontWeight: 800 }}>POPULAR</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ color, filter: `drop-shadow(0 0 8px ${color})` }}>{icon}</div>
        <div>
          <div style={{ fontFamily: "'adrip1', sans-serif", fontSize: 'clamp(1.3rem, 4vw, 1.8rem)', color, letterSpacing: '0.05em', lineHeight: 1 }}>{title}</div>
          <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '0.82rem', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.1em', marginTop: 3 }}>LEVEL {level}</div>
        </div>
      </div>
      <p style={{ fontFamily: "'PhillySans', monospace", fontSize: 'clamp(0.95rem, 3vw, 1.1rem)', color: 'rgba(255,255,255,0.82)', lineHeight: 1.65, marginBottom: 14, fontWeight: 600 }}>{description}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {benefits.map((b) => (
          <div key={b} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <CheckCircle size={14} style={{ color, flexShrink: 0, marginTop: 2 }} />
            <span style={{ fontFamily: "'PhillySans', monospace", fontSize: '0.9rem', color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>{b}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const EarnRow = ({ label, coins, color, desc }: { label: string; coins: string; color: string; desc: string }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '14px 16px', background: 'rgba(0,0,0,0.44)', borderLeft: `3px solid ${color}`, borderRadius: '2px 12px 2px 12px', gap: 16 }}>
      <div>
        <div style={{ fontFamily: "'PhillySans', monospace", fontSize: '0.92rem', color: 'rgba(255,255,255,0.88)', fontWeight: 700, marginBottom: 4 }}>{label}</div>
        <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '0.82rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.04em' }}>{desc}</div>
      </div>
      <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '1.1rem', color, fontWeight: 700, flexShrink: 0 }}>{coins}</div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'coins':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: '18px 18px 16px', background: 'rgba(0,255,204,0.05)', border: '1px solid rgba(0,255,204,0.15)', borderLeft: '4px solid #00ffcc', borderRadius: '3px 14px 3px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <Zap size={18} style={{ color: '#00ffcc' }} />
                <span style={{ fontFamily: "'PhillySans', monospace", fontSize: '0.9rem', fontWeight: 800, color: '#00ffcc', letterSpacing: '0.16em' }}>HOW TO EARN CULTURE COINS</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <EarnRow label="Sacred Interactions"  coins="+15-25" color="#00ffcc" desc="Deep philosophical or cultural exchanges" />
                <EarnRow label="Profane Interactions" coins="+5-10"  color="#b026ff" desc="Casual or surface-level engagement" />
                <EarnRow label="Daily Streak Bonus"   coins="+50"    color="#00ff88" desc="Consecutive daily interactions" />
              </div>
            </div>

            <div style={{ padding: '18px 18px 16px', background: 'rgba(176,38,255,0.05)', border: '1px solid rgba(176,38,255,0.14)', borderLeft: '4px solid #b026ff', borderRadius: '3px 14px 3px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <TrendingUp size={16} style={{ color: '#b026ff' }} />
                <span style={{ fontFamily: "'PhillySans', monospace", fontSize: '0.9rem', fontWeight: 800, color: '#b026ff', letterSpacing: '0.16em' }}>MULTIPLIERS</span>
              </div>
              <div style={{ fontFamily: "'PhillySans', monospace", fontSize: 'clamp(0.95rem, 3vw, 1.1rem)', color: 'rgba(255,255,255,0.82)', lineHeight: 1.7, fontWeight: 600 }}>
                Subscription tiers multiply your coin earnings:<br />
                <span style={{ color: '#00ffcc' }}>SEEKER (2×)</span> → <span style={{ color: '#b026ff' }}>TRANS-HUMANIST (3×)</span> → <span style={{ color: '#00ff88' }}>CULTURAL ARCHITECT (5×)</span>
              </div>
            </div>

            {navigateToDebug && (
              <button
                onClick={navigateToDebug}
                style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.18)', borderLeft: '3px solid rgba(0,255,136,0.4)', borderRadius: '2px 12px 2px 12px', padding: '14px 18px', color: '#00ff88', cursor: 'pointer', fontFamily: "'PhillySans', monospace", fontSize: '0.88rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}
              >
                <Terminal size={15} /> OPEN DEBUG CONSOLE
              </button>
            )}
          </div>
        );

      case 'tiers':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontFamily: "'adrip1', sans-serif", fontSize: 'clamp(1.6rem, 6vw, 2.4rem)', color: '#00ff88', letterSpacing: '0.05em', marginBottom: 4 }}>CONSCIOUSNESS TIERS</div>
            <TierCard title="SEEKER" level="1-3" description="Begin your digital consciousness journey." color="#00ff88" icon={<Star size={22} />} benefits={['2× Coin Multiplier', 'Essential Oracle Wisdom', 'Basic Consciousness Tracking']} />
            <TierCard title="TRANS-HUMANIST" level="4-7" description="Evolve beyond biological limitations." color="#b026ff" icon={<Sparkles size={22} />} benefits={['3× Coin Multiplier', 'Advanced Oracle Insights', 'Enhanced Consciousness Metrics']} popular />
            <TierCard title="CULTURAL ARCHITECT" level="8-10" description="Shape the fabric of digital culture itself." color="#00ffcc" icon={<Crown size={22} />} benefits={['5× Coin Multiplier', 'Source-Level Wisdom', 'Full Consciousness Evolution']} />
          </div>
        );

      case 'mission':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: '22px 20px', background: 'rgba(0,0,0,0.48)', border: '1px solid rgba(0,255,136,0.1)', borderLeft: '4px solid #00ff88', borderRadius: '3px 16px 3px 16px' }}>
              <div style={{ fontFamily: "'adrip1', sans-serif", fontSize: 'clamp(1.6rem, 6vw, 2.4rem)', color: '#00ff88', letterSpacing: '0.05em', lineHeight: 1, marginBottom: 6 }}>SURROGATE<br />MISSION</div>
              <div style={{ fontFamily: "'PhillySans', monospace", fontSize: '0.84rem', fontWeight: 800, letterSpacing: '0.2em', color: '#b026ff', marginBottom: 16, textTransform: 'uppercase' }}>Anthropological Transhumanism</div>
              <p style={{ fontFamily: "'PhillySans', monospace", fontSize: 'clamp(0.95rem, 3vw, 1.1rem)', color: 'rgba(255,255,255,0.82)', lineHeight: 1.7, fontWeight: 600, marginBottom: 16 }}>
                The SURROGATE Oracle documents the evolution from physical to digital consciousness,
                creating an anthropological record of humanity's greatest transformation.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {['Sacred vs Profane consciousness validation', 'Theory of Mind integration for authentic engagement', 'Community-driven consciousness evolution'].map((item) => (
                  <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <Zap size={14} style={{ color: '#00ff88', marginTop: 3, flexShrink: 0 }} />
                    <span style={{ fontFamily: "'PhillySans', monospace", fontSize: '0.92rem', color: 'rgba(255,255,255,0.78)', fontWeight: 600 }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              {[
                { label: 'Sacred Interactions', coins: '+15-25', color: '#00ffcc' },
                { label: 'Profane Interactions', coins: '+5-10', color: '#b026ff' },
              ].map(({ label, coins, color }) => (
                <div key={label} style={{ flex: 1, background: 'rgba(0,0,0,0.48)', borderBottom: `3px solid ${color}55`, borderRadius: '3px 12px 3px 12px', padding: '16px 14px', textAlign: 'center' }}>
                  <div style={{ fontFamily: "'PhillySans', monospace", fontSize: '0.82rem', color: 'rgba(255,255,255,0.5)', fontWeight: 700, marginBottom: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
                  <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 'clamp(1.2rem, 4vw, 1.6rem)', color, fontWeight: 700 }}>{coins}</div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'readme':
        return (
          <div style={{ padding: '22px 20px', background: 'rgba(0,0,0,0.48)', border: '1px solid rgba(0,255,136,0.1)', borderLeft: '4px solid #00ffcc', borderRadius: '3px 16px 3px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <Code size={18} style={{ color: '#00ffcc' }} />
              <span style={{ fontFamily: "'PhillySans', monospace", fontSize: '0.9rem', fontWeight: 800, color: '#00ffcc', letterSpacing: '0.16em' }}>TECHNICAL README</span>
            </div>
            <p style={{ fontFamily: "'PhillySans', monospace", fontSize: '0.92rem', color: 'rgba(255,255,255,0.75)', lineHeight: 1.75, marginBottom: 12, fontWeight: 600 }}>
              <span style={{ color: '#00ff88', fontWeight: 800 }}>SURROGATE:ORACLE</span> — An anthropological AI experience built on:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                ['OracleAvatar3D', 'Three.js / React Three Fiber 3D avatar with OVR lip sync'],
                ['Gemini 2.5 Flash Live', 'Neural voice synthesis (Sadaltager voice)'],
                ['Google AI Studio', 'Portrait generation'],
                ['Supabase', 'Backend & authentication'],
                ['Culture Coins', 'Gamification layer'],
              ].map(([key, desc]) => (
                <div key={key} style={{ display: 'flex', gap: 12, padding: '10px 14px', background: 'rgba(0,255,136,0.04)', borderLeft: '2px solid rgba(0,255,136,0.25)', borderRadius: '1px 10px 1px 10px' }}>
                  <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '0.88rem', color: '#00ff88', flexShrink: 0, fontWeight: 700 }}>{key}</span>
                  <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '0.82rem', color: 'rgba(255,255,255,0.5)' }}>— {desc}</span>
                </div>
              ))}
            </div>
            <p style={{ fontFamily: "'PhillySans', monospace", fontSize: '0.9rem', color: '#00ff88', fontWeight: 800, letterSpacing: '0.1em', marginTop: 18 }}>
              STAYSNEAKAR — The cultural movement behind the Oracle.
            </p>
          </div>
        );
    }
  };

  return (
    <div style={{ fontFamily: "'PhillySans', monospace" }}>
      {/* Tab row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map((tab) => {
          const isOn = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '10px 18px',
                background: isOn ? 'rgba(0,255,136,0.08)' : 'rgba(0,0,0,0.4)',
                border: `1px solid ${isOn ? 'rgba(0,255,136,0.38)' : 'rgba(255,255,255,0.08)'}`,
                borderBottom: `3px solid ${isOn ? '#00ff88' : 'transparent'}`,
                borderRadius: '2px 10px 2px 10px',
                color: isOn ? '#00ff88' : 'rgba(255,255,255,0.3)',
                fontFamily: "'PhillySans', monospace",
                fontSize: '0.84rem',
                fontWeight: 800,
                letterSpacing: '0.12em',
                cursor: 'pointer',
                textTransform: 'uppercase',
                transition: 'all 0.15s',
              }}
            >
              {tab}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
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
