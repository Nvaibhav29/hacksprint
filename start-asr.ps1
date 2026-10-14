# start-asr.ps1
# Starts the laptop ASR server (Whisper) and shares it with Railway through ngrok.
# One tunnel serves both the ASR (/transcribe) and your local Ollama (/api/generate).
#
# Before the first run:
#   1. pip install -r requirements.txt            (installs faster-whisper)
#   2. In .env on this laptop:  ASR_TOKEN=<long random string>   (same value on Railway)
#   3. On Railway:              ASR_REMOTE_URL=https://<your-ngrok-domain>   (no trailing slash)
#
# Usage:   .\start-asr.ps1 -Domain nutrient-green-sip.ngrok-free.dev
#          (or set $env:NGROK_DOMAIN once). Leave -Domain empty for a random ngrok URL.
param(
    [string]$Domain = $env:NGROK_DOMAIN,
    [int]$Port = 8001
)

Write-Host ""
Write-Host "MedRoute AI: laptop ASR + tunnel" -ForegroundColor Cyan
Write-Host ""

# Find ngrok. An old ngrok 2.x can be first on PATH and cannot read a v3 config,
# so prefer the winget (v3) install and fall back to whatever is on PATH.
$ngrokExe = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Ngrok.Ngrok*" -Filter "ngrok.exe" -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName
if (-not $ngrokExe) { $ngrokExe = "ngrok" }
Write-Host ("Using ngrok: " + $ngrokExe + "  (" + ((& $ngrokExe version 2>&1 | Out-String).Trim()) + ")") -ForegroundColor Gray

# An old tunnel that still points at Ollama's port would keep your domain busy
$old = Get-Process -Name "ngrok" -ErrorAction SilentlyContinue
if ($old) {
    Write-Host "Stopping the existing ngrok tunnel (it would hold your domain)..." -ForegroundColor Yellow
    $old | Stop-Process -Force
    Start-Sleep -Seconds 2
}

# Ollama (used by the LLM fallback through the same tunnel)
try { Invoke-RestMethod "http://localhost:11434/api/tags" -TimeoutSec 3 | Out-Null; Write-Host "Ollama is running" -ForegroundColor Green }
catch { Write-Host "Ollama is not running (only needed for the Qwen fallback). Start it with: ollama serve" -ForegroundColor Yellow }

# ASR server in its own window
$server = Start-Process -FilePath "python" -ArgumentList "asr_server.py" -PassThru
Write-Host "Starting the ASR server (the first run downloads the Whisper model)..." -ForegroundColor Yellow

$ready = $false
for ($i = 0; $i -lt 90; $i++) {
    Start-Sleep -Seconds 2
    if ($server.HasExited) { Write-Host "The ASR server stopped. Check the message in its window (ASR_TOKEN missing? faster-whisper not installed?)." -ForegroundColor Red; exit 1 }
    try {
        $h = Invoke-RestMethod "http://127.0.0.1:$Port/health" -TimeoutSec 2
        if ($h.model_loaded) { $ready = $true; break }
    } catch { }
}
if (-not $ready) { Write-Host "The ASR server did not become ready in 3 minutes." -ForegroundColor Red; exit 1 }
Write-Host "ASR server ready: model $($h.model) on $($h.device)" -ForegroundColor Green

Write-Host ""
if ($Domain) {
    Write-Host "Tunnel: https://$Domain  ->  localhost:$Port   (Ctrl+C stops the tunnel)" -ForegroundColor Cyan
    # Newer ngrok uses --url, older versions use --domain: pick whichever this install knows
    $help = (& $ngrokExe http --help 2>&1 | Out-String)
    $flag = if ($help -match '--url') { '--url' } else { '--domain' }
    & $ngrokExe http $Port "$flag=$Domain"
} else {
    Write-Host "No domain given: ngrok will print a random URL. Put it in Railway as ASR_REMOTE_URL." -ForegroundColor Yellow
    & $ngrokExe http $Port
}
