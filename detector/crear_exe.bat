@echo off
setlocal
cd /d "%~dp0"
echo =====================================
echo CONECTPC - Crear detector de Windows
echo =====================================
echo.
if exist "..\.venv\Scripts\python.exe" (
  set "PYTHON=..\.venv\Scripts\python.exe"
) else (
  where py >nul 2>&1
  if errorlevel 1 (
    echo ERROR: Necesitas Python instalado SOLO para compilar el EXE.
    pause
    exit /b 1
  )
  set "PYTHON=py -3"
)
%PYTHON% -m pip install --upgrade pyinstaller
if errorlevel 1 (
  echo Error al instalar PyInstaller.
  pause
  exit /b 1
)
%PYTHON% -m PyInstaller --clean --noconfirm --onefile --windowed --name ConnectPC-Detector --icon connectpc.ico detector_windows.py
if errorlevel 1 (
  echo ERROR: No se pudo construir el EXE.
  pause
  exit /b 1
)
echo.
echo LISTO: detector\dist\ConnectPC-Detector.exe
echo Puedes usarlo sin Python en otra PC Windows.
echo.
pause
