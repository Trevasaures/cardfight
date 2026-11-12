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
$global:LASTEXITCODE = 0
$probeSource = if ($args[0] -eq '-') { $input | Out-String }
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
} elseif ($args[0] -eq '-c' -and $args[1] -eq 'import backend.app') {
  [void]$global:LauncherTestEvents.Add('python:app-preflight')
  $global:LauncherTestPreflightEnvironment = Get-LauncherTestEnvironment
  if ($global:LauncherTestScenario -in @('ApiPreflightFails', 'OwnedPreflightFails')) {
    $global:LASTEXITCODE = 1
  }
} else {
  throw 'The isolated launcher attempted an unexpected Python operation.'
}
"""


HARNESS = r"""
param([string]$ProjectRoot, [string]$Scenario, [switch]$UnsetParentApiUrl,
      [string]$PythonExecutable, [switch]$FrontendOnly, [switch]$Fresh,
      [switch]$ApiOnly, [switch]$Seed, [string]$DatabasePath)
$ErrorActionPreference = 'Stop'
$global:LauncherTestScenario = $Scenario
$global:LauncherTestEvents = [System.Collections.Generic.List[string]]::new()
$global:LauncherTestStarts = [System.Collections.Generic.List[object]]::new()
$global:LauncherTestStopped = [System.Collections.Generic.List[object]]::new()
$global:LauncherTestPreflightEnvironment = $null
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

function global:Get-LauncherTestEnvironment {
  return @{
    database_url = $env:DATABASE_URL;
    auth_mode = $env:CARDFIGHT_AUTH_MODE;
    auth_origin = $env:CARDFIGHT_AUTH_PUBLIC_ORIGIN;
  }
}
$beforeLaunchEnvironment = Get-LauncherTestEnvironment

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
  param([string]$State, [int]$LocalPort, [int]$RemotePort)
  [void]$global:LauncherTestEvents.Add("port:$LocalPort")
  $owned = $global:LauncherTestScenario -in @('OwnedBoth', 'MixedOwnership', 'OwnedPreflightFails', 'OwnerChanged')
  $row = if (($owned -or $global:LauncherTestScenario -eq 'OccupiedApi') -and $LocalPort -eq 5000) {
    [pscustomobject]@{ LocalPort = $LocalPort; RemotePort = 0; State = 'Listen'; OwningProcess = 65001 }
  } elseif (($owned -or $global:LauncherTestScenario -eq 'OccupiedFrontend') -and $LocalPort -eq 5173) {
    [pscustomobject]@{ LocalPort = $LocalPort; RemotePort = 0; State = 'Bound'; OwningProcess = 65002 }
  } elseif ($global:LauncherTestScenario -eq 'StaleConnection' -and $LocalPort -eq 5000) {
    [pscustomobject]@{ LocalPort = $LocalPort; RemotePort = 42000; State = 'Listen'; OwningProcess = 0 }
  }
  $stopped = @($global:LauncherTestStopped | ForEach-Object { $_.id })
  if ($null -ne $row -and
      $row.OwningProcess -notin $stopped -and
      -not ($row.OwningProcess -eq 65001 -and 65011 -in $stopped) -and
      (-not $PSBoundParameters.ContainsKey('State') -or $row.State -eq $State) -and
      (-not $PSBoundParameters.ContainsKey('RemotePort') -or $row.RemotePort -eq $RemotePort)) {
    return $row
  }
}

function global:Get-CimInstance {
  [CmdletBinding()]
  param([string]$ClassName, [string]$Filter)
  if ($ClassName -ne 'Win32_Process' -or $Filter -notmatch '^ProcessId\s*=\s*(\d+)$') {
    throw 'The launcher test only permits a filtered Win32_Process lookup.'
  }
  $processId = [int]$Matches[1]
  [void]$global:LauncherTestEvents.Add("process:$processId")
  $created = [datetime]::new(2026, 11, 8, 16, 0, 0)
  if ($global:LauncherTestScenario -eq 'OwnerChanged' -and
      'python:app-preflight' -in $global:LauncherTestEvents) {
    $created = $created.AddMinutes(1)
  }
  if ($processId -in @(65001, 65011)) {
    $python = Join-Path $ProjectRoot '.venv/Scripts/python.exe'
    $executable = if ($processId -eq 65001) {
      Join-Path $ProjectRoot 'test-runtime/python.exe'
    } else { $python }
    return [pscustomobject]@{
      ProcessId = $processId; ParentProcessId = $(if ($processId -eq 65001) { 65011 } else { 0 });
      CreationDate = $(if ($processId -eq 65001) { $created.AddSeconds(1) } else { $created });
      Name = 'python.exe'; ExecutablePath = $executable;
      CommandLine = '"' + $python + '" -m waitress --host=127.0.0.1 --port=5000 backend.app:app';
    }
  }
  if ($processId -eq 65002) {
    $node = Join-Path $ProjectRoot 'test-runtime/node.exe'
    $viteRoot = if ($global:LauncherTestScenario -eq 'MixedOwnership') {
      Join-Path (Split-Path -Parent $ProjectRoot) 'unrelated frontend'
    } else { Join-Path $ProjectRoot 'frontend-web' }
    $vite = Join-Path $viteRoot 'node_modules/vite/bin/vite.js'
    return [pscustomobject]@{
      ProcessId = $processId; ParentProcessId = 0; CreationDate = $created;
      Name = 'node.exe'; ExecutablePath = $node;
      CommandLine = '"' + $node + '" "' + $vite + '" --host 127.0.0.1';
    }
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
    environment = Get-LauncherTestEnvironment;
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

function global:taskkill.exe {
  if ($args.Count -ne 4 -or $args[0] -ne '/PID' -or $args[2] -ne '/T' -or $args[3] -ne '/F') {
    throw 'The test restart requires a specific process tree.'
  }
  $processId = [int]$args[1]
  [void]$global:LauncherTestEvents.Add("stop:$processId")
  [void]$global:LauncherTestStopped.Add([pscustomobject]@{ id = $processId; arguments = $args })
  $global:LASTEXITCODE = 0
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
  $launchOptions = @{ FrontendOnly = $FrontendOnly; Fresh = $Fresh; ApiOnly = $ApiOnly; Seed = $Seed }
  if ($DatabasePath) { $launchOptions.DatabasePath = $DatabasePath }
  & (Join-Path $ProjectRoot 'start.ps1') @launchOptions
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
  preflight_environment = $global:LauncherTestPreflightEnvironment;
  environment_before = $beforeLaunchEnvironment;
  environment_after = Get-LauncherTestEnvironment;
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
    existing_database = tmp_path / "existing player data.db"
    existing_database.write_bytes(b"existing database sentinel")
    player_database = workspace / "instance" / "cardfight.db"
    player_database.parent.mkdir()
    player_database.write_bytes(b"personal database sentinel")
    local_app_data = tmp_path / "isolated local app data"

    def run(
        scenario="Success", *, unset_parent=False, native_legacy=False,
        fresh=False, frontend_only=False, api_only=False, unset_fresh_env=False,
        seed=False, database_path=None,
    ):
        shell = WINDOWS_POWERSHELL if native_legacy else POWERSHELL
        environment = {
            **os.environ,
            "LOCALAPPDATA": str(local_app_data),
            "DATABASE_URL": f"sqlite:///{existing_database.as_posix()}",
            "CARDFIGHT_AUTH_MODE": "oidc-dev",
            "CARDFIGHT_AUTH_PUBLIC_ORIGIN": "http://localhost:5173",
        }
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
        if fresh:
            command.append("-Fresh")
        if frontend_only or native_legacy:
            command.append("-FrontendOnly")
        if api_only:
            command.append("-ApiOnly")
        if seed:
            command.append("-Seed")
        if database_path is not None:
            command.extend(["-DatabasePath", str(database_path)])
        if unset_fresh_env:
            for key in ("DATABASE_URL", "CARDFIGHT_AUTH_MODE", "CARDFIGHT_AUTH_PUBLIC_ORIGIN"):
                environment.pop(key)
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
                for key, value in environment.items()
                if not key.startswith("CARDFIGHT_AUTH_")
                and key != "PYTHON_DOTENV_DISABLED"
            }
            command.extend(["-PythonExecutable", sys.executable])
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
        assert existing_database.read_bytes() == b"existing database sentinel"
        assert player_database.read_bytes() == b"personal database sentinel"
        assert not local_app_data.exists()
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
    assert "--force" not in " ".join(result["starts"][1]["arguments"])
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
    assert result["preflight_environment"] == result["starts"][0]["environment"]
    assert result["starts"][0]["environment"] == result["environment_before"]
    assert result["environment_after"] == result["environment_before"]


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


def test_stale_connected_socket_does_not_block_fresh_start(run_launcher):
    result = run_launcher("StaleConnection", fresh=True)
    assert result["ok"], result["error"]
    assert [start["kind"] for start in result["starts"]] == ["api", "frontend"]
    assert not result["stopped"]


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


def test_fresh_restarts_owned_services_with_existing_local_database(run_launcher, tmp_path):
    result = run_launcher("OwnedBoth", fresh=True)
    assert result["ok"], result["error"]
    assert [start["kind"] for start in result["starts"]] == ["api", "frontend"]
    assert {stopped["id"] for stopped in result["stopped"]} == {65011, 65002}
    events = result["events"]
    for process_id in (65011, 65002):
        assert events.index("python:app-preflight") < events.index(f"stop:{process_id}")
        assert events.index(f"stop:{process_id}") < events.index("start:api")

    database = tmp_path / "isolated launcher" / "instance" / "cardfight.db"
    api, frontend = result["starts"]
    assert api["environment"] == result["preflight_environment"] == {
        "database_url": f"sqlite:///{database.as_posix()}",
        "auth_mode": "local",
        "auth_origin": "http://127.0.0.1:5173",
    }
    assert frontend["environment"] == result["environment_before"]
    assert result["environment_after"] == result["environment_before"]
    frontend_command = " ".join(frontend["arguments"])
    assert "--host 127.0.0.1" in frontend_command
    assert "--force" in frontend_command
    assert any(event.startswith("message:Frontend ready: http://127.0.0.1:5173") for event in events)


@pytest.mark.parametrize("fresh", [False, True])
def test_database_path_selects_existing_copy_and_restores_environment(
    run_launcher, tmp_path, fresh
):
    copy = tmp_path / "restored workspace.db"
    copy.write_bytes(b"disposable workspace")
    result = run_launcher(fresh=fresh, api_only=True, database_path=copy)
    assert result["ok"] is True
    expected = "sqlite:///" + copy.as_posix()
    assert result["preflight_environment"]["database_url"] == expected
    assert result["starts"][0]["environment"]["database_url"] == expected
    assert result["environment_after"] == result["environment_before"]
    assert copy.read_bytes() == b"disposable workspace"


def test_fresh_api_only_restores_initially_unset_environment(run_launcher):
    result = run_launcher("OwnedBoth", fresh=True, api_only=True, unset_fresh_env=True)
    assert result["ok"], result["error"]
    assert [start["kind"] for start in result["starts"]] == ["api"]
    assert [stopped["id"] for stopped in result["stopped"]] == [65011]
    assert "port:5173" not in result["events"]
    assert result["environment_before"] == result["environment_after"] == {
        "database_url": None, "auth_mode": None, "auth_origin": None,
    }


def test_fresh_failed_schema_preflight_leaves_existing_services_running(run_launcher):
    result = run_launcher("OwnedPreflightFails", fresh=True)
    assert result["ok"] is False
    assert "API readiness" in result["error"]
    assert "python:app-preflight" in result["events"]
    assert not result["stopped"]
    assert not result["starts"]
    assert result["environment_after"] == result["environment_before"]


def test_fresh_refuses_other_checkout_vite_before_stopping_owned_api(run_launcher):
    result = run_launcher("MixedOwnership", fresh=True)
    assert result["ok"] is False
    assert "5173" in result["error"]
    assert not result["stopped"]
    assert not result["starts"]


def test_fresh_does_not_stop_a_pid_reused_after_preflight(run_launcher):
    result = run_launcher("OwnerChanged", fresh=True, api_only=True)
    assert result["ok"] is False
    assert "python:app-preflight" in result["events"]
    assert not result["stopped"]
    assert not result["starts"]


@pytest.mark.parametrize("option, flag", [("frontend_only", "-FrontendOnly"), ("seed", "-Seed")])
def test_fresh_rejects_incompatible_flags_before_any_work(run_launcher, option, flag):
    result = run_launcher(fresh=True, **{option: True})
    assert result["ok"] is False
    assert "-Fresh" in result["error"] and flag in result["error"]
    assert not result["events"]
    assert not result["starts"]
    assert not result["stopped"]
