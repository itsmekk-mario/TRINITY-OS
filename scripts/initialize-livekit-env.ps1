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
  [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
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
[IO.File]::WriteAllText($envPath, $content + "`n", [Text.UTF8Encoding]::new($false))
Write-Host "PASS Created ignored LiveKit environment file: $envPath"
Write-Host 'WARN Copy the key and secret interactively into Cloudflare Worker secrets before deployment.'
