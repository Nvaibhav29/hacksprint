FROM python:3.11-slim

# System deps: ffmpeg for audio preprocessing
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install production Python deps (no faster-whisper, no torch — Groq handles ASR)
COPY requirements-prod.txt .
RUN pip install --no-cache-dir -r requirements-prod.txt

# Copy app source
COPY . .

# Railway injects PORT env var
EXPOSE 8000

# Railway sets PORT env var — single worker avoids fork issues in containers
CMD uvicorn backend.app:app --host 0.0.0.0 --port ${PORT:-8000}
