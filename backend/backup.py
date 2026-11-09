"""Consistent SQLite snapshots and non-destructive restore rehearsals.

This module deliberately never imports backend.app: importing it validates the
configured application database. Only the optional application check imports it, in a subprocess
pointed at a disposable, read-only restored database.
"""

import argparse
from contextlib import closing
from datetime import datetime, timezone
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
from uuid import uuid4


PROJECT_ROOT = Path(__file__).resolve().parents[1]
FORMAT_VERSION = 1
SIDECARS = ("-wal", "-shm", "-journal")


class BackupError(Exception):
    """A snapshot or restore failed validation; the live database is not changed."""


def manifest_path(backup):
    backup = Path(backup)
    return backup.with_name(backup.name + ".manifest.json")


def _file_hash(path):
    with Path(path).open("rb") as stream:
        return hashlib_stream(stream)


def hashlib_stream(stream):
    digest = sha256()
    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
        digest.update(chunk)
    return digest.hexdigest()


def _read_connection(path):
    path = Path(path).expanduser().resolve()
    if not path.is_file():
        raise BackupError(f"Database file not found: {path}")
    connection = sqlite3.connect(path.as_uri() + "?mode=ro", uri=True, timeout=5)
    connection.execute("PRAGMA query_only=ON")
    return connection


def _quote(name):
    return '"' + name.replace('"', '""') + '"'


def _hash_value(digest, value):
    # Type and byte length delimit every value, including embedded NULs/BLOBs.
    if value is None:
        tag, data = b"n", b""
    elif isinstance(value, bytes):
        tag, data = b"b", value
    elif isinstance(value, str):
        tag, data = b"s", value.encode("utf-8")
    elif isinstance(value, int):
        tag, data = b"i", str(value).encode("ascii")
    else:
        tag, data = b"f", value.hex().encode("ascii")
    digest.update(tag + str(len(data)).encode("ascii") + b":")
    digest.update(data)


def _database_summary(path):
    """Validate and fingerprint all saved rows/schema, without writing to SQLite."""
    with closing(_read_connection(path)) as connection:
        connection.execute("BEGIN")
        integrity = connection.execute("PRAGMA integrity_check").fetchall()
        if integrity != [("ok",)]:
            raise BackupError("SQLite integrity check failed; retain the source for recovery.")
        if connection.execute("PRAGMA foreign_key_check").fetchone() is not None:
            raise BackupError("SQLite foreign-key check failed; retain the source for recovery.")
        tables = [row[0] for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )]
        # Accept older Cardfight schemas too, so a pre-upgrade backup never
        # depends on running today's schema helpers first.
        if not {"deck", "match"}.issubset(tables):
            raise BackupError("Not a Cardfight database: deck and match tables are required.")
        schema = connection.execute(
            "SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name"
        ).fetchall()
        summary = {
            "schema_sha256": sha256(json.dumps(schema, ensure_ascii=True).encode()).hexdigest(),
            "user_version": connection.execute("PRAGMA user_version").fetchone()[0],
            "application_id": connection.execute("PRAGMA application_id").fetchone()[0],
            "tables": {},
        }
        for table in tables:
            columns = connection.execute(f"PRAGMA table_info({_quote(table)})").fetchall()
            primary = sorted((column[5], column[1]) for column in columns if column[5])
            order = [name for _, name in primary] or [column[1] for column in columns]
            digest = sha256()
            count = 0
            rows = connection.execute(
                f"SELECT * FROM {_quote(table)} ORDER BY " + ", ".join(map(_quote, order))
            )
            for row in rows:
                digest.update(b"row:")
                for value in row:
                    _hash_value(digest, value)
                count += 1
            summary["tables"][table] = {"rows": count, "sha256": digest.hexdigest()}
        return summary


def database_summary(path):
    """Return a validated, read-only schema/content fingerprint or a clear failure."""
    try:
        return _database_summary(path)
    except (OSError, sqlite3.Error) as exc:
        raise BackupError(f"Could not validate SQLite database: {exc}") from exc


def _check_new_destination(destination):
    destination = Path(destination).expanduser()
    if destination.is_symlink():
        raise BackupError("Restore/backup destination must be a new regular file, not a symlink.")
    destination = destination.resolve()
    for candidate in (destination, *(Path(str(destination) + suffix) for suffix in SIDECARS)):
        if candidate.exists() or candidate.is_symlink():
            raise BackupError(f"Destination or SQLite journal already exists: {candidate}")
    return destination


def _sync_file(path):
    # Windows requires a writable descriptor for FlushFileBuffers/_commit.
    # This helper is only used on the snapshot created by this invocation.
    with Path(path).open("r+b") as stream:
        os.fsync(stream.fileno())


def create_backup(source, backup_dir):
    """Snapshot committed data with SQLite's online backup API; never copy a live file."""
    source = Path(source).expanduser().resolve()
    backup_dir = Path(backup_dir).expanduser().resolve()
    created = datetime.now(timezone.utc)
    name = f"cardfight-{created.strftime('%Y%m%dT%H%M%SZ')}-{uuid4().hex[:8]}.sqlite3"
    backup = _check_new_destination(backup_dir / name)
    metadata = manifest_path(backup)
    backup_created = metadata_created = False
    try:
        with closing(_read_connection(source)) as reader:
            backup_dir.mkdir(parents=True, exist_ok=True)
            with backup.open("xb"):
                backup_created = True
            with closing(sqlite3.connect(backup.as_uri() + "?mode=rw", uri=True)) as writer:
                deadline = time.monotonic() + 60

                def progress(_status, _remaining, _total):
                    if time.monotonic() > deadline:
                        raise BackupError("Backup exceeded 60 seconds. Pause app writes and retry.")

                reader.backup(writer, pages=256, progress=progress, sleep=0.05)
                writer.execute("PRAGMA journal_mode=DELETE")
        summary = database_summary(backup)
        _sync_file(backup)
        manifest = {
            "format_version": FORMAT_VERSION,
            "created_at": created.isoformat(),
            "source_database": str(source),
            "backup_file": backup.name,
            "size_bytes": backup.stat().st_size,
            "sha256": _file_hash(backup),
            "database": summary,
        }
        with metadata.open("x", encoding="utf-8") as stream:
            metadata_created = True
            json.dump(manifest, stream, indent=2, sort_keys=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        return backup
    except BaseException as exc:
        # Only remove files reserved by this invocation, never a caller's file.
        if metadata_created:
            metadata.unlink(missing_ok=True)
        if backup_created:
            backup.unlink(missing_ok=True)
        if isinstance(exc, (OSError, sqlite3.Error)):
            raise BackupError(f"Could not create SQLite backup: {exc}") from exc
        raise


def check_backup(backup):
    """Check the frozen snapshot against its companion manifest, not the changing live DB."""
    backup = Path(backup).expanduser().resolve()
    try:
        manifest = json.loads(manifest_path(backup).read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise BackupError("Missing or unreadable backup manifest; keep the original pair together.") from exc
    if not isinstance(manifest, dict) or manifest.get("format_version") != FORMAT_VERSION:
        raise BackupError("Unsupported backup manifest format.")
    if not isinstance(manifest.get("source_database"), str) or not manifest["source_database"]:
        raise BackupError("Backup manifest is missing the original database path.")
    if manifest.get("backup_file") != backup.name:
        raise BackupError("Backup filename does not match its manifest.")
    if not backup.is_file():
        raise BackupError(f"Backup file not found: {backup}")
    if backup.stat().st_size != manifest.get("size_bytes") or _file_hash(backup) != manifest.get("sha256"):
        raise BackupError("Backup checksum/size mismatch; do not use this snapshot for recovery.")
    if database_summary(backup) != manifest.get("database"):
        raise BackupError("Backup schema or saved content differs from its manifest.")
    return manifest


def restore_backup(backup, destination):
    """Restore only to a new path and verify before reporting success; no overwrite mode."""
    backup = Path(backup).expanduser().resolve()
    manifest = check_backup(backup)
    destination = _check_new_destination(destination)
    if destination == Path(manifest["source_database"]).resolve() or destination == backup:
        raise BackupError("Restore into a separate new path, never the original source or backup.")
    created = False
    try:
        destination.parent.mkdir(parents=True, exist_ok=True)
        # The backup is a closed standalone snapshot, so a byte copy is safe.
        with destination.open("xb") as writer:
            created = True
            with backup.open("rb") as reader:
                shutil.copyfileobj(reader, writer, length=1024 * 1024)
            writer.flush()
            os.fsync(writer.fileno())
        if _file_hash(destination) != manifest["sha256"]:
            raise BackupError("Restored file checksum mismatch.")
        summary = database_summary(destination)
        if summary != manifest["database"]:
            raise BackupError("Restored schema or saved content differs from the snapshot.")
        return {"destination": str(destination), "database": summary}
    except BaseException:
        if created:
            destination.unlink(missing_ok=True)
        raise


def verify_backup(backup, *, app_check=False):
    """Rehearse a restore to disposable storage, optionally exercising the real API."""
    backup = Path(backup).expanduser().resolve()
    with tempfile.TemporaryDirectory(prefix="cardfight-restore-") as directory:
        restored = Path(directory) / "cardfight.db"
        result = restore_backup(backup, restored)
        result.pop("destination")
        result.update(backup=str(backup), restored_copy_verified=True)
        if app_check:
            environment = os.environ.copy()
            # The subprocess also overrides this before importing backend.app.
            environment["DATABASE_URL"] = f"sqlite:///{restored.as_uri()}?mode=ro&uri=true"
            environment["FLASK_DEBUG"] = "false"
            try:
                process = subprocess.run(
                    [sys.executable, "-m", "backend.backup_check", str(restored)],
                    cwd=PROJECT_ROOT, env=environment, text=True,
                    capture_output=True, timeout=180, check=False,
                )
            except subprocess.TimeoutExpired as exc:
                raise BackupError("Restored application check exceeded 180 seconds.") from exc
            if process.returncode:
                raise BackupError(
                    "Restored application check failed: "
                    + (process.stderr.strip() or process.stdout.strip())[-2000:]
                )
            result["application"] = json.loads(process.stdout)
            if database_summary(restored) != result["database"]:
                raise BackupError("Application check changed the restored database.")
        return result


def default_source():
    """Read configuration without importing the application or opening its database."""
    from dotenv import load_dotenv
    from sqlalchemy.engine import make_url

    load_dotenv(PROJECT_ROOT / ".env")
    configured = os.getenv("DATABASE_URL")
    if configured is None:
        return PROJECT_ROOT / "instance" / "cardfight.db"
    try:
        url = make_url(configured)
    except Exception as exc:
        raise BackupError("Invalid DATABASE_URL. Supply --source with the SQLite file path.") from exc
    if url.get_backend_name() != "sqlite":
        raise BackupError("This workflow supports file-backed SQLite only.")
    database = url.database
    if not database or database == ":memory:" or url.query or not Path(database).is_absolute():
        raise BackupError("Supply --source for in-memory, URI, or relative DATABASE_URL settings.")
    return Path(database)


def _backup_directory(value, setting):
    if not isinstance(value, str) or not value.strip():
        raise BackupError(f"{setting} must specify an absolute backup directory.")
    expanded = os.path.expandvars(os.path.expanduser(value.strip()))
    if re.search(r"\$(?:[A-Za-z_]\w*|\{[^}]*\})|%[^%]+%", expanded):
        raise BackupError(f"{setting} contains an unresolved environment variable.")
    if any(ord(character) < 32 for character in expanded):
        raise BackupError(f"{setting} contains an invalid path character.")
    try:
        directory = Path(expanded)
        if not directory.is_absolute():
            raise BackupError(f"{setting} must specify an absolute backup directory.")
        directory = directory.resolve()
        if directory.is_relative_to(PROJECT_ROOT.resolve()):
            raise BackupError(f"{setting} must point outside the Cardfight project.")
        if directory.exists() and not directory.is_dir():
            raise BackupError(f"{setting} must point to a directory, not a file.")
        return directory
    except (OSError, ValueError, RuntimeError) as exc:
        raise BackupError(f"{setting} is not a valid backup directory: {exc}") from exc


def default_backup_dir():
    """Resolve external backup storage without importing Flask or creating it."""
    from dotenv import dotenv_values

    setting = "CARDFIGHT_BACKUP_DIR"
    if setting in os.environ:
        return _backup_directory(os.environ[setting], setting)
    try:
        configuration = dotenv_values(PROJECT_ROOT / ".env", interpolate=False)
    except OSError as exc:
        raise BackupError(f"Could not read backup directory configuration: {exc}") from exc
    if setting in configuration:
        return _backup_directory(configuration[setting], setting)
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA", str(Path.home() / "AppData" / "Local"))
        destination = Path(base) / "Cardfight" / "backups"
        return _backup_directory(str(destination), "LOCALAPPDATA backup location")
    base = os.environ.get("XDG_STATE_HOME", str(Path.home() / ".local" / "state"))
    destination = Path(base) / "cardfight" / "backups"
    return _backup_directory(str(destination), "XDG_STATE_HOME backup location")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create", help="Create a consistent SQLite backup and manifest")
    create.add_argument("--source", type=Path, help="Override configured SQLite database path")
    create.add_argument("--backup-dir", type=Path,
                        help="Override CARDFIGHT_BACKUP_DIR or the per-user backup directory")
    verify = commands.add_parser("verify", help="Restore and verify a disposable copy")
    verify.add_argument("backup", type=Path)
    verify.add_argument("--app-check", action="store_true", help="Also read restored data through Flask")
    restore = commands.add_parser("restore", help="Restore only to a new database file")
    restore.add_argument("backup", type=Path)
    restore.add_argument("--destination", type=Path, required=True)
    arguments = parser.parse_args(argv)
    try:
        if arguments.command == "create":
            backup_dir = arguments.backup_dir if arguments.backup_dir is not None else default_backup_dir()
            backup = create_backup(arguments.source or default_source(), backup_dir)
            result = {"backup": str(backup), "manifest": str(manifest_path(backup)),
                      "database": check_backup(backup)["database"]}
        elif arguments.command == "verify":
            result = verify_backup(arguments.backup, app_check=arguments.app_check)
        else:
            result = restore_backup(arguments.backup, arguments.destination)
        print(json.dumps({"status": "ok", "operation": arguments.command, **result}, indent=2))
        return 0
    except (BackupError, OSError, sqlite3.Error, ValueError) as exc:
        print(f"Backup/restore failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
