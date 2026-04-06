#Requires -Version 5.1
<#
  Downloads the latest Node.js LTS Windows x64 ZIP (no MSI) into .tools and extracts it.
  Skips download if Node is already in .tools or the project root (see portable-node-lib.ps1).
#>
$ErrorActionPreference = "Stop"

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ToolsDir = Join-Path $ProjectRoot ".tools"

. "$PSScriptRoot\portable-node-lib.ps1"

$existing = Get-PortableNodeDirectory -ProjectRoot $ProjectRoot
if ($existing) {
  Write-Host "Portable Node already present: $($existing.FullName)" -ForegroundColor Green
  Write-Host "node version: " -NoNewline
  & (Join-Path $existing.FullName "node.exe") "-v"
  exit 0
}

New-Item -ItemType Directory -Force -Path $ToolsDir | Out-Null

Write-Host "Fetching Node.js LTS release list..." -ForegroundColor Cyan
$releases = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json" -UseBasicParsing

$pick = $releases |
  Where-Object { $_.lts -and ($_.files -contains "win-x64.zip") } |
  ForEach-Object {
    $ver = $_.version -replace '^v', ''
    [pscustomobject]@{ Version = $_.version; SemVer = [version]$ver; Entry = $_ }
  } |
  Sort-Object SemVer -Descending |
  Select-Object -First 1

if (-not $pick) {
  throw "Could not find a Windows x64 LTS build in the Node.js index."
}

$ver = $pick.Version
$zipName = "node-$ver-win-x64.zip"
$zipUrl = "https://nodejs.org/dist/$ver/$zipName"
$zipPath = Join-Path $ToolsDir $zipName

Write-Host "Downloading $zipUrl ..." -ForegroundColor Cyan
Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing

Write-Host "Extracting to $ToolsDir ..." -ForegroundColor Cyan
Expand-Archive -Path $zipPath -DestinationPath $ToolsDir -Force
Remove-Item -LiteralPath $zipPath -Force

$nodeHome = Get-PortableNodeDirectory -ProjectRoot $ProjectRoot
if (-not $nodeHome) {
  throw "Extraction finished but node-v*-win-x64 folder was not found."
}

Write-Host "Done. Node is at: $($nodeHome.FullName)" -ForegroundColor Green
& (Join-Path $nodeHome.FullName "node.exe") "-v"
& (Join-Path $nodeHome.FullName "npm.cmd") "-v"

Write-Host ""
Write-Host "Next: run first-time project setup:" -ForegroundColor Yellow
Write-Host "  powershell -ExecutionPolicy Bypass -File .\scripts\first-run.ps1" -ForegroundColor Gray
