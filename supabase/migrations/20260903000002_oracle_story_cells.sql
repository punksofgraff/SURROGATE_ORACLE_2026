-- Short-lived, queryable cell manifest for local story assembly.
-- Media bytes remain in the oracle-films storage bucket; Postgres owns the
-- ordered references and expiry metadata used by the stitch planner.
CREATE TABLE IF NOT EXISTS public.oracle_story_cells (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.oracle_film_jobs(id) ON DELETE CASCADE,
  page_number integer NOT NULL CHECK (page_number BETWEEN 1 AND 32),
  panel_id text NOT NULL,
  source_hash text NOT NULL,
  media_url text NOT NULL,
  media_kind text NOT NULL DEFAULT 'image/jpeg'
    CHECK (media_kind IN ('image/jpeg', 'image/png', 'video/mp4')),
  duration_seconds double precision NOT NULL CHECK (duration_seconds > 0 AND duration_seconds <= 10),
  status text NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready', 'expired', 'failed')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, page_number),
  UNIQUE (job_id, panel_id)
);

CREATE INDEX IF NOT EXISTS oracle_story_cells_job_order_idx
  ON public.oracle_story_cells (job_id, page_number);

ALTER TABLE public.oracle_story_cells ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "oracle story cells are server owned" ON public.oracle_story_cells;
CREATE POLICY "oracle story cells are server owned"
  ON public.oracle_story_cells FOR ALL
  USING (false)
  WITH CHECK (false);