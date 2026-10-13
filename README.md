# MedRoute AI — Healthcare Call Intelligence (HLS004)

Audio call → ASR → LLM → Structured action tickets routed to hospital departments.

## Stack
- **ASR**: Groq Whisper large v3 (primary) → Sarvam AI → faster-whisper local (fallbacks)
- **LLM**: Groq Llama 3.3 70B (primary) → Gemini → Qwen2.5:7b via Ollama (fallbacks)
- **Backend**: FastAPI + Supabase
- **Frontend**: React + Vite

## Setup

### 1. Clone and configure
```bash
git clone https://github.com/Nvaibhav29/healthcare-call-actionable.git
cd healthcare-call-actionable
cp .env.example .env
# Put your GROQ_API_KEY in .env (https://console.groq.com/keys). Other keys are optional fallbacks.
# Groq only? set ASR_ORDER=groq and LLM_ORDER=groq
```

### 2. Run Supabase schema
Open `database/schema.sql` and run it in your Supabase SQL editor.

### 3. Backend
```bash
pip install -r requirements.txt
python main.py
# Runs on http://localhost:8000
```

### 4. Frontend
```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:5173
```

## API Docs
Visit `http://localhost:8000/docs` after starting the backend.

## Pipeline
```
Audio → preprocess (ffmpeg) → ASR chain → LLM chain → Router → Supabase → Dashboard
```
