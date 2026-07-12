-- =============================================================================
-- RLS lock for PII tables — edge-function-only access
-- =============================================================================
-- These tables are written and read exclusively by Supabase Edge Functions using
-- the service_role key, which bypasses RLS entirely. The anon key ships in the
-- client JS bundle; without RLS the REST API exposes these rows to anyone.
--
-- Strategy:
--   • Enable RLS (deny-all by default — no permissive policies added)
--   • REVOKE ALL from anon and authenticated as defense-in-depth against the
--     PostgREST/REST layer, in addition to RLS
--   • service_role is a superuser-equivalent and bypasses RLS; no grant change
--     needed for it, but we make the USAGE + SELECT grants explicit for clarity
--
-- DO NOT add policies granting anon/authenticated SELECT or INSERT — the
-- intentional absence of policies is what enforces deny-all for those roles.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- seeker_echo
-- Stores: name, ip (seeker_key), wallet_address, alignment, irl_context
-- (web-grounded personal dossier) — highest-sensitivity PII.
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS seeker_echo ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE seeker_echo FROM anon;
REVOKE ALL ON TABLE seeker_echo FROM authenticated;

-- ---------------------------------------------------------------------------
-- seeker_echo_memory (columns added via 20260632000000_seeker_echo_memory.sql)
-- The memory columns live on seeker_echo itself (ALTER TABLE ADD COLUMN), not
-- a separate table, so no additional table to lock here.
-- Documented explicitly so future maintainers understand why it is absent.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- culture_crew
-- chainfuelz_wallet_address added by 20260624000000_chainfuelz_ghost_infrastructure.sql
-- The base table predates these migrations; lock it here.
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS culture_crew ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE culture_crew FROM anon;
REVOKE ALL ON TABLE culture_crew FROM authenticated;

-- ---------------------------------------------------------------------------
-- surrogate_sessions
-- on_chain_tx_hash and culture_coins_minted added by the same ghost migration.
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS surrogate_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE surrogate_sessions FROM anon;
REVOKE ALL ON TABLE surrogate_sessions FROM authenticated;
