"""RunPod worker for the Oracle materialized-film contract.

The worker keeps portrait/video bytes on the GPU pod and uploads only the
finished normalized MP4 to an S3-compatible bucket. Configure OUTPUT_* and
MODEL_ID in the RunPod endpoint environment. The default model is the
Apache-2.0 Wan2.2 TI2V-5B proof-of-concept route.
"""
import base64
import io
import os
import subprocess
import tempfile
import uuid
from pathlib import Path

import requests
import runpod
import torch
from PIL import Image

MODEL_ID = os.getenv("MODEL_ID", "Wan-AI/Wan2.2-TI2V-5B")
FRAME_RATE = 24
WIDTH = int(os.getenv("FILM_WIDTH", "720"))
HEIGHT = int(os.getenv("FILM_HEIGHT", "720"))

_pipeline = None


def pipeline():
    global _pipeline
    if _pipeline is None:
        from diffusers import WanImageToVideoPipeline
        _pipeline = WanImageToVideoPipeline.from_pretrained(
            MODEL_ID, torch_dtype=torch.float16, variant="fp16"
        ).to("cuda")
        _pipeline.enable_model_cpu_offload()
    return _pipeline


def upload_mp4(path: Path) -> str:
    """Upload the finished film to a public Supabase Storage bucket.

    The service-role key is only present in the private RunPod worker. The
    browser receives the public object URL, never this credential.
    """
    supabase_url = os.environ["SUPABASE_URL"].rstrip("/")
    service_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    bucket = os.getenv("OUTPUT_STORAGE_BUCKET", "oracle-films").strip("/")
    key = f"oracle-films/{uuid.uuid4().hex}.mp4"
    upload_url = f"{supabase_url}/storage/v1/object/{bucket}/{key}"
    with path.open("rb") as payload:
        response = requests.post(
            upload_url,
            data=payload,
            headers={
                "Authorization": f"Bearer {service_key}",
                "apikey": service_key,
                "Content-Type": "video/mp4",
                "x-upsert": "false",
            },
            timeout=120,
        )
    if not response.ok:
        raise RuntimeError(
            f"Supabase Storage upload failed ({response.status_code}): "
            f"{response.text[:240]}"
        )
    public_base = os.getenv("OUTPUT_PUBLIC_BASE_URL", "").rstrip("/")
    if not public_base:
        public_base = f"{supabase_url}/storage/v1/object/public/{bucket}"
    return f"{public_base}/{key}"


def make_chunk(image: Image.Image, prompt: str, seconds: int, seed: int, out: Path):
    generator = torch.Generator("cuda").manual_seed(seed)
    frames = pipeline()(
        image=image.convert("RGB").resize((WIDTH, HEIGHT)),
        prompt=prompt,
        height=HEIGHT,
        width=WIDTH,
        num_frames=seconds * FRAME_RATE,
        guidance_scale=5.0,
        generator=generator,
    ).frames[0]
    from diffusers.utils import export_to_video
    export_to_video(frames, str(out), fps=FRAME_RATE)


def handler(job):
    inp = job["input"]
    chunks = inp.get("chunks", [])
    if not chunks:
        raise ValueError("chunks are required")
    audio_base64 = inp.get("audio_base64")
    if not audio_base64:
        raise ValueError("audio_base64 is required; premium films must retain the Oracle soundtrack")
    portrait = requests.get(inp["portrait_url"], timeout=30)
    portrait.raise_for_status()
    image = Image.open(io.BytesIO(portrait.content))
    with tempfile.TemporaryDirectory(prefix="oracle-film-") as tmp:
        root = Path(tmp)
        anchor = root / "anchor.mp3"
        try:
            anchor.write_bytes(base64.b64decode(audio_base64, validate=True))
        except (ValueError, TypeError):
            raise ValueError("audio_base64 is not valid base64")
        if not anchor.stat().st_size:
            raise ValueError("audio_base64 is empty")
        chunk_paths = []
        for index, chunk in enumerate(chunks):
            path = root / f"chunk-{index:03d}.mp4"
            make_chunk(image, str(chunk["prompt"])[:1200],
                       min(int(chunk.get("durationSeconds", 5)), 5),
                       index + 401, path)
            chunk_paths.append(path)
            yield {"progress": int((index + 1) / len(chunks) * 82), "status": "generating"}

        concat = root / "concat.txt"
        concat.write_text("\n".join(f"file '{p}'" for p in chunk_paths))
        final = root / "oracle-film.mp4"
        subprocess.run([
            "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat),
            "-r", str(FRAME_RATE), "-c:v", "libx264",
            "-i", str(anchor), "-map", "0:v:0", "-map", "1:a:0",
            "-vf", "scale=720:720:force_original_aspect_ratio=decrease,"
                   "pad=720:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
            "-c:a", "aac", "-shortest", "-movflags", "+faststart",
            str(final),
        ], check=True, capture_output=True)
        yield {"progress": 92, "status": "stitching"}
        url = upload_mp4(final)
        return {"final_media_url": url, "duration_seconds": len(chunks) * 5,
                "audio_stream_present": True,
                "codec": "h264", "pixel_format": "yuv420p", "frame_rate": FRAME_RATE}


runpod.serverless.start({"handler": handler})