-- Premium illustration-story jobs keep every panel reference and provider
-- scene state on the server. The browser may leave and resume without losing
-- the production record or confusing a local proof with a finished film.
ALTER TABLE public.oracle_film_jobs
  ADD COLUMN IF NOT EXISTS job_type text NOT NULL DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS story_scenes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS story_manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS narration_url text,
  ADD COLUMN IF NOT EXISTS music_url text;

ALTER TABLE public.oracle_film_jobs
  DROP CONSTRAINT IF EXISTS oracle_film_jobs_job_type_check;

ALTER TABLE public.oracle_film_jobs
  ADD CONSTRAINT oracle_film_jobs_job_type_check
  CHECK (job_type IN ('single', 'illustration-story'));

CREATE INDEX IF NOT EXISTS oracle_film_jobs_story_idx
  ON public.oracle_film_jobs (job_type, session_id, created_at DESC);