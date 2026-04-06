#Requires -Version 5.1
# Start dev server using portable Node (after first-run.ps1 has been run once).
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot
Write-Host "Use the Local URL Next.js prints (port may not be 3000 if it is already in use)." -ForegroundColor Cyan
& "$PSScriptRoot\with-node.ps1" npm run dev
