<#
Starts the Cardfight backend and optional frontend.

Usage:
  .\start.ps1                    # run backend + React frontend
  .\start.ps1 -ApiOnly           # run only Flask backend
  .\start.ps1 -FrontendOnly      # run only React frontend
  .\start.ps1 -Seed              # seed DB before starting
  .\start.ps1 -ApiOnly -Seed     # seed DB, then run only backend
  .\start.ps1 -LegacyStreamlit   # run backend + old Streamlit frontend
#>

param(
  [switch]$Seed,
  [switch]$ApiOnly,
  [switch]$FrontendOnly,
  [switch]$LegacyStreamlit
)

$ErrorActionPreference = "Stop"

Set-Location -Path $PSScriptRoot

$env:FLASK_APP = "backend.app"
$env:FLASK_ENV = "development"
$env:VITE_CARDFIGHT_API_URL = "http://127.0.0.1:5000"

if ($Seed) {
  Write-Host "Seeding database..." -ForegroundColor Cyan
  python -m backend.seed
}

$backend = $null
$frontend = $null

if (-not $FrontendOnly) {
  Write-Host "Starting Flask backend on http://127.0.0.1:5000 ..." -ForegroundColor Green

  $backend = Start-Process powershell -PassThru -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location `"$PSScriptRoot`";",
    "`$env:FLASK_APP = 'backend.app';",
    "`$env:FLASK_ENV = 'development';",
    "python -m flask run"
  )

  Start-Sleep -Seconds 2
}

if (-not $ApiOnly) {
  if ($LegacyStreamlit) {
    Write-Host "Starting legacy Streamlit frontend on http://localhost:8501 ..." -ForegroundColor Yellow

    $frontend = Start-Process powershell -PassThru -ArgumentList @(
      "-NoExit",
      "-Command",
      "Set-Location `"$PSScriptRoot`";",
      "python -m streamlit run frontend/gui.py"
    )
  }
  else {
    Write-Host "Starting React frontend on http://localhost:5173 ..." -ForegroundColor Green

    $frontend = Start-Process powershell -PassThru -ArgumentList @(
      "-NoExit",
      "-Command",
      "Set-Location `"$PSScriptRoot\frontend-web`";",
      "`$env:VITE_CARDFIGHT_API_URL = 'http://127.0.0.1:5000';",
      "npm run dev"
    )
  }
}

Write-Host ""
Write-Host "Launched!" -ForegroundColor Yellow

if ($backend) {
  Write-Host "Backend:  PID $($backend.Id)  -> http://127.0.0.1:5000"
}

if ($frontend) {
  if ($LegacyStreamlit) {
    Write-Host "Frontend: PID $($frontend.Id) -> http://localhost:8501"
  }
  else {
    Write-Host "Frontend: PID $($frontend.Id) -> http://localhost:5173"
  }
}