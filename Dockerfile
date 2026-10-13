FROM python:3.11-slim

# Install system dependencies (ffmpeg for audio preprocessing)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app source
COPY . .

# Railway sets PORT env var — uvicorn must bind to it
ENV PORT=8000
EXPOSE $PORT

CMD uvicorn backend.app:app --host 0.0.0.0 --port $PORT --workers 2
