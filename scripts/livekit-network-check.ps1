[CmdletBinding()]
param(
  [string]$ExpectedLanIp = '192.168.25.33',
  [string]$Domain = 'cam.trinityos.mcv.kr'
)

$ErrorActionPreference = 'Continue'
function Result([string]$Level, [string]$Message) {
  $color = if ($Level -eq 'PASS') { 'Green' } elseif ($Level -eq 'FAIL') { 'Red' } else { 'Yellow' }
  Write-Host "$Level $Message" -ForegroundColor $color
}
function Is-PrivateOrCgnat([Net.IPAddress]$Address) {
  $bytes = $Address.GetAddressBytes()
  return $bytes[0] -eq 10 -or
    ($bytes[0] -eq 172 -and $bytes[1] -ge 16 -and $bytes[1] -le 31) -or
    ($bytes[0] -eq 192 -and $bytes[1] -eq 168) -or
    ($bytes[0] -eq 100 -and $bytes[1] -ge 64 -and $bytes[1] -le 127)
}
function Send-UdpProbe([Net.IPAddress]$Gateway, [byte[]]$Payload, [int]$ExpectedVersion) {
  $client = [Net.Sockets.UdpClient]::new()
  try {
    $client.Client.ReceiveTimeout = 1200
    [void]$client.Send($Payload, $Payload.Length, [Net.IPEndPoint]::new($Gateway, 5351))
    $remote = [Net.IPEndPoint]::new([Net.IPAddress]::Any, 0)
    $response = $client.Receive([ref]$remote)
    return $response.Length -gt 1 -and $response[0] -eq $ExpectedVersion
  } catch { return $false } finally { $client.Dispose() }
}
function Find-UpnpGateway {
  $client = [Net.Sockets.UdpClient]::new()
  try {
    $client.Client.ReceiveTimeout = 900
    $request = "M-SEARCH * HTTP/1.1`r`nHOST: 239.255.255.250:1900`r`nMAN: `"ssdp:discover`"`r`nMX: 1`r`nST: urn:schemas-upnp-org:device:InternetGatewayDevice:1`r`n`r`n"
    $bytes = [Text.Encoding]::ASCII.GetBytes($request)
    [void]$client.Send($bytes, $bytes.Length, '239.255.255.250', 1900)
    $remote = [Net.IPEndPoint]::new([Net.IPAddress]::Any, 0)
    $response = [Text.Encoding]::ASCII.GetString($client.Receive([ref]$remote))
    $location = [regex]::Match($response, '(?im)^location:\s*(.+?)\s*$').Groups[1].Value
    return @{ Found = [bool]$location; Location = $location; Remote = $remote.Address.ToString() }
  } catch { return @{ Found = $false; Location = ''; Remote = '' } } finally { $client.Dispose() }
}
function Read-UpnpExternalIp([string]$Location) {
  if (-not $Location) { return $null }
  try {
    [xml]$description = (Invoke-WebRequest -UseBasicParsing -Uri $Location -TimeoutSec 3).Content
    $service = $description.SelectNodes("//*[local-name()='service']") | Where-Object {
      $_.serviceType -match 'WAN(IP|PPP)Connection'
    } | Select-Object -First 1
    if (-not $service) { return $null }
    $base = [Uri]$Location
    $control = [Uri]::new($base, [string]$service.controlURL).AbsoluteUri
    $serviceType = [string]$service.serviceType
    $body = "<?xml version=`"1.0`"?><s:Envelope xmlns:s=`"http://schemas.xmlsoap.org/soap/envelope/`" s:encodingStyle=`"http://schemas.xmlsoap.org/soap/encoding/`"><s:Body><u:GetExternalIPAddress xmlns:u=`"$serviceType`" /></s:Body></s:Envelope>"
    $response = Invoke-WebRequest -UseBasicParsing -Uri $control -Method Post -ContentType 'text/xml; charset=utf-8' -Headers @{ SOAPAction = "`"$serviceType#GetExternalIPAddress`"" } -Body $body -TimeoutSec 3
    return [regex]::Match($response.Content, '<NewExternalIPAddress>([^<]+)</NewExternalIPAddress>').Groups[1].Value
  } catch { return $null }
}

Write-Host 'TRINITY LiveKit network diagnostic (read-only; no port mappings are created)'

if (Get-Command docker -ErrorAction SilentlyContinue) {
  Result PASS "Docker found: $((docker --version) -join ' ')"
  docker compose version | ForEach-Object { Result PASS $_ }
} else {
  Result FAIL 'Docker is not installed or not on PATH.'
}

$configuration = Get-NetIPConfiguration | Where-Object {
  $_.IPv4DefaultGateway -and $_.IPv4Address.IPAddress -notlike '169.254.*'
} | Select-Object -First 1
if (-not $configuration) {
  Result FAIL 'No active IPv4 interface with a default gateway was found.'
  exit 1
}
$lanIp = [string]$configuration.IPv4Address.IPAddress
$gatewayText = [string]$configuration.IPv4DefaultGateway.NextHop
$gateway = [Net.IPAddress]::Parse($gatewayText)
if ($lanIp -eq $ExpectedLanIp) { Result PASS "LAN IPv4 is $lanIp." } else { Result FAIL "LAN IPv4 is $lanIp; expected $ExpectedLanIp." }
Result PASS "Default gateway is $gatewayText."

$adapter = Get-CimInstance Win32_NetworkAdapterConfiguration | Where-Object { $_.IPAddress -contains $lanIp } | Select-Object -First 1
if ($adapter.DHCPEnabled) {
  Result WARN "$lanIp is assigned by DHCP. Reserve it on the router before adding forwarding rules."
} else {
  Result PASS "$lanIp is statically configured on Windows."
}

$profile = Get-NetConnectionProfile -InterfaceIndex $configuration.InterfaceIndex -ErrorAction SilentlyContinue
if ($profile.NetworkCategory -eq 'Private') { Result PASS 'Active Ethernet network profile is Private.' } else { Result WARN "Active network profile is $($profile.NetworkCategory); firewall rules are intentionally scoped to Private." }
$firewallProfiles = Get-NetFirewallProfile
if (($firewallProfiles | Where-Object Enabled).Count -eq 3) { Result PASS 'Windows Firewall is enabled for Domain, Private, and Public profiles.' } else { Result WARN 'One or more Windows Firewall profiles are disabled.' }
$liveKitRules = Get-NetFirewallRule -DisplayName 'TRINITY LiveKit*' -ErrorAction SilentlyContinue
if (($liveKitRules | Where-Object { $_.Enabled -eq 'True' -and $_.Action -eq 'Allow' }).Count -ge 3) {
  Result PASS 'TRINITY LiveKit firewall rules are enabled.'
} else {
  Result WARN 'TRINITY LiveKit firewall rules are not applied. Run setup-livekit-firewall.ps1 -Apply as Administrator after reviewing it.'
}

$upnp = Find-UpnpGateway
if ($upnp.Found) { Result PASS "UPnP/IGD discovery responded from $($upnp.Remote). No mapping was created." } else { Result WARN 'UPnP/IGD was not discovered.' }
$natPmp = Send-UdpProbe $gateway ([byte[]](0, 0)) 0
if ($natPmp) { Result PASS 'NAT-PMP gateway capability responded. No mapping was created.' } else { Result WARN 'NAT-PMP did not respond.' }
$pcpRequest = New-Object byte[] 24
$pcpRequest[0] = 2
$pcp = Send-UdpProbe $gateway $pcpRequest 2
if ($pcp) { Result PASS 'PCP gateway capability responded. No mapping was created.' } else { Result WARN 'PCP did not respond.' }

$routerWanText = Read-UpnpExternalIp $upnp.Location
$publicText = $null
try { $publicText = [string](Invoke-RestMethod -Uri 'https://api.ipify.org' -TimeoutSec 4) } catch { Result WARN 'Could not query an external public IPv4 check service.' }
if ($routerWanText) {
  $routerWan = [Net.IPAddress]::Parse($routerWanText)
  if (Is-PrivateOrCgnat $routerWan) {
    Result FAIL 'Router WAN address is private or CGNAT space; direct inbound forwarding needs ISP/upstream-router changes.'
  } elseif ($publicText -and $routerWanText -ne $publicText) {
    Result WARN 'Router WAN IPv4 differs from the internet-observed IPv4; double NAT is possible.'
  } else {
    Result PASS 'Router WAN IPv4 is public and matches the internet-observed IPv4.'
  }
} else {
  Result WARN 'Router WAN IPv4 could not be read, so double NAT/CGNAT cannot be ruled out automatically.'
}

try {
  $dns = [Net.Dns]::GetHostAddresses($Domain) | Where-Object AddressFamily -eq InterNetwork
  if (-not $dns) {
    Result FAIL "$Domain has no IPv4 A record."
  } elseif ($publicText -and ($dns.IPAddressToString -contains $publicText)) {
    Result PASS "$Domain resolves to the current public IPv4."
  } else {
    Result WARN "$Domain resolves, but it does not match the detected public IPv4 or the public IPv4 was unavailable."
  }
} catch { Result FAIL "$Domain does not resolve." }

$tcp = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue
foreach ($port in 80, 443, 7880, 7881) {
  if ($tcp.LocalPort -contains $port) { Result PASS "TCP $port is LISTENING." } else { Result FAIL "TCP $port is not LISTENING." }
}
$udp = Get-NetUDPEndpoint -ErrorAction SilentlyContinue
if ($udp.LocalPort -contains 7882) { Result PASS 'UDP 7882 is bound.' } else { Result FAIL 'UDP 7882 is not bound.' }

Write-Host ''
Write-Host 'A PASS for local listeners does not prove public reachability. Test from a separate mobile/external network after DNS and router forwarding are configured.'
