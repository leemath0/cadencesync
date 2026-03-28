@echo off
title CadenceSync Launcher (v2.7 Cloudflare Fix)

echo [*] Cleaning ports...
powershell "Get-NetTCPConnection -LocalPort 5173,8123 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | Stop-Process -Force -ErrorAction SilentlyContinue"

echo.
echo [*] Starting Backend...
start "Backend (8123)" cmd /k "cd /d D:\AI STUDY\CadenceSync\backend && python main.py"

echo [*] Starting Frontend...
start "Frontend (5173)" cmd /k "cd /d D:\AI STUDY\CadenceSync && npm.cmd run dev"

echo.
echo [*] Waiting 10s for startup...
timeout /t 10

echo.
echo [*] Connecting High-Reliability Tunnel (via Cloudflare)...
echo ========================================================
echo  SCAN THE QR CODE IN THE BROWSER (Automatic)
echo ========================================================
echo.

:: Use Cloudflare Quick Tunnel (Highly stable, no 'Endpoint IP' bypass required)
:: npx -y cloudflared tunnel --url http://127.0.0.1:5173
npx.cmd -y cloudflared tunnel --url http://127.0.0.1:5173

pause
