[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$serviceRoot = $PSScriptRoot
$envFile = Join-Path $serviceRoot '.env'
$venvPython = Join-Path $serviceRoot '.venv\Scripts\python.exe'

function Stop-WithMessage([string]$Message) {
    Write-Error $Message
    exit 1
}

if (-not (Test-Path -LiteralPath $envFile)) {
    Stop-WithMessage "Missing local-ai\.env. Copy .env.example to .env and review the settings."
}

Get-Content -LiteralPath $envFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#') -or -not $line.Contains('=')) { return }
    $parts = $line.Split('=', 2)
    $name = $parts[0].Trim()
    $value = $parts[1].Trim().Trim('"').Trim("'")
    if (-not [Environment]::GetEnvironmentVariable($name, 'Process')) {
        [Environment]::SetEnvironmentVariable($name, $value, 'Process')
    }
}

if (Test-Path -LiteralPath $venvPython) {
    $python = $venvPython
} else {
    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if (-not $pythonCommand) { Stop-WithMessage 'Python was not found. Install Python 3.11+ and create local-ai\.venv.' }
    $python = $pythonCommand.Source
    Write-Warning 'local-ai\.venv was not found; using the Python on PATH.'
}

& $python -c "import fastapi, httpx, pydantic_settings, uvicorn" 2>$null
if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'Python dependencies are missing. Run: pip install -r requirements.txt' }

$ollamaBaseUrl = if ($env:OLLAMA_BASE_URL) { $env:OLLAMA_BASE_URL.TrimEnd('/') } else { 'http://127.0.0.1:11434' }
$model = if ($env:OLLAMA_MODEL) { $env:OLLAMA_MODEL } else { 'qwen3:8b' }
try {
    $tags = Invoke-RestMethod -Method Get -Uri "$ollamaBaseUrl/api/tags" -TimeoutSec 5
} catch {
    Stop-WithMessage "Ollama is not reachable at $ollamaBaseUrl. Start Ollama and try again."
}

$installed = @($tags.models | ForEach-Object { if ($_.name) { $_.name } else { $_.model } })
if ($installed -notcontains $model -and $installed -notcontains "$model`:latest") {
    Stop-WithMessage "Configured model '$model' is not installed. Run: ollama pull $model"
}

if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
    Write-Host 'NVIDIA tools detected. Use nvidia-smi during a chat request to verify GPU/VRAM use.' -ForegroundColor Green
} else {
    Write-Warning 'nvidia-smi was not found. The API can start, but GPU use cannot be verified from this shell.'
}

$hostAddress = if ($env:LOCAL_AI_HOST) { $env:LOCAL_AI_HOST } else { '127.0.0.1' }
if ($hostAddress -notin @('127.0.0.1', '::1', 'localhost')) {
    Stop-WithMessage 'LOCAL_AI_HOST must remain loopback-only. Use 127.0.0.1 and expose it only through Cloudflare Tunnel.'
}
$port = if ($env:LOCAL_AI_PORT) { [int]$env:LOCAL_AI_PORT } else { 8765 }
Write-Host "Starting TRINITY Local AI at http://$hostAddress`:$port with model $model" -ForegroundColor Cyan
Push-Location $serviceRoot
try {
    & $python -m uvicorn app.main:app --host $hostAddress --port $port
} finally {
    Pop-Location
}
