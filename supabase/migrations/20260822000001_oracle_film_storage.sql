-- Public-read storage for completed Oracle films.
-- Only the private RunPod worker, using the Supabase service role, writes here.
INSERT INTO storage.buckets (id, name, public, created_at, updated_at)
VALUES ('oracle-films', 'oracle-films', true, now(), now())
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "oracle films public read" ON storage.objects;
CREATE POLICY "oracle films public read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'oracle-films');

-- Keep the audio-anchor decision auditable. A film is only promoted to ready
-- after the worker has populated this verification record.
ALTER TABLE public.oracle_film_jobs
  ADD COLUMN IF NOT EXISTS anchor_audio_duration_seconds double precision,
  ADD COLUMN IF NOT EXISTS anchor_audio_url text,
  ADD COLUMN IF NOT EXISTS output_duration_seconds double precision,
  ADD COLUMN IF NOT EXISTS audio_stream_present boolean,
  ADD COLUMN IF NOT EXISTS audio_waveform_match boolean,
  ADD COLUMN IF NOT EXISTS audio_verification jsonb;