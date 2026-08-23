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