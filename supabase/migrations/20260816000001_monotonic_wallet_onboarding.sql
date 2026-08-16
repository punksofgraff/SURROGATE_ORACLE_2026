-- Monotonic onboarding status for user_wallets.
--
-- Problem: the client fires lifecycle writes (visited, lore_completed) on every
-- journey, and these could overwrite a prior wallet_signed row — erasing durable
-- wallet memory for seekers returning on a fresh device or cleared localStorage.
--
-- Fix: an atomic upsert RPC that never downgrades onboarding_status
--   visited (1) < lore_completed (2) < wallet_signed (3)
-- and never nulls out an existing wallet_address. Called only by the
-- user-wallet-sync edge function (service_role); revoked from anon/authenticated.

CREATE OR REPLACE FUNCTION public.upsert_user_wallet_monotonic(
  p_ip_address text,
  p_status text,
  p_wallet_address text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('visited', 'lore_completed', 'wallet_signed') THEN
    RAISE EXCEPTION 'invalid onboarding_status: %', p_status;
  END IF;

  INSERT INTO public.user_wallets (ip_address, onboarding_status, wallet_address, last_seen_at)
  VALUES (p_ip_address, p_status, p_wallet_address, now())
  ON CONFLICT (ip_address) DO UPDATE SET
    -- Keep whichever status ranks higher — never downgrade.
    onboarding_status = CASE
      WHEN CASE EXCLUDED.onboarding_status
             WHEN 'wallet_signed' THEN 3 WHEN 'lore_completed' THEN 2 ELSE 1 END
         > CASE user_wallets.onboarding_status
             WHEN 'wallet_signed' THEN 3 WHEN 'lore_completed' THEN 2 ELSE 1 END
      THEN EXCLUDED.onboarding_status
      ELSE user_wallets.onboarding_status
    END,
    -- Only adopt a new wallet address; never null out an existing one.
    wallet_address = COALESCE(EXCLUDED.wallet_address, user_wallets.wallet_address),
    last_seen_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_user_wallet_monotonic(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_user_wallet_monotonic(text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.upsert_user_wallet_monotonic(text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_user_wallet_monotonic(text, text, text) TO service_role;
