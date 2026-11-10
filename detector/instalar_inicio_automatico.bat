@echo off
setlocal
cd /d "%~dp0"
set "ORIGEN=%~dp0dist\ConnectPC-Detector.exe"
set "DESTINO=%LOCALAPPDATA%\ConnectPC"
if not exist "%ORIGEN%" (
  echo No existe dist\ConnectPC-Detector.exe
  echo Ejecuta primero crear_exe.bat en tu PC con Python.
  pause
  exit /b 1
)
echo ================================================
echo ConnectPC Detector - instalacion voluntaria
echo Se copiara a: %DESTINO%
echo Se iniciara al entrar a Windows con tu cuenta.
echo Podras eliminarlo con quitar_inicio_automatico.bat
echo ================================================
choice /C SN /M "Autorizas esta configuracion"
if errorlevel 2 exit /b 0
if not exist "%DESTINO%" mkdir "%DESTINO%"
copy /Y "%ORIGEN%" "%DESTINO%\ConnectPC-Detector.exe" >nul
if errorlevel 1 (
  echo Error al copiar el programa.
  pause
  exit /b 1
)
powershell.exe -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('Startup')) 'ConnectPC Detector.lnk')); $s.TargetPath=(Join-Path $env:LOCALAPPDATA 'ConnectPC\ConnectPC-Detector.exe'); $s.Arguments='--minimizado'; $s.Description='Detector de hardware autorizado de ConnectPC'; $s.Save()"
if errorlevel 1 (
  echo No se pudo crear el acceso de inicio automatico.
  pause
  exit /b 1
)
start "" "%DESTINO%\ConnectPC-Detector.exe"
echo.
echo Instalacion completada. Ya puedes usar Analizar mi PC en ConnectPC.
echo La primera vez y cuando lo solicite, autoriza el acceso del navegador.
echo.
pause
