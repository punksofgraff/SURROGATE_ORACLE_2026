-- Single-flight generation lease for oracle_world_briefing.
--
-- Problem: on cache expiry, concurrent requests all saw the stale row and each
-- independently invoked the paid Gemini generation (cache-miss stampede). With
-- the endpoint being anon-key-invokable, this was a direct API-cost abuse path.
--
-- Fix: an atomic lease on the cache row. Exactly one caller can hold the lease
-- during any 90s window; everyone else is served the existing (possibly stale)
-- briefing. This bounds Gemini invocations to AT MOST ONE per lease window
-- globally, regardless of request volume — a hard server-side cost cap that an
-- attacker cannot widen by fanning out requests.
--
-- The lease is NOT cleared on generation failure: a failed attempt (e.g. 429
-- quota exhaustion) throttles retries to one per window instead of hammering.

ALTER TABLE oracle_world_briefing
  ADD COLUMN IF NOT EXISTS lease_until timestamptz;

-- Atomic acquire: succeeds only if no live lease exists. SECURITY DEFINER +
-- REVOKE below means only the service role (edge function) can call it.
CREATE OR REPLACE FUNCTION acquire_briefing_lease(p_lease_seconds int DEFAULT 90)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  got boolean;
BEGIN
  -- Ensure the singleton row exists so a fresh install can still acquire.
  INSERT INTO oracle_world_briefing (id, briefing_text, refreshed_at, lease_until)
  VALUES (1, '', now() - interval '100 years', NULL)
  ON CONFLICT (id) DO NOTHING;

  UPDATE oracle_world_briefing
     SET lease_until = now() + make_interval(secs => p_lease_seconds)
   WHERE id = 1
     AND (lease_until IS NULL OR lease_until < now())
  RETURNING true INTO got;

  RETURN COALESCE(got, false);
END $$;

-- REVOKE from public strips the default EXECUTE grant every role inherits —
-- including service_role — so the edge function's role must be re-granted
-- explicitly. Only service_role may call this; anon/authenticated stay revoked.
REVOKE ALL ON FUNCTION acquire_briefing_lease(int) FROM public;
REVOKE ALL ON FUNCTION acquire_briefing_lease(int) FROM anon;
REVOKE ALL ON FUNCTION acquire_briefing_lease(int) FROM authenticated;
GRANT EXECUTE ON FUNCTION acquire_briefing_lease(int) TO service_role;
