$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$referenceCloudflare = 'D:\College\MIT_India\MudraPhoneWebcam\cloudflare'
$tokenPath = Join-Path $referenceCloudflare 'update-token.txt'
$workerUrl = 'https://mudra-camera-gateway.aakashtribhuvan2006.workers.dev'
$permanentUrl = "$workerUrl/model-test"
$frontendUrl = 'http://127.0.0.1:3000'
$healthUrl = "$frontendUrl/health"
$currentTunnelPath = Join-Path $PSScriptRoot 'current-tunnel.txt'

if (-not (Test-Path -LiteralPath $tokenPath -PathType Leaf)) {
    throw "The existing Worker update token is missing: $tokenPath"
}
$workerToken = [IO.File]::ReadAllText($tokenPath).Trim()
if (-not $workerToken) {
    throw 'The existing Worker update token file is empty.'
}

$health = $null
for ($attempt = 0; $attempt -lt 10; $attempt++) {
    try {
        $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 3
        break
    } catch {
        Start-Sleep -Seconds 1
    }
}
if (-not $health -or -not $health.model_loaded) {
    throw "MudraTraining is not ready at $frontendUrl. Start the API and Vite frontend first; /health must report model_loaded=true."
}

$cloudflaredCommand = Get-Command cloudflared.exe, cloudflared -ErrorAction SilentlyContinue |
    Select-Object -First 1
$cloudflaredPath = if ($cloudflaredCommand) {
    $cloudflaredCommand.Source
} else {
    Join-Path ${env:ProgramFiles(x86)} 'cloudflared\cloudflared.exe'
}
if (-not (Test-Path -LiteralPath $cloudflaredPath -PathType Leaf)) {
    throw 'cloudflared is not installed. Install it with: winget install --id Cloudflare.cloudflared'
}

if (Test-Path -LiteralPath $currentTunnelPath -PathType Leaf) {
    $existingTunnelUrl = [IO.File]::ReadAllText($currentTunnelPath).Trim()
    if ($existingTunnelUrl -match '^https://[a-z0-9-]+\.trycloudflare\.com$') {
        try {
            $existingHealth = Invoke-RestMethod -Uri "$existingTunnelUrl/health" -TimeoutSec 5
            $workerHealthResponse = Invoke-WebRequest `
                -Uri "$workerUrl/health" `
                -UseBasicParsing `
                -MaximumRedirection 10 `
                -TimeoutSec 10
            if (
                $existingHealth.model_loaded -and
                $workerHealthResponse.BaseResponse.ResponseUri.Host -eq ([uri]$existingTunnelUrl).Host
            ) {
                Write-Host "MudraTraining tunnel is already active: $existingTunnelUrl"
                Write-Host "Permanent Worker URL: $permanentUrl"
                return
            }
        } catch {
            Write-Host "The previously recorded tunnel is not reusable: $($_.Exception.Message)"
        }
    }
}

$stdoutPath = Join-Path $env:TEMP ("mudra-training-cloudflared-{0}.out" -f [guid]::NewGuid())
$stderrPath = Join-Path $env:TEMP ("mudra-training-cloudflared-{0}.err" -f [guid]::NewGuid())
$process = $null
$registeredUrl = $null

try {
    $process = Start-Process `
        -FilePath $cloudflaredPath `
        -ArgumentList @('tunnel', '--url', $frontendUrl) `
        -PassThru `
        -RedirectStandardOutput $stdoutPath `
        -RedirectStandardError $stderrPath `
        -NoNewWindow

    Write-Host 'MudraTraining is opening a temporary Cloudflare Quick Tunnel.'
    Write-Host 'The existing permanent Worker will redirect visitors to this active tunnel.'
    Write-Host 'Keep this window open; closing it stops remote access.'
    while (Get-Process -Id $process.Id -ErrorAction SilentlyContinue) {
        foreach ($logPath in @($stdoutPath, $stderrPath)) {
            if (-not (Test-Path -LiteralPath $logPath)) { continue }
            $logText = Get-Content -Raw -LiteralPath $logPath -ErrorAction SilentlyContinue
            if (-not $logText) { continue }
            $urlMatches = [regex]::Matches(
                $logText,
                'https://[a-z0-9-]+\.trycloudflare\.com',
                [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
            )
            if ($urlMatches.Count -eq 0) { continue }
            $tunnelUrl = $urlMatches[$urlMatches.Count - 1].Value
            if ($tunnelUrl -eq $registeredUrl) { continue }

            $tunnelReady = $false
            for ($probe = 0; $probe -lt 30; $probe++) {
                try {
                    $remoteHealth = Invoke-RestMethod -Uri "$tunnelUrl/health" -TimeoutSec 5
                    if ($remoteHealth.model_loaded) {
                        $tunnelReady = $true
                        break
                    }
                } catch {
                    Start-Sleep -Seconds 2
                }
            }
            if (-not $tunnelReady) {
                throw "The Quick Tunnel did not reach a healthy MudraTraining API at $tunnelUrl."
            }

            $updateBody = @{ target = $tunnelUrl } | ConvertTo-Json -Compress
            $updateResponse = Invoke-RestMethod `
                -Uri "$workerUrl/__update" `
                -Method Post `
                -Headers @{ Authorization = "Bearer $workerToken" } `
                -ContentType 'application/json' `
                -Body $updateBody `
                -TimeoutSec 20
            if (-not $updateResponse.updated) {
                throw 'The Worker did not confirm that its tunnel destination was updated.'
            }

            $registeredUrl = $tunnelUrl
            [IO.File]::WriteAllText(
                $currentTunnelPath,
                $tunnelUrl,
                (New-Object Text.UTF8Encoding($false))
            )
            Write-Host ''
            Write-Host "MudraTraining temporary tunnel: $tunnelUrl"
            Write-Host "Permanent Worker URL: $permanentUrl"
            try {
                Set-Clipboard -Value $permanentUrl
                Write-Host 'The permanent Worker URL was copied to the clipboard.'
            } catch {
                Write-Warning "Could not copy the website URL to the clipboard: $($_.Exception.Message)"
            }
        }
        Start-Sleep -Seconds 1
    }

    if (-not $registeredUrl) {
        throw "cloudflared (PID $($process.Id)) stopped before reporting a Quick Tunnel URL."
    }
    throw "cloudflared (PID $($process.Id)) stopped after registering $registeredUrl; the permanent Worker target is now offline."
} finally {
    if ($process -and (Get-Process -Id $process.Id -ErrorAction SilentlyContinue)) {
        Stop-Process -Id $process.Id
        $process.WaitForExit()
    }
    foreach ($logPath in @($stdoutPath, $stderrPath)) {
        if (Test-Path -LiteralPath $logPath) {
            Remove-Item -LiteralPath $logPath -Force
        }
    }
}
