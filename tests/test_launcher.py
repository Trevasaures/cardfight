"""Run the real PowerShell launcher against disposable, fully mocked services."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
POWERSHELL = shutil.which("pwsh") or shutil.which("powershell")
WINDOWS_POWERSHELL = shutil.which("powershell.exe") if sys.platform == "win32" else None
pytestmark = pytest.mark.skipif(POWERSHELL is None, reason="PowerShell is unavailable")


FAKE_PYTHON = r"""
param([string]$c)
$global:LASTEXITCODE = 0
$probeSource = if ($c -eq '-') { $input | Out-String }
if ($probeSource -match 'print\(json.dumps') {
  [void]$global:LauncherTestEvents.Add('python:settings')
  if ($global:LauncherTestScenario -eq 'InvalidSettings') {
    $global:LASTEXITCODE = 1
    return
  }
  $origin = if ($global:LauncherTestScenario -eq 'CanonicalOidcOrigin') {
    'http://localhost:5173'
  } else { 'http://127.0.0.1:5173' }
  $mode = if ($global:LauncherTestScenario -eq 'CanonicalOidcOrigin') { 'oidc' } else { 'local' }
  @{ mode = $mode; origin = $origin; host = ([uri]$origin).Host } | ConvertTo-Json -Compress
} elseif ($c -eq 'import backend.app') {
  [void]$global:LauncherTestEvents.Add('python:app-preflight')
  if ($global:LauncherTestScenario -eq 'ApiPreflightFails') {
    $global:LASTEXITCODE = 1
  }
} else {
  throw 'The isolated launcher attempted an unexpected Python operation.'
}
"""


HARNESS = r"""
param([string]$ProjectRoot, [string]$Scenario, [switch]$UnsetParentApiUrl,
      [string]$PythonExecutable, [switch]$FrontendOnly)
$ErrorActionPreference = 'Stop'
$global:LauncherTestScenario = $Scenario
$global:LauncherTestEvents = [System.Collections.Generic.List[string]]::new()
$global:LauncherTestStarts = [System.Collections.Generic.List[object]]::new()
$global:LauncherTestStopped = [System.Collections.Generic.List[object]]::new()
$global:LauncherTestPython = if ($PythonExecutable) { $PythonExecutable } else {
  Join-Path $ProjectRoot 'fake-python.ps1'
}
if ($UnsetParentApiUrl) {
  Remove-Item -LiteralPath Env:VITE_CARDFIGHT_API_URL -ErrorAction SilentlyContinue
} else {
  $env:VITE_CARDFIGHT_API_URL = 'https://inherited-api.example/stale'
}
$before = [Environment]::GetEnvironmentVariable('VITE_CARDFIGHT_API_URL', 'Process')
$beforePresent = Test-Path Env:VITE_CARDFIGHT_API_URL

function global:Get-Command {
  [CmdletBinding()]
  param([string]$Name)
  if ($Name -eq 'python') {
    return [pscustomobject]@{ Source = $global:LauncherTestPython }
  }
  throw "The isolated launcher attempted to locate an unexpected command: $Name"
}

function global:Get-NetTCPConnection {
  [CmdletBinding()]
  param([string]$State, [int]$LocalPort)
  [void]$global:LauncherTestEvents.Add("port:$LocalPort")
  if (($global:LauncherTestScenario -eq 'OccupiedApi' -and $LocalPort -eq 5000) -or
      ($global:LauncherTestScenario -eq 'OccupiedFrontend' -and $LocalPort -eq 5173)) {
    return [pscustomobject]@{ LocalPort = $LocalPort; OwningProcess = 65001 }
  }
}

function global:Start-Process {
  [CmdletBinding()]
  param([string]$FilePath, [switch]$PassThru, [string]$WorkingDirectory,
        [string]$WindowStyle, [string[]]$ArgumentList,
        [string]$RedirectStandardOutput, [string]$RedirectStandardError)
  $kind = if ($FilePath -eq 'cmd.exe') { 'frontend' } else { 'api' }
  [void]$global:LauncherTestEvents.Add("start:$kind")
  [void]$global:LauncherTestStarts.Add([pscustomobject]@{
    kind = $kind; file = $FilePath; arguments = $ArgumentList;
    directory = $WorkingDirectory; window = $WindowStyle;
    api_url = [Environment]::GetEnvironmentVariable('VITE_CARDFIGHT_API_URL', 'Process')
  })
  if ($kind -eq 'frontend' -and $global:LauncherTestScenario -eq 'FrontendStartThrows') {
    throw 'The fake frontend could not start.'
  }
  $process = [pscustomobject]@{
    Id = 41000 + $global:LauncherTestStarts.Count;
    HasExited = ($kind -eq 'api' -and $global:LauncherTestScenario -eq 'ApiExits')
  }
  Add-Member -InputObject $process -MemberType ScriptMethod -Name Refresh -Value { }
  return $process
}

function global:Stop-Process {
  [CmdletBinding()]
  param([int[]]$Id, [object]$InputObject, [switch]$Force)
  [void]$global:LauncherTestStopped.Add([pscustomobject]@{ id = $Id; process = $InputObject })
}

function global:Invoke-WebRequest {
  [CmdletBinding()]
  param([string]$Uri, [switch]$UseBasicParsing, [int]$TimeoutSec)
  [void]$global:LauncherTestEvents.Add("http:$Uri")
  return [pscustomobject]@{ StatusCode = 200; Content = '{"status":"ok","service":"cardfight-api"}' }
}

function global:Invoke-RestMethod {
  [CmdletBinding()]
  param([string]$Uri, [int]$TimeoutSec)
  [void]$global:LauncherTestEvents.Add("http:$Uri")
  return [pscustomobject]@{ status = 'ok'; mode = 'local'; access = @{ workspace = $true } }
}

function global:Start-Sleep {
  [CmdletBinding()]
  param([int]$Milliseconds, [int]$Seconds)
}

function global:Write-Host {
  [CmdletBinding()]
  param([Parameter(ValueFromRemainingArguments=$true)][object[]]$Object)
  [void]$global:LauncherTestEvents.Add('message:' + ($Object -join ' '))
}

$succeeded = $true
$failure = $null
try {
  & (Join-Path $ProjectRoot 'start.ps1') -FrontendOnly:$FrontendOnly
} catch {
  $succeeded = $false
  $failure = $_.Exception.Message
}
$result = @{
  ok = $succeeded; error = $failure; before = $before;
  after = [Environment]::GetEnvironmentVariable('VITE_CARDFIGHT_API_URL', 'Process');
  before_present = $beforePresent; after_present = (Test-Path Env:VITE_CARDFIGHT_API_URL);
  starts = $global:LauncherTestStarts.ToArray();
  stopped = $global:LauncherTestStopped.ToArray();
  events = $global:LauncherTestEvents.ToArray()
}
Write-Output ('LAUNCHER_TEST_RESULT=' + ($result | ConvertTo-Json -Depth 8 -Compress))
"""


@pytest.fixture()
def run_launcher(tmp_path):
    workspace = tmp_path / "isolated launcher"
    workspace.mkdir()
    (workspace / "frontend-web").mkdir()
    shutil.copy2(PROJECT_ROOT / "start.ps1", workspace / "start.ps1")
    (workspace / "fake-python.ps1").write_text(FAKE_PYTHON, encoding="utf-8")
    harness = workspace / "harness.ps1"
    harness.write_text(HARNESS, encoding="utf-8")

    def run(scenario="Success", *, unset_parent=False, native_legacy=False):
        shell = WINDOWS_POWERSHELL if native_legacy else POWERSHELL
        environment = None
        command = [
            shell,
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(harness),
            "-ProjectRoot",
            str(workspace),
            "-Scenario",
            scenario,
        ]
        if unset_parent:
            command.append("-UnsetParentApiUrl")
        if native_legacy:
            # Run the real settings probe with isolated modules and .env. The
            # frontend-only flag skips the backend app import and its DB checks.
            for directory in (workspace / "backend", workspace / "backend" / "auth"):
                directory.mkdir()
                (directory / "__init__.py").touch()
            for relative in ("backend/config.py", "backend/auth/settings.py"):
                shutil.copy2(PROJECT_ROOT / relative, workspace / relative)
            (workspace / ".env").write_text(
                "CARDFIGHT_AUTH_MODE=oidc-dev\n"
                "CARDFIGHT_AUTH_PUBLIC_ORIGIN=http://localhost:5173\n",
                encoding="utf-8",
            )
            environment = {
                key: value
                for key, value in os.environ.items()
                if not key.startswith("CARDFIGHT_AUTH_")
                and key != "PYTHON_DOTENV_DISABLED"
            }
            command.extend(["-PythonExecutable", sys.executable, "-FrontendOnly"])
        completed = subprocess.run(
            command,
            cwd=workspace,
            env=environment,
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
        assert completed.returncode == 0, completed.stdout + completed.stderr
        output = next(
            (
                line.removeprefix("LAUNCHER_TEST_RESULT=")
                for line in completed.stdout.splitlines()
                if line.startswith("LAUNCHER_TEST_RESULT=")
            ),
            None,
        )
        assert output is not None, completed.stdout + completed.stderr
        return json.loads(output)

    return run


@pytest.mark.skipif(
    WINDOWS_POWERSHELL is None, reason="Windows PowerShell is unavailable"
)
def test_legacy_powershell_preserves_quotes_in_native_python_settings_probe(
    run_launcher,
):
    result = run_launcher(native_legacy=True)
    assert result["ok"], result["error"]
    assert [start["kind"] for start in result["starts"]] == ["frontend"]
    assert "--host localhost" in " ".join(result["starts"][0]["arguments"])
    assert any(
        event.startswith("message:Frontend ready: http://localhost:5173")
        for event in result["events"]
    )


@pytest.mark.parametrize("unset_parent", [False, True])
def test_frontend_inherits_same_origin_paths_and_parent_environment_is_restored(
    run_launcher, unset_parent
):
    result = run_launcher(unset_parent=unset_parent)
    assert result["ok"], result["error"]
    assert [start["kind"] for start in result["starts"]] == ["api", "frontend"]
    assert result["starts"][1]["api_url"] == "/"
    assert result["before"] == result["after"]
    assert result["before_present"] == result["after_present"]
    assert result["before_present"] is (not unset_parent)
    if unset_parent:
        assert result["before"] in {None, ""}
    else:
        assert result["before"] == "https://inherited-api.example/stale"
    assert all(start["window"] == "Hidden" for start in result["starts"])
    api_ready = next(
        index
        for index, event in enumerate(result["events"])
        if event.startswith("message:API ready:")
    )
    assert result["events"].index("http:http://127.0.0.1:5000/api/health") < api_ready
    assert not result["stopped"]


def test_parent_api_environment_is_restored_when_frontend_start_throws(run_launcher):
    result = run_launcher("FrontendStartThrows")
    assert result["ok"] is False
    assert "fake frontend" in result["error"]
    assert result["starts"][-1]["kind"] == "frontend"
    assert result["starts"][-1]["api_url"] == "/"
    assert result["before"] == result["after"]
    assert not any(
        event.startswith("message:Frontend ready:") for event in result["events"]
    )


@pytest.mark.parametrize("scenario", ["ApiPreflightFails", "ApiExits"])
def test_failed_api_does_not_start_frontend_or_print_ready(run_launcher, scenario):
    result = run_launcher(scenario)
    assert result["ok"] is False
    assert "API" in result["error"]
    assert not any(start["kind"] == "frontend" for start in result["starts"])
    assert not any(event.startswith("message:API ready:") for event in result["events"])
    if scenario == "ApiPreflightFails":
        assert not result["starts"]
    assert result["before"] == result["after"]


@pytest.mark.parametrize(
    "scenario,port", [("OccupiedApi", 5000), ("OccupiedFrontend", 5173)]
)
def test_occupied_port_refuses_start_without_killing_any_process(
    run_launcher, scenario, port
):
    result = run_launcher(scenario)
    assert result["ok"] is False
    assert f"Port {port} is already in use" in result["error"]
    assert not result["starts"]
    assert not result["stopped"]
    assert "python:app-preflight" not in result["events"]


def test_configured_auth_origin_selects_frontend_host_and_display_url(run_launcher):
    result = run_launcher("CanonicalOidcOrigin")
    assert result["ok"], result["error"]
    frontend = next(start for start in result["starts"] if start["kind"] == "frontend")
    assert "--host localhost" in " ".join(frontend["arguments"])
    assert any(
        event.startswith("message:Frontend ready: http://localhost:5173")
        for event in result["events"]
    )


def test_invalid_launch_configuration_starts_nothing(run_launcher):
    result = run_launcher("InvalidSettings")
    assert result["ok"] is False
    assert "Invalid launcher configuration" in result["error"]
    assert not result["starts"]
    assert not result["stopped"]
    assert not any(event.startswith("port:") for event in result["events"])
