-- =============================================================================
-- RLS lock for surrogate_portraits — edge-function-only access
-- =============================================================================
-- ⚠ APPLY ONLY AFTER the portrait-gallery edge function is deployed AND the
--   refactored PortraitGalleryDashboard client is live in production.
--   Applying this before the client refactor ships will break the portrait
--   gallery UI (the client can no longer read/delete surrogate_portraits
--   directly via the anon key).
-- =============================================================================
-- Strategy matches 20260701000001_rls_lock_user_wallets.sql:
--   • Enable RLS (deny-all by default — no permissive policies added)
--   • REVOKE ALL from anon and authenticated as defense-in-depth
--   • service_role is superuser-equivalent and bypasses RLS; the
--     portrait-gallery edge function uses SUPABASE_SERVICE_ROLE_KEY and
--     therefore continues to have full read/delete access.
--   • gemini-portrait-generator also uses SUPABASE_SERVICE_ROLE_KEY for
--     INSERT — portrait CREATION is completely unaffected by this migration.
-- =============================================================================
-- NOTE: No migration currently defines the surrogate_portraits table — the
-- table was created directly in the remote database. IF EXISTS guards are used
-- throughout to prevent errors if this migration runs in an environment where
-- the table hasn't been created yet.
-- =============================================================================
-- All client reads/deletes to surrogate_portraits are now proxied through
-- supabase/functions/portrait-gallery/index.ts.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- surrogate_portraits
-- Stores: AI-generated portrait images, linked to users by user_id / email /
--         session_id. All client access now proxied through
--         supabase/functions/portrait-gallery/index.ts.
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS surrogate_portraits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE surrogate_portraits FROM anon;
REVOKE ALL ON TABLE surrogate_portraits FROM authenticated;
