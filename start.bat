@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

echo === form-builder launcher ===
echo.

where docker >nul 2>&1
if errorlevel 1 (
    echo Docker was not found on PATH. Install/start Docker Desktop and try again.
    pause
    exit /b 1
)

if not exist "server\.env" (
    echo Creating server\.env from template...
    copy /Y "server\.env.example" "server\.env" >nul
)

echo Starting Postgres (docker compose)...
docker compose up -d db
if errorlevel 1 (
    echo Failed to start Postgres. Is Docker Desktop running?
    pause
    exit /b 1
)

echo Waiting for Postgres to accept connections...
:waitdb
docker compose exec -T db pg_isready -U formbuilder >nul 2>&1
if errorlevel 1 (
    timeout /t 1 /nobreak >nul
    goto waitdb
)
echo Postgres is ready.
echo.

if not exist "node_modules" (
    echo Installing dependencies — first run only, this can take a few minutes...
    call npm install
    if errorlevel 1 (
        echo npm install failed — see above.
        pause
        exit /b 1
    )
)

echo Applying database migrations...
call npm run db:migrate -w server
if errorlevel 1 (
    echo Migrations failed — see above.
    pause
    exit /b 1
)
echo.

echo Launching server + client in a new window...
start "form-builder dev servers" cmd /k npm run dev

echo Waiting for the client to come up...
:waitclient
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri 'http://localhost:5173' -UseBasicParsing -TimeoutSec 1 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
    timeout /t 1 /nobreak >nul
    goto waitclient
)

echo Opening http://localhost:5173 in your browser...
start "" "http://localhost:5173"

echo.
echo Done. The "form-builder dev servers" window keeps the app running —
echo close that window (or press Ctrl+C in it) to stop server + client.
echo Postgres keeps running in Docker until you run: docker compose down
echo.
pause
endlocal
