-- oracle_world_briefing: single-row cache for the Gemini-grounded world briefing.
-- CHECK constraint enforces exactly one row (id must equal 1).
-- Anon can read (public cache); service role writes via Edge Function.

CREATE TABLE IF NOT EXISTS oracle_world_briefing (
  id            int           PRIMARY KEY DEFAULT 1,
  briefing_text text          NOT NULL,
  refreshed_at  timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- RLS: enable but allow anon reads, service-role writes (via Edge Function which
-- uses service-role key automatically).
ALTER TABLE oracle_world_briefing ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'oracle_world_briefing' AND policyname = 'anon_read_world_briefing'
  ) THEN
    CREATE POLICY anon_read_world_briefing
      ON oracle_world_briefing FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;
