@echo off
setlocal
set SCRIPT_DIR=%~dp0
for %%I in ("%SCRIPT_DIR%\..\..") do set REPO_ROOT=%%~fI
set PROJECT_DIR=%SCRIPT_DIR:~0,-1%
call "%REPO_ROOT%\gradlew.bat" -p "%PROJECT_DIR%" %*
