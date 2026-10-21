@echo off
cd /d "%~dp0"
if not exist "data\server.pid" (
  if exist "data\server.port" del "data\server.port" >nul 2>nul
  echo No running Kexu service was found.
  pause
  exit /b 0
)
set /p KEXU_PID=<"data\server.pid"
taskkill /PID %KEXU_PID% >nul 2>nul
if %errorlevel%==0 (
  echo Kexu local file service stopped.
) else (
  echo The process was not found; it may already be stopped.
)
del "data\server.pid" >nul 2>nul
del "data\server.port" >nul 2>nul
pause
