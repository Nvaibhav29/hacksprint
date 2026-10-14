FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements-prod.txt .
RUN pip install --no-cache-dir -r requirements-prod.txt

COPY . .

# Pure Python start — no shell script, no CRLF issues, reads PORT env var correctly
CMD ["python", "-c", "import os,uvicorn; uvicorn.run('backend.app:app', host='0.0.0.0', port=int(os.getenv('PORT',8000)), log_level='info')"]
