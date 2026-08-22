FROM nvidia/cuda:12.4.1-cudnn-devel-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/models/cache

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip ffmpeg git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN python3 -m pip install --upgrade pip && \
    pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124 && \
    pip install runpod diffusers transformers accelerate safetensors pillow requests boto3

WORKDIR /app
COPY handler.py /app/handler.py
CMD ["python3", "/app/handler.py"]