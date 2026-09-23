$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'ypt-api-smoke.mjs'
Write-Host 'YPT live API test: 30 seconds study, 10 seconds break, 30 seconds study.'
Write-Host 'This creates real study records. Stop any existing YPT timer on all devices first.'
Write-Host 'Do not close this terminal during the test. If interrupted, check and stop the timer in the YPT app.'
if ((Read-Host 'Type START to confirm all existing timers are stopped') -cne 'START') { return }
$email = Read-Host 'YPT email'
$password = Read-Host 'YPT password (hidden)' -AsSecureString
$subject = Read-Host 'Existing YPT subject title (exact spelling)'
$pointer = [IntPtr]::Zero
try {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
    $credentials = @{
        email = $email
        password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        subject = $subject
        confirmedIdle = $true
    }
    $previousEncoding = $OutputEncoding
    $OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    try {
        # Credentials go directly to stdin, never into arguments, files, or logs.
        $credentials | ConvertTo-Json -Compress | & node $scriptPath
        $testExitCode = $LASTEXITCODE
    } finally {
        $OutputEncoding = $previousEncoding
        $credentials.password = $null
        $credentials = $null
    }
} finally {
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    $password.Dispose()
}
if ($testExitCode -ne 0) {
    Write-Host 'Test did not pass. Check the YPT app: stop any running timer before retrying.'
}
exit $testExitCode
