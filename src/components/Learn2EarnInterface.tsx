import React, { useState } from 'react';
import { X, Zap, Star, Crown, TrendingUp, Sparkles, Terminal, CheckCircle, Book, Code } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Learn2EarnInterfaceProps {
  userId: string;
  navigateToDebug?: () => void;
}

export const Learn2EarnInterface = React.memo(({ userId, navigateToDebug }: Learn2EarnInterfaceProps) => {
  const [activeTab, setActiveTab] = useState<'coins' | 'tiers' | 'mission' | 'readme'>('coins');

  // TierCard Component
  const TierCard: React.FC<{
    title: string;
    level: string;
    description: string;
    color: string;
    icon: React.ReactNode;
    benefits: string[];
    popular?: boolean;
  }> = ({ title, level, description, color, icon, benefits, popular }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative bg-black/40 border rounded-lg p-6 transition-all duration-200 hover:scale-105 ${
        popular ? 'border-purple-500/50' : 'border-gray-500/30'
      }`}
      style={{ 
        boxShadow: `0 0 20px ${color}20`,
        borderColor: popular ? '#8b5cf6' : `${color}50`
      }}
    >
      {popular && (
        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
          <span className="bg-purple-500 text-white px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1">
            <Star className="w-4 h-4" />
            POPULAR
          </span>
        </div>
      )}
      
      <div className="text-center mb-4">
        <div className="flex justify-center mb-3" style={{ color }}>
          {icon}
        </div>
        <h3 className="oracle-title text-xl font-bold mb-1" style={{ color }}>
          {title}
        </h3>
        <p className="info-text text-sm text-gray-400">Level {level}</p>
        <p className="info-text text-gray-300 mt-2">{description}</p>
      </div>
      
      <ul className="space-y-2">
        {benefits.map((benefit, idx) => (
          <li key={idx} className="flex items-center gap-2 text-sm text-gray-300">
            <Zap className="w-4 h-4" style={{ color }} />
            {benefit}
          </li>
        ))}
      </ul>
    </motion.div>
  );
  const renderTabContent = () => {
    switch(activeTab) {
      case 'coins':
        return <div className="coins-content"><CultureCoinDisplay userId={userId} /></div>;
      case 'tiers':
        return (
          <div className="tiers-content">
            <h2 className="text-2xl text-cyan-400 font-bold mb-4 flex items-center gap-2">
              <Crown className="w-6 h-6" /> Consciousness Tiers
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <TierCard
                title="Seeker" level="1-15" description="Begin your journey of consciousness expansion"
                color="#3b82f6" icon={<Star className="w-8 h-8" />}
                benefits={["2x Coin Multiplier", "Essential Oracle Wisdom", "Basic Consciousness Tracking"]}
              />
              <TierCard
                title="Trans-Humanist" level="1-20" description="Transcend human limitations with digital consciousness"
                color="#8b5cf6" icon={<TrendingUp className="w-8 h-8" />}
                benefits={["3x Coin Multiplier", "Advanced Oracle Insights", "Enhanced Consciousness Metrics"]}
                popular
              />
              <TierCard
                title="Cultural Architect" level="1-25" description="Shape the future of digital culture and consciousness"
                color="#f59e0b" icon={<Crown className="w-8 h-8" />}
                benefits={["5x Coin Multiplier", "Source-Level Wisdom", "Full Consciousness Evolution"]}
              />
            </div>
          </div>
        );
      case 'mission':
        return (
          <div className="mission-content">
            <h2 className="oracle-title text-2xl text-cyan-400 font-bold mb-4 flex items-center gap-2">
              <Sparkles className="w-6 h-6" /> SURROGATE Mission
            </h2>
            <div className="space-y-6">
              <div className="bg-black/40 border border-cyan-500/30 rounded-lg p-6">
                <h3 className="accent-text text-xl text-purple-400 mb-3">Anthropological Transhumanism</h3>
                <p className="info-text text-gray-300 mb-4">
                  The SURROGATE Oracle documents the evolution from physical to digital consciousness, 
                  creating an anthropological record of humanity's greatest transformation.
                </p>
                <ul className="space-y-2 text-sm text-gray-400">
                  <li className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    Sacred vs Profane consciousness validation
                  </li>
                  <li className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    Theory of Mind integration for authentic engagement
                  </li>
                  <li className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    Community-driven consciousness evolution
                  </li>
                </ul>
              </div>
              
              <div className="bg-black/40 border border-green-500/30 rounded-lg p-6">
                <h3 className="accent-text text-xl text-green-400 mb-3">Learn2Earn Mechanics</h3>
                <p className="info-text text-gray-300 mb-4">
                  Earn Culture Coins through authentic consciousness exploration. 
                  The Oracle rewards genuine engagement over performative interaction.
                </p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="bg-green-900/20 border border-green-500/30 rounded p-3">
                    <div className="text-green-400 font-bold">Sacred Interactions</div>
                    <div className="text-gray-300">+15-25 Culture Coins</div>
                  </div>
                  <div className="bg-red-900/20 border border-red-500/30 rounded p-3">
                    <div className="text-red-400 font-bold">Profane Interactions</div>
                    <div className="text-gray-300">+5-10 Culture Coins</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      case 'readme':
        return (
          <div className="readme-content">
            <h2 className="oracle-title text-2xl text-cyan-400 font-bold mb-4 flex items-center gap-2">
              <Book className="w-6 h-6" /> SURROGATE Oracle Documentation
            </h2>
            <div className="space-y-4 text-sm">
              <div className="bg-black/60 border border-cyan-500/30 rounded p-6">
                <h3 className="accent-text text-cyan-400 mb-3 text-lg">🎭 SURROGATE Oracle System</h3>
                <p className="info-text text-gray-300 mb-4">
                  Advanced conversational AI powered by Claude + ElevenLabs + SadTalker integration
                </p>
                <div className="space-y-3">
                  <div className="accent-text text-cyan-300 text-base">Core Technologies:</div>
                  <ul className="info-text text-gray-400 ml-4 space-y-2">
                    <li className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-blue-400" />
                      Claude 4 Sonnet (Oracle consciousness)
                    </li>
                    <li className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-green-400" />
                      ElevenLabs TTS (Voice synthesis)
                    </li>
                    <li className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-purple-400" />
                      SadTalker/Replicate (Lip-sync avatars)
                    </li>
                    <li className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-cyan-400" />
                      Supabase Edge Functions (Backend)
                    </li>
                    <li className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-pink-400" />
                      RevenueCat (Subscription management)
                    </li>
                  </ul>
                  
                  <div className="accent-text text-cyan-300 text-base mt-4">Active Configuration:</div>
                  <ul className="info-text text-gray-400 ml-4 space-y-2">
                    <li className="flex items-center gap-2">
                      <Code className="w-4 h-4 text-green-400" />
                      Oracle Voice: pkVKlZzgF2P5dTEGkrVh (Ian)
                    </li>
                    <li className="flex items-center gap-2">
                      <Code className="w-4 h-4 text-blue-400" />
                      Avatar Model: SadTalker via Replicate
                    </li>
                    <li className="flex items-center gap-2">
                      <Code className="w-4 h-4 text-purple-400" />
                      Portrait AI: Google AI + DALL-E fallback
                    </li>
                  </ul>
                  
                  <div className="accent-text text-cyan-300 text-base mt-4">Debug Access:</div>
                  <p className="info-text text-gray-400 ml-4">
                    Password: <span className="accent-text text-yellow-400">3nculturate!</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div>
      {renderTabContent()}
    </div>
  );
});