<#
Starts the local Flask application with Waitress and the React development server.
Use -DevDebug explicitly for Flask's debugger/reloader in local mode only.
Logs go to instance/, and both services stay in hidden background processes.
#>
param(
  [switch]$Seed,
  [switch]$ApiOnly,
  [switch]$FrontendOnly,
  [switch]$DevDebug
)

$ErrorActionPreference = "Stop"
if ($ApiOnly -and $FrontendOnly) {
  throw "Choose either -ApiOnly or -FrontendOnly."
}

$projectPython = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
$pythonExecutable = if (Test-Path -LiteralPath $projectPython) {
  $projectPython
} else {
  (Get-Command python -ErrorAction Stop).Source
}
$logDirectory = Join-Path $PSScriptRoot "instance"
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null

# Read only non-secret launch metadata. Do not import backend.app here: schema
# readiness is checked separately before starting a server, never migrated.
$launchSettingsCode = @'
import json
from types import SimpleNamespace
from urllib.parse import urlsplit
from dotenv import load_dotenv
from backend.config import PROJECT_ROOT, default_config
from backend.auth.settings import AuthSettings
load_dotenv(PROJECT_ROOT / ".env")
settings = AuthSettings.from_app(SimpleNamespace(config=default_config()))
if settings.mode == "oidc":
    raise SystemExit("start.ps1 is a loopback development launcher; use the hosting runbook for production OIDC.")
origin = settings.origin if settings.mode == "oidc-dev" else "http://127.0.0.1:5173"
parsed = urlsplit(origin)
if parsed.scheme != "http" or parsed.port != 5173:
    raise SystemExit("The development frontend requires an HTTP loopback origin on port 5173.")
print(json.dumps({"mode": "local" if settings.mode == "local" else "oidc", "origin": origin, "host": parsed.hostname}))
'@
Push-Location -LiteralPath $PSScriptRoot
try {
  # Standard input preserves Python's quotes in Windows PowerShell 5.1.
  $launchSettingsJson = $launchSettingsCode | & $pythonExecutable -
  if ($LASTEXITCODE -ne 0) { throw "Invalid launcher configuration. No services were started." }
  $launchSettings = $launchSettingsJson | ConvertFrom-Json
} finally {
  Pop-Location
}

function Assert-PortAvailable([int]$Port) {
  $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
  if ($listeners.Count -gt 0) {
    throw "Port $Port is already in use. Stop the existing Cardfight service before restarting; no running process was changed."
  }
}

function Wait-ServiceReady($Process, [string]$Uri, [string]$Name) {
  $deadline = [DateTime]::UtcNow.AddSeconds(20)
  do {
    $Process.Refresh()
    if ($Process.HasExited) {
      throw "$Name exited during startup. Check its logs in $logDirectory."
    }
    try {
      $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -eq 200) { return }
    } catch { }
    Start-Sleep -Milliseconds 250
  } while ([DateTime]::UtcNow -lt $deadline)
  throw "$Name did not become ready. Check its logs in $logDirectory."
}

if (-not $FrontendOnly) { Assert-PortAvailable 5000 }
if (-not $ApiOnly) { Assert-PortAvailable 5173 }

# Importing the application validates the configured schema read-only. A failed
# startup must stop here, rather than leave a frontend pointed at a dead API.
if (-not $FrontendOnly) {
  Push-Location -LiteralPath $PSScriptRoot
  try {
    & $pythonExecutable -c "import backend.app"
    if ($LASTEXITCODE -ne 0) {
      throw "API readiness check failed. No services were started and no migration was applied. Follow the reported schema/configuration instructions."
    }
  } finally {
    Pop-Location
  }
}

if ($Seed) {
  Push-Location -LiteralPath $PSScriptRoot
  try {
    & $pythonExecutable -m backend.seed
    if ($LASTEXITCODE -ne 0) { throw "Database seed failed." }
  } finally {
    Pop-Location
  }
}

if (-not $FrontendOnly) {
  if ($DevDebug -and $launchSettings.mode -ne "local") {
    throw "Use -DevDebug only for the local personal lab, without real sign-in credentials."
  }
  $backendArguments = if ($DevDebug) {
    @("-m", "flask", "--app", "backend.app", "--debug",
      "run", "--host", "127.0.0.1", "--port", "5000")
  } else {
    # Waitress avoids Flask's development access log recording login-code URLs.
    @("-m", "waitress", "--host=127.0.0.1", "--port=5000", "backend.app:app")
  }
  $backendProcess = Start-Process -FilePath $pythonExecutable -PassThru `
    -WorkingDirectory $PSScriptRoot -WindowStyle Hidden `
    -ArgumentList $backendArguments `
    -RedirectStandardOutput (Join-Path $logDirectory "api.stdout.log") `
    -RedirectStandardError (Join-Path $logDirectory "api.stderr.log")
  Wait-ServiceReady $backendProcess "http://127.0.0.1:5000/api/health" "API"
  Write-Host "API ready: http://127.0.0.1:5000 (PID $($backendProcess.Id))"
}

if (-not $ApiOnly) {
  # Relative API paths use Vite's /api, /auth and /join proxies. Scope this to
  # the child process so an old launcher setting cannot leak into later shells.
  $previousApiUrl = [Environment]::GetEnvironmentVariable("VITE_CARDFIGHT_API_URL", "Process")
  try {
    $env:VITE_CARDFIGHT_API_URL = "/"
    $frontendProcess = Start-Process -FilePath "cmd.exe" -PassThru `
      -WorkingDirectory (Join-Path $PSScriptRoot "frontend-web") -WindowStyle Hidden `
      -ArgumentList @("/c", "npm.cmd run dev -- --host $($launchSettings.host)") `
      -RedirectStandardOutput (Join-Path $logDirectory "frontend.stdout.log") `
      -RedirectStandardError (Join-Path $logDirectory "frontend.stderr.log")
  } finally {
    if ($null -eq $previousApiUrl) {
      Remove-Item -LiteralPath Env:VITE_CARDFIGHT_API_URL -ErrorAction SilentlyContinue
    } else {
      [Environment]::SetEnvironmentVariable("VITE_CARDFIGHT_API_URL", $previousApiUrl, "Process")
    }
  }
  Wait-ServiceReady $frontendProcess $launchSettings.origin "Frontend"
  Write-Host "Frontend ready: $($launchSettings.origin) (PID $($frontendProcess.Id))"
}

Write-Host "Service logs: $logDirectory"
