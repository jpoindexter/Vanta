[CmdletBinding()]
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$VantaArgs)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$VantaHome = if ($env:VANTA_HOME) { $env:VANTA_HOME } else { Join-Path $HOME ".vanta" }
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$kernel = Join-Path $Root "target\debug\vanta-kernel.exe"
$modules = Join-Path $Root "vanta-ts\node_modules\tsx"

New-Item -ItemType Directory -Force -Path $VantaHome | Out-Null
[IO.File]::WriteAllText((Join-Path $VantaHome "repo-path"), "$Root`r`n", $Utf8NoBom)

if (-not (Test-Path $kernel) -or -not (Test-Path $modules) -or -not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
  & (Join-Path $Root "install.ps1") -SkipPathUpdate -SkipSkillInstall
}

$heap = if ($env:VANTA_NODE_MAX_MB) { $env:VANTA_NODE_MAX_MB } else { "4096" }
$heapOption = "--max-old-space-size=$heap"
if ($env:NODE_OPTIONS) { $env:NODE_OPTIONS = "$($env:NODE_OPTIONS) $heapOption" } else { $env:NODE_OPTIONS = $heapOption }
$env:VANTA_RELAUNCH = "1"
$env:VANTA_PLATFORM = "windows"

Push-Location (Join-Path $Root "vanta-ts")
try {
  while ($true) {
    & node.exe --import tsx src/cli.ts @VantaArgs
    $code = $LASTEXITCODE
    if ($code -ne 75) { exit $code }
    Write-Host "vanta: reloading..." -ForegroundColor DarkGray
  }
} finally {
  Pop-Location
}
