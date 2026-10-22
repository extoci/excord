@echo off
setlocal
if not exist "%~dp0excord.exe" (
    echo Extract the Windows test ZIP here, with excord.exe beside this launcher. Do not run an installer.
    pause
    exit /b 1
)
tasklist /FI "IMAGENAME eq excord.exe" /NH | find /I "excord.exe" >nul
if not errorlevel 1 (
    echo Quit Excord completely before starting the Favorites test build, then run this launcher again.
    pause
    exit /b 1
)
set "EXCORD_USER_DATA_DIR=%LOCALAPPDATA%\excord-favorites-dev"
echo DEV DO NOT INSTALL - ExcordFavorites
echo Using the separate test profile: %EXCORD_USER_DATA_DIR%
echo Sign in again for testing. Do not install updates from this test build.
"%~dp0excord.exe"
