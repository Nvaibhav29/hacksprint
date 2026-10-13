"""
Gemini LLM provider — primary cloud LLM.
Uses the google-genai SDK (pip package: google-genai).

Fix #1: the SDK is imported lazily inside complete(), so if the package is
missing or broken the error is raised at call time and dual_mode falls back
to Qwen instead of the whole server crashing at startup.
"""
from config import get_settings


def complete(prompt: str) -> str:
    """
    Send prompt to Gemini and return raw JSON text.
    Raises on API failure — caller handles fallback.
    """
    settings = get_settings()
    if not settings.gemini_api_key:
        raise ValueError("GEMINI_API_KEY not set — falling back to local LLM")

    from google import genai            # lazy import
    from google.genai import types

    client = genai.Client(api_key=settings.gemini_api_key)
    response = client.models.generate_content(
        model=settings.gemini_model,
        contents=prompt,
        config=types.GenerateContentConfig(
            temperature=0.1,
            max_output_tokens=4096,
            response_mime_type="application/json",   # Fix #6: JSON mode
        ),
    )

    text = response.text.strip() if response.text else ""
    if not text:
        raise RuntimeError("Gemini returned empty response")
    return text
