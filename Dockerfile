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
ENV PORT=8000
EXPOSE $PORT

CMD uvicorn backend.app:app --host 0.0.0.0 --port $PORT --workers 2
