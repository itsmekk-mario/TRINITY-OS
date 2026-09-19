[CmdletBinding()]
param([string]$Domain = 'cam.trinityos.mcv.kr')

$ErrorActionPreference = 'Continue'
$repoRoot = Split-Path -Parent $PSScriptRoot
$composeDir = Join-Path $repoRoot 'infra\livekit'
function Result([string]$Level, [string]$Message) {
  $color = if ($Level -eq 'PASS') { 'Green' } elseif ($Level -eq 'FAIL') { 'Red' } else { 'Yellow' }
  Write-Host "$Level $Message" -ForegroundColor $color
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Result FAIL 'Docker is not installed or not on PATH.'
  exit 1
}

docker compose --project-directory $composeDir -f (Join-Path $composeDir 'docker-compose.yml') ps
if ($LASTEXITCODE -ne 0) { Result FAIL 'Docker Compose could not inspect the LiveKit stack.' } else { Result PASS 'Docker Compose responded.' }

try {
  $local = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:7880/' -TimeoutSec 3
  if ($local.StatusCode -ge 200 -and $local.StatusCode -lt 500) { Result PASS 'LiveKit signaling responds on loopback port 7880.' } else { Result FAIL "Loopback signaling returned HTTP $($local.StatusCode)." }
} catch { Result FAIL 'LiveKit signaling did not respond on 127.0.0.1:7880.' }

try {
  $addresses = [Net.Dns]::GetHostAddresses($Domain) | Where-Object AddressFamily -eq InterNetwork
  if ($addresses) { Result PASS "$Domain resolves to IPv4." } else { Result FAIL "$Domain has no IPv4 A record." }
} catch { Result FAIL "$Domain does not resolve." }

try {
  $remote = Invoke-WebRequest -UseBasicParsing -Uri "https://$Domain/" -TimeoutSec 6
  if ($remote.StatusCode -ge 200 -and $remote.StatusCode -lt 500) { Result PASS "TLS/WSS origin responds at https://$Domain/." } else { Result FAIL "TLS endpoint returned HTTP $($remote.StatusCode)." }
} catch { Result FAIL "TLS endpoint https://$Domain/ is unreachable or has no trusted certificate." }

$tcp = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue
foreach ($port in 80, 443, 7880, 7881) {
  if ($tcp.LocalPort -contains $port) { Result PASS "TCP $port is LISTENING." } else { Result FAIL "TCP $port is not LISTENING." }
}
$udp = Get-NetUDPEndpoint -ErrorAction SilentlyContinue
if ($udp.LocalPort -contains 7882) { Result PASS 'UDP 7882 is bound.' } else { Result FAIL 'UDP 7882 is not bound.' }
