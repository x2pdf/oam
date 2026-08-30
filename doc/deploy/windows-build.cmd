@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows-build.ps1" %*
set "EXITCODE=%ERRORLEVEL%"
echo.
if not "%EXITCODE%"=="0" (
  echo Build failed, exit code %EXITCODE%.
) else (
  echo Build succeeded.
)
REM Pause when double-clicked so the artifact paths stay visible.
echo %CMDCMDLINE% | find /I "%~nx0" >nul
if not errorlevel 1 pause
exit /b %EXITCODE%
