@echo off
setlocal
cd /d "%~dp0"

set "PYTHON=%~dp0..\.venv\Scripts\python.exe"

if not exist "%PYTHON%" (
    echo ERROR: Project Python environment not found:
    echo   %PYTHON%
    echo.
    echo Expected the virtual environment at D:\College\MIT_Indian\.venv
    pause
    exit /b 1
)

if not exist "%~dp0models\pose_landmarker_lite.task" (
    echo ERROR: Missing models\pose_landmarker_lite.task
    pause
    exit /b 1
)

if not exist "%~dp0models\hand_landmarker.task" (
    echo ERROR: Missing models\hand_landmarker.task
    pause
    exit /b 1
)

echo Starting MUDRA with Camo Camera 1 using Media Foundation...
echo The dashboard will open in your browser. Keep this window open while using it.
echo.
"%PYTHON%" "%~dp0test.py" --camera 1 --backend msmf --static-demo --speak-recognized --open-web-ui
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%EXIT_CODE%"=="0" (
    echo MUDRA exited with error code %EXIT_CODE%.
    echo Check that Camo is connected and camera 1 is not in use by another application.
) else (
    echo MUDRA has stopped.
)
pause
exit /b %EXIT_CODE%
