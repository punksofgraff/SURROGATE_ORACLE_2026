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

For FAL-produced visuals, the worker also accepts
`task: mux_oracle_film` with `video_url` and `audio_url`. It downloads the
visual MP4 and the existing Lyria anchor, muxes them with FFmpeg without
re-encoding the H.264 video, uploads the completed MP4 to the configured
Supabase Storage bucket, and returns the stable `final_media_url`. The response
includes `audio_stream_present: true`, `codec: h264`, and
`pixel_format: yuv420p` so the Edge Function can apply its normal readiness
verification.

The model is intentionally capped at five seconds per chunk for the first
benchmark. Increase the cap only after measuring VRAM and wall-clock behavior on
the selected GPU.

The direct ComfyUI route is schema-driven: before queueing a premium shot, the
Edge Function reads `/object_info/ByteDance2ReferenceNode` from the active Pod.
The portrait and Lyria soundtrack are connected through the node's current
individual sockets (`model.reference_images.image_1`/`image_2` and
`model.reference_audios.audio_1`), with an aggregate-array fallback for older
templates. The resulting Pod video is authenticated while fetched and then
copied to the public `oracle-films` bucket, so the returned URL is stable.