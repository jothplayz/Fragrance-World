@echo off
setlocal EnableDelayedExpansion
REM Adds project portable Node to PATH and runs npm (no PowerShell execution policy issues).
set "ROOT=%~dp0.."
set "NODE_DIR="
for /d %%D in ("%ROOT%\.node-portable\node-v*-win-x64") do set "NODE_DIR=%%~fD"
if not defined NODE_DIR (
  echo [ERROR] No .node-portable\node-v*-win-x64 folder found.
  echo Install Node.js from https://nodejs.org/ ^(adds npm to PATH^) or extract the official Windows .zip into .node-portable\
  exit /b 1
)
set "PATH=%NODE_DIR%;%PATH%"
call "%NODE_DIR%\npm.cmd" %*
exit /b %ERRORLEVEL%
