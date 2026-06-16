<#
Starts the Cardfight backend and optional frontend.

Usage:
  .\start.ps1                 # run backend + Streamlit frontend
  .\start.ps1 -ApiOnly        # run only Flask backend
  .\start.ps1 -Seed           # seed DB before starting
  .\start.ps1 -ApiOnly -Seed  # seed DB, then run only backend
#>

param(
  [switch]$Seed,
  [switch]$ApiOnly
)

$ErrorActionPreference = "Stop"

# Ensure we're at repo root
Set-Location -Path $PSScriptRoot

# Environment
$env:FLASK_APP = "backend.app"
$env:FLASK_ENV = "development"

# Optional: seed DB
if ($Seed) {
  Write-Host "Seeding database..." -ForegroundColor Cyan
  python -m backend.seed
}

# Start backend in a new PowerShell window
Write-Host "Starting Flask backend on http://127.0.0.1:5000 ..." -ForegroundColor Green
$backend = Start-Process powershell -PassThru -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-Location `"$PSScriptRoot`";",
  "`$env:FLASK_APP = 'backend.app';",
  "`$env:FLASK_ENV = 'development';",
  "python -m flask run"
)

Start-Sleep -Seconds 1

if (-not $ApiOnly) {
  Write-Host "Starting Streamlit frontend on http://localhost:8501 ..." -ForegroundColor Green
  $frontend = Start-Process powershell -PassThru -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location `"$PSScriptRoot`";",
    "python -m streamlit run frontend/gui.py"
  )

  Write-Host ""
  Write-Host "Launched!" -ForegroundColor Yellow
  Write-Host "Backend:  PID $($backend.Id)  -> http://127.0.0.1:5000"
  Write-Host "Frontend: PID $($frontend.Id) -> http://localhost:8501"
}
else {
  Write-Host ""
  Write-Host "API launched!" -ForegroundColor Yellow
  Write-Host "Backend: PID $($backend.Id) -> http://127.0.0.1:5000"
}