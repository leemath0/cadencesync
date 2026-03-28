@echo off
chcp 65001 > nul
title CadenceSync - Ultimate Mobile App Server

echo =======================================================
echo        CadenceSync - Mobile Server Starter
echo =======================================================
echo.

echo [1/4] Cleaning up orphaned ports...
FOR /F "tokens=5" %%a IN ('netstat -aon ^| findstr :5173') DO (
    IF NOT "%%a"=="0" ( taskkill /F /PID %%a > nul 2>&1 )
)
FOR /F "tokens=5" %%a IN ('netstat -aon ^| findstr :8123') DO (
    IF NOT "%%a"=="0" ( taskkill /F /PID %%a > nul 2>&1 )
)

echo.
echo [2/4] Starting Python Backend on Port 8123...
start "CadenceSync API" cmd /c "cd backend && venv\Scripts\python.exe main.py"

echo [3/4] Starting Vite Frontend Strictly on Port 5173...
start "CadenceSync UI" cmd /c "npm run dev"

echo Waiting for initialization...
ping 127.0.0.1 -n 5 > nul

echo.
echo =======================================================
echo [4/4] 🚀 초고속 보안 터널 연결중 (QR 코드 생성) 🚀
echo =======================================================
echo.
echo 잠시 후 화면에 나타나는 QR 코드를 스마트폰 기본 카메라로 스캔하세요!
echo (링크 복사 붙여넣기나 패스워드 입력 없이 즉시 연결됩니다)
echo.

ssh -o StrictHostKeyChecking=no -R 80:localhost:5173 nokey@localhost.run
pause
