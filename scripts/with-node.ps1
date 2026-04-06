#Requires -Version 5.1
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $Command = @()
)

$ErrorActionPreference = "Stop"

if (-not $Command -or $Command.Count -eq 0) {
  Write-Host "Usage: .\scripts\with-node.ps1 npm install" -ForegroundColor Yellow
  Write-Host "       .\scripts\with-node.ps1 npx prisma db push" -ForegroundColor Yellow
  Write-Host "       .\scripts\with-node.ps1 npm run dev" -ForegroundColor Yellow
  exit 1
}

$ProjectRoot = Split-Path -Parent $PSScriptRoot
. "$PSScriptRoot\portable-node-lib.ps1"

$nodeHome = Get-PortableNodeDirectory -ProjectRoot $ProjectRoot

if (-not $nodeHome) {
  Write-Host "Portable Node not found." -ForegroundColor Red
  Write-Host "Put a extracted folder like node-v24.14.1-win-x64 in the project root or in .tools" -ForegroundColor Yellow
  Write-Host "or set FRAGRANCE_NODE_HOME to the folder that contains node.exe" -ForegroundColor Yellow
  Write-Host "Or run: powershell -ExecutionPolicy Bypass -File .\scripts\setup-portable-node.ps1" -ForegroundColor Yellow
  exit 1
}

$env:PATH = "$($nodeHome.FullName);$ProjectRoot\node_modules\.bin;$env:PATH"

$bin = $Command[0]
$rest = @()
if ($Command.Count -gt 1) {
  $rest = $Command[1..($Command.Count - 1)]
}

switch -Regex ($bin) {
  '^npm(\.cmd)?$' {
    & (Join-Path $nodeHome.FullName "npm.cmd") @rest
    exit $LASTEXITCODE
  }
  '^npx(\.cmd)?$' {
    & (Join-Path $nodeHome.FullName "npx.cmd") @rest
    exit $LASTEXITCODE
  }
  '^node(\.exe)?$' {
    & (Join-Path $nodeHome.FullName "node.exe") @rest
    exit $LASTEXITCODE
  }
  default {
    & $bin @rest
    exit $LASTEXITCODE
  }
}
