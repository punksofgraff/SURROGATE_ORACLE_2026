import React, { useState, useEffect } from 'react';
import { Zap, TrendingUp, Crown } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface CultureCoinInlineDisplayProps {
  userId: string;
  onUpgradeClick?: () => void;
  onCoinsUpdated?: (amount: number) => void;
  showUpgradePrompt?: boolean;
}

export function CultureCoinInlineDisplay({ 
  userId, 
  onUpgradeClick, 
  onCoinsUpdated,
  showUpgradePrompt 
}: CultureCoinInlineDisplayProps) {
  const [metrics, setMetrics] = useState<any>(null);
  const [recentEarning, setRecentEarning] = useState<number>(0);
  const [isEnvReady, setIsEnvReady] = useState(false);
  const [envError, setEnvError] = useState<string | null>(null);

  // Environment validation
  useEffect(() => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      const missing = [];
      if (!supabaseUrl) missing.push('VITE_SUPABASE_URL');
      if (!supabaseKey) missing.push('VITE_SUPABASE_ANON_KEY');
      setEnvError(`Missing environment variables: ${missing.join(', ')}`);
      setIsEnvReady(false);
      return;
    }
    
    setIsEnvReady(true);
    setEnvError(null);
  }, []);

  const fetchMetrics = async () => {
    if (!isEnvReady) return;
    
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/culture-coin-manager`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
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
          setMetrics(result.metrics);
        }
      } else {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
    } catch (error) {
      console.error('❌ Failed to fetch user metrics (detailed):', error);
    }
  };

  // Real-time updates using Supabase subscriptions
  useEffect(() => {
    if (!userId || !isEnvReady) return;

    const subscription = supabase
      .channel('culture-coin-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_consciousness_metrics',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          console.log('🔄 Real-time culture coin update:', payload);
          fetchMetrics(); // Refresh metrics when data changes
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [userId, isEnvReady]);

  useEffect(() => {
    if (isEnvReady) {
      fetchMetrics();
    }
  }, [userId, isEnvReady]);

  // Handle coins update from parent component
  useEffect(() => {
    if (onCoinsUpdated) {
      const updateCoinsEarned = (amount: number) => {
        setRecentEarning(amount);
        setTimeout(() => setRecentEarning(0), 3000);
        fetchMetrics(); // Refresh metrics
      };
      
      // Store in component instance instead of global window
      onCoinsUpdated(updateCoinsEarned);
    }
  }, [onCoinsUpdated]);

  // Environment error state
  if (!isEnvReady && envError) {
    return (
      <div className="culture-coin-inline-error">
        <div className="flex items-center gap-2 text-red-400">
          <Zap className="w-4 h-4" />
          <span className="text-sm">Config Error</span>
        </div>
        <div className="text-xs text-red-300 mt-1">
          {envError}
        </div>
      </div>
    );
  }

  // Loading state
  if (!isEnvReady) {
    return (
      <div className="culture-coin-inline-loading">
        <div className="flex items-center gap-2 text-cyan-400">
          <Zap className="w-4 h-4 animate-spin" />
          <span className="text-sm">Initializing...</span>
        </div>
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div className="culture-coin-inline">
      <div className="flex items-center gap-2 mb-2">
        <Zap className="w-5 h-5 text-yellow-400" />
        <span className="accent-text text-yellow-400 font-bold text-lg">{metrics.availableCoins}</span>
        <span className="info-text text-cyan-400 text-sm">Culture Coins</span>
      </div>
      
      <div className="flex items-center gap-2 mb-2">
        <TrendingUp className="w-4 h-4 text-purple-400" />
        <span className="accent-text text-white text-sm">Level {metrics.currentLevel}</span>
        <span className="info-text text-purple-400 text-xs">{metrics.consciousnessTitle}</span>
      </div>

      {recentEarning > 0 && (
        <div className="recent-earning" style={{
          background: 'rgba(255, 215, 0, 0.2)',
          border: '1px solid rgba(255, 215, 0, 0.5)',
          borderRadius: '8px',
          padding: '8px',
          marginBottom: '10px',
          textAlign: 'center',
          animation: 'coin-pulse 2s ease-in-out'
        }}>
          <span className="accent-text text-yellow-300 font-bold">+{recentEarning} Coins Earned!</span>
        </div>
      )}

      {showUpgradePrompt && metrics.subscriptionTier === 'free' && onUpgradeClick && (
        <button 
          onClick={onUpgradeClick}
          className="upgrade-prompt accent-text"
          aria-label="Upgrade to premium subscription"
        >
          <Crown className="w-4 h-4 inline mr-2" />
          Upgrade to Premium
        </button>
      )}
    </div>
  );
}