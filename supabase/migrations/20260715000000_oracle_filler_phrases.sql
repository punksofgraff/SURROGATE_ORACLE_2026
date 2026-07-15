-- oracle_filler_phrases
-- Pre-rendered filler audio phrases played during Gemini processing gaps.
-- Seeded by scripts/generate-filler-audio.mjs (idempotent, run once per environment).

CREATE TABLE IF NOT EXISTS oracle_filler_phrases (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phrase_text text NOT NULL,
  audio_url   text NOT NULL,
  phrase_type text NOT NULL CHECK (phrase_type IN ('thinking', 'vision')),
  duration_ms integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (phrase_text)
);

-- Public read (anon key can fetch phrase list at runtime)
GRANT SELECT ON oracle_filler_phrases TO anon, authenticated;

-- Storage: oracle-assets bucket (public-read, no public write path)
INSERT INTO storage.buckets (id, name, public, created_at, updated_at)
VALUES ('oracle-assets', 'oracle-assets', true, now(), now())
ON CONFLICT (id) DO UPDATE SET public = true;

-- Public read policy: anyone can GET the pre-rendered WAV files at runtime.
-- Upload is intentionally excluded — the generation script authenticates
-- with the service-role key via the Management API, not the public anon key.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'oracle-assets public read'
  ) THEN
    EXECUTE '
      CREATE POLICY "oracle-assets public read"
      ON storage.objects FOR SELECT
      TO anon, authenticated
      USING (bucket_id = ''oracle-assets'')
    ';
  END IF;
END $$;
