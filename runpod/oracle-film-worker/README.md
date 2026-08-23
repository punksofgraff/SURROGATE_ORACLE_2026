# Oracle film worker

Build this directory as a RunPod Serverless endpoint image and set the endpoint
environment variables:

- `RUNPOD_API_KEY` stays on the Replit/Supabase side; it is not needed here.
- `MODEL_ID` (defaults to `Wan-AI/Wan2.2-TI2V-5B`)
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are used by the worker to
  upload the finished MP4 to Supabase Storage. The service key stays private
  in the RunPod endpoint environment.
- `OUTPUT_STORAGE_BUCKET` (defaults to `oracle-films`) and optionally
  `OUTPUT_PUBLIC_BASE_URL` (defaults to Supabase's public object URL)

The worker receives `task: materialize_oracle_film`, generates four bounded
five-second image-conditioned chunks, normalizes/stitches them with FFmpeg, and
returns only the stable final MP4 URL. It never returns intermediate video bytes.
The Edge Function passes continuity-aware prompts and maps RunPod progress into
the seeker-facing job record.

The model is intentionally capped at five seconds per chunk for the first
benchmark. Increase the cap only after measuring VRAM and wall-clock behavior on
the selected GPU.