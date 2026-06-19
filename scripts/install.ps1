# Dimensions Analytics MCP one-step installer (Windows PowerShell)
# Run from the repo, or: irm https://raw.githubusercontent.com/digital-science/dimensions-analytics-mcp/main/scripts/install.ps1 | iex
#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Repo = "digital-science/dimensions-analytics-mcp"
$Ref = if ($env:DIMENSIONS_MCP_INSTALL_REF) { $env:DIMENSIONS_MCP_INSTALL_REF } else { "main" }
$RawBase = "https://raw.githubusercontent.com/$Repo/$Ref"
$MinNodeMajor = 20

function Write-Info([string]$Message) {
  Write-Host $Message
}

function Test-NodeJs {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) { return $false }
  $version = & node -p "process.versions.node.split('.')[0]"
  if ([int]$version -lt $MinNodeMajor) {
    Write-Warning "Node.js $MinNodeMajor+ is required. Found $(node -v)."
    exit 1
  }
  return $true
}

function Offer-NodeInstall {
  Write-Info ""
  Write-Info "Node.js is not installed (or not on your PATH)."
  Write-Info "Node.js $MinNodeMajor+ is required to run Dimensions Analytics MCP."
  Write-Info ""

  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($winget) {
    $answer = Read-Host "Install Node.js LTS with winget now? [y/N]"
    if ($answer -match '^[Yy]') {
      & winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
      Write-Info ""
      Write-Info "Node.js installed. Close this window, open a new PowerShell, and run:"
      Write-Info "  irm https://raw.githubusercontent.com/$Repo/$Ref/scripts/install.ps1 | iex"
      exit 0
    }
  }

  Write-Info "Download Node.js LTS from https://nodejs.org/ and run this script again."
  exit 1
}

function Resolve-InstallMjs {
  $local = Join-Path $ScriptDir "install.mjs"
  if (Test-Path $local) {
    return $local
  }
  $tempDir = Join-Path $env:TEMP "dimensions-analytics-mcp-install"
  New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
  $dest = Join-Path $tempDir "install.mjs"
  Write-Info "Downloading installer from $RawBase/scripts/install.mjs ..."
  Invoke-WebRequest -Uri "$RawBase/scripts/install.mjs" -OutFile $dest -UseBasicParsing
  return $dest
}

function Main {
  Write-Info "Dimensions Analytics MCP installer"
  if (-not (Test-NodeJs)) {
    Offer-NodeInstall
  }
  $mjs = Resolve-InstallMjs
  & node $mjs @args
}

Main @args
