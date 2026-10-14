# MedRoute AI — Deployment Guide

## Architecture

```
[Your Laptop]                    [Cloud]
  Ollama (Qwen) ─────────────►  Railway (FastAPI backend)
  Whisper (local ASR)            │
    │                            │
    └── cloudflared tunnel ──►   │ (OLLAMA_BASE_URL = tunnel URL)
                                 │
                           Vercel (React frontend)
                                 │
                           Supabase (PostgreSQL)
```

---

## 1. Deploy Backend → Railway

### One-click deploy
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template)

### Manual steps
1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Select `Nvaibhav29/hacksprint`
3. Railway auto-detects the `Dockerfile` ✅
4. Add these **Environment Variables** in Railway dashboard:

```
GROQ_API_KEY=your_key
GEMINI_API_KEY=your_key
SARVAM_API_KEY=your_key
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=eyJ...
ALLOWED_ORIGINS=https://your-app.vercel.app,http://localhost:5173
OLLAMA_BASE_URL=https://YOUR-CLOUDFLARE-TUNNEL-URL  ← set after step 3
```

5. Railway gives you a URL like `https://hacksprint-production.up.railway.app` — copy it.

---

## 2. Set Up Cloudflare Tunnel (Local LLM → Railway)

This lets Railway call your local Ollama/GPU even though it's behind your home network.

### Install cloudflared
```powershell
winget install Cloudflare.cloudflared
```

### Quick tunnel (no account needed — great for hackathon)
```powershell
# Start Ollama first
ollama serve

# In another terminal — creates a temporary public URL
cloudflared tunnel --url http://localhost:11434
```
Copy the `https://xxxx.trycloudflare.com` URL → paste into Railway as `OLLAMA_BASE_URL`.

### Permanent tunnel (needs free Cloudflare account)
```powershell
cloudflared login                          # opens browser
cloudflared tunnel create medroute-local-llm
cloudflared tunnel route dns medroute-local-llm llm.yourdomain.com
cloudflared tunnel run --config cloudflare-tunnel.yml medroute-local-llm
```

---

## 2b. Laptop ASR (Whisper) through the same tunnel

If Groq speech-to-text fails (rate limit, outage), the Railway backend sends the audio to Whisper
running on your laptop. `asr_server.py` also forwards Ollama calls, so **one tunnel serves both**.

ASR order on Railway: **Groq -> laptop Whisper -> (nothing else; faster-whisper is not in the image)**.

**One-time setup**
1. Laptop: `pip install -r requirements.txt`
2. Pick a secret: `python -c "import secrets; print(secrets.token_urlsafe(32))"`
3. Laptop `.env`: `ASR_TOKEN=<secret>`
4. Railway Variables: `ASR_TOKEN=<same secret>` and `ASR_REMOTE_URL=https://<your-ngrok-domain>` (no trailing slash).
   Keep `OLLAMA_BASE_URL` as it is: the same address now reaches Ollama through the ASR server.
5. Stop the old ngrok autostart (Task Scheduler: `MedRoute-NgrokTunnel`), it holds your domain on port 11434.

**Every time (before a demo)**
```powershell
.\start-asr.ps1 -Domain your-domain.ngrok-free.dev
```
It starts the server, waits until Whisper is loaded, then opens the tunnel.
Check from any browser: `https://<your-domain>/health` shows the model and device.

**Test the fallback on purpose:** on Railway set `GROQ_API_KEY` to a wrong value for a minute (or remove it),
upload a call, and the stepper shows `whisper-laptop` with the *fallback* tag.

Notes
- The laptop must be on, online, and running `start-asr.ps1`. If not, the upload fails with one short line
  ("laptop ASR unreachable ...").
- Only the allowed Ollama paths are forwarded (`/api/generate`, `/api/chat`, `/api/tags`, `/api/show`, `/api/version`).
  Model management (pull / delete) is blocked. The Ollama paths themselves have no token, as before.
- `whisper small` on CPU takes roughly 1 to 3 minutes for a 3-minute call. Set `WHISPER_DEVICE=cuda` and
  `WHISPER_COMPUTE_TYPE=float16` in the laptop `.env` if you have an NVIDIA GPU.
- `start-asr.ps1` picks `--url` or `--domain` automatically, depending on your ngrok version.

---

## 3. Deploy Frontend → Vercel

```powershell
cd frontend
npm install -g vercel   # one time
vercel                  # follow prompts
```

When Vercel asks for environment variables, add:
```
VITE_API_URL=https://hacksprint-production.up.railway.app
```

Or set it in the Vercel dashboard → Project → Settings → Environment Variables.

---

## 4. Running Locally (dev)

```powershell
# Terminal 1 — Backend
cd "c:\hacksprint grok"
python main.py

# Terminal 2 — Frontend
cd "c:\hacksprint grok\frontend"
npm run dev

# Terminal 3 — Ollama LLM
ollama serve

# Terminal 4 — Cloudflare tunnel (if testing prod backend with local LLM)
cloudflared tunnel --url http://localhost:11434
```

---

## Summary

| Service | Where | URL |
|---|---|---|
| Backend (FastAPI) | Railway | `https://hacksprint-xxx.railway.app` |
| Frontend (React) | Vercel | `https://hacksprint.vercel.app` |
| Database | Supabase | `https://xxx.supabase.co` |
| Local LLM (Ollama) | Your laptop → Cloudflare | `https://xxx.trycloudflare.com` |
