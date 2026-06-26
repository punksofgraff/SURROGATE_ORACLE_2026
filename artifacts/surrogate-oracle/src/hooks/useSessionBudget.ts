import { useEffect, useRef, useState } from 'react';

const BUDGET_MS = 2 * 60 * 1000;
const TICK_MS   = 1_000;

interface UseSessionBudgetProps {
  isOracleMode:   boolean;
  isWalletSigned: boolean;
  onExceeded:     () => void;
}

export function useSessionBudget({ isOracleMode, isWalletSigned, onExceeded }: UseSessionBudgetProps) {
  const [budgetExceeded, setBudgetExceeded] = useState(false);
  const elapsedRef    = useRef(0);
  const exceededRef   = useRef(false);
  const onExceededRef = useRef(onExceeded);
  useEffect(() => { onExceededRef.current = onExceeded; }, [onExceeded]);

  useEffect(() => {
    if (isWalletSigned || budgetExceeded) return;
    if (!isOracleMode) return;

    const id = setInterval(() => {
      if (exceededRef.current) return;
      elapsedRef.current += TICK_MS;
      if (elapsedRef.current >= BUDGET_MS) {
        exceededRef.current = true;
        setBudgetExceeded(true);
        onExceededRef.current();
        clearInterval(id);
      }
    }, TICK_MS);

    return () => clearInterval(id);
  }, [isOracleMode, isWalletSigned, budgetExceeded]);

  const reset = () => {
    elapsedRef.current  = 0;
    exceededRef.current = false;
    setBudgetExceeded(false);
  };

  return { budgetExceeded, reset };
}
