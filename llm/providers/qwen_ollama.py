"""
Local Qwen2.5 LLM via Ollama — fallback when cloud API is unavailable.
Requires Ollama running locally: https://ollama.ai
Pull model: ollama pull qwen2.5:7b-instruct-q4_K_M
"""
import httpx
from config import get_settings


def complete(prompt: str) -> str:
    """
    Send prompt to local Qwen model via Ollama API.
    Raises on failure — caller handles further fallback.
    """
    settings = get_settings()

    payload = {
        "model": settings.ollama_model,
        "prompt": prompt,
        "stream": False,
        "format": "json",                      # Fix #6: JSON mode
        "options": {
            "temperature": 0.1,
            "num_predict": 2048,
            "num_ctx": settings.ollama_num_ctx,  # Fix #6: stop silent truncation
        },
    }

    with httpx.Client(timeout=180.0) as client:
        response = client.post(
            f"{settings.ollama_base_url}/api/generate",
            json=payload,
        )

    if response.status_code != 200:
        raise RuntimeError(f"Ollama error {response.status_code}: {response.text}")

    text = response.json().get("response", "").strip()
    if not text:
        raise RuntimeError("Ollama returned empty response")
    return text
