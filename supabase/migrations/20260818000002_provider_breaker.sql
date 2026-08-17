-- provider_breaker: tracks per-provider quota/server failure counts and
-- cool-down windows for the portrait generation cascade.
-- Three consecutive 429/5xx failures open the breaker for an escalating
-- back-off schedule (15 min → 1 h → 4 h → 12 h → 24 h).
-- A success resets fail_count and open_until so the provider is re-enabled.

CREATE TABLE IF NOT EXISTS public.provider_breaker (
  provider      TEXT        NOT NULL PRIMARY KEY,
  fail_count    INTEGER     NOT NULL DEFAULT 0,
  backoff_level INTEGER     NOT NULL DEFAULT 0,
  open_until    TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Edge functions run as service_role — they already have full access.
-- Deny direct read/write from anon/authenticated to keep failure counts private.
ALTER TABLE public.provider_breaker ENABLE ROW LEVEL SECURITY;

-- No RLS policies: only service_role (edge functions) can read/write.
-- Anon and authenticated roles are implicitly denied by the enabled RLS.
