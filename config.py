from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # ── Groq (ASR + LLM) ─────────────────────────────────────────────────
    # Get your key: https://console.groq.com
    groq_api_key: str = ""
    # ASR model — whisper-large-v3 or whisper-large-v3-turbo (faster)
    groq_asr_model: str = "whisper-large-v3"

    # ── Local Proxy (ASR + Ollama via single ngrok tunnel) ───────────────
    # Set LOCAL_PROXY_URL to your ngrok static domain on Railway
    # e.g. https://nutrient-green-sip.ngrok-free.dev
    local_proxy_url: str = ""        # blank = skip local proxy
    asr_token: str = ""              # matches ASR_TOKEN in local_proxy.py
    groq_chunk_seconds: int = 600       # 10 min of 16kHz mono WAV ~ 19 MB (under Groq's 25 MB cap)
    # LLM model
    groq_model: str = "meta-llama/llama-4-scout-17b-16e-instruct"

    # ── Local Whisper (ASR fallback when no Groq key) ─────────────────────
    whisper_model: str = "small"        # tiny | base | small | medium
    whisper_device: str = "cpu"         # "cuda" if NVIDIA GPU present
    whisper_compute_type: str = "int8"  # int8 on CPU; float16 on GPU

    # ── Laptop ASR over a tunnel (see asr_server.py) ──────────────────────
    # Backend (Railway) side: where the laptop's ASR server is reachable.
    asr_remote_url: str = ""            # e.g. https://your-domain.ngrok-free.dev  (empty = disabled)
    asr_remote_timeout_seconds: int = 300
    # Shared secret. Set the SAME value on Railway and in the laptop's .env.
    asr_token: str = ""
    # Laptop side (asr_server.py only)
    asr_server_port: int = 8001
    asr_server_ollama_url: str = "http://localhost:11434"   # "" turns the Ollama pass-through off

    # ── Local Ollama / Qwen (LLM fallback when no Groq key) ──────────────
    # If local_proxy_url is set, Ollama calls go through proxy /ollama/*
    # Otherwise set OLLAMA_BASE_URL directly.
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:7b-instruct-q4_K_M"
    ollama_num_ctx: int = 8192

    # ── Supabase ──────────────────────────────────────────────────────────
    supabase_url: str = ""
    supabase_key: str = ""

    # ── App ───────────────────────────────────────────────────────────────
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    confidence_threshold: float = 0.70
    max_audio_size_mb: int = 50
    max_concurrent_jobs: int = 2

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
