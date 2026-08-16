-- Persistent dev session traces for the SURROGATE Oracle.
--
-- Access model: NO direct client access. RLS is enabled with no policies and
-- all privileges revoked from anon/authenticated, so the table is reachable
-- only through the `oracle-trace` Edge Function, which runs with the service
-- role and requires the ORACLE_TRACE_DEV_TOKEN shared secret on every request
-- (ingest and read alike). The ?devui query param is a UI affordance only —
-- authorization is the token, verified server-side.

CREATE TABLE IF NOT EXISTS oracle_session_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  seq integer NOT NULL DEFAULT 0,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  client_ts bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oracle_session_traces_session
  ON oracle_session_traces (session_id, client_ts, seq);
CREATE INDEX IF NOT EXISTS idx_oracle_session_traces_created
  ON oracle_session_traces (created_at DESC);

ALTER TABLE oracle_session_traces ENABLE ROW LEVEL SECURITY;

-- Belt and braces: no RLS policies exist, and static privileges are revoked
-- too, so anon/authenticated are denied even if a permissive policy were
-- accidentally added later.
DROP POLICY IF EXISTS anon_insert ON oracle_session_traces;
DROP POLICY IF EXISTS anon_select ON oracle_session_traces;
REVOKE ALL ON oracle_session_traces FROM anon, authenticated;

-- Recent-session summary used by the oracle-trace Edge Function (service role).
-- Not executable by clients.
CREATE OR REPLACE FUNCTION oracle_recent_trace_sessions(p_limit integer DEFAULT 20)
RETURNS TABLE (
  session_id text,
  event_count bigint,
  first_event timestamptz,
  last_event timestamptz,
  turn_count bigint,
  error_count bigint
)
LANGUAGE sql STABLE
AS $$
  SELECT
    t.session_id,
    count(*) AS event_count,
    min(t.created_at) AS first_event,
    max(t.created_at) AS last_event,
    count(*) FILTER (WHERE t.event_type = 'turn') AS turn_count,
    count(*) FILTER (WHERE t.event_type = 'step' AND t.payload->>'status' = 'err') AS error_count
  FROM oracle_session_traces t
  GROUP BY t.session_id
  ORDER BY max(t.created_at) DESC
  LIMIT p_limit;
$$;

REVOKE EXECUTE ON FUNCTION oracle_recent_trace_sessions(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oracle_recent_trace_sessions(integer) FROM anon, authenticated;
