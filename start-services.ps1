# MedRoute AI — Auto-start script
# Starts Ollama + ngrok tunnel silently at Windows login
# Registered as: Task Scheduler → MedRoute-NgrokTunnel

$ollamaExe = "C:\Users\mysur\AppData\Local\Programs\Ollama\ollama.exe"
$ngrokExe  = "C:\Users\mysur\AppData\Local\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe"
$ngrokConf = "$env:LOCALAPPDATA\ngrok\ngrok.yml"

# 1. Start Ollama if not running
$ollama = Get-Process -Name "ollama" -ErrorAction SilentlyContinue
if (-not $ollama) {
    Start-Process -FilePath $ollamaExe -WindowStyle Minimized
    Start-Sleep -Seconds 8
}

# 2. Start ngrok tunnel if not running
$ngrok = Get-Process -Name "ngrok" -ErrorAction SilentlyContinue
if (-not $ngrok) {
    Start-Process -FilePath $ngrokExe -ArgumentList "start ollama --config `"$ngrokConf`"" -WindowStyle Minimized
}
