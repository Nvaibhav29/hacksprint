"""
Local ASR fallback using faster-whisper (CTranslate2).
Used when the Sarvam API is unavailable or returns an error.

Fix #7:
  * faster-whisper instead of openai-whisper -> no torch download, ~4x faster on CPU;
  * model size / device / compute type come from config (WHISPER_MODEL etc.);
  * language comes from the UI dropdown (None = auto-detect);
  * a short hospital-vocabulary `initial_prompt` (Roman script) improves
    recognition of terms like billing/appointment/UHID and nudges Roman output.

Note on scripts: Whisper outputs native script (Devanagari/Kannada) for Indian
languages and cannot be forced to Roman. The LLM prompt copies trigger phrases
verbatim, so matching works with either script.
"""
import threading
from config import get_settings

_model = None
_model_key = None
_lock = threading.Lock()

# Short Roman-script samples: vocabulary hint + style nudge.
_VOCAB_PROMPTS = {
    "hi": "Namaste, main hospital se bol raha hoon. Aapka naam aur patient ID ya UHID kya hai? Billing, appointment, medicine, refund, prescription, report.",
    "kn": "Namaskara, nanna hesaru. Hospital billing, appointment, medicine, refund, prescription bagge maatadabeku.",
    "en": "Hospital call about billing, appointment, pharmacy, refund, prescription, UHID, patient ID, doctor.",
}


def _load_model():
    """Load the model once; reload only if the configured settings change."""
    global _model, _model_key
    from faster_whisper import WhisperModel          # lazy: only needed on fallback
    s = get_settings()
    key = (s.whisper_model, s.whisper_device, s.whisper_compute_type)
    with _lock:
        if _model is None or _model_key != key:
            _model = WhisperModel(
                s.whisper_model, device=s.whisper_device, compute_type=s.whisper_compute_type
            )
            _model_key = key
    return _model


def transcribe(audio_path: str, language: str = None) -> dict:
    """
    Args:
        audio_path: Path to preprocessed 16 kHz mono WAV.
        language:   ISO code ("hi", "kn", "en", ...) or None/"auto" for auto-detect.
    """
    model = _load_model()

    lang = None if (not language or language == "auto") else language
    prompt = _VOCAB_PROMPTS.get(lang or "hi")

    segments, info = model.transcribe(
        audio_path,
        language=lang,
        task="transcribe",                 # keep original language
        initial_prompt=prompt,
        beam_size=5,
        vad_filter=True,                   # skip silence -> fewer hallucinations
        condition_on_previous_text=False,
    )
    transcript = " ".join(seg.text.strip() for seg in segments).strip()
    if not transcript:
        raise RuntimeError("Whisper returned empty transcript")

    return {
        "transcript": transcript,
        "language_code": info.language or lang or "unknown",
        "provider": "whisper",
    }
