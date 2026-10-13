"""
Local ASR fallback using faster-whisper (CTranslate2).
Used when Groq API key is missing or Groq fails.

faster-whisper is NOT installed in the production Docker image (Railway uses Groq).
This module imports it lazily so the app starts fine even without it.
"""
import threading
from config import get_settings

_model = None
_model_key = None
_lock = threading.Lock()

# Roman-script vocabulary hints — also imported by groq_asr.py for prompt seeding.
_VOCAB_PROMPTS = {
    "hi": "Namaste, main hospital se bol raha hoon. Aapka naam aur patient ID ya UHID kya hai? Billing, appointment, medicine, refund, prescription, report.",
    "kn": "Namaskara, nanna hesaru. Hospital billing, appointment, medicine, refund, prescription bagge maatadabeku.",
    "en": "Hospital call about billing, appointment, pharmacy, refund, prescription, UHID, patient ID, doctor.",
}


def _load_model():
    """Load faster-whisper model once; reload only if config changes."""
    global _model, _model_key
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise RuntimeError(
            "faster-whisper is not installed. "
            "Install it locally with: pip install faster-whisper\n"
            "On Railway, set GROQ_API_KEY to use Groq ASR instead."
        )
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
        language:   ISO code ("hi", "kn", "en") or None/"auto" for auto-detect.
    """
    model = _load_model()

    lang = None if (not language or language == "auto") else language
    prompt = _VOCAB_PROMPTS.get(lang or "hi")

    segments, info = model.transcribe(
        audio_path,
        language=lang,
        task="transcribe",
        initial_prompt=prompt,
        beam_size=5,
        vad_filter=True,
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
