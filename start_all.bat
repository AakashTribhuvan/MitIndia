@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
    echo Python was not found in PATH.
    echo Please install Python 3 and restart this launcher.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo Node.js or npm was not found in PATH.
    echo Please install Node.js and restart this launcher.
    pause
    exit /b 1
)

REM --- Backend setup ---
set "BACKEND_DIR=%~dp0app\backend"
set "VENV_DIR=%BACKEND_DIR%\.venv"
set "BACKEND_DEPS_FILE=%BACKEND_DIR%\.deps_ok"
set "BACKEND_NEEDS_INSTALL=0"

if not exist "%VENV_DIR%\Scripts\python.exe" (
    echo Creating Python virtual environment for backend...
    python -m venv "%VENV_DIR%"
    set "BACKEND_NEEDS_INSTALL=1"
)

if not exist "%BACKEND_DEPS_FILE%" (
    set "BACKEND_NEEDS_INSTALL=1"
)

if exist "%BACKEND_DIR%\requirements.txt" if exist "%BACKEND_DEPS_FILE%" (
    powershell -NoProfile -Command "$req = Get-Item '%BACKEND_DIR%\requirements.txt'; $ok = Get-Item '%BACKEND_DEPS_FILE%'; if ($req.LastWriteTimeUtc -gt $ok.LastWriteTimeUtc) { exit 1 } else { exit 0 }" >nul 2>nul
    if errorlevel 1 set "BACKEND_NEEDS_INSTALL=1"
)

if "%BACKEND_NEEDS_INSTALL%"=="1" (
    echo Installing backend dependencies only if required...
    call "%VENV_DIR%\Scripts\activate.bat"
    cd /d "%BACKEND_DIR%"
    python -m pip install --disable-pip-version-check -r requirements.txt
    type nul > "%BACKEND_DEPS_FILE%"
) else (
    echo Backend dependencies are already up to date.
)

REM --- Frontend setup ---
set "FRONTEND_DIR=%~dp0app\frontend"
set "FRONTEND_DEPS_FILE=%FRONTEND_DIR%\.deps_ok"
set "FRONTEND_NEEDS_INSTALL=0"

if not exist "%FRONTEND_DIR%\node_modules" (
    set "FRONTEND_NEEDS_INSTALL=1"
)

if not exist "%FRONTEND_DEPS_FILE%" (
    set "FRONTEND_NEEDS_INSTALL=1"
)

if exist "%FRONTEND_DIR%\package.json" if exist "%FRONTEND_DEPS_FILE%" (
    powershell -NoProfile -Command "$pkg = Get-Item '%FRONTEND_DIR%\package.json'; $ok = Get-Item '%FRONTEND_DEPS_FILE%'; if ($pkg.LastWriteTimeUtc -gt $ok.LastWriteTimeUtc) { exit 1 } else { exit 0 }" >nul 2>nul
    if errorlevel 1 set "FRONTEND_NEEDS_INSTALL=1"
)

if "%FRONTEND_NEEDS_INSTALL%"=="1" (
    echo Installing frontend dependencies only if required...
    cd /d "%FRONTEND_DIR%"
    npm install --no-fund --no-audit
    type nul > "%FRONTEND_DEPS_FILE%"
) else (
    echo Frontend dependencies are already up to date.
)

REM --- Launch services ---
powershell -NoProfile -Command "$health = $null; try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 2 } catch {}; if ($health -and $health.model_loaded) { exit 0 }; if (Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue) { Write-Error 'Port 8000 is occupied, but the MUDRA API health check failed.'; exit 2 }; exit 1" >nul 2>nul
if errorlevel 2 (
    echo Port 8000 is already occupied, but the MUDRA API is not healthy.
    echo Find and stop the unrelated listener, or configure a different backend port.
    pause
    exit /b 1
)
if errorlevel 1 (
    start "MUDRA Backend" cmd /k "cd /d ""%BACKEND_DIR%"" && ""%VENV_DIR%\Scripts\python.exe"" main.py"
) else (
    echo Reusing the healthy backend already running on port 8000.
)

cd /d "%FRONTEND_DIR%"
powershell -NoProfile -Command "try { $null = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/' -UseBasicParsing -TimeoutSec 2; exit 0 } catch {}; if (Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue) { Write-Error 'Port 3000 is occupied, but the frontend health check failed.'; exit 2 }; exit 1" >nul 2>nul
if errorlevel 2 (
    echo Port 3000 is already occupied, but the MUDRA frontend is not responding.
    echo Find and stop the unrelated listener, or configure a different frontend port.
    pause
    exit /b 1
)
if errorlevel 1 (
    start "MUDRA Frontend" cmd /k "cd /d ""%FRONTEND_DIR%"" && npm run dev -- --host 127.0.0.1 --port 3000"
) else (
    echo Reusing the frontend already responding on port 3000.
)

echo.
echo Waiting for the backend and frontend to become healthy...
powershell -NoProfile -Command "$ready = $false; for ($i = 0; $i -lt 60; $i++) { try { $api = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 2; $web = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/health' -UseBasicParsing -TimeoutSec 2; if ($api.model_loaded -and $web.StatusCode -eq 200) { $ready = $true; break } } catch {}; Start-Sleep -Seconds 1 }; if (-not $ready) { Write-Error 'MUDRA services did not become healthy within 60 seconds.'; exit 1 }"
if errorlevel 1 (
    echo MUDRA services did not become healthy. The tunnel was not started.
    pause
    exit /b 1
)

echo Starting the Cloudflare tunnel and permanent Worker redirect...
start "MUDRA Tunnel and Worker" cmd.exe /k "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""%~dp0cloudflare\start-tunnel.ps1"""

echo.
echo MUDRA project started.
echo Backend: http://localhost:8000
echo Frontend: http://localhost:3000
echo Permanent Worker: https://mudra-camera-gateway.aakashtribhuvan2006.workers.dev/model-test
echo Keep the MUDRA Tunnel and Worker window open for remote access.
echo.
pause
