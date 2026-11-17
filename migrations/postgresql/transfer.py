"""Transfer durable data from a verified SQLite checkpoint to empty PostgreSQL."""

import argparse
from contextlib import closing, contextmanager
from datetime import datetime
import json
import os
from pathlib import Path
import sqlite3
import sys
from tempfile import TemporaryDirectory

from sqlalchemy import (
    Boolean, DateTime, Integer, LargeBinary, String, create_engine, func, select, text,
)
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.pool import NullPool

from backend.backup import BackupError, _quote, _read_connection, restore_backup
from backend.migrate import MigrationError, _apply_migrations, inspect_database
from backend.postgres import HEAD_REVISION, PG_CONNECTION_ARGS, _inspect_connection
from migrations.postgresql.baseline import SCHEMA


EXCLUDED_AUTH = ("auth_invitation", "auth_session", "auth_throttle", "auth_transaction")
TABLES = tuple(SCHEMA.sorted_tables)
BATCH_SIZE = 64


class TransferError(MigrationError):
    """The transfer did not meet its validation requirements."""


@contextmanager
def _restored_source(backup):
    with TemporaryDirectory(prefix="cardfight-transfer-") as directory:
        path = Path(directory) / "source.sqlite3"
        restore_backup(backup, path)
        state = inspect_database(path)
        if state["status"] in {"unversioned", "pending"}:
            _apply_migrations(path, baseline=state["status"] == "unversioned")
        with closing(_read_connection(path)) as source:
            source.execute("BEGIN")
            names = {name for (name,) in source.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )}
            expected = {table.name for table in TABLES}
            sqlite_metadata = {"alembic_version", "sqlite_sequence", "sqlite_stat1", "sqlite_stat4"}
            if names - expected - sqlite_metadata:
                raise TransferError("The SQLite checkpoint contains additional tables. Review them before transferring.")
            yield source, state["revision"]


def _convert(column, value):
    if value is None:
        return value
    kind = column.type
    if isinstance(kind, Boolean) and type(value) is int and value in (0, 1):
        return bool(value)
    if isinstance(kind, DateTime) and isinstance(value, str):
        try:
            date = datetime.fromisoformat(value)
            if date.tzinfo is None:
                return date
        except ValueError:
            pass
    if isinstance(kind, Integer) and type(value) is int and -(2**31) <= value < 2**31:
        return value
    if isinstance(kind, LargeBinary) and isinstance(value, bytes):
        return value
    if isinstance(kind, String) and isinstance(value, str) and "\0" not in value:
        if kind.length is None or len(value) <= kind.length:
            return value
    raise TransferError(f"A saved value in {column.table.name}.{column.name} cannot be represented in PostgreSQL.")


def _sqlite_rows(source, table):
    columns = ", ".join(map(_quote, table.columns.keys()))
    return source.execute(f"SELECT {columns} FROM {_quote(table.name)}")


def _count(connection, table):
    return connection.scalar(select(func.count()).select_from(table))


def _batches(source, table):
    rows = _sqlite_rows(source, table)
    while batch := rows.fetchmany(BATCH_SIZE):
        yield [
            {column.name: _convert(column, value) for column, value in zip(table.columns, row, strict=True)}
            for row in batch
        ]


def _copy_table(source, target, table):
    (primary,) = table.primary_key.columns
    count = 0
    for batch in _batches(source, table):
        target.execute(table.insert(), batch)
        # Compare by saved primary key to avoid different SQLite/PostgreSQL collations.
        expected = {row[primary.name]: row for row in batch}
        result = target.execute(select(table).where(primary.in_(expected))).mappings()
        actual = {row[primary.name]: dict(row) for row in result}
        if actual != expected:
            raise TransferError(f"PostgreSQL saved values differ in {table.name}.")
        count += len(batch)
    if _count(target, table) != count:
        raise TransferError(f"PostgreSQL row count differs in {table.name}.")
    return count


def _restart_sequence(connection, table):
    key = table.autoincrement_column
    if key is None:
        return
    next_id = max(connection.scalar(select(func.max(key))) or 0, 0) + 1
    if next_id >= 2**31:
        raise TransferError(f"There are no available generated IDs in {table.name}.")
    # Use the serial sequence owned by this column. ALTER SEQUENCE is transactional.
    sequence = connection.execute(
        text("""
            SELECT format('%I.%I', namespace.nspname, relation.relname)
            FROM pg_catalog.pg_class AS relation
            JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
            WHERE relation.oid = pg_get_serial_sequence(:table, :column)::regclass
        """),
        {"table": table.fullname, "column": key.name},
    ).scalar_one()
    connection.exec_driver_sql(f"ALTER SEQUENCE {sequence} RESTART WITH {next_id}")


def _source_counts(source, names):
    return {name: source.execute(f"SELECT count(*) FROM {_quote(name)}").fetchone()[0] for name in names}


def transfer_backup(backup, engine):
    """Import all durable data and verify every saved value before atomic commit."""
    if engine.dialect.name != "postgresql":
        raise TransferError("Select a PostgreSQL target.")
    try:
        with _restored_source(backup) as (source, source_revision), engine.begin() as target:
            target.exec_driver_sql("SET LOCAL lock_timeout = '5s'")
            target.exec_driver_sql("SELECT pg_advisory_xact_lock(507095601)")
            if _inspect_connection(target)["status"] != "current":
                raise TransferError("Initialize the target with python -m backend.postgres upgrade.")
            names = ", ".join(f'public.{_quote(table.name)}' for table in TABLES)
            target.exec_driver_sql(f"LOCK TABLE {names} IN EXCLUSIVE MODE")
            if any(_count(target, table) for table in TABLES):
                raise TransferError("The PostgreSQL target already contains rows. Select a separate empty database.")
            counts = {
                table.name: _copy_table(source, target, table)
                for table in TABLES if table.name not in EXCLUDED_AUTH
            }
            for table in TABLES:
                _restart_sequence(target, table)
            return {
                "database": target.scalar(text("SELECT current_database()")),
                "source_revision": source_revision,
                "target_revision": HEAD_REVISION,
                "table_counts": counts,
                "excluded_auth_counts": _source_counts(source, EXCLUDED_AUTH),
                "saved_values_verified": True,
            }
    except TransferError:
        raise
    except (BackupError, MigrationError, OSError, sqlite3.Error, SQLAlchemyError) as exc:
        if isinstance(exc, (BackupError, MigrationError)):
            raise TransferError(str(exc)) from exc
        # Driver errors can contain private rows or credentials.
        raise TransferError("Transfer failed. Check the target connection, privileges, and schema.") from exc


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("backup", type=Path, help="Verified SQLite checkpoint with its manifest")
    arguments = parser.parse_args(argv)
    try:
        url = make_url(os.getenv("DATABASE_URL", ""))
        if url.drivername != "postgresql+psycopg" or not url.database or not url.username:
            raise TransferError("Set DATABASE_URL explicitly to the empty PostgreSQL target.")
        engine = create_engine(url, connect_args=PG_CONNECTION_ARGS, poolclass=NullPool, hide_parameters=True)
        try:
            report = transfer_backup(arguments.backup, engine)
        finally:
            engine.dispose()
    except TransferError as exc:
        print(f"PostgreSQL transfer failed: {exc}", file=sys.stderr)
        return 1
    except (ValueError, ImportError, SQLAlchemyError):
        print("PostgreSQL transfer failed. Check DATABASE_URL and credentials.", file=sys.stderr)
        return 1
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
