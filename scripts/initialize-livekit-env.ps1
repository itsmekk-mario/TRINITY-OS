[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[^@\s]+@[^@\s]+\.[^@\s]+$')]
  [string]$AcmeEmail,
  [string]$Domain = 'cam.trinityos.mcv.kr',
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $repoRoot 'infra\livekit\.env'

if ((Test-Path -LiteralPath $envPath) -and -not $Force) {
  throw "Refusing to overwrite $envPath. Use -Force only when rotating both LiveKit and Worker secrets."
}

function New-UrlSafeSecret([int]$ByteCount) {
  $bytes = New-Object byte[] $ByteCount
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  }
  finally {
    $rng.Dispose()
  }

  return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

$apiKey = 'LK_' + (New-UrlSafeSecret 15)
$apiSecret = New-UrlSafeSecret 36

$content = @(
  "LIVEKIT_DOMAIN=$Domain"
  "ACME_EMAIL=$AcmeEmail"
  "LIVEKIT_API_KEY=$apiKey"
  "LIVEKIT_API_SECRET=$apiSecret"
) -join "`n"

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($envPath, $content + "`n", $utf8NoBom)

Write-Host "PASS Created ignored LiveKit environment file: $envPath" -ForegroundColor Green
Write-Host 'WARN Keep this file private. Do not paste the API secret into chat, frontend code, Git, or wrangler.toml.' -ForegroundColor Yellow
Write-Host 'NEXT Configure the same API key/secret as Cloudflare Worker secrets before deployment.' -ForegroundColor Cyan
