@echo off
setlocal EnableDelayedExpansion
set "ROOT=%~dp0.."
set "NODE_DIR="
for /d %%D in ("%ROOT%\.node-portable\node-v*-win-x64") do set "NODE_DIR=%%~fD"
if not defined NODE_DIR (
  echo [ERROR] No portable Node under .node-portable
  exit /b 1
)
set "PATH=%NODE_DIR%;%PATH%"
call "%NODE_DIR%\npx.cmd" %*
exit /b %ERRORLEVEL%
