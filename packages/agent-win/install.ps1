# Chat-Sync Agent Windows Installer
# Usage: Right-click -> Run with PowerShell
# Or: powershell -ExecutionPolicy Bypass -File install.ps1 -Server "http://YOUR_SERVER:5173"

param(
    [string]$Server = "",
    [string]$InstallDir = "$env:LOCALAPPDATA\chat-sync-agent"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Chat-Sync Agent - Windows Installer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check Node.js
Write-Host "[1/5] Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version 2>$null
    Write-Host "  Found Node.js $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "  Node.js not found!" -ForegroundColor Red
    Write-Host "  Please install Node.js 18+ from https://nodejs.org/" -ForegroundColor Red
    Write-Host "  Then re-run this script." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Check version >= 18
$major = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
if ($major -lt 18) {
    Write-Host "  Node.js $nodeVersion is too old. Need v18+." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# 2. Prompt for server URL
if (-not $Server) {
    Write-Host ""
    $Server = Read-Host "[2/5] Enter server URL (e.g. http://117.72.151.207:5173)"
}
if (-not $Server) {
    Write-Host "  Server URL is required!" -ForegroundColor Red
    exit 1
}
Write-Host "  Server: $Server" -ForegroundColor Green

# 3. Create install directory
Write-Host ""
Write-Host "[3/5] Setting up install directory..." -ForegroundColor Yellow
if (!(Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}
Write-Host "  Directory: $InstallDir" -ForegroundColor Green

# 4. Copy files or clone
Write-Host ""
Write-Host "[4/5] Installing dependencies..." -ForegroundColor Yellow

# Create package.json for standalone install
$packageJson = @'
{
  "name": "chat-sync-agent-win",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "chokidar": "^4.0.0",
    "ws": "^8.19.0"
  },
  "optionalDependencies": {
    "node-pty": "^1.1.0"
  }
}
'@

# Check if we're running from the source directory
$srcDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$distDir = Join-Path $srcDir "dist"

if (Test-Path (Join-Path $distDir "index.js")) {
    Write-Host "  Found pre-built dist, copying..." -ForegroundColor Green

    # Copy dist
    Copy-Item -Path $distDir -Destination $InstallDir -Recurse -Force

    # Copy shared types if available
    $sharedDist = Join-Path $srcDir "..\shared\dist"
    if (Test-Path $sharedDist) {
        $sharedTarget = Join-Path $InstallDir "node_modules\@chat-sync\shared\dist"
        New-Item -ItemType Directory -Path (Join-Path $InstallDir "node_modules\@chat-sync\shared") -Force | Out-Null
        Copy-Item -Path $sharedDist -Destination (Split-Path $sharedTarget) -Recurse -Force
        # Create package.json for shared
        @'
{"name":"@chat-sync/shared","version":"1.0.0","type":"module","main":"dist/index.js"}
'@ | Out-File -FilePath (Join-Path $InstallDir "node_modules\@chat-sync\shared\package.json") -Encoding UTF8
    }

    # Write package.json and install deps
    $packageJson | Out-File -FilePath (Join-Path $InstallDir "package.json") -Encoding UTF8
    Push-Location $InstallDir
    npm install --omit=dev 2>&1 | Out-Null
    Pop-Location
} else {
    Write-Host "  No pre-built dist found. Please build first:" -ForegroundColor Red
    Write-Host "    cd packages/agent-win && npm run build" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "  Dependencies installed." -ForegroundColor Green

# 5. Create startup script and config
Write-Host ""
Write-Host "[5/5] Creating startup scripts..." -ForegroundColor Yellow

# Config file
$configFile = Join-Path $InstallDir "config.env"
@"
SYNC_SERVER=$Server
"@ | Out-File -FilePath $configFile -Encoding UTF8

# Start script
$startScript = Join-Path $InstallDir "start.bat"
@"
@echo off
title Chat-Sync Agent
cd /d "$InstallDir"
set SYNC_SERVER=$Server
node dist/index.js --server $Server
pause
"@ | Out-File -FilePath $startScript -Encoding ASCII

# Start script (PowerShell)
$startPs1 = Join-Path $InstallDir "start.ps1"
@"
`$env:SYNC_SERVER = "$Server"
Set-Location "$InstallDir"
node dist/index.js --server $Server
"@ | Out-File -FilePath $startPs1 -Encoding UTF8

# Create Windows Service install script (using nssm or sc)
$serviceScript = Join-Path $InstallDir "install-service.bat"
@"
@echo off
echo Installing Chat-Sync Agent as Windows Service...
echo.
echo Option 1: Using NSSM (recommended, download from nssm.cc)
echo   nssm install ChatSyncAgent node.exe "$InstallDir\dist\index.js" --server $Server
echo   nssm set ChatSyncAgent AppDirectory "$InstallDir"
echo   nssm start ChatSyncAgent
echo.
echo Option 2: Using Task Scheduler
echo   schtasks /create /tn "ChatSyncAgent" /tr "$startScript" /sc onlogon /rl highest
echo.
echo Option 3: Just run start.bat manually
echo.
pause
"@ | Out-File -FilePath $serviceScript -Encoding ASCII

# Create desktop shortcut
$desktopPath = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktopPath "Chat-Sync Agent.lnk"
try {
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $startScript
    $shortcut.WorkingDirectory = $InstallDir
    $shortcut.Description = "Chat-Sync Agent"
    $shortcut.Save()
    Write-Host "  Desktop shortcut created." -ForegroundColor Green
} catch {
    Write-Host "  Could not create desktop shortcut (non-critical)." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Installation Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Install dir:  $InstallDir" -ForegroundColor White
Write-Host "  Server:       $Server" -ForegroundColor White
Write-Host ""
Write-Host "  To start:" -ForegroundColor Cyan
Write-Host "    Double-click 'Chat-Sync Agent' on Desktop" -ForegroundColor White
Write-Host "    Or run: $startScript" -ForegroundColor White
Write-Host ""
Write-Host "  To auto-start on login:" -ForegroundColor Cyan
Write-Host "    Run: $serviceScript" -ForegroundColor White
Write-Host ""

Read-Host "Press Enter to exit"
