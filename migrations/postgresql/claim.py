"""Back up, rehearse, and assign a local workspace to one PostgreSQL account."""

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from uuid import uuid4

from psycopg.conninfo import make_conninfo
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.pool import NullPool

from backend.backup import (
    BackupError, _backup_directory, _file_hash, _sync_file, default_backup_dir,
)
from backend.migrate import MigrationError
from backend.postgres import PG_CONNECTION_ARGS, inspect_postgres
from migrations.postgresql.ownership import PostgresOwnershipError, assign_postgres_owner


PG_URL_OPTIONS = {
    "passfile": "PGPASSFILE",
    "sslmode": "PGSSLMODE",
    "sslrootcert": "PGSSLROOTCERT",
    "sslcert": "PGSSLCERT",
    "sslkey": "PGSSLKEY",
}
PG_TARGET_OVERRIDES = ("PGSERVICE", "PGHOSTADDR", "PGOPTIONS")


def _database_url(variable):
    url = make_url(os.getenv(variable, ""))
    if (
        url.drivername != "postgresql+psycopg"
        or not all((url.host, url.port, url.username, url.database))
    ):
        raise PostgresOwnershipError(f"Set {variable} to an explicit PostgreSQL host, port, username, and database.")
    if set(url.query) - PG_URL_OPTIONS.keys() or any(
        not isinstance(value, str) for value in url.query.values()
    ):
        raise PostgresOwnershipError(f"Unsupported connection options in {variable}.")
    return url


def _client(name, directory):
    if directory is not None:
        binary = directory / (name + ".exe" if os.name == "nt" else name)
        if binary.is_file():
            return str(binary.resolve())
    else:
        binary = shutil.which(name)
        if binary:
            return binary
    raise PostgresOwnershipError(f"Could not find {name}. Supply the PostgreSQL 18 bin directory with --pg-bin.")


def _run(binary, url, *arguments):
    environment = os.environ.copy()
    # The URL selects the exact server. Keep the password out of the process arguments.
    environment.update(
        PGHOST=url.host, PGPORT=str(url.port), PGUSER=url.username, PGDATABASE=url.database
    )
    if url.password is not None:
        environment["PGPASSWORD"] = url.password
    for setting, value in url.query.items():
        environment[PG_URL_OPTIONS[setting]] = value
    try:
        subprocess.run(
            [binary, "--no-password", *arguments], env=environment,
            stdin=subprocess.DEVNULL, capture_output=True, check=True,
        )
    except (OSError, subprocess.CalledProcessError) as exc:
        # Native client diagnostics may contain hosts, usernames, and object data.
        raise PostgresOwnershipError(f"{Path(binary).stem} failed. Check credentials, client version, and database privileges.") from exc


def claim(engine, rehearsal_engine, account_id, *, backup_dir, pg_bin=None):
    """Create a fresh archive, restore it to an empty database, and assign."""
    if any(os.getenv(name) for name in PG_TARGET_OVERRIDES):
        raise PostgresOwnershipError("Unset PGSERVICE, PGHOSTADDR, and PGOPTIONS before the explicit backup and restore.")
    with engine.connect() as target, rehearsal_engine.connect() as restored:
        target_name = target.scalar(text("SELECT current_database()"))
        restored_name = restored.scalar(text("SELECT current_database()"))
        if target_name == restored_name:
            raise PostgresOwnershipError("Select a separately named PostgreSQL rehearsal database.")
    inspect_postgres(engine, require_current=True)
    if inspect_postgres(rehearsal_engine)["status"] != "empty":
        raise PostgresOwnershipError("Select a rehearsal database with an empty public schema.")

    dump, restore = (_client(name, pg_bin) for name in ("pg_dump", "pg_restore"))
    backup_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    archive = backup_dir / f"cardfight-postgres-before-owner-assignment-{timestamp}-{uuid4().hex[:8]}.dump"
    with archive.open("xb"):
        pass
    try:
        _run(dump, engine.url, "--format=custom", "--no-statistics", "--file", str(archive))
    except PostgresOwnershipError:
        archive.unlink()
        raise
    _sync_file(archive)
    digest = _file_hash(archive)
    print(f"Saved pre-assignment PostgreSQL backup at {archive}", file=sys.stderr)
    _run(
        restore, rehearsal_engine.url, "--dbname",
        make_conninfo(dbname=rehearsal_engine.url.database),
        "--single-transaction", "--no-owner", "--no-privileges", str(archive),
    )
    result = assign_postgres_owner(engine, account_id, rehearsal_engine=rehearsal_engine)
    return {**result, "backup": str(archive), "backup_sha256": digest}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--account", required=True, help="The chosen admitted Cardfight account UUID")
    parser.add_argument("--backup-dir", help="External directory for the pre-assignment dump")
    parser.add_argument("--pg-bin", type=Path, help="PostgreSQL client binaries directory")
    args = parser.parse_args(argv)
    try:
        target = _database_url("DATABASE_URL")
        copy = _database_url("CARDFIGHT_REHEARSAL_DATABASE_URL")
        backup_dir = (
            _backup_directory(args.backup_dir, "--backup-dir")
            if args.backup_dir else default_backup_dir()
        )
        options = {"connect_args": PG_CONNECTION_ARGS, "poolclass": NullPool, "hide_parameters": True}
        engine = create_engine(target, **options)
        rehearsal = create_engine(copy, **options)
        try:
            result = claim(engine, rehearsal, args.account, backup_dir=backup_dir, pg_bin=args.pg_bin)
        finally:
            engine.dispose()
            rehearsal.dispose()
    except (BackupError, MigrationError) as exc:
        print(f"PostgreSQL ownership assignment stopped. {exc}", file=sys.stderr)
        return 1
    except (OSError, SQLAlchemyError, ValueError, ImportError):
        print("PostgreSQL ownership assignment stopped. Check PostgreSQL connectivity and backup storage.", file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
