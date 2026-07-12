import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { logStep } from '../components/CodeAuditor';

export function useIpCheck() {
  // ?newuser — dev override: skip DB + localStorage check, force fresh-user flow
  const forceNew = new URLSearchParams(window.location.search).has('newuser');

  const [isReturning, setIsReturning] = useState(false);
  const [hasCompletedLore, setHasCompletedLore] = useState(false);
  const [hasSignedWallet, setHasSignedWallet] = useState(false);
  const [ipAddress, setIpAddress] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(!forceNew);

  useEffect(() => {
    if (forceNew) return; // skip all checks — dev fresh-user mode

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

        // Check IP-keyed key first; fall back to the IP-agnostic key written
        // when the wallet signs before the IP check resolves.
        // Also treat a stored wallet seeker key as proof of signing.
        const walletFlag = localStorage.getItem(`oracle_wallet_signed_${ip}`)
          || localStorage.getItem('oracle_wallet_signed')
          || localStorage.getItem('oracle_seeker_key');
        if (walletFlag) {
          setHasSignedWallet(true);
          // Upgrade to IP-keyed storage so future loads skip the agnostic fallback.
          localStorage.setItem(`oracle_wallet_signed_${ip}`, 'true');
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
          
          if (walletData.onboarding_status === 'lore_completed' || walletData.onboarding_status === 'wallet_signed') {
            setHasCompletedLore(true);
            localStorage.setItem(`surrogate_lore_completed_${ip}`, 'true');
          }

          if (walletData.onboarding_status === 'wallet_signed') {
            setHasSignedWallet(true);
            localStorage.setItem(`oracle_wallet_signed_${ip}`, 'true');
            localStorage.setItem('oracle_wallet_signed', 'true');
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

  const markWalletSigned = async (walletAddress?: string) => {
    // Always write the IP-agnostic key immediately so the sign is captured even
    // if the IP check hasn't resolved yet (avoids silent drop on fast signers).
    localStorage.setItem('oracle_wallet_signed', 'true');
    if (walletAddress) {
      // Persist the canonical seeker key so future sessions resolve to the wallet, not the IP.
      localStorage.setItem('oracle_seeker_key', walletAddress);
    }
    setHasSignedWallet(true);
    setHasCompletedLore(true);
    setIsReturning(true);

    if (!ipAddress) {
      logStep('WALLET SIGNED (IP pending — agnostic key written)', 'ok');
      return; // IP-keyed write + Supabase will happen when checkIp re-runs or upgrades on next load
    }
    localStorage.setItem(`oracle_wallet_signed_${ipAddress}`, 'true');
    localStorage.setItem(`surrogate_lore_completed_${ipAddress}`, 'true');
    try {
      await supabase.from('user_wallets').upsert({
        ip_address: ipAddress,
        onboarding_status: 'wallet_signed'
      }, { onConflict: 'ip_address' });
      logStep('WALLET SIGNED: ALLEY ACCESS PERSISTED', 'ok');
    } catch (e) { /* ignore */ }
  };

  return { isReturning, hasCompletedLore, hasSignedWallet, isChecking, ipAddress, markVisited, markLoreCompleted, markWalletSigned };
}
