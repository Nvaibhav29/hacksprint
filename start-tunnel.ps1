# start-tunnel.ps1
# Starts Cloudflare tunnel to expose your local Ollama to Railway backend.
# Run this EVERY TIME you want the deployed backend to use your local GPU/LLM.

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  MedRoute AI — Local LLM Tunnel" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check Ollama is running
try {
    $check = Invoke-RestMethod "http://localhost:11434/api/tags" -TimeoutSec 3 -ErrorAction Stop
    Write-Host "✅ Ollama is running" -ForegroundColor Green
} catch {
    Write-Host "❌ Ollama is NOT running. Start it first:" -ForegroundColor Red
    Write-Host "   ollama serve" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "Starting Cloudflare tunnel to localhost:11434..." -ForegroundColor Yellow
Write-Host "Copy the tunnel URL (https://xxxx.trycloudflare.com) and paste it" -ForegroundColor Yellow
Write-Host "into Railway dashboard as: OLLAMA_BASE_URL" -ForegroundColor Yellow
Write-Host ""
Write-Host "Press Ctrl+C to stop the tunnel." -ForegroundColor Gray
Write-Host ""

cloudflared tunnel --url http://localhost:11434
