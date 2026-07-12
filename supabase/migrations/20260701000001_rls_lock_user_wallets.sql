-- =============================================================================
-- RLS lock for user_wallets — edge-function-only access
-- =============================================================================
-- ⚠ APPLY ONLY AFTER user-wallet-sync is deployed AND the refactored
--   useIpCheck.ts client is live in production.
--   Applying this before the client refactor ships will break
--   returning-seeker detection (the client can no longer read/write
--   user_wallets directly via the anon key).
-- =============================================================================
-- Strategy matches 20260701000000_rls_lock_pii_tables.sql:
--   • Enable RLS (deny-all by default — no permissive policies added)
--   • REVOKE ALL from anon and authenticated as defense-in-depth
--   • service_role is superuser-equivalent and bypasses RLS; the
--     user-wallet-sync edge function uses SUPABASE_SERVICE_ROLE_KEY and
--     therefore continues to have full access.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- user_wallets
-- Stores: ip_address (PII), wallet_address, onboarding_status, timestamps.
-- All access now proxied through supabase/functions/user-wallet-sync/index.ts.
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS user_wallets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE user_wallets FROM anon;
REVOKE ALL ON TABLE user_wallets FROM authenticated;
