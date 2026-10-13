"""
LLM provider chain — Groq first, local Ollama (Qwen) fallback.
No Gemini. No other cloud providers.
"""
import logging
from config import get_settings
from llm.providers import groq_llm, qwen_ollama

logger = logging.getLogger(__name__)

RETRIES_PER_PROVIDER = 1


def complete(prompt: str, parse) -> tuple:
    """
    Get a parsed, validated LLM result with automatic fallback.

    Args:
        prompt: full prompt text.
        parse:  function(raw_text) -> parsed object. Must raise on bad output.

    Returns:
        (parsed_result, provider_name, fallback_used)
    """
    s = get_settings()
    errors = []

    # ── 1. Groq cloud LLM (fast, smart) ───────────────────────────────────
    if s.groq_api_key:
        for attempt in range(1 + RETRIES_PER_PROVIDER):
            try:
                logger.info(f"LLM: Groq attempt {attempt + 1}...")
                raw = groq_llm.complete(prompt)
                parsed = parse(raw)
                logger.info("LLM: Groq succeeded.")
                return parsed, f"groq-{s.groq_model}", False
            except Exception as e:
                logger.warning(f"LLM: Groq attempt {attempt + 1} failed ({e}).")
                errors.append(f"groq: {e}")
        logger.warning("LLM: Groq exhausted retries. Falling back to Ollama...")
    else:
        logger.info("LLM: Groq skipped (no GROQ_API_KEY). Using Ollama.")

    # ── 2. Local Ollama/Qwen fallback ─────────────────────────────────────
    for attempt in range(1 + RETRIES_PER_PROVIDER):
        try:
            logger.info(f"LLM: Ollama attempt {attempt + 1}...")
            raw = qwen_ollama.complete(prompt)
            parsed = parse(raw)
            logger.info("LLM: Ollama succeeded.")
            return parsed, f"{s.ollama_model}-ollama", True
        except Exception as e:
            logger.warning(f"LLM: Ollama attempt {attempt + 1} failed ({e}).")
            errors.append(f"ollama: {e}")

    raise RuntimeError(
        "LLM extraction failed on all providers: " + " | ".join(errors)
        if errors else
        "No LLM provider worked. Check GROQ_API_KEY or ensure Ollama is running."
    )
