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
    if inp.get("task") == "stitch_oracle_story":
        scene_urls = inp.get("scene_urls", [])
        durations = inp.get("durations", [])
        music_url = inp.get("music_url")
        narration_url = inp.get("narration_url")
        if not isinstance(scene_urls, list) or len(scene_urls) != 32:
            raise ValueError("stitch_oracle_story requires 32 scene_urls")
        if not isinstance(durations, list) or len(durations) != len(scene_urls):
            raise ValueError("stitch_oracle_story requires one duration per scene")
        if not music_url or not narration_url:
            raise ValueError("stitch_oracle_story requires music_url and narration_url")
        with tempfile.TemporaryDirectory(prefix="oracle-story-") as tmp:
            root = Path(tmp)
            normalized = []
            for index, (scene_url, duration) in enumerate(zip(scene_urls, durations)):
                if not scene_url or float(duration) <= 0 or float(duration) > 10:
                    raise ValueError("story scene input is invalid")
                source = root / f"source-{index:02d}.mp4"
                clip = root / f"scene-{index:02d}.mp4"
                response = requests.get(scene_url, timeout=90)
                response.raise_for_status()
                source.write_bytes(response.content)
                if not source.stat().st_size:
                    raise ValueError(f"story scene {index + 1} was empty")
                subprocess.run([
                    "ffmpeg", "-y", "-i", str(source), "-t", str(float(duration)),
                    "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,"
                           "pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
                    "-r", str(FRAME_RATE), "-an", "-c:v", "libx264",
                    "-preset", "veryfast", "-movflags", "+faststart", str(clip),
                ], check=True, capture_output=True)
                normalized.append(clip)
                yield {"progress": 8 + int((index + 1) / len(scene_urls) * 64), "status": "stitching"}

            concat = root / "concat.txt"
            concat.write_text("\n".join(f"file '{p}'" for p in normalized))
            silent = root / "story-silent.mp4"
            final = root / "oracle-story.mp4"
            subprocess.run([
                "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat),
                "-c", "copy", str(silent),
            ], check=True, capture_output=True)

            music = root / "music.mp3"
            narration = root / "narration.wav"
            music_response = requests.get(music_url, timeout=90)
            music_response.raise_for_status()
            narration_response = requests.get(narration_url, timeout=90)
            narration_response.raise_for_status()
            music.write_bytes(music_response.content)
            narration.write_bytes(narration_response.content)
            if not music.stat().st_size or not narration.stat().st_size:
                raise ValueError("story soundtrack or narration was empty")

            total_duration = sum(float(value) for value in durations)
            subprocess.run([
                "ffmpeg", "-y", "-i", str(silent),
                "-stream_loop", "-1", "-i", str(music),
                "-stream_loop", "-1", "-i", str(narration),
                "-filter_complex",
                "[1:a]volume=0.24[music];[2:a]volume=1.0[narration];"
                "[music][narration]amix=inputs=2:duration=longest:dropout_transition=2[a]",
                "-map", "0:v:0", "-map", "[a]", "-c:v", "copy",
                "-c:a", "aac", "-b:a", "160k", "-t", str(total_duration),
                "-movflags", "+faststart", str(final),
            ], check=True, capture_output=True)
            yield {"progress": 92, "status": "stitching"}
            return {
                "final_media_url": upload_mp4(final),
                "audio_stream_present": True,
                "codec": "h264",
                "pixel_format": "yuv420p",
                "duration_seconds": total_duration,
                "scene_count": len(scene_urls),
            }

    if inp.get("task") == "mux_oracle_film":
        video_url = inp.get("video_url")
        audio_url = inp.get("audio_url")
        if not video_url or not audio_url:
            raise ValueError("video_url and audio_url are required for audio mux")
        with tempfile.TemporaryDirectory(prefix="oracle-mux-") as tmp:
            root = Path(tmp)
            video = root / "visual.mp4"
            audio = root / "anchor.mp3"
            final = root / "oracle-film.mp4"
            video.write_bytes(requests.get(video_url, timeout=60).content)
            audio_response = requests.get(audio_url, timeout=60)
            audio_response.raise_for_status()
            audio.write_bytes(audio_response.content)
            if not video.stat().st_size or not audio.stat().st_size:
                raise ValueError("FAL visual or Lyria anchor was empty")
            yield {"progress": 84, "status": "stitching"}
            subprocess.run([
                "ffmpeg", "-y", "-i", str(video), "-i", str(audio),
                "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy",
                "-c:a", "aac", "-shortest", "-movflags", "+faststart",
                str(final),
            ], check=True, capture_output=True)
            return {
                "final_media_url": upload_mp4(final),
                "audio_stream_present": True,
                "codec": "h264",
                "pixel_format": "yuv420p",
            }

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