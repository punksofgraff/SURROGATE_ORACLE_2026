import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { logStep } from '../components/CodeAuditor';

export function useIpCheck() {
  const [isReturning, setIsReturning] = useState(false);
  const [hasCompletedLore, setHasCompletedLore] = useState(false);
  const [ipAddress, setIpAddress] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    async function checkIp() {
      try {
        // 1. Get IP
        const res = await fetch('https://api.ipify.org?format=json');
        const data = await res.json();
        const ip = data.ip;
        setIpAddress(ip);

        // 2. Check local storage first for fast response
        const localFlag = localStorage.getItem(`surrogate_visited_${ip}`);
        if (localFlag) {
          setIsReturning(true);
        }
        
        const loreFlag = localStorage.getItem(`surrogate_lore_completed_${ip}`);
        if (loreFlag) {
          setHasCompletedLore(true);
        }

        // 3. Optional: check database if we want a hard backend check
        // We do a soft fail here so the experience doesn't block on DB
        const { data: walletData, error } = await supabase
          .from('user_wallets')
          .select('ip_address, onboarding_status')
          .eq('ip_address', ip)
          .limit(1)
          .single();

        if (walletData && !error) {
          setIsReturning(true);
          localStorage.setItem(`surrogate_visited_${ip}`, 'true');
          
          if (walletData.onboarding_status === 'lore_completed') {
            setHasCompletedLore(true);
            localStorage.setItem(`surrogate_lore_completed_${ip}`, 'true');
          }
          
          logStep('IP CHECK: RETURN TRIP VERIFIED', 'ok');
        } else {
          // If not in DB but we are here, we might just be new.
          logStep('IP CHECK: NEW SIGNAL DETECTED', 'ok');
        }
      } catch (err) {
        logStep('IP CHECK FAILED', 'warn');
        console.warn('IP Check error:', err);
      } finally {
        setIsChecking(false);
      }
    }

    checkIp();
  }, []);

  const markVisited = async () => {
    if (!ipAddress) return;
    localStorage.setItem(`surrogate_visited_${ipAddress}`, 'true');
    setIsReturning(true);
    
    try {
      // Upsert basic IP record to start tracking onboarding
      await supabase.from('user_wallets').upsert({
        ip_address: ipAddress,
        onboarding_status: 'visited'
      }, { onConflict: 'ip_address' });
    } catch (e) {
      // ignore
    }
  };

  const markLoreCompleted = async () => {
    if (!ipAddress) return;
    localStorage.setItem(`surrogate_lore_completed_${ipAddress}`, 'true');
    setHasCompletedLore(true);
    setIsReturning(true); // Implied

    try {
      await supabase.from('user_wallets').upsert({
        ip_address: ipAddress,
        onboarding_status: 'lore_completed'
      }, { onConflict: 'ip_address' });
      logStep('LORE STATUS: COMPLETED (Persisted)', 'ok');
    } catch (e) {
      // ignore
    }
  };

  return { isReturning, hasCompletedLore, isChecking, ipAddress, markVisited, markLoreCompleted };
}
