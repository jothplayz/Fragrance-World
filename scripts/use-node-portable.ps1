# Dot-source this so npm/node work in the current PowerShell session:
#   . .\scripts\use-node-portable.ps1
# If scripts are blocked: powershell -ExecutionPolicy Bypass -File .\scripts\use-node-portable.ps1
# Or skip PowerShell and use: .\scripts\npm-portable.cmd run catalog:import-brands

# Repo root (parent of this script's folder)
$root = Split-Path $PSScriptRoot -Parent

$portable = Get-ChildItem -Path (Join-Path $root ".node-portable") -Directory -Filter "node-v*-win-x64" -ErrorAction SilentlyContinue |
  Sort-Object Name -Descending |
  Select-Object -First 1

if (-not $portable) {
  Write-Host "No portable Node found under .node-portable. Install Node.js LTS from https://nodejs.org/ or extract the Windows zip there." -ForegroundColor Yellow
  return
}

$bin = $portable.FullName
$env:Path = "$bin;$env:Path"
Write-Host "Using Node: $(Join-Path $bin 'node.exe')" -ForegroundColor Green
& (Join-Path $bin "node.exe") --version
