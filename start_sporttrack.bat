@echo off
setlocal

cd /d "%~dp0"

set "UI_HOST=localhost"
set "UI_PORT=18501"

echo [SportTrack] Lancement de l'application Streamlit...
start "SportTrack" powershell -NoExit -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath '%CD%'; python -m streamlit run ui\Home.py --server.address %UI_HOST% --server.port %UI_PORT%"

echo [SportTrack] Application disponible sur http://%UI_HOST%:%UI_PORT%

endlocal
