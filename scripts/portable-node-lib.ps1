# Dot-source this file:  . "$PSScriptRoot\portable-node-lib.ps1"
# Resolves the folder that contains node.exe (project root, .tools, or FRAGRANCE_NODE_HOME).

function Get-PortableNodeDirectory {
  param(
    [Parameter(Mandatory = $true)]
    [string] $ProjectRoot
  )

  if ($env:FRAGRANCE_NODE_HOME) {
    $custom = $env:FRAGRANCE_NODE_HOME.Trim().TrimEnd('\', '/')
    if ($custom -and (Test-Path (Join-Path $custom "node.exe"))) {
      return Get-Item -LiteralPath $custom
    }
  }

  $candidates = @()
  foreach ($parent in @((Join-Path $ProjectRoot ".tools"), $ProjectRoot)) {
    if (-not (Test-Path -LiteralPath $parent)) { continue }
    Get-ChildItem -LiteralPath $parent -Directory -ErrorAction SilentlyContinue | ForEach-Object {
      if ($_.Name -match '^node-v(\d+\.\d+\.\d+)-win-x64$' -and (Test-Path (Join-Path $_.FullName "node.exe"))) {
        $candidates += [pscustomobject]@{
          Dir     = $_
          Version = [version]$Matches[1]
        }
      }
    }
  }

  if ($candidates.Count -eq 0) { return $null }

  $candidates |
    Sort-Object Version -Descending |
    Select-Object -First 1 |
    ForEach-Object { $_.Dir }
}
