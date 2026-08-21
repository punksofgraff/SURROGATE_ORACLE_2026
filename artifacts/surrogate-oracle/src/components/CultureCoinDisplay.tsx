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

const TIER_ACCENT: Record<string, string> = {
  free:              '#00ff88',
  seeker:            '#00ffcc',
  trans_humanist:    '#b026ff',
  cultural_architect:'#00ffcc',
};

export function CultureCoinDisplay({ userId, onLevelUp, onMetricsFetched }: CultureCoinDisplayProps) {
  const [metrics, setMetrics]                   = useState<UserMetrics | null>(null);
  const [isLoading, setIsLoading]               = useState(true);
  const [showLevelUpAnimation, setShowLevelUp]  = useState(false);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
            setShowLevelUp(true);
            onLevelUp?.(result.metrics.currentLevel, result.metrics.consciousnessTitle);
            setTimeout(() => setShowLevelUp(false), 3000);
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
      <div style={{ padding: '32px 0', textAlign: 'center', fontFamily: "'Share Tech Mono', monospace", fontSize: '0.9rem', color: '#00ffcc', letterSpacing: '0.18em', opacity: 0.5 }}>
        LOADING CONSCIOUSNESS...
      </div>
    );
  }

  if (!metrics) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center', fontFamily: "'Share Tech Mono', monospace", fontSize: '0.9rem', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.14em' }}>
        {supabaseUrl ? 'NO_METRICS_AVAILABLE' : 'CONFIGURE_SUPABASE'}
      </div>
    );
  }

  const accent = TIER_ACCENT[metrics.subscriptionTier] ?? '#00ff88';
  const usedPct = metrics.monthlyFreeLimit
    ? Math.min(100, ((metrics.monthlyFreeInteractions || 0) / metrics.monthlyFreeLimit) * 100)
    : 0;

  return (
    <div style={{ fontFamily: "'PhillySans', monospace", display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Level Up flash */}
      <AnimatePresence>
        {showLevelUpAnimation && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            style={{ position: 'fixed', inset: 0, zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', pointerEvents: 'none' }}
          >
            <div style={{ textAlign: 'center' }}>
              <Sparkles size={56} style={{ color: '#00ff88', marginBottom: 16, filter: 'drop-shadow(0 0 24px #00ff88)' }} />
              <div style={{ fontFamily: "'adrip1', sans-serif", fontSize: 'clamp(2.2rem, 8vw, 3.4rem)', color: '#00ff88', filter: 'drop-shadow(0 0 28px #00ff88)', letterSpacing: '0.05em' }}>LEVEL UP</div>
              <div style={{ fontFamily: "'PhillySans', monospace", fontSize: '1.1rem', color: '#00ffcc', letterSpacing: '0.2em', marginTop: 8, fontWeight: 800 }}>{metrics.consciousnessTitle.toUpperCase()}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Level hero */}
      <div style={{ padding: '22px 20px', background: 'rgba(0,0,0,0.5)', borderLeft: `4px solid ${accent}`, borderRadius: '3px 16px 3px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontFamily: "'PhillySans', monospace", fontSize: '0.84rem', fontWeight: 800, letterSpacing: '0.2em', color: `${accent}80`, textTransform: 'uppercase', marginBottom: 6 }}>CONSCIOUSNESS LEVEL</div>
          <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 'clamp(2.6rem, 10vw, 4.2rem)', fontWeight: 700, color: accent, lineHeight: 1, textShadow: `0 0 40px ${accent}99`, letterSpacing: '-0.01em' }}>{metrics.currentLevel}</div>
          <div style={{ fontFamily: "'PhillySans', monospace", fontSize: '0.9rem', color: 'rgba(255,255,255,0.75)', fontWeight: 700, letterSpacing: '0.1em', marginTop: 6 }}>{metrics.consciousnessTitle.toUpperCase()}</div>
        </div>
        <Crown size={40} style={{ color: accent, opacity: 0.6, filter: `drop-shadow(0 0 14px ${accent})`, flexShrink: 0 }} />
      </div>

      {/* Metrics 2×2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {[
          { label: 'CULTURE COINS', value: metrics.availableCoins.toLocaleString(), Icon: Zap,        color: '#00ff88' },
          { label: 'MULTIPLIER',    value: `${metrics.multiplier}x`,               Icon: TrendingUp,  color: '#00ffcc' },
          { label: 'SACRED',        value: String(metrics.sacredInteractions),      Icon: Star,        color: '#b026ff' },
          { label: 'TOTAL EARNED',  value: metrics.totalCultureCoins.toLocaleString(), Icon: Sparkles, color: '#00ffcc' },
        ].map(({ label, value, Icon, color }) => (
          <div key={label} style={{ background: 'rgba(0,0,0,0.52)', borderBottom: `3px solid ${color}55`, borderRadius: '3px 12px 3px 12px', padding: '16px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
              <Icon size={14} style={{ color, flexShrink: 0 }} />
              <span style={{ fontFamily: "'PhillySans', monospace", fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.14em', color: `${color}88`, textTransform: 'uppercase' }}>{label}</span>
            </div>
            <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 'clamp(1.3rem, 4.5vw, 1.9rem)', fontWeight: 700, color: 'rgba(255,255,255,0.95)', lineHeight: 1 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Monthly usage bar */}
      {metrics.monthlyFreeLimit && (
        <div style={{ padding: '16px 18px', background: 'rgba(0,0,0,0.44)', border: '1px solid rgba(0,255,136,0.1)', borderRadius: '2px 12px 2px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontFamily: "'PhillySans', monospace", fontSize: '0.82rem', fontWeight: 800, letterSpacing: '0.16em', color: 'rgba(0,255,136,0.5)', textTransform: 'uppercase' }}>MONTHLY USAGE</span>
            <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '0.9rem', color: '#00ff88' }}>{metrics.monthlyFreeInteractions || 0} / {metrics.monthlyFreeLimit}</span>
          </div>
          <div style={{ height: 6, background: 'rgba(0,255,136,0.12)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${usedPct}%`, background: 'linear-gradient(90deg, #00ff88, #b026ff)', borderRadius: 3, transition: 'width 0.6s ease', boxShadow: '0 0 10px rgba(0,255,136,0.5)' }} />
          </div>
        </div>
      )}
    </div>
  );
}
