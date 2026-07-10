[CmdletBinding()]
param(
  [switch]$SkipPathUpdate,
  [switch]$SkipSkillInstall
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$VantaHome = if ($env:VANTA_HOME) { $env:VANTA_HOME } else { Join-Path $HOME ".vanta" }
$BinDir = Join-Path $HOME ".local\bin"
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Refresh-ProcessPath {
  $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  $cargo = Join-Path $HOME ".cargo\bin"
  $env:Path = "$machine;$user;$cargo"
}

function Ensure-Command([string]$Command, [string]$WingetId, [string]$Label) {
  if (Get-Command $Command -ErrorAction SilentlyContinue) { return }
  if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
    throw "$Label is required and winget is unavailable. Install $Label, then rerun install.ps1."
  }
  Write-Host "-> installing $Label with winget"
  & winget.exe install --id $WingetId --exact --source winget --accept-package-agreements --accept-source-agreements --silent
  if ($LASTEXITCODE -ne 0) { throw "winget failed to install $Label" }
  Refresh-ProcessPath
  if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) { throw "$Label installed but $Command is not on PATH" }
}

function Install-Kernel {
  $kernel = Join-Path $Root "target\debug\vanta-kernel.exe"
  if (Test-Path $kernel) { return }
  $targetDir = Split-Path -Parent $kernel
  New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
  $base = if ($env:VANTA_KERNEL_RELEASE_BASE) { $env:VANTA_KERNEL_RELEASE_BASE } else { "https://github.com/jpoindexter/Vanta/releases/latest/download" }
  $asset = "vanta-kernel-x86_64-pc-windows-msvc.exe"
  $download = Join-Path $env:TEMP $asset
  $checksum = "$download.sha256"
  try {
    Invoke-WebRequest "$base/$asset" -OutFile $download -UseBasicParsing
    Invoke-WebRequest "$base/$asset.sha256" -OutFile $checksum -UseBasicParsing
    $want = ((Get-Content $checksum -Raw).Trim() -split "\s+")[0].ToLowerInvariant()
    $got = (Get-FileHash $download -Algorithm SHA256).Hash.ToLowerInvariant()
    if (-not $want -or $want -ne $got) { throw "kernel checksum mismatch" }
    Move-Item -Force $download $kernel
    Remove-Item -Force $checksum -ErrorAction SilentlyContinue
    Write-Host "OK downloaded checksum-verified Windows kernel"
    return
  } catch {
    Remove-Item -Force $download, $checksum -ErrorAction SilentlyContinue
    Write-Host "-> no Windows release kernel available; building natively with cargo"
  }
  Push-Location $Root
  try { & cargo build } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $kernel)) { throw "native Windows kernel build failed" }
}

Write-Host ""
Write-Host "Vanta Windows install"
Ensure-Command "git.exe" "Git.Git" "Git for Windows"
Ensure-Command "node.exe" "OpenJS.NodeJS.LTS" "Node.js LTS"
Ensure-Command "cargo.exe" "Rustlang.Rustup" "Rust"

$nodeMajor = [int]((& node.exe -p "process.versions.node.split('.')[0]").Trim())
if ($nodeMajor -lt 22) { throw "Node.js 22+ is required; found $nodeMajor" }

Install-Kernel
if (-not (Test-Path (Join-Path $Root "vanta-ts\node_modules"))) {
  Write-Host "-> installing agent dependencies"
  Push-Location (Join-Path $Root "vanta-ts")
  try { & npm.cmd install --omit=dev } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
}

New-Item -ItemType Directory -Force -Path $VantaHome, $BinDir | Out-Null
[IO.File]::WriteAllText((Join-Path $VantaHome "repo-path"), "$Root`r`n", $Utf8NoBom)
$launcher = @'
@echo off
setlocal
if "%VANTA_HOME%"=="" (set "VHOME=%USERPROFILE%\.vanta") else (set "VHOME=%VANTA_HOME%")
if not exist "%VHOME%\repo-path" (
  echo vanta: repo path is missing. Rerun install.ps1. 1>&2
  exit /b 1
)
set /p "VANTA_REPO="<"%VHOME%\repo-path"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%VANTA_REPO%\run.ps1" %*
exit /b %ERRORLEVEL%
'@
Set-Content -Path (Join-Path $BinDir "vanta.cmd") -Value $launcher -Encoding ASCII

if (-not $SkipPathUpdate) {
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $parts = @($userPath -split ";" | Where-Object { $_ })
  if ($parts -notcontains $BinDir) {
    [Environment]::SetEnvironmentVariable("Path", (($parts + $BinDir) -join ";"), "User")
    Write-Host "OK added $BinDir to the user PATH (new terminal required)"
  }
}

if (-not $SkipSkillInstall) {
  & (Join-Path $Root "run.ps1") skills install | Out-Null
}

Write-Host "OK installed vanta.cmd in $BinDir"
Write-Host "Start a new terminal, then run: vanta setup"
