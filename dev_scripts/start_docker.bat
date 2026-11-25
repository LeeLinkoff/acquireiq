@echo off
setlocal EnableExtensions
REM ============================================================
REM  start_docker.bat
REM  Checks if the Docker engine is actually responding. If not,
REM  launches Docker Desktop and checks readiness up to 24 times,
REM  waiting 5 seconds between unsuccessful checks.
REM  Returns a nonzero exit code on failure without prompting.
REM
REM  Call this at the top of any script that needs docker build/run,
REM  e.g. from act.bat
REM ============================================================

where docker >nul 2>&1
if errorlevel 1 (
    echo ERROR: docker not found on PATH. Is Docker Desktop installed?
    exit /b 1
)

echo Checking if Docker is running...
docker info >nul 2>&1
if not errorlevel 1 (
    echo Docker is already running.
    exit /b 0
)

echo Docker is not running. Attempting to start Docker Desktop...

REM Default install location. If Docker Desktop is installed somewhere
REM else, edit this path to match.
set "DOCKER_DESKTOP_EXE=C:\Program Files\Docker\Docker\Docker Desktop.exe"

if not exist "%DOCKER_DESKTOP_EXE%" (
    echo.
    echo ============================================================
    echo  ERROR: Could not find Docker Desktop at:
    echo  %DOCKER_DESKTOP_EXE%
    echo.
    echo  If it is installed somewhere else, open this file and
    echo  update the DOCKER_DESKTOP_EXE path near the top.
    echo ============================================================
    echo.
    exit /b 1
)

REM PowerShell supplies a delay that also works with redirected input.
where powershell.exe >nul 2>&1
if errorlevel 1 (
    echo ERROR: powershell.exe not found on PATH; cannot wait for Docker readiness.
    exit /b 1
)

start "" "%DOCKER_DESKTOP_EXE%"
set "START_RESULT=%ERRORLEVEL%"
if not "%START_RESULT%"=="0" (
    echo ERROR: Failed to launch Docker Desktop.
    exit /b %START_RESULT%
)

echo Waiting for Docker engine to become ready...

set /a attempts=0

:waitloop
set /a attempts+=1
docker info >nul 2>&1
if not errorlevel 1 (
    echo.
    echo Docker is now running.
    exit /b 0
)

if %attempts% GEQ 24 (
    echo.
    echo ============================================================
    echo  ERROR: Docker did not become ready after 24 readiness checks.
    echo  Check the whale icon in your system tray, it should be
    echo  steady, not animating, once fully started.
    echo  Once it looks ready, just re-run your original command.
    echo ============================================================
    echo.
    exit /b 1
)

echo   still waiting, attempt %attempts% of 24
powershell.exe -NoProfile -NonInteractive -Command "Start-Sleep -Seconds 5"
set "WAIT_RESULT=%ERRORLEVEL%"
if not "%WAIT_RESULT%"=="0" (
    echo ERROR: Failed while waiting for Docker readiness.
    exit /b %WAIT_RESULT%
)
goto waitloop