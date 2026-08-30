#Requires -Version 5.1
<#
.SYNOPSIS
  One-click Windows desktop packager for this Expo + Tauri repo.

.DESCRIPTION
  Checks toolchain, pins CARGO_TARGET_DIR into the repo, ensures a 24-bit
  NSIS sidebar BMP, runs `npm run build:desktop`, and if NSIS fails because
  the default win.bmp is encrypted/missing, retries makensis with the
  in-repo sidebar image.

.PARAMETER SkipNpmInstall
  Skip `npm install` even when node_modules is missing.

.EXAMPLE
  .\doc\deploy\build-windows.ps1
  .\doc\deploy\build-windows.cmd
#>
[CmdletBinding()]
param(
  [switch]$SkipNpmInstall
)

$ErrorActionPreference = 'Continue'

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==== $Message ====" -ForegroundColor Cyan
}

function Write-Ok {
  param([string]$Message)
  Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Warn2 {
  param([string]$Message)
  Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Fail {
  param([string]$Message)
  Write-Host "[FAIL] $Message" -ForegroundColor Red
  exit 1
}

function Get-RepoRoot {
  $here = $PSScriptRoot
  if (-not $here) {
    $here = Split-Path -Parent $MyInvocation.MyCommand.Path
  }
  $root = (Resolve-Path (Join-Path $here '..\..')).Path
  if (-not (Test-Path (Join-Path $root 'package.json'))) {
    Fail "Cannot find package.json at repo root: $root"
  }
  if (-not (Test-Path (Join-Path $root 'src-tauri\tauri.conf.json'))) {
    Fail "Cannot find src-tauri\tauri.conf.json. This script is for the Windows Tauri desktop build."
  }
  return $root
}

function Get-CommandPath {
  param([string]$Name)
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

function Assert-Windows {
  if ($env:OS -ne 'Windows_NT') {
    Fail "This script is Windows-only."
  }
}

function Assert-Toolchain {
  Write-Step "Check toolchain"

  $node = Get-CommandPath 'node'
  if (-not $node) { Fail "Node.js not found. Install Node >= 20.19.4 then reopen the terminal." }
  $nodeVerRaw = (& node -v 2>$null)
  if (-not $nodeVerRaw) { Fail "node -v failed." }
  $nodeVer = [version](($nodeVerRaw.TrimStart('v') -split '-')[0])
  $minNode = [version]'20.19.4'
  if ($nodeVer -lt $minNode) {
    Fail "Node $nodeVerRaw is too old. Need >= v20.19.4 (nvm install 20.19.4 && nvm use 20.19.4)."
  }
  Write-Ok "Node $nodeVerRaw"

  $npmCmd = Get-CommandPath 'npm.cmd'
  if (-not $npmCmd) { $npmCmd = Get-CommandPath 'npm' }
  if (-not $npmCmd) { Fail "npm not found." }
  Write-Ok "npm $((& $npmCmd -v 2>$null))"

  $rustc = Get-CommandPath 'rustc'
  $cargo = Get-CommandPath 'cargo'
  if (-not $rustc -or -not $cargo) {
    Fail "Rust toolchain missing. Install rustup (x86_64-pc-windows-msvc) and reopen the terminal."
  }
  Write-Ok ((& rustc --version 2>$null))
  Write-Ok ((& cargo --version 2>$null))

  $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
  if (Test-Path $vswhere) {
    $vsPath = & $vswhere -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
    if ($vsPath) { Write-Ok "MSVC: $vsPath" } else { Write-Warn2 "vswhere did not find C++ tools. cargo may fail to link." }
  } else {
    Write-Warn2 "vswhere not found. If cargo cannot find link.exe, install VS 2022 Build Tools (Desktop development with C++)."
  }
}

function Invoke-Npm {
  param([Parameter(Mandatory = $true)][string[]]$NpmArgs)
  $npmCmd = Get-CommandPath 'npm.cmd'
  if (-not $npmCmd) { $npmCmd = Get-CommandPath 'npm' }
  & $npmCmd @NpmArgs
  if ($LASTEXITCODE -ne 0) {
    throw "npm $($NpmArgs -join ' ') failed with exit code $LASTEXITCODE"
  }
}

function Get-AppMeta {
  param([string]$RepoRoot)
  $name = 'OAM'
  $ver = '26.1.2'
  $pkgPath = Join-Path $RepoRoot 'package.json'
  $confPath = Join-Path $RepoRoot 'src-tauri\tauri.conf.json'
  try {
    $pkg = Get-Content -Path $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($pkg.name) { $name = [string]$pkg.name }
    if ($pkg.version) { $ver = [string]$pkg.version }
  } catch {}
  try {
    $conf = Get-Content -Path $confPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($conf.productName) { $name = [string]$conf.productName }
    if ($conf.version) { $ver = [string]$conf.version }
  } catch {}
  return [pscustomobject]@{ Name = $name; Version = $ver }
}

function Get-BmpBitCount {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return 0 }
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -lt 30) { return 0 }
  if ($bytes[0] -ne 0x42 -or $bytes[1] -ne 0x4D) { return 0 }
  return [int][BitConverter]::ToUInt16($bytes, 28)
}

function Ensure-NsisSidebarBmp {
  param([string]$RepoRoot)
  Write-Step "Ensure 24-bit NSIS sidebar BMP"
  $dir = Join-Path $RepoRoot 'src-tauri\windows'
  $out = Join-Path $dir 'nsis-sidebar.bmp'
  if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }
  $bits = Get-BmpBitCount -Path $out
  if ($bits -eq 24) {
    Write-Ok "sidebar BMP already 24-bit: $out"
    return $out
  }

  Add-Type -AssemblyName System.Drawing
  $bmp = New-Object System.Drawing.Bitmap 164, 314, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.Clear([System.Drawing.Color]::FromArgb(74, 144, 217))
  $iconPath = Join-Path $RepoRoot 'assets\icon.png'
  if (Test-Path $iconPath) {
    $icon = [System.Drawing.Image]::FromFile($iconPath)
    $size = 96
    $x = [int]((164 - $size) / 2)
    $g.DrawImage($icon, $x, 80, $size, $size)
    $icon.Dispose()
  }
  $g.Dispose()
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Bmp)
  $bmp.Dispose()
  $bits = Get-BmpBitCount -Path $out
  if ($bits -ne 24) {
    Write-Warn2 "Generated BMP bit count is $bits (want 24). NSIS may warn Unsupported format."
  } else {
    Write-Ok "Wrote 24-bit sidebar BMP: $out"
  }
  return $out
}

function Get-LogText {
  param([string]$LogPath)
  if (-not (Test-Path $LogPath)) { return '' }
  try {
    return [System.IO.File]::ReadAllText($LogPath)
  } catch {
    return ''
  }
}

function Find-FileUnder {
  param(
    [string[]]$Roots,
    [string]$Filter,
    [string]$FullNameRegex
  )
  $hits = @()
  foreach ($root in $Roots) {
    if (-not $root) { continue }
    if (-not (Test-Path $root)) { continue }
    $hits += Get-ChildItem -Path $root -Filter $Filter -Recurse -File -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -match $FullNameRegex }
  }
  $hits | Sort-Object LastWriteTime -Descending
}

function Invoke-NsisFallback {
  param(
    [string]$RepoRoot,
    [string]$TargetDir,
    [string]$SidebarBmp,
    [string]$ProductName,
    [string]$Version
  )
  Write-Step "NSIS fallback (use in-repo sidebar BMP)"

  $makensis = Join-Path $env:LOCALAPPDATA 'tauri\NSIS\makensis.exe'
  if (-not (Test-Path $makensis)) {
    Fail "makensis not found: $makensis. Let a successful tauri build download NSIS first, or unzip it there manually."
  }

  $searchRoots = @(
    $TargetDir,
    (Join-Path $RepoRoot 'src-tauri\target')
  )
  if ($env:TEMP) {
    $sandbox = Join-Path $env:TEMP 'cursor-sandbox-cache'
    if (Test-Path $sandbox) { $searchRoots += $sandbox }
  }

  $exeHit = Find-FileUnder -Roots $searchRoots -Filter 'app.exe' -FullNameRegex '\\release\\app\.exe$' | Select-Object -First 1
  if (-not $exeHit) {
    Fail "app.exe not found. Rust compile likely failed; fix that before NSIS."
  }
  Write-Ok "Found exe: $($exeHit.FullName)"

  $nsiHit = Find-FileUnder -Roots $searchRoots -Filter 'installer.nsi' -FullNameRegex '\\release\\nsis\\[^\\]+\\installer\.nsi$' | Select-Object -First 1
  if (-not $nsiHit) {
    Fail "installer.nsi not found. tauri did not generate the NSIS script; cannot fallback."
  }

  $nsiPath = $nsiHit.FullName
  $nsiDir = Split-Path -Parent $nsiPath
  $text = [System.IO.File]::ReadAllText($nsiPath)
  $patched = [regex]::Replace($text, '!define SIDEBARIMAGE ".*?"', "!define SIDEBARIMAGE `"$SidebarBmp`"")
  if ($patched -notmatch [regex]::Escape($SidebarBmp)) {
    Fail "Failed to patch SIDEBARIMAGE in $nsiPath"
  }
  $utf8 = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($nsiPath, $patched, $utf8)
  Write-Ok "Patched SIDEBARIMAGE -> $SidebarBmp"

  Push-Location $nsiDir
  try {
    & $makensis /V2 installer.nsi
    if ($LASTEXITCODE -ne 0) {
      Fail "makensis fallback failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }

  $built = Join-Path $nsiDir 'nsis-output.exe'
  if (-not (Test-Path $built)) {
    Fail "makensis succeeded but nsis-output.exe is missing in $nsiDir"
  }

  $destExeDir = Join-Path $RepoRoot 'src-tauri\target\release'
  $destNsisDir = Join-Path $destExeDir 'bundle\nsis'
  New-Item -ItemType Directory -Force -Path $destNsisDir | Out-Null
  Copy-Item -Force $exeHit.FullName (Join-Path $destExeDir 'app.exe')
  $setupName = "${ProductName}_${Version}_x64-setup.exe"
  Copy-Item -Force $built (Join-Path $destNsisDir $setupName)
  Write-Ok "Fallback installer: $(Join-Path $destNsisDir $setupName)"
}

function Copy-IfElsewhere {
  param(
    [string]$RepoRoot,
    [string]$TargetDir,
    [string]$ProductName,
    [string]$Version
  )
  $destExeDir = Join-Path $RepoRoot 'src-tauri\target\release'
  $destNsisDir = Join-Path $destExeDir 'bundle\nsis'
  $destExe = Join-Path $destExeDir 'app.exe'
  $destSetup = Join-Path $destNsisDir "${ProductName}_${Version}_x64-setup.exe"

  if ((Test-Path $destExe) -and (Test-Path $destSetup)) {
    return
  }

  $searchRoots = @($TargetDir)
  if ($env:TEMP) {
    $sandbox = Join-Path $env:TEMP 'cursor-sandbox-cache'
    if (Test-Path $sandbox) { $searchRoots += $sandbox }
  }

  if (-not (Test-Path $destExe)) {
    $exeHit = Find-FileUnder -Roots $searchRoots -Filter 'app.exe' -FullNameRegex '\\release\\app\.exe$' | Select-Object -First 1
    if ($exeHit) {
      New-Item -ItemType Directory -Force -Path $destExeDir | Out-Null
      Copy-Item -Force $exeHit.FullName $destExe
      Write-Ok "Copied exe from $($exeHit.FullName)"
    }
  }

  if (-not (Test-Path $destSetup)) {
    $setupHit = Find-FileUnder -Roots $searchRoots -Filter '*-setup.exe' -FullNameRegex '\\bundle\\nsis\\' | Select-Object -First 1
    if (-not $setupHit) {
      $setupHit = Find-FileUnder -Roots $searchRoots -Filter 'nsis-output.exe' -FullNameRegex '.' | Select-Object -First 1
    }
    if ($setupHit) {
      New-Item -ItemType Directory -Force -Path $destNsisDir | Out-Null
      Copy-Item -Force $setupHit.FullName $destSetup
      Write-Ok "Copied installer from $($setupHit.FullName)"
    }
  }
}

# ---- main ----

Assert-Windows
$RepoRoot = Get-RepoRoot
Write-Host "Repo: $RepoRoot"

Assert-Toolchain

$targetDir = Join-Path $RepoRoot 'src-tauri\target'
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
$env:CARGO_TARGET_DIR = $targetDir
Write-Ok "CARGO_TARGET_DIR=$env:CARGO_TARGET_DIR"

$sidebarBmp = Ensure-NsisSidebarBmp -RepoRoot $RepoRoot
$meta = Get-AppMeta -RepoRoot $RepoRoot

Push-Location $RepoRoot
try {
  if (-not $SkipNpmInstall) {
    $nm = Join-Path $RepoRoot 'node_modules'
    $cli = Join-Path $nm '@tauri-apps\cli'
    if (-not (Test-Path $nm) -or -not (Test-Path $cli)) {
      Write-Step "npm install"
      Invoke-Npm @('install')
    } else {
      Write-Ok "node_modules present, skip npm install"
    }
  } else {
    Write-Warn2 "SkipNpmInstall set"
  }

  Write-Step "tauri build (web export + rust + nsis)"
  Write-Host "First Rust compile can take several minutes." -ForegroundColor DarkGray
  $logPath = Join-Path $targetDir 'windows-build.log'
  $npmCmd = Get-CommandPath 'npm.cmd'
  if (-not $npmCmd) { $npmCmd = Get-CommandPath 'npm' }

  # Do not pipe native commands through Tee-Object: PowerShell 5.1 then loses LASTEXITCODE.
  cmd.exe /c "`"$npmCmd`" run build:desktop > `"$logPath`" 2>&1"
  $buildCode = $LASTEXITCODE
  if (Test-Path $logPath) {
    Get-Content -Path $logPath
  }
  $logText = Get-LogText -LogPath $logPath

  if ($buildCode -ne 0) {
    if ($logText -match 'stream did not contain valid UTF-8') {
      Write-Host ""
      Write-Host "cargo cannot read src-tauri\tauri.conf.json as UTF-8." -ForegroundColor Red
      Write-Host "This is usually corporate transparent encryption." -ForegroundColor Yellow
      Write-Host "Decrypt that file (and do not save it again in the editor), then rerun this script." -ForegroundColor Yellow
      Fail "Stopped: encrypted or non-UTF-8 tauri.conf.json"
    }

    if ($logText -match 'win\.bmp|Failed to bundle app with makensis|failed to bundle project') {
      Write-Warn2 "tauri NSIS bundle failed; trying in-repo sidebar fallback."
      Invoke-NsisFallback -RepoRoot $RepoRoot -TargetDir $targetDir -SidebarBmp $sidebarBmp -ProductName $meta.Name -Version $meta.Version
    } else {
      Fail "npm run build:desktop failed. See $logPath"
    }
  } else {
    Write-Ok "tauri build finished"
    Copy-IfElsewhere -RepoRoot $RepoRoot -TargetDir $targetDir -ProductName $meta.Name -Version $meta.Version
  }
} catch {
  Fail $_.Exception.Message
} finally {
  Pop-Location
}

$exe = Join-Path $RepoRoot 'src-tauri\target\release\app.exe'
$setup = Join-Path $RepoRoot "src-tauri\target\release\bundle\nsis\$($meta.Name)_$($meta.Version)_x64-setup.exe"

Write-Step "Artifacts"
if (Test-Path $exe) {
  $fi = Get-Item $exe
  Write-Ok ("exe: {0} ({1:N1} MB)" -f $fi.FullName, ($fi.Length / 1MB))
} else {
  Write-Warn2 "exe not at $exe"
}
if (Test-Path $setup) {
  $fi = Get-Item $setup
  Write-Ok ("setup: {0} ({1:N1} MB)" -f $fi.FullName, ($fi.Length / 1MB))
} else {
  Write-Warn2 "installer not at $setup"
}

if (-not (Test-Path $exe)) {
  Fail "Build finished without app.exe"
}
if (-not (Test-Path $setup)) {
  Write-Warn2 "Installer missing, but exe exists. You can still run app.exe (WebView2 required)."
  exit 2
}

Write-Host ""
Write-Host "Windows package ready." -ForegroundColor Green
exit 0
