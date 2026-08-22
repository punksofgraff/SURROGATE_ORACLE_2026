# Oracle film worker

Build this directory as a RunPod Serverless endpoint image and set the endpoint
environment variables:

- `RUNPOD_API_KEY` stays on the Replit/Supabase side; it is not needed here.
- `MODEL_ID` (defaults to `Wan-AI/Wan2.2-TI2V-5B`)
- `OUTPUT_S3_ENDPOINT`, `OUTPUT_S3_BUCKET`, `OUTPUT_S3_ACCESS_KEY`,
  `OUTPUT_S3_SECRET_KEY`, and `OUTPUT_PUBLIC_BASE_URL`

The worker receives `task: materialize_oracle_film`, generates four bounded
five-second image-conditioned chunks, normalizes/stitches them with FFmpeg, and
returns only the stable final MP4 URL. It never returns intermediate video bytes.
The Edge Function passes continuity-aware prompts and maps RunPod progress into
the seeker-facing job record.

The model is intentionally capped at five seconds per chunk for the first
benchmark. Increase the cap only after measuring VRAM and wall-clock behavior on
the selected GPU.