@echo off
setlocal
title MUDRA Exit All

echo Stopping MudraTraining services...

rem Stop only the service windows created by start_all.bat, including child processes.
for %%W in ("MUDRA Backend" "MUDRA Frontend" "MUDRA Tunnel and Worker") do (
    taskkill /F /T /FI "WINDOWTITLE eq %%~W" >nul 2>nul
)

rem Also stop a reused MudraTraining listener, but only when its process executable
rem or command line points inside this project folder. Leave unrelated port users alone.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue'; $root=[IO.Path]::GetFullPath('%~dp0').TrimEnd('\') + '\'; $stopped=@{}; foreach($port in @(3000,8000)){ foreach($connection in @(Get-NetTCPConnection -State Listen -LocalPort $port)){ $processId=[int]$connection.OwningProcess; if($stopped.ContainsKey($processId)){ continue }; $process=Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $processId); if($process -and (([string]$process.ExecutablePath).StartsWith($root,[StringComparison]::OrdinalIgnoreCase) -or ([string]$process.CommandLine).IndexOf($root,[StringComparison]::OrdinalIgnoreCase) -ge 0)){ Stop-Process -Id $processId -Force; $stopped[$processId]=$true; Write-Host ('Stopped MudraTraining listener on port ' + $port + ' (PID ' + $processId + ').') } } }; foreach($process in @(Get-CimInstance Win32_Process | Where-Object { $_.Name -ieq 'cloudflared.exe' })){ if(([string]$process.CommandLine -match '(?i)tunnel.*--url\s+https?://(127\.0\.0\.1|localhost):3000')){ Stop-Process -Id $process.ProcessId -Force; Write-Host ('Stopped MudraTraining Cloudflare tunnel (PID ' + $process.ProcessId + ').') } }"

echo.
echo MudraTraining stop command finished. Unrelated listeners and Cloudflare tunnels were left running.
pause
endlocal
