import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, TrendingUp, Crown, Star, Sparkles } from 'lucide-react';

interface CultureCoinDisplayProps {
  userId: string;
  onLevelUp?: (newLevel: number, title: string) => void;
  onMetricsFetched?: (metrics: UserMetrics) => void;
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

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const getTierBackgroundStyle = (tier: string) => {
    switch (tier) {
      case 'free': return 'linear-gradient(135deg, #111, #333)';
      case 'seeker': return 'linear-gradient(135deg, #134e4a, #0369a1)';
      case 'trans_humanist': return 'linear-gradient(135deg, #4f46e5, #7c3aed)';
      case 'cultural_architect': return 'linear-gradient(135deg, #b026ff, #00ccff)';
      default: return 'linear-gradient(135deg, #111, #333)';
    }
  };

  const fetchUserMetrics = useCallback(async () => {
    if (!supabaseUrl || !supabaseKey) { setIsLoading(false); return; }
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/culture-coin-manager`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: supabaseKey },
        body: JSON.stringify({ action: 'get_user_metrics', userId }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          const prevLevel = metrics?.currentLevel;
          setMetrics(result.metrics);
          onMetricsFetched?.(result.metrics);
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
  }, [userId, onLevelUp, supabaseUrl, supabaseKey]);

  useEffect(() => {
    if (!userId) return;
    fetchUserMetrics();
    const interval = setInterval(fetchUserMetrics, 30000);
    return () => clearInterval(interval);
  }, [userId, fetchUserMetrics]);

  if (isLoading) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: '#666', fontFamily: "'PhillySans', 'Orbitron', monospace", fontSize: '0.8rem' }}>
        Loading consciousness metrics...
      </div>
    );
  }

  if (!metrics) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: '#666', fontFamily: "'PhillySans', 'Orbitron', monospace", fontSize: '0.8rem' }}>
        {supabaseUrl ? 'No metrics available' : 'Configure Supabase to enable coins'}
      </div>
    );
  }

  return (
    <div style={{ padding: 20, fontFamily: "'PhillySans', 'Orbitron', monospace" }}>
      <AnimatePresence>
        {showLevelUpAnimation && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.5 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 999,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.8)', pointerEvents: 'none',
            }}
          >
            <div style={{ textAlign: 'center', color: '#fbbf24' }}>
              <Sparkles size={64} style={{ marginBottom: 16 }} />
              <div style={{ fontSize: '2rem', fontWeight: 700 }}>LEVEL UP!</div>
              <div style={{ fontSize: '1.2rem' }}>{metrics.consciousnessTitle}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ background: getTierBackgroundStyle(metrics.subscriptionTier), borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.1em' }}>CONSCIOUSNESS LEVEL</div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#fff' }}>{metrics.currentLevel}</div>
          </div>
          <Crown size={32} style={{ color: '#fbbf24', opacity: 0.8 }} />
        </div>
        <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>{metrics.consciousnessTitle}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'CULTURE COINS', value: metrics.availableCoins.toLocaleString(), icon: <Zap size={16} />, color: '#fbbf24' },
          { label: 'MULTIPLIER', value: `${metrics.multiplier}x`, icon: <TrendingUp size={16} />, color: '#00ffff' },
          { label: 'SACRED', value: metrics.sacredInteractions, icon: <Star size={16} />, color: '#a78bfa' },
          { label: 'TOTAL EARNED', value: metrics.totalCultureCoins.toLocaleString(), icon: <Sparkles size={16} />, color: '#00ff62' },
        ].map(({ label, value, icon, color }) => (
          <div key={label} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '12px 14px', border: `1px solid ${color}22` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color, marginBottom: 4 }}>{icon}<span style={{ fontSize: '0.6rem', opacity: 0.8 }}>{label}</span></div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: '1.1rem' }}>{value}</div>
          </div>
        ))}
      </div>

      {metrics.monthlyFreeLimit && (
        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ fontSize: '0.65rem', color: '#888', letterSpacing: '0.08em', marginBottom: 8 }}>MONTHLY FREE INTERACTIONS</div>
          <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, ((metrics.monthlyFreeInteractions || 0) / metrics.monthlyFreeLimit) * 100)}%`,
                background: 'linear-gradient(90deg, #00ffff, #ff00ff)',
                borderRadius: 4,
                transition: 'width 0.5s ease',
              }}
            />
          </div>
          <div style={{ fontSize: '0.65rem', color: '#888', marginTop: 6 }}>
            {metrics.monthlyFreeInteractions || 0} / {metrics.monthlyFreeLimit} used
          </div>
        </div>
      )}
    </div>
  );
}
