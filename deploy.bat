@echo off
setlocal
cd /d "%~dp0"

where npx >nul 2>nul
if errorlevel 1 (
  echo Node.js / npx not found in PATH.
  echo Please install Node.js 22+ from https://nodejs.org/
  exit /b 1
)

echo Deploying cwa-forecast worker...

npx wrangler deploy
if errorlevel 1 (
  echo.
  echo Cloudflare deployment failed.
  exit /b %errorlevel%
)

echo.
echo Deployment completed successfully.
echo Try a smoke test with:
echo   curl "https://cwa-forecast.sekewei.workers.dev/health"
