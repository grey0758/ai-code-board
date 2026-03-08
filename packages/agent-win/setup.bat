@echo off
title Chat-Sync Agent Setup
echo ========================================
echo   Chat-Sync Agent - Quick Setup
echo ========================================
echo.

:: Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found!
    echo Please install Node.js 18+ from https://nodejs.org/
    pause
    exit /b 1
)

:: Get server URL
set /p SERVER_URL="Enter server URL (e.g. http://117.72.151.207:5173): "
if "%SERVER_URL%"=="" (
    echo Server URL is required!
    pause
    exit /b 1
)

:: Install dependencies
echo.
echo Installing dependencies...
cd /d "%~dp0"
call npm install --omit=dev
if errorlevel 1 (
    echo [WARN] Some optional dependencies failed (node-pty) - this is OK.
    echo        Interactive PTY sessions won't work, but sync and exec mode will.
)

:: Build if needed
if not exist dist\index.js (
    echo Building...
    call npm run build
)

:: Create start script
echo @echo off > start.bat
echo title Chat-Sync Agent >> start.bat
echo cd /d "%~dp0" >> start.bat
echo set SYNC_SERVER=%SERVER_URL% >> start.bat
echo node dist/index.js --server %SERVER_URL% >> start.bat
echo pause >> start.bat

echo.
echo ========================================
echo   Setup Complete!
echo ========================================
echo.
echo To start the agent, run: start.bat
echo.
pause
