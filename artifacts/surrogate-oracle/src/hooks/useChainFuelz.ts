import { useState, useEffect } from 'react';

export interface ChainFuelzState {
  isInitialized: boolean;
  walletAddress: string | null;
  vaultHandle: string | null;
  balance: number;
  isMinting: boolean;
  justClaimed: boolean;
}

export function useChainFuelz(userEmail?: string | null, pendingCoins: number = 0) {
  const [state, setState] = useState<ChainFuelzState>({
    isInitialized: false,
    walletAddress: null,
    vaultHandle: null,
    balance: 0,
    isMinting: false,
    justClaimed: false,
  });

  // Mock Initialization
  useEffect(() => {
    if (!userEmail) {
      setState(prev => ({ ...prev, isInitialized: false, walletAddress: null, vaultHandle: null }));
      return;
    }

    // Simulate SDK loading
    const timer = setTimeout(() => {
      const emailPrefix = userEmail.split('@')[0].toLowerCase();
      
      setState(prev => ({
        ...prev,
        isInitialized: true,
        walletAddress: `0xCF...${emailPrefix.substring(0, 4).toUpperCase()}...PENDING`,
        vaultHandle: `crew/${emailPrefix}`,
        balance: 0,
      }));

      // Simulate auto-claim of pending session coins upon wallet creation
      if (pendingCoins > 0) {
         mintTokens(pendingCoins, 'session_yield_claim');
      }

    }, 1500);

    return () => clearTimeout(timer);
  }, [userEmail]);

  // Mock Minting Function
  const mintTokens = async (amount: number, reason: string) => {
    if (!state.walletAddress && !userEmail) { // Allow minting check to pass if initializing
      console.warn('ChainFuelz: Cannot mint, no wallet connected.');
      return false;
    }

    setState(prev => ({ ...prev, isMinting: true, justClaimed: false }));

    // TODO: Await actual Edge Function call to trigger ChainFuelz API securely
    console.log(`[CHAINFUELZ MOCK] ⏳ Minting ${amount} Culture Coins for: ${reason}`);
    
    await new Promise(resolve => setTimeout(resolve, 3000)); // Simulate longer cinematic network latency

    console.log(`[CHAINFUELZ MOCK] ✅ Minted! TX: 0xPENDING_PATRICK_SDK`);
    
    setState(prev => ({ 
      ...prev, 
      isMinting: false,
      balance: prev.balance + amount,
      justClaimed: true
    }));

    // Reset the "just claimed" highlight after a few seconds
    setTimeout(() => {
      setState(p => ({ ...p, justClaimed: false }));
    }, 4000);

    return true;
  };

  return {
    ...state,
    mintTokens,
  };
}
