@echo off
SETLOCAL EnableExtensions EnableDelayedExpansion

:: PerigeeWatch Startup Script
:: Runs Infrastructure (Redis) via Docker, and Apps (Backend/Frontend) Locally.

cd /d "%~dp0"

echo ========================================================
echo   Starting PerigeeWatch (Local Dev Mode)
echo ========================================================
echo.

:: 0. Install Dependencies
echo [INFO] Checking Backend Dependencies...
pip install -r backend/requirements.txt
if %ERRORLEVEL% NEQ 0 (
    echo [WARN] Failed to install dependencies. Check your python environment.
    pause
)

:: 1. Start Redis Infrastructure
echo [INFO] Starting Redis via Docker...
docker compose up -d redis
IF %ERRORLEVEL% NEQ 0 (
    echo [WARN] Docker failed to start Redis. Ensure Docker Desktop is running.
    echo [WARN] Continuing... (Backend may fail if Redis is required)
) ELSE (
    echo [INFO] Redis running on localhost:6379
)

:: 2. Start Backend
echo [INFO] Launching Backend (Uvicorn)...
start "PerigeeWatch Backend" cmd /k "cd backend && echo [LOGS] Starting Uvicorn... && python -m uvicorn app.main:app --host 0.0.0.0 --port 3001 --reload"

:: 3. Start Background Worker (Celery)
echo [INFO] Launching Background Worker...
start "PerigeeWatch Worker" cmd /k "cd backend && echo [LOGS] Starting Celery Worker... && python -m celery -A app.worker worker --loglevel=info --pool=solo"

:: 3b. Start Scheduler (Beat)
echo [INFO] Launching Periodic Scheduler...
start "PerigeeWatch Beat" cmd /k "cd backend && echo [LOGS] Starting Celery Beat... && python -m celery -A app.worker.celery_app beat --loglevel=info"

:: 4. Wait for Backend to be Ready
echo [INFO] Waiting for Backend to initialize...
set /A retries=0
:CheckBackend
timeout /t 2 /nobreak >nul
curl -s -f http://localhost:3001/health >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    set /A retries+=1
    echo [INFO] Waiting for backend... ^(!retries!/30^)
    if !retries! GTR 30 (
        echo [ERROR] Backend failed to start. Please check the backend terminal.
        pause
        exit /b 1
    )
    goto CheckBackend
)
echo [INFO] Backend is READY!

:: 4. Start Frontend
echo [INFO] Launching Frontend (Vite)...
start "PerigeeWatch Frontend" cmd /k "cd frontend && echo [LOGS] Starting Vite... && npm run dev"

:: 4. Wait a moment
timeout /t 5 /nobreak >nul

:: 5. Open Browser
echo [INFO] Opening Application...
start http://localhost:5173

echo.
echo ========================================================
echo   Startup Initiated!
echo.
echo   [1] Backend:  http://localhost:3001/docs
echo   [2] Frontend: http://localhost:5173
echo.
echo   Run 'docker compose stop' to stop Redis later.
echo ========================================================
pause
