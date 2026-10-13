"""
Groq LLM provider — OpenAI-compatible chat completions.
Docs: https://console.groq.com/docs/api-reference#chat

JSON mode (response_format=json_object) is used so the reply is a JSON object;
llm.dual_mode still validates it and retries / falls back on bad output.
"""
import httpx
from config import get_settings

GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"


def complete(prompt: str) -> str:
    """Send the prompt to Groq and return raw JSON text. Raises on failure."""
    s = get_settings()
    if not s.groq_api_key:
        raise ValueError("GROQ_API_KEY not set")

    payload = {
        "model": s.groq_model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.1,
        "max_tokens": 4096,
        "response_format": {"type": "json_object"},
    }
    headers = {"Authorization": f"Bearer {s.groq_api_key}"}

    with httpx.Client(timeout=60.0) as client:
        resp = client.post(GROQ_CHAT_URL, headers=headers, json=payload)

    if resp.status_code != 200:
        raise RuntimeError(f"Groq LLM error {resp.status_code}: {resp.text[:300]}")

    try:
        text = (resp.json()["choices"][0]["message"]["content"] or "").strip()
    except (KeyError, IndexError, TypeError, ValueError) as e:
        raise RuntimeError(f"Groq LLM returned an unexpected response: {e}")
    if not text:
        raise RuntimeError("Groq returned empty response")
    return text
