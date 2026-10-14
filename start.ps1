<#
Starts the local Flask API and React development server.
Use -DevDebug explicitly for Flask's debugger/reloader; normal startup disables it.
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
  $debugArgument = if ($DevDebug) { "--debug" } else { "--no-debug" }
  $backendProcess = Start-Process -FilePath $pythonExecutable -PassThru `
    -WorkingDirectory $PSScriptRoot -WindowStyle Hidden `
    -ArgumentList @("-m", "flask", "--app", "backend.app", $debugArgument,
      "run", "--host", "127.0.0.1", "--port", "5000") `
    -RedirectStandardOutput (Join-Path $logDirectory "api.stdout.log") `
    -RedirectStandardError (Join-Path $logDirectory "api.stderr.log")
  Write-Host "API: http://127.0.0.1:5000 (PID $($backendProcess.Id))"
}

if (-not $ApiOnly) {
  $env:VITE_CARDFIGHT_API_URL = "http://127.0.0.1:5000"
  $frontendProcess = Start-Process -FilePath "cmd.exe" -PassThru `
    -WorkingDirectory (Join-Path $PSScriptRoot "frontend-web") -WindowStyle Hidden `
    -ArgumentList @("/c", "npm.cmd run dev") `
    -RedirectStandardOutput (Join-Path $logDirectory "frontend.stdout.log") `
    -RedirectStandardError (Join-Path $logDirectory "frontend.stderr.log")
  Write-Host "Frontend: http://localhost:5173 (PID $($frontendProcess.Id))"
}

Write-Host "Service logs: $logDirectory"
