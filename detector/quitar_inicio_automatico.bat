@echo off
setlocal
echo Se eliminara el inicio automatico del detector ConnectPC.
choice /C SN /M "Deseas continuar"
if errorlevel 2 exit /b 0
powershell.exe -NoProfile -Command "Remove-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath('Startup')) 'ConnectPC Detector.lnk') -ErrorAction SilentlyContinue"
taskkill /IM ConnectPC-Detector.exe /F >nul 2>&1
if exist "%LOCALAPPDATA%\ConnectPC\ConnectPC-Detector.exe" del /F /Q "%LOCALAPPDATA%\ConnectPC\ConnectPC-Detector.exe"
if exist "%LOCALAPPDATA%\ConnectPC" rmdir "%LOCALAPPDATA%\ConnectPC" >nul 2>&1
echo Inicio automatico deshabilitado. El original en detector\dist permanece.
pause
