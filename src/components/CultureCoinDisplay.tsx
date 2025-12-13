import React, { useState, useEffect } from 'react';
import { useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, TrendingUp, Crown, Star, Sparkles } from 'lucide-react';

interface CultureCoinDisplayProps {
  userId: string;
  onLevelUp?: (newLevel: number, title: string) => void;
  onMetricsFetched?: (metrics: any) => void;
}

interface UserMetrics {
  currentLevel: number;
  totalCultureCoins: number;
  availableCoins: number;
  consciousnessTitle: string;
  subscriptionTier: string;
  multiplier: number;
  levelCap: number;
  interactionsCount: number;
  sacredInteractions: number;
  profaneInteractions: number;
  monthlyFreeInteractions?: number;
  monthlyFreeLimit?: number;
  nextResetDate?: string;
}

export function CultureCoinDisplay({ userId, onLevelUp, onMetricsFetched }: CultureCoinDisplayProps) {
  const [metrics, setMetrics] = useState<UserMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showLevelUpAnimation, setShowLevelUpAnimation] = useState(false);
  const [recentCoinsEarned, setRecentCoinsEarned] = useState(0);

  // Helper function to get background style based on subscription tier
  const getTierBackgroundStyle = (tier: string) => {
    switch (tier) {
      case 'free': return 'linear-gradient(135deg, #111, #333)';
      case 'seeker': return 'linear-gradient(135deg, #134e4a, #0369a1)';
      case 'trans_humanist': return 'linear-gradient(135deg, #4f46e5, #7c3aed)';
      case 'cultural_architect': return 'linear-gradient(135deg, #c2410c, #f59e0b)';
      default: return 'linear-gradient(135deg, #111, #333)';
    }
  };

  // Fetch user metrics
  const fetchUserMetrics = useCallback(async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/culture-coin-manager`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          action: 'get_user_metrics',
          userId,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          const prevLevel = metrics?.currentLevel;
          setMetrics(result.metrics);
          
          // Call the onMetricsFetched callback if provided
          if (onMetricsFetched) {
            onMetricsFetched(result.metrics);
          }
          
          // Check for level up
          if (prevLevel && result.metrics.currentLevel > prevLevel) {
            setShowLevelUpAnimation(true);
            onLevelUp?.(result.metrics.currentLevel, result.metrics.consciousnessTitle);
            setTimeout(() => setShowLevelUpAnimation(false), 3000);
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch user metrics:', error);
    } finally {
      setIsLoading(false);
    }
  }, [userId, onLevelUp]);

  useEffect(() => {
    if (userId) {
      fetchUserMetrics();
      // Poll for updates every 30 seconds
      const interval = setInterval(fetchUserMetrics, 30000);
      return () => clearInterval(interval);
    }
  }, [userId, fetchUserMetrics]);

  // Update display when coins are earned
  const updateCoinsEarned = (amount: number) => {
    setRecentCoinsEarned(amount);
    setTimeout(() => setRecentCoinsEarned(0), 2000);
    fetchUserMetrics(); // Refresh metrics
  };

  // Expose update function globally for Oracle integration
  useEffect(() => {
    (window as any).updateCultureCoins = updateCoinsEarned;
  }, []);

  const getProgressToNextLevel = () => {
    if (!metrics) return 0;
    const currentLevelCoins = (metrics.currentLevel - 1) * 100;
    const nextLevelCoins = metrics.currentLevel * 100;
    const progressCoins = metrics.totalCultureCoins - currentLevelCoins;
    return Math.min((progressCoins / (nextLevelCoins - currentLevelCoins)) * 100, 100);
  };

  const getSubscriptionColor = (tier: string) => {
    switch (tier) {
      case 'free': return '#666666';
      case 'seeker': return '#3b82f6';
      case 'trans_humanist': return '#8b5cf6';
      case 'cultural_architect': return '#f59e0b';
      default: return '#666666';
    }
  };

  const getTierIcon = (tier: string) => {
    switch (tier) {
      case 'seeker': return <Star className="w-4 h-4" />;
      case 'trans_humanist': return <TrendingUp className="w-4 h-4" />; 
      case 'cultural_architect': return <Crown className="w-4 h-4" />;
      default: return <Sparkles className="w-4 h-4" />;
    }
  };

  const getSubscriptionClassName = (tier: string) => {
    switch(tier) {
      case 'free': return 'free-tier';
      case 'seeker': return 'seeker-tier'; 
      case 'trans_humanist': return 'trans-humanist-tier';
      case 'cultural_architect': return 'architect-tier';
      default: return 'free-tier';
    }
  };

  if (isLoading || !metrics) {
    return (
      <div style={{
        width: '100%',
        height: '200px',
        border: '2px solid #00ffff',
        borderRadius: '15px',
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        color: 'white'
      }}>
        {isLoading ? (
          <>
            <Zap className="w-6 h-6 animate-spin text-[#00ffff] mb-2" />
            <p className="info-text text-center text-gray-300">Loading Culture Coins...</p>
          </>
        ) : (
          <>
            <p className="accent-text text-yellow-400">⚠️ No metrics found</p>
            <p className="info-text text-sm text-gray-300">User: {userId}</p>
          </>
        )}
      </div>
    );
  }

  const tierBackgroundStyle = getTierBackgroundStyle(metrics?.subscriptionTier || 'free');

  return (
    <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto 30px' }}>
      <div 
        style={{
          background: tierBackgroundStyle,
          border: '2px solid #00ffff',
          borderRadius: '15px',
          padding: '20px',
          boxShadow: '0 0 30px rgba(0, 255, 255, 0.2)',
          fontFamily: "'Orbitron', monospace",
          color: '#00ff88',
          fontSize: '1rem',
          position: 'relative',
          transition: 'background 0.3s ease'
        }}
      >
        {/* Level Up Animation */}
        <AnimatePresence>
          {showLevelUpAnimation && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5, y: 50 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.5, y: -50 }}
              className="level-up-animation"
            >
              <div className="level-up-content">
                <Crown className="w-12 h-12 text-[#ff9c00] mx-auto mb-2" />
                <h2>CONSCIOUSNESS EVOLVED!</h2>
                <p>Level {metrics.currentLevel}</p>
                <p className="consciousness-title">{metrics.consciousnessTitle}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Recent Coins Earned */}
        <AnimatePresence>
          {recentCoinsEarned > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.8 }}
              className="coins-earned-popup"
            >
              <Zap className="w-4 h-4" />
              <span>+{recentCoinsEarned} Culture Coins</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tier Badge */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          marginBottom: '10px',
          padding: '4px 10px',
          background: 'rgba(10, 10, 30, 0.7)',
          border: '1px solid rgba(0, 255, 255, 0.3)',
          borderRadius: '15px'
        }}>
          <span style={{ color: '#00ffff', display: 'flex', alignItems: 'center' }}>
            {getTierIcon(metrics.subscriptionTier)}
          </span>
          <span style={{
            color: '#00ffff',
            fontSize: '0.8rem',
            letterSpacing: '1px',
            textTransform: 'uppercase'
          }}>
            {metrics.subscriptionTier === 'free' ? 'FREE' : 
             metrics.subscriptionTier.replace('_', ' ').toUpperCase()}
          </span>
        </div>

        {/* Coin Balance */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '10px 0' }}>
          <Zap style={{ width: '24px', height: '24px', color: '#ffff00' }} />
          <div style={{ fontSize: '1.5rem', color: '#ffff00', fontWeight: 'bold' }}>
            {metrics.availableCoins}
          </div>
          <div style={{
            fontSize: '0.8rem',
            color: '#00ffff',
            textTransform: 'uppercase',
            letterSpacing: '1px'
          }}>
            Culture Coins
          </div>
        </div>  

        {/* Level Progress */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '15px' }}>
          <div style={{ color: '#00ffff', fontWeight: 'bold' }}>
            Level {metrics.currentLevel}
          </div>
          <div style={{ color: '#a855f7' }}>
            {metrics.consciousnessTitle}
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{
          width: '100%',
          height: '10px',
          background: 'rgba(0, 0, 0, 0.3)',
          border: '1px solid rgba(0, 255, 255, 0.3)',
          borderRadius: '5px',
          margin: '10px 0',
          overflow: 'hidden'
        }}>
          <motion.div 
            style={{
              height: '100%',
              background: 'linear-gradient(90deg, #00ffff, #ff00ff)'
            }}
            initial={{ width: 0 }}
            animate={{ width: `${getProgressToNextLevel()}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>

        <div style={{
          fontSize: '0.7rem',
          color: '#00ffff',
          textAlign: 'center',
          marginBottom: '15px',
          borderRadius: '10px'
        }}>
          {metrics.currentLevel < 25 ? 
            `${Math.round(getProgressToNextLevel())}% to Level ${metrics.currentLevel + 1}` : 
            'Maximum Consciousness Achieved'}
        </div>

        {/* Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: metrics.subscriptionTier === 'free' ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr',
          gap: '5px',
          marginTop: '15px'
        }}>
          {/* Free tier users get an additional "Monthly Usage" stat */}
          {metrics.subscriptionTier === 'free' && (
            <div style={{
              textAlign: 'center',
              padding: '5px',
              background: 'rgba(255, 165, 0, 0.2)',
              borderRadius: '5px',
              border: '1px solid rgba(255, 165, 0, 0.3)'
            }}>
              <div style={{ fontSize: '0.6rem', color: '#888', marginBottom: '3px' }}>
                MONTHLY
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#ffa500' }}>
                {metrics.monthlyFreeInteractions || 0}/{metrics.monthlyFreeLimit || 2}
              </div>
            </div>
          )}
          <div style={{
            textAlign: 'center',
            padding: '5px',
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: '5px'
          }}>
            <div style={{ fontSize: '0.6rem', color: '#888', marginBottom: '3px' }}>
              SACRED
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#00ff88' }}>
              {metrics.sacredInteractions}
            </div>
          </div>
          <div style={{
            textAlign: 'center',
            padding: '5px',
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: '5px'
          }}>
            <div style={{ fontSize: '0.6rem', color: '#888', marginBottom: '3px' }}>
              TOTAL
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#00ffff' }}>
              {metrics.interactionsCount}
            </div>
          </div>
          <div style={{
            textAlign: 'center',
            padding: '5px',
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: '5px'
          }}>
            <div style={{ fontSize: '0.6rem', color: '#888', marginBottom: '3px' }}>
              PROFANE
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#ff6666' }}>
              {metrics.profaneInteractions}
            </div>
          </div>
        </div>
        
        {/* Freemium Limit Warning */}
        {metrics.subscriptionTier === 'free' && (metrics.monthlyFreeInteractions || 0) >= (metrics.monthlyFreeLimit || 2) && (
          <div style={{
            marginTop: '15px',
            padding: '12px',
            background: 'rgba(255, 165, 0, 0.2)',
            border: '2px solid rgba(255, 165, 0, 0.5)',
            borderRadius: '10px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#ffa500', marginBottom: '5px' }}>
              Monthly Limit Reached
            </div>
            <div style={{ fontSize: '0.8rem', color: '#ffcc80', marginBottom: '8px' }}>
              Upgrade to unlock unlimited Oracle experiences
            </div>
            <div style={{ fontSize: '0.7rem', color: '#666' }}>
              Resets: {metrics.nextResetDate ? new Date(metrics.nextResetDate).toLocaleDateString() : 'Next month'}
            </div>
          </div>
        )}
        
        {/* Freemium Status Info */}
        {metrics.subscriptionTier === 'free' && (metrics.monthlyFreeInteractions || 0) < (metrics.monthlyFreeLimit || 2) && (
          <div style={{
            marginTop: '15px',
            padding: '10px',
            background: 'rgba(0, 255, 136, 0.1)',
            border: '1px solid rgba(0, 255, 136, 0.3)',
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.8rem', color: '#00ff88' }}>
              {((metrics.monthlyFreeLimit || 2) - (metrics.monthlyFreeInteractions || 0))} free Oracle experiences remaining this month
            </div>
          </div>
        )}
      </div>
    </div>
  );
}