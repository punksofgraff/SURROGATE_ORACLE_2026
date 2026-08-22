import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { logStep } from '../components/CodeAuditor';

// All user_wallets reads/writes go through the user-wallet-sync edge function
// (service_role key) so the table can be RLS-locked against the anon key.
//
// SECURITY: the edge function derives the caller's IP server-side from request
// headers and only ever reads/writes that caller's own row. We never send an
// IP in the body (a caller-supplied IP would let anyone touch anyone's row).
// The server returns the IP it derived, and we use that as the canonical key
// for localStorage so client and server always agree.

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
        // Wallet sign flags are IP-agnostic-first: a stored wallet seeker key or the
        // agnostic signed flag counts immediately, before any network round-trip.
        const walletFlagEarly = localStorage.getItem('oracle_wallet_signed')
          || localStorage.getItem('oracle_seeker_key');
        if (walletFlagEarly) {
          setHasSignedWallet(true);
          setHasCompletedLore(true);
          setIsReturning(true);
        }

        // Single round-trip: the edge function derives the caller IP server-side
        // and returns it along with any existing row for that IP.
        const { data: fnData, error } = await supabase.functions.invoke('user-wallet-sync', {
          body: { action: 'get' },
        });

        const ip: string | null = fnData?.ip_address ?? null;
        if (ip) setIpAddress(ip);

        // Local storage check keyed by the server-derived IP
        if (ip) {
          if (localStorage.getItem(`surrogate_visited_${ip}`)) setIsReturning(true);
          if (localStorage.getItem(`surrogate_lore_completed_${ip}`)) setHasCompletedLore(true);
          const walletFlag = localStorage.getItem(`oracle_wallet_signed_${ip}`) || walletFlagEarly;
          if (walletFlag) {
            setHasSignedWallet(true);
            // Upgrade to IP-keyed storage so future loads skip the agnostic fallback.
            localStorage.setItem(`oracle_wallet_signed_${ip}`, 'true');
          }
        }

        const walletData = fnData?.data as { ip_address: string; onboarding_status: string } | null;

        if (walletData && !error) {
          setIsReturning(true);
          if (ip) localStorage.setItem(`surrogate_visited_${ip}`, 'true');

          if (walletData.onboarding_status === 'lore_completed' || walletData.onboarding_status === 'wallet_signed') {
            setHasCompletedLore(true);
            if (ip) localStorage.setItem(`surrogate_lore_completed_${ip}`, 'true');
          }

          if (walletData.onboarding_status === 'wallet_signed') {
            setHasSignedWallet(true);
            if (ip) localStorage.setItem(`oracle_wallet_signed_${ip}`, 'true');
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
    if (ipAddress) localStorage.setItem(`surrogate_visited_${ipAddress}`, 'true');
    setIsReturning(true);

    try {
      // Upsert the caller's own row (IP derived server-side)
      await supabase.functions.invoke('user-wallet-sync', {
        body: { action: 'upsert', onboarding_status: 'visited' },
      });
    } catch (e) {
      // ignore
    }
  };

  const markLoreCompleted = async () => {
    if (ipAddress) localStorage.setItem(`surrogate_lore_completed_${ipAddress}`, 'true');
    setHasCompletedLore(true);
    setIsReturning(true); // Implied

    try {
      await supabase.functions.invoke('user-wallet-sync', {
        body: { action: 'upsert', onboarding_status: 'lore_completed' },
      });
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

    if (ipAddress) {
      localStorage.setItem(`oracle_wallet_signed_${ipAddress}`, 'true');
      localStorage.setItem(`surrogate_lore_completed_${ipAddress}`, 'true');
    }
    try {
      // Server derives the caller IP itself — safe to call even before the
      // local IP check resolves (no IP needed in the body anymore).
      await supabase.functions.invoke('user-wallet-sync', {
        body: {
          action: 'upsert',
          onboarding_status: 'wallet_signed',
          ...(walletAddress ? { wallet_address: walletAddress } : {}),
        },
      });
      logStep('WALLET SIGNED: ALLEY ACCESS PERSISTED', 'ok');
    } catch (e) { /* ignore */ }
  };

  return { isReturning, hasCompletedLore, hasSignedWallet, isChecking, ipAddress, markVisited, markLoreCompleted, markWalletSigned };
}
