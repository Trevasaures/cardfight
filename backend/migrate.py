"""Explicit, rehearsed SQLite migrations; importing this module never starts Flask."""

import argparse
from contextlib import contextmanager
from hashlib import sha256
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError

from backend.backup import (
    BackupError, PROJECT_ROOT, _check_new_destination, _hash_value, _quote, _read_connection,
    create_backup, default_source, restore_backup, verify_backup,
)
from migrations.legacy_v1 import SchemaError, validate_schema


HEAD_REVISION = "0001_baseline"


class MigrationError(Exception):
    """Migration did not pass its safety/compatibility gates."""


def _config(connection=None):
    config = Config(str(PROJECT_ROOT / "migrations" / "alembic.ini"))
    if connection is not None:
        config.attributes.update(connection=connection, verified_workflow=True)
    return config


@contextmanager
def _read_engine(path):
    engine = create_engine("sqlite://", creator=lambda: _read_connection(path))
    try:
        with engine.connect() as connection:
            yield connection
    finally:
        engine.dispose()


def _tables(connection):
    return {row[0] for row in connection.exec_driver_sql(
        "SELECT name FROM sqlite_master WHERE type='table' "
        "AND (name NOT LIKE 'sqlite_%' OR name='sqlite_sequence')"
    )}


def _revision(connection):
    if "alembic_version" not in _tables(connection):
        return None
    columns = connection.exec_driver_sql("PRAGMA table_info(alembic_version)").fetchall()
    if (
        [row[1] for row in columns] != ["version_num"]
        or columns[0][2].upper() != "VARCHAR(32)"
        or not columns[0][3]
        or columns[0][5] != 1
    ):
        raise MigrationError("Malformed migration version table; restore a verified checkpoint.")
    rows = connection.exec_driver_sql("SELECT version_num FROM alembic_version").fetchall()
    if len(rows) != 1 or not isinstance(rows[0][0], str) or not rows[0][0]:
        raise MigrationError("Incomplete or multiple database revisions; restore a verified checkpoint.")
    revision = rows[0][0]
    try:
        found = ScriptDirectory.from_config(_config()).get_revision(revision)
    except Exception as exc:
        raise MigrationError("Unknown database revision; use matching code or a verified backup.") from exc
    if found is None or found.revision != revision:
        raise MigrationError("Unknown or abbreviated database revision; use matching code.")
    return revision


def _integrity(connection):
    if connection.exec_driver_sql("PRAGMA integrity_check").fetchall() != [("ok",)]:
        raise MigrationError("SQLite integrity check failed; retain the database for recovery.")
    if connection.exec_driver_sql("PRAGMA foreign_key_check").first() is not None:
        raise MigrationError("SQLite foreign-key check failed; retain the database for recovery.")


def _inspect_connection(connection):
    tables = _tables(connection)
    if not tables:
        return {"status": "empty", "revision": None, "head": HEAD_REVISION}
    _integrity(connection)
    revision = _revision(connection)
    if revision is None:
        validate_schema(connection, legacy=True)
        status = "unversioned"
    elif revision == HEAD_REVISION:
        validate_schema(connection)
        status = "current"
    else:
        status = "pending"
    return {"status": status, "revision": revision, "head": HEAD_REVISION}


def inspect_database(path, *, require_current=False):
    """Read existence, revision and schema without creating or modifying a file."""
    path = Path(path).expanduser().resolve()
    try:
        if not path.exists():
            _check_new_destination(path)
            result = {"status": "missing", "revision": None, "head": HEAD_REVISION}
        else:
            with _read_engine(path) as connection:
                result = _inspect_connection(connection)
        if require_current and result["status"] != "current":
            action = "baseline" if result["status"] == "unversioned" else "upgrade"
            raise MigrationError(
                f"Database schema is {result['status']}. Stop the app and run "
                f"python -m backend.migrate {action}; see docs/database-migrations.md. "
                "Startup has not changed the database."
            )
        return result
    except (BackupError, SchemaError, OSError, sqlite3.Error, SQLAlchemyError) as exc:
        raise MigrationError(f"Database schema check failed: {exc}") from exc


def _row_snapshot(connection, original=None):
    """Hash old columns by saved ID so added fields/order cannot mask data loss."""
    result = {}
    names = sorted(_tables(connection) - {"alembic_version"}) if original is None else original
    for table in names:
        info = connection.exec_driver_sql(f"PRAGMA table_info({_quote(table)})").fetchall()
        present = {row[1] for row in info}
        columns = [row[1] for row in info] if original is None else original[table]["columns"]
        if not info or not set(columns).issubset(present):
            raise MigrationError(f"Migration removed saved columns from {table}.")
        primary = sorted((row[5], row[1]) for row in info if row[5])
        order = [name for _, name in primary] or columns
        rows = connection.exec_driver_sql(
            "SELECT " + ", ".join(map(_quote, columns)) + f" FROM {_quote(table)} ORDER BY "
            + ", ".join(map(_quote, order))
        )
        digest = sha256()
        count = 0
        for row in rows:
            digest.update(b"row:")
            for value in row:
                _hash_value(digest, value)
            count += 1
        result[table] = {"columns": columns, "rows": count, "sha256": digest.hexdigest()}
    return result


def _snapshot(connection):
    schema = [tuple(row) for row in connection.exec_driver_sql(
        "SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name"
    )]
    return {
        "schema": schema,
        "rows": _row_snapshot(connection),
        "revision": _revision(connection),
        "user_version": connection.exec_driver_sql("PRAGMA user_version").scalar(),
        "application_id": connection.exec_driver_sql("PRAGMA application_id").scalar(),
    }


def _file_snapshot(path):
    with _read_engine(path) as connection:
        connection.exec_driver_sql("BEGIN")
        return _snapshot(connection)


def _apply_migrations(path, *, baseline=False, expected=None):
    """One SQLite DDL transaction, including data verification and revision stamp."""
    path = Path(path).resolve()
    created = False
    engine = None
    try:
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("xb"):
                created = True
        engine = create_engine("sqlite://", creator=lambda: sqlite3.connect(
            path.as_uri() + "?mode=rw", uri=True, timeout=5, isolation_level=None
        ))
        with engine.connect() as connection:
            # Before BEGIN: toggling this within a transaction has no effect.
            # It prevents table rebuilds from cascading or nulling incoming refs.
            connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
            connection.commit()
            connection.exec_driver_sql("BEGIN EXCLUSIVE")
            try:
                state = _inspect_connection(connection)
                if state["status"] == "unversioned" and not baseline:
                    raise MigrationError("Existing unversioned data requires the baseline command.")
                before = _snapshot(connection)
                if expected is not None and before != expected:
                    raise MigrationError("Database changed after backup. Stop app writes and retry.")
                command.upgrade(_config(connection), "head")
                validate_schema(connection)
                if _revision(connection) != HEAD_REVISION:
                    raise MigrationError("Migration did not reach the expected revision.")
                _integrity(connection)
                if _row_snapshot(connection, before["rows"]) != before["rows"]:
                    raise MigrationError("Migration changed existing saved values; changes rolled back.")
                connection.commit()
            except BaseException:
                connection.rollback()
                raise
            finally:
                connection.exec_driver_sql("PRAGMA foreign_keys=ON")
                connection.commit()
    except BaseException:
        if engine is not None:
            engine.dispose()
        if created:
            path.unlink(missing_ok=True)
        raise
    finally:
        if engine is not None:
            engine.dispose()


def _application_check(path):
    environment = os.environ.copy()
    environment["DATABASE_URL"] = f"sqlite:///{Path(path).resolve().as_uri()}?mode=ro&uri=true"
    environment["FLASK_DEBUG"] = "false"
    try:
        process = subprocess.run(
            [sys.executable, "-m", "backend.backup_check", str(path)], cwd=PROJECT_ROOT,
            env=environment, capture_output=True, text=True, timeout=180, check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise MigrationError("Migrated-copy application check exceeded 180 seconds.") from exc
    if process.returncode:
        raise MigrationError("Migrated-copy application check failed: "
                             + (process.stderr.strip() or process.stdout.strip())[-2000:])
    return json.loads(process.stdout)


def rehearse_backup(backup, *, app_check=True):
    """Upgrade a disposable restored checkpoint and verify the new app there."""
    try:
        return _rehearse_backup(backup, app_check=app_check)
    except MigrationError:
        raise
    except Exception as exc:
        raise MigrationError(f"Disposable migration rehearsal failed: {exc}") from exc


def _rehearse_backup(backup, *, app_check=True):
    with tempfile.TemporaryDirectory(prefix="cardfight-migration-") as directory:
        restored = Path(directory) / "cardfight.db"
        restore_backup(backup, restored)
        before = _file_snapshot(restored)
        state = inspect_database(restored)
        _apply_migrations(restored, baseline=state["status"] == "unversioned", expected=before)
        report = {"revision": HEAD_REVISION, "saved_values_preserved": True,
                  "table_counts": {name: data["rows"] for name, data in before["rows"].items()}}
        if app_check:
            report["application"] = _application_check(restored)
        return report


def migrate_database(path, *, baseline=False, backup_dir=None, app_check=True):
    """Back up/rehearse an existing database, then apply only if it is unchanged."""
    path = Path(path).expanduser().resolve()
    try:
        state = inspect_database(path)
        if state["status"] == "current":
            return {**state, "changed": False, "database": str(path)}
        if state["status"] == "unversioned" and not baseline:
            raise MigrationError("Existing unversioned data requires python -m backend.migrate baseline.")
        if baseline and state["status"] in {"empty", "missing"}:
            raise MigrationError("Use the upgrade command to initialize a new database.")
        report = {"database": str(path), "previous_revision": state["revision"]}
        expected = None
        if state["status"] not in {"empty", "missing"}:
            backup = create_backup(path, backup_dir or PROJECT_ROOT / "instance" / "backups")
            report["backup"] = str(backup)
            # Untouched legacy checkpoints fail the new startup guard by design.
            # Verify raw recovery here; app compatibility is checked AFTER the
            # disposable copy is migrated, avoiding a circular baseline gate.
            verify_backup(backup)
            expected = _file_snapshot(backup)
            report["rehearsal"] = rehearse_backup(backup, app_check=app_check)
        _apply_migrations(path, baseline=baseline, expected=expected)
        return {**report, **inspect_database(path, require_current=True), "changed": True}
    except MigrationError:
        raise
    except Exception as exc:
        raise MigrationError(f"Migration failed; use the retained backup for recovery: {exc}") from exc


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("status", "baseline", "upgrade"):
        subcommand = commands.add_parser(name)
        subcommand.add_argument("--database", type=Path, help="Override the configured SQLite file")
        if name == "status":
            subcommand.add_argument("--require-current", action="store_true",
                                    help="Fail unless revision and schema match this application")
        else:
            subcommand.add_argument("--backup-dir", type=Path)
    rehearsal = commands.add_parser("rehearse", help="Upgrade a disposable restored backup only")
    rehearsal.add_argument("backup", type=Path)
    arguments = parser.parse_args(argv)
    try:
        if arguments.command == "rehearse":
            result = rehearse_backup(arguments.backup)
        else:
            path = arguments.database or default_source()
            if arguments.command == "status":
                result = inspect_database(path, require_current=arguments.require_current)
            else:
                result = migrate_database(path, baseline=arguments.command == "baseline",
                                          backup_dir=arguments.backup_dir)
        print(json.dumps({"operation": arguments.command, **result}, indent=2))
        return 0
    except (MigrationError, BackupError, OSError, ValueError) as exc:
        print(f"Database migration check failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
