#Requires -Version 5.1
<#
  One-time: ensure portable Node, install deps, create .env, push Prisma schema.
  Then start the dev server (Ctrl+C to stop).
#>
$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

. "$PSScriptRoot\portable-node-lib.ps1"

$nodeHome = Get-PortableNodeDirectory -ProjectRoot $ProjectRoot
if (-not $nodeHome) {
  Write-Host "Portable Node not found. Downloading LTS into .tools ..." -ForegroundColor Cyan
  & "$PSScriptRoot\setup-portable-node.ps1"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$envPath = Join-Path $ProjectRoot ".env"
$examplePath = Join-Path $ProjectRoot "env.example"
if (-not (Test-Path $envPath) -and (Test-Path $examplePath)) {
  Copy-Item $examplePath $envPath
  Write-Host "Created .env from env.example" -ForegroundColor Green
}

Write-Host "npm install..." -ForegroundColor Cyan
& "$PSScriptRoot\with-node.ps1" npm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "prisma db push..." -ForegroundColor Cyan
& "$PSScriptRoot\with-node.ps1" npx prisma db push
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Starting dev server (Ctrl+C to stop)." -ForegroundColor Green
Write-Host "Open the URL Next.js prints below — if 3000 is busy it will use 3001, 3002, …" -ForegroundColor Yellow
& "$PSScriptRoot\with-node.ps1" npm run dev
