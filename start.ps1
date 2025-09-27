<#
Starts backend (Flask) and frontend (Streamlit) together.
Usage:
  .\start.ps1                # just run
  .\start.ps1 -Seed          # seed DB before starting
#>

param(
  [switch]$Seed
)

$ErrorActionPreference = "Stop"

# Ensure we’re at repo root
Set-Location -Path $PSScriptRoot

# Environment
$env:FLASK_APP  = "backend.app"
$env:FLASK_ENV  = "development"
# If your API runs elsewhere, set CARDFIGHT_API_URL; otherwise the frontend defaults to 127.0.0.1:5000
# $env:CARDFIGHT_API_URL = "http://127.0.0.1:5000"

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
  "$env:FLASK_APP = 'backend.app';",
  "$env:FLASK_ENV = 'development';",
  "python -m flask run"
)

Start-Sleep -Seconds 1

# Start frontend (Streamlit) in a new PowerShell window
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