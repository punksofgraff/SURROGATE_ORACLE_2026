-- Keep provider identity queryable without disturbing historical story rows.
ALTER TABLE oracle_film_jobs
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS model_slug text;

COMMENT ON COLUMN oracle_film_jobs.provider IS
  'Story provider identity. Historical Seedance rows remain readable and are never silently converted.';
COMMENT ON COLUMN oracle_film_jobs.model_slug IS
  'Approved hosted model slug for newly submitted story visual scenes.';