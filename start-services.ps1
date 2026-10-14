# MedRoute AI — Auto-start script
# Starts Ollama + local proxy server + ngrok tunnel silently at Windows login
# Registered as: Task Scheduler → MedRoute-NgrokTunnel

$ollamaExe  = "C:\Users\mysur\AppData\Local\Programs\Ollama\ollama.exe"
$ngrokExe   = "C:\Users\mysur\AppData\Local\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe"
$ngrokConf  = "$env:LOCALAPPDATA\ngrok\ngrok.yml"
$proxyScript = "c:\hacksprint grok\local_proxy.py"
$envFile     = "c:\hacksprint grok\.env"

# Load .env so PROXY_PORT, ASR_TOKEN, WHISPER_MODEL etc. are available
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
        }
    }
}

# 1. Start Ollama (needed by local proxy for Ollama LLM pass-through)
if (-not (Get-Process -Name "ollama" -ErrorAction SilentlyContinue)) {
    Write-Host "Starting Ollama..."
    Start-Process -FilePath $ollamaExe -WindowStyle Minimized
    Start-Sleep -Seconds 8
}

# 2. Start local proxy server (ASR + Ollama pass-through on port 8888)
$existingProxy = Get-NetTCPConnection -LocalPort 8888 -ErrorAction SilentlyContinue
if (-not $existingProxy) {
    Write-Host "Starting local proxy server on port 8888..."
    Start-Process -FilePath "python" `
        -ArgumentList "`"$proxyScript`"" `
        -WorkingDirectory "c:\hacksprint grok" `
        -WindowStyle Minimized
    Start-Sleep -Seconds 5
}

# 3. Start ngrok tunnel (proxy port 8888 → nutrient-green-sip.ngrok-free.dev)
if (-not (Get-Process -Name "ngrok" -ErrorAction SilentlyContinue)) {
    Write-Host "Starting ngrok tunnel..."
    Start-Process -FilePath $ngrokExe `
        -ArgumentList "http 8888 --domain=nutrient-green-sip.ngrok-free.dev" `
        -WindowStyle Minimized
}

Write-Host "All services started. Tunnel: https://nutrient-green-sip.ngrok-free.dev"
