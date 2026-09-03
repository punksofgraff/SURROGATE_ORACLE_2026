-- Preserve pre-rollout per-scene story records for accounting, then remove
-- them from the live job table so the runtime no longer needs a compatibility
-- provider lane.
CREATE TABLE IF NOT EXISTS public.oracle_film_jobs_story_archive
  (LIKE public.oracle_film_jobs INCLUDING DEFAULTS INCLUDING CONSTRAINTS);

ALTER TABLE public.oracle_film_jobs_story_archive
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS archive_reason text NOT NULL DEFAULT 'legacy-per-scene-cutoff';

CREATE UNIQUE INDEX IF NOT EXISTS oracle_film_jobs_story_archive_id_idx
  ON public.oracle_film_jobs_story_archive (id);

CREATE INDEX IF NOT EXISTS oracle_film_jobs_story_archive_created_idx
  ON public.oracle_film_jobs_story_archive (created_at DESC);

ALTER TABLE public.oracle_film_jobs_story_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "oracle story archive is server owned"
  ON public.oracle_film_jobs_story_archive;
CREATE POLICY "oracle story archive is server owned"
  ON public.oracle_film_jobs_story_archive
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- This predicate is intentionally the same compatibility boundary that
-- previously guarded historical per-scene polling and recovery:
-- explicit legacy markers are eligible regardless of date; unmarked rows must
-- predate the single-job rollout and must not be browser proofs or workflows.
INSERT INTO public.oracle_film_jobs_story_archive
SELECT jobs.*, now(), 'legacy-per-scene-cutoff'
FROM public.oracle_film_jobs AS jobs
WHERE jobs.job_type = 'illustration-story'
  AND (jobs.provider IS NULL OR jobs.provider <> 'browser-film')
  AND NOT (
    jobs.story_manifest->>'workflowMode' = 'single-fal-workflow'
    AND jsonb_typeof(jobs.story_manifest->'workflow') = 'object'
  )
  AND (
    jobs.story_manifest->>'legacyPerScene' = 'true'
    OR jobs.story_manifest->>'workflowMode' = 'legacy-per-scene'
    OR (
      NOT (jobs.story_manifest ? 'workflowMode')
      AND jobs.created_at < timestamptz '2026-09-01T00:00:00.000Z'
    )
  )
ON CONFLICT (id) DO NOTHING;

-- Delete only rows that are now durably present in the archive. This makes a
-- rerun safe after an interrupted migration and never deletes a current
-- single-job workflow or browser-created local proof.
DELETE FROM public.oracle_film_jobs AS jobs
WHERE jobs.id IN (
  SELECT archived.id
  FROM public.oracle_film_jobs_story_archive AS archived
)
  AND jobs.job_type = 'illustration-story'
  AND (jobs.provider IS NULL OR jobs.provider <> 'browser-film')
  AND NOT (
    jobs.story_manifest->>'workflowMode' = 'single-fal-workflow'
    AND jsonb_typeof(jobs.story_manifest->'workflow') = 'object'
  )
  AND (
    jobs.story_manifest->>'legacyPerScene' = 'true'
    OR jobs.story_manifest->>'workflowMode' = 'legacy-per-scene'
    OR (
      NOT (jobs.story_manifest ? 'workflowMode')
      AND jobs.created_at < timestamptz '2026-09-01T00:00:00.000Z'
    )
  );