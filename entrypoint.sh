#!/bin/sh
set -e
echo "Starting MedRoute AI on port ${PORT:-8000}"
exec uvicorn backend.app:app --host 0.0.0.0 --port "${PORT:-8000}"
