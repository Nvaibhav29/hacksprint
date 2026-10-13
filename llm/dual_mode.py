"""
LLM provider chain.
Tries the providers in LLM_ORDER (default: groq, gemini, qwen). Providers without
an API key are skipped; qwen is the local Ollama model.

Fix #6: fallback is now triggered by *bad output* as well as by API errors.
For each provider: call -> parse/validate -> on bad output retry once ->
then move on to the next provider.
"""
import logging
from typing import Callable, Any

from config import get_settings, parse_order
from llm.providers import gemini, qwen_ollama, groq_llm

logger = logging.getLogger(__name__)

RETRIES_PER_PROVIDER = 1   # one retry after the first attempt


def _providers() -> list[tuple[str, Callable[[str], str]]]:
    """Ordered (display name, call) pairs for the providers that are configured."""
    s = get_settings()
    available = {
        "groq":   (s.groq_api_key,   f"groq-{s.groq_model}",       groq_llm.complete),
        "gemini": (s.gemini_api_key, s.gemini_model,               gemini.complete),
        "qwen":   (True,             f"{s.ollama_model}-ollama",   qwen_ollama.complete),
    }
    chain = []
    for name in parse_order(s.llm_order):
        if name not in available:
            logger.warning(f"LLM: unknown provider '{name}' in LLM_ORDER — ignored")
            continue
        key, label, fn = available[name]
        if not key:
            logger.info(f"LLM: {name} skipped (no API key set)")
            continue
        chain.append((label, fn))
    return chain


def complete(prompt: str, parse: Callable[[str], Any]) -> tuple[Any, str, bool]:
    """
    Get a *parsed, validated* LLM result with automatic fallback.

    Args:
        prompt: full prompt text.
        parse:  function(raw_text) -> parsed object. Must raise ValueError
                (or any exception) if the output is unusable.

    Returns:
        (parsed_result, provider_name, fallback_used)
        fallback_used is True when the first provider in the chain did not produce the result.
    """
    errors: list[str] = []

    for idx, (name, call) in enumerate(_providers()):
        for attempt in range(1 + RETRIES_PER_PROVIDER):
            try:
                logger.info(f"LLM: {name} attempt {attempt + 1}...")
                raw = call(prompt)
            except Exception as e:                       # API/network/import error
                logger.warning(f"LLM: {name} call failed ({e}). Switching provider.")
                errors.append(f"{name}: {e}")
                break                                    # retrying a dead API is pointless

            try:
                parsed = parse(raw)
                logger.info(f"LLM: {name} succeeded.")
                return parsed, name, idx > 0
            except Exception as e:                       # bad JSON / bad schema
                logger.warning(f"LLM: {name} returned unusable output ({e}).")
                errors.append(f"{name} (bad output): {e}")
                # loop again -> retry once, then fall through to next provider

    raise RuntimeError(
        "LLM extraction failed on all providers: " + " | ".join(errors)
        if errors else "No LLM provider is configured (set GROQ_API_KEY or GEMINI_API_KEY, or run Ollama and add qwen to LLM_ORDER)."
    )
