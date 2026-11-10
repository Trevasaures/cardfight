<#
Starts the local Flask application with Waitress and the React development server.
Use -DevDebug explicitly for Flask's debugger/reloader in local mode only.
Use -Fresh to restart the local lab with a rebuilt Vite cache and the usual SQLite database.
Logs go to instance/, and both services stay in hidden background processes.
#>
param(
  [switch]$Seed,
  [switch]$ApiOnly,
  [switch]$FrontendOnly,
  [switch]$DevDebug,
  [switch]$Fresh
)

$ErrorActionPreference = "Stop"
if ($ApiOnly -and $FrontendOnly) {
  throw "Choose either -ApiOnly or -FrontendOnly."
}
if ($Fresh -and $FrontendOnly) {
  throw "-Fresh needs the API. Remove -FrontendOnly to restart the local lab."
}
if ($Fresh -and $Seed) {
  throw "-Fresh keeps the database as-is. Run -Seed separately if you want starter data."
}

$projectPython = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
$pythonExecutable = if (Test-Path -LiteralPath $projectPython) {
  $projectPython
} else {
  (Get-Command python -ErrorAction Stop).Source
}
$logDirectory = Join-Path $PSScriptRoot "instance"

if ($Fresh) {
  $launchSettings = @{ mode = "local"; origin = "http://127.0.0.1:5173"; host = "127.0.0.1" }
} else {
  # Read only non-secret launch metadata before checking database readiness.
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
}

function Get-PortOwners([int]$Port) {
  Get-NetTCPConnection -LocalPort $Port -RemotePort 0 -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
}

function Assert-PortAvailable([int]$Port) {
  $listenerIds = @(Get-PortOwners $Port)
  if ($listenerIds.Count -gt 0) {
    throw "Port $Port is already in use (PID $($listenerIds -join ', ')). Stop the listener if it is your previous Cardfight service before restarting."
  }
}

function Get-ProcessIdentity([int]$ProcessId) {
  Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $ProcessId"
}

function Get-CardfightProcess([int]$Port, [int]$ListenerId) {
  $process = Get-ProcessIdentity $ListenerId
  if ($Port -eq 5173 -and $process.Name -eq "node.exe") {
    $argument = [regex]::Match($process.CommandLine, '^\s*(?:"[^"]+"|\S+)\s+(?:"([^"]+)"|(\S+))')
    $entryPoint = $argument.Groups[1].Value + $argument.Groups[2].Value
    $projectVite = Join-Path $PSScriptRoot "frontend-web\node_modules\vite\bin\vite.js"
    if ($entryPoint -and [IO.Path]::IsPathRooted($entryPoint) -and
        [IO.Path]::GetFullPath($entryPoint) -eq $projectVite) {
      return $process
    }
  }
  if ($Port -eq 5000) {
    # The venv shim and Flask's reloader can own parents of the actual listener.
    $apiCommand = '\s-m\s+(?:waitress\s+.*\sbackend\.app:app(?:\s|$)|flask\s+--app\s+backend\.app\s+--debug\s+run(?:\s|$))'
    while ($process.Name -eq "python.exe" -and $process.CommandLine -match $apiCommand) {
      if ($process.ExecutablePath -eq $projectPython) { return $process }
      $parent = Get-ProcessIdentity $process.ParentProcessId
      if (-not $parent -or $parent.CreationDate -ge $process.CreationDate) { break }
      $process = $parent
    }
  }
  throw "Port $Port is already in use (PID $ListenerId). Cannot verify that the listener belongs to this Cardfight checkout. Stop it manually if it is your service."
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

$ports = @()
if (-not $FrontendOnly) { $ports += 5000 }
if (-not $ApiOnly) { $ports += 5173 }

$restartProcesses = @()
foreach ($port in $ports) {
  if ($Fresh) {
    foreach ($listenerId in Get-PortOwners $port) {
      $restartProcesses += Get-CardfightProcess $port $listenerId
    }
  } else {
    Assert-PortAvailable $port
  }
}

$previousFreshEnvironment = @{}
try {
  if ($Fresh) {
    $localDatabase = Join-Path $logDirectory "cardfight.db"
    if (-not (Test-Path -LiteralPath $localDatabase -PathType Leaf)) {
      throw "The existing local database was not found at $localDatabase. No services were restarted."
    }
    $freshEnvironment = @{
      DATABASE_URL = "sqlite:///" + $localDatabase.Replace('\', '/')
      CARDFIGHT_AUTH_MODE = $launchSettings.mode
      CARDFIGHT_AUTH_PUBLIC_ORIGIN = $launchSettings.origin
    }
    foreach ($name in $freshEnvironment.Keys) {
      $previousFreshEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
      [Environment]::SetEnvironmentVariable($name, $freshEnvironment[$name], "Process")
    }
  }
  New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null

  if (-not $FrontendOnly -or $Seed) {
    Push-Location -LiteralPath $PSScriptRoot
    try {
      # Validate the selected schema read-only before starting either service.
      if (-not $FrontendOnly) {
        & $pythonExecutable -c "import backend.app"
        if ($LASTEXITCODE -ne 0) {
          throw "API readiness check failed. No services were started. Follow the reported schema/configuration instructions."
        }
      }
      if ($Seed) {
        & $pythonExecutable -m backend.seed
        if ($LASTEXITCODE -ne 0) { throw "Database seed failed." }
      }
    } finally {
      Pop-Location
    }
  }

  if ($Fresh) {
    foreach ($previous in $restartProcesses | Sort-Object ProcessId -Unique) {
      $current = Get-ProcessIdentity $previous.ProcessId
      if (-not $current) { continue }
      if ($current.CreationDate -ne $previous.CreationDate) {
        throw "PID $($previous.ProcessId) changed during the restart. Run -Fresh again to recheck the ports."
      }
      & taskkill.exe /PID $current.ProcessId /T /F | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "Could not stop the previous Cardfight process (PID $($current.ProcessId))." }
    }
    foreach ($port in $ports) { Assert-PortAvailable $port }
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
} finally {
  foreach ($name in $previousFreshEnvironment.Keys) {
    if ($null -eq $previousFreshEnvironment[$name]) {
      Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
    } else {
      [Environment]::SetEnvironmentVariable($name, $previousFreshEnvironment[$name], "Process")
    }
  }
}

if (-not $ApiOnly) {
  # Relative API paths use Vite's /api, /auth and /join proxies. Scope this to
  # the child process so an old launcher setting cannot leak into later shells.
  $previousApiUrl = [Environment]::GetEnvironmentVariable("VITE_CARDFIGHT_API_URL", "Process")
  try {
    $env:VITE_CARDFIGHT_API_URL = "/"
    $viteArguments = "npm.cmd run dev -- --host $($launchSettings.host)"
    if ($Fresh) { $viteArguments += " --force" }
    $frontendProcess = Start-Process -FilePath "cmd.exe" -PassThru `
      -WorkingDirectory (Join-Path $PSScriptRoot "frontend-web") -WindowStyle Hidden `
      -ArgumentList @("/c", $viteArguments) `
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
