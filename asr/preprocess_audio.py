"""
Audio preprocessor.
Converts any input audio to 16 kHz mono WAV using ffmpeg.
Required format for both Sarvam API and Vakyansh/Whisper.
"""
import subprocess
import tempfile
import os
import shutil
from pathlib import Path


def preprocess_audio(input_path: str) -> str:
    """
    Convert audio file to 16kHz mono WAV.
    Returns path to the converted temp file.
    Caller is responsible for deleting the temp file.
    """
    suffix = ".wav"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp.close()
    out_path = tmp.name

    cmd = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-ac", "1",           # mono
        "-ar", "16000",       # 16 kHz
        "-c:a", "pcm_s16le",  # 16-bit PCM
        out_path
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        os.unlink(out_path)
        raise RuntimeError(f"ffmpeg failed: {result.stderr}")

    return out_path


def get_duration_seconds(file_path: str) -> int:
    """Return audio duration in seconds using ffprobe."""
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        file_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return 0
    try:
        return int(float(result.stdout.strip()))
    except (ValueError, AttributeError):
        return 0


def split_audio(wav_path: str, chunk_seconds: int = 25) -> tuple[list[str], str | None]:
    """
    Split a WAV into <= chunk_seconds pieces (Sarvam REST accepts max 30 s).

    Returns (chunk_paths, temp_dir). If the file is already short enough,
    returns ([wav_path], None) and nothing needs cleaning up. Otherwise the
    caller must shutil.rmtree(temp_dir) when finished.
    """
    duration = get_duration_seconds(wav_path)
    if duration and duration <= chunk_seconds:
        return [wav_path], None

    tmp_dir = tempfile.mkdtemp(prefix="asr_chunks_")
    pattern = os.path.join(tmp_dir, "chunk_%03d.wav")
    cmd = [
        "ffmpeg", "-y", "-i", wav_path,
        "-f", "segment", "-segment_time", str(chunk_seconds),
        "-c:a", "pcm_s16le", "-ar", "16000", "-ac", "1",
        pattern,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    chunks = sorted(str(p) for p in Path(tmp_dir).glob("chunk_*.wav"))
    if result.returncode != 0 or not chunks:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise RuntimeError(f"ffmpeg split failed: {result.stderr[-500:]}")
    return chunks, tmp_dir
