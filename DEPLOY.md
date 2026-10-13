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
