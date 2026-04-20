@echo off
setlocal

cd /d "%~dp0"

set "BACKEND_HOST=127.0.0.1"
set "BACKEND_PORT=8000"
set "UI_HOST=127.0.0.1"
set "UI_PORT=18501"

echo [SportTrack] Lancement du backend FastAPI...
start "SportTrack Backend" powershell -NoExit -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath '%CD%'; python -m uvicorn app.main:app --host %BACKEND_HOST% --port %BACKEND_PORT% --reload"

timeout /t 2 /nobreak >nul

echo [SportTrack] Lancement de l'UI Streamlit...
start "SportTrack UI" powershell -NoExit -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath '%CD%'; python -m streamlit run ui\Home.py --server.address %UI_HOST% --server.port %UI_PORT%"

echo [SportTrack] Deux terminaux ont ete ouverts.
echo [SportTrack] Backend: http://%BACKEND_HOST%:%BACKEND_PORT%
echo [SportTrack] UI: http://%UI_HOST%:%UI_PORT%

endlocal
