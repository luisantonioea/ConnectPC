@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  where py >nul 2>&1
  if %errorlevel%==0 (
    py -3 -m venv .venv
  ) else (
    python -m venv .venv
  )
  if errorlevel 1 (
    echo No se pudo crear el entorno. Instala Python 3.11 o superior.
    pause
    exit /b 1
  )
)
call ".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 (
  echo Error al instalar dependencias.
  pause
  exit /b 1
)
echo.
echo Inicia ConnectPC en http://127.0.0.1:5000
echo Para cerrar presiona Ctrl+C.
echo.
start "" "http://127.0.0.1:5000"
".venv\Scripts\python.exe" app.py
pause
