[CmdletBinding()]
param([switch]$Apply)

$ErrorActionPreference = 'Stop'
$rules = @(
  @{ Name = 'TRINITY LiveKit HTTPS'; Protocol = 'TCP'; Ports = '80,443' }
  @{ Name = 'TRINITY LiveKit ICE TCP'; Protocol = 'TCP'; Ports = '7881' }
  @{ Name = 'TRINITY LiveKit ICE UDP mux'; Protocol = 'UDP'; Ports = '7882' }
)

Write-Host 'The following inbound ports will be allowed on the Windows Private profile only:'
$rules | ForEach-Object { Write-Host ("  {0,-34} {1}/{2}" -f $_.Name, $_.Ports, $_.Protocol) }
Write-Host 'Port 7880 remains loopback-only and no firewall rule is created for it.'

if (-not $Apply) {
  Write-Host 'WARN Preview only. Re-run from elevated PowerShell with -Apply to create the rules.'
  exit 0
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this script from an elevated PowerShell window.'
}

foreach ($rule in $rules) {
  $existing = Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue
  if ($existing) {
    Set-NetFirewallRule -DisplayName $rule.Name -Enabled True -Direction Inbound -Action Allow -Profile Private | Out-Null
    Get-NetFirewallPortFilter -AssociatedNetFirewallRule $existing | Set-NetFirewallPortFilter -Protocol $rule.Protocol -LocalPort $rule.Ports | Out-Null
    Write-Host "PASS Updated $($rule.Name)"
  } else {
    New-NetFirewallRule -DisplayName $rule.Name -Direction Inbound -Action Allow -Profile Private -Protocol $rule.Protocol -LocalPort $rule.Ports | Out-Null
    Write-Host "PASS Created $($rule.Name)"
  }
}
