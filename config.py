from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Provider chains: tried left to right, the first that works wins.
    # Providers without an API key are skipped. Names: groq | sarvam | whisper  /  groq | gemini | qwen
    asr_order: str = "groq,sarvam,whisper"
    llm_order: str = "groq,gemini,qwen"

    # Groq (one key for both ASR and LLM): https://console.groq.com
    groq_api_key: str = ""
    groq_asr_model: str = "whisper-large-v3"        # or whisper-large-v3-turbo (faster, slightly less accurate)
    groq_chunk_seconds: int = 600                   # 10 min of 16 kHz mono WAV ~ 19 MB, under the 25 MB upload cap
    groq_model: str = "openai/gpt-oss-120b"     # or openai/gpt-oss-120b, openai/gpt-oss-20b

    # ASR
    sarvam_api_key: str = ""
    # Fix #4: Saaras v3 supports `mode`. "translit" returns Roman-script text,
    # which matches what the LLM prompt asks for. Other modes: transcribe,
    # translate, verbatim, codemix.
    sarvam_model: str = "saaras:v3"
    sarvam_mode: str = "translit"
    # Sarvam REST accepts max 30 s per request, so longer audio is split.
    asr_chunk_seconds: int = 25
    whisper_model: str = "small"        # tiny | base | small | medium (small is a good CPU balance)
    whisper_device: str = "cpu"         # "cuda" if you have an NVIDIA GPU
    whisper_compute_type: str = "int8"  # int8 on CPU; float16 on GPU

    # LLM
    gemini_api_key: str = ""
    # Fix #1: model name now lives in config (gemini-1.5-flash is retired).
    # Check https://aistudio.google.com for the models your key can use.
    gemini_model: str = "gemini-3.1-flash-lite"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:7b-instruct-q4_K_M"
    ollama_num_ctx: int = 8192  # Fix #6

    # Supabase
    supabase_url: str = ""
    supabase_key: str = ""

    # App
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    confidence_threshold: float = 0.70
    max_audio_size_mb: int = 50
    max_concurrent_jobs: int = 2  # Fix #3

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


def parse_order(value: str) -> list[str]:
    return [p.strip().lower() for p in (value or "").split(",") if p.strip()]


@lru_cache()
def get_settings() -> Settings:
    return Settings()
