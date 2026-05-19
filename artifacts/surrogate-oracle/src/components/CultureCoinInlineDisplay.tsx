import { useState, useEffect } from 'react';
import { Zap, TrendingUp, Crown } from 'lucide-react';

interface CultureCoinInlineDisplayProps {
  userId: string;
  onUpgradeClick?: () => void;
  onCoinsUpdated?: (fn: (amount: number) => void) => void;
  showUpgradePrompt?: boolean;
}

interface Metrics {
  currentLevel: number;
  totalCultureCoins: number;
  availableCoins: number;
  consciousnessTitle: string;
  subscriptionTier: string;
  multiplier: number;
}

export function CultureCoinInlineDisplay({ userId, onUpgradeClick, showUpgradePrompt }: CultureCoinInlineDisplayProps) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [recentEarning, setRecentEarning] = useState(0);
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const fetchMetrics = async () => {
    if (!supabaseUrl || !supabaseKey) return;
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/culture-coin-manager`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseKey}`,
          apikey: supabaseKey,
        },
        body: JSON.stringify({ action: 'get_user_metrics', userId }),
      });
      if (response.ok) {
        const result = await response.json();
        if (result.success) setMetrics(result.metrics);
      }
    } catch (error) {
      console.error('Failed to fetch user metrics:', error);
    }
  };

  useEffect(() => {
    if (!userId) return;
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, [userId]);

  const tierColor =
    metrics?.subscriptionTier === 'cultural_architect'
      ? 'linear-gradient(135deg, #eab308, #b026ff)'
      : metrics?.subscriptionTier === 'trans_humanist'
        ? 'linear-gradient(135deg, #170529, #b026ff)'
        : metrics?.subscriptionTier === 'seeker'
          ? 'linear-gradient(135deg, #004d2e, #00ff88)'
          : 'linear-gradient(135deg, #111, #333)';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: 'rgba(0,0,0,0.6)',
        border: '1px solid rgba(0,255,136,0.2)',
        borderRadius: 12,
        padding: '8px 16px',
        backdropFilter: 'blur(10px)',
        fontFamily: "'PhillySans', 'Orbitron', monospace",
        cursor: showUpgradePrompt ? 'pointer' : 'default',
      }}
      onClick={showUpgradePrompt ? onUpgradeClick : undefined}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Zap size={14} style={{ color: '#eab308' }} />
        <span style={{ color: '#eab308', fontSize: '0.8rem', fontWeight: 700 }}>
          {metrics ? metrics.availableCoins.toLocaleString() : '—'}
        </span>
      </div>

      {metrics && (
        <>
          <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.15)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <TrendingUp size={12} style={{ color: '#00ff88' }} />
            <span style={{ color: '#00ff88', fontSize: '0.7rem' }}>Lv.{metrics.currentLevel}</span>
          </div>
          <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.15)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Crown size={12} style={{ color: '#b026ff' }} />
            <span style={{ color: '#ffffff', fontSize: '0.65rem', textTransform: 'uppercase' }}>
              {metrics.consciousnessTitle || metrics.subscriptionTier}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
