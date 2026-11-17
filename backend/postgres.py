"""Inspect or initialize Cardfight's PostgreSQL schema explicitly."""

import argparse
import json
import os
import sys

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from dotenv import load_dotenv
from sqlalchemy import CheckConstraint, UniqueConstraint, create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.pool import NullPool

from backend.config import DEFAULT_DATABASE_URL, PROJECT_ROOT
from backend.migrate import MigrationError
from migrations.postgresql.baseline import SCHEMA


HEAD_REVISION = "0001_postgresql"
POSTGRES_MAJOR = 18
PUBLIC = SCHEMA.schema
PG_CONNECTION_ARGS = {
    "connect_timeout": 5,
    # Workspace dates use Central wall time. Identity supplies naive UTC explicitly.
    "options": "-csearch_path=public -cTimeZone=America/Chicago",
}


def _require_match(actual, expected, description):
    if actual != expected:
        raise MigrationError(f"PostgreSQL schema drift in {description}.")


def _columns(columns, dialect):
    return {
        name: (column_type.compile(dialect=dialect).upper(), nullable)
        for name, column_type, nullable in columns
    }


def _validate_constraints(connection, inspector, tables):
    names = [table.name for table in tables]
    primaries = inspector.get_multi_pk_constraint(schema=PUBLIC, filter_names=names)
    foreign_keys = inspector.get_multi_foreign_keys(
        schema=PUBLIC, filter_names=names, postgresql_ignore_search_path=True
    )
    unique = inspector.get_multi_unique_constraints(schema=PUBLIC, filter_names=names)
    checks = inspector.get_multi_check_constraints(schema=PUBLIC, filter_names=names)
    indexes = inspector.get_multi_indexes(schema=PUBLIC, filter_names=names)
    for table in tables:
        key = (PUBLIC, table.name)
        primary = tuple(column.name for column in table.primary_key)
        _require_match(tuple(primaries[key]["constrained_columns"]), primary, f"{table.name} primary key")
        _require_match(
            {
                (tuple(fk["constrained_columns"]), fk["referred_schema"], fk["referred_table"],
                 tuple(fk["referred_columns"]), fk["options"].get("ondelete", "NO ACTION"))
                for fk in foreign_keys[key]
            },
            {
                (tuple(fk.column_keys), PUBLIC, fk.referred_table.name,
                 tuple(element.column.name for element in fk.elements), fk.ondelete or "NO ACTION")
                for fk in table.foreign_key_constraints
            },
            f"{table.name} foreign keys",
        )
        _require_match(
            {tuple(item["column_names"]) for item in unique[key]},
            {tuple(item.columns.keys()) for item in table.constraints if isinstance(item, UniqueConstraint)},
            f"{table.name} unique constraints",
        )
        _require_match(
            {item["name"] for item in checks[key]},
            {item.name for item in table.constraints if isinstance(item, CheckConstraint)},
            f"{table.name} check constraints",
        )
        reflected_indexes = {item["name"]: item for item in indexes[key] if not item.get("duplicates_constraint")}
        _require_match(set(reflected_indexes), {index.name for index in table.indexes}, f"{table.name} indexes")
        for index in table.indexes:
            item = reflected_indexes[index.name]
            predicate = item.get("dialect_options", {}).get("postgresql_where")
            expected = index.dialect_options["postgresql"].get("where")
            expected = expected.compile(dialect=connection.dialect, compile_kwargs={"include_table": False}) if expected is not None else None
            _require_match(
                (item["unique"], tuple(item["column_names"]), predicate.strip("()") if predicate else None),
                (index.unique, tuple(index.columns.keys()), str(expected) if expected is not None else None),
                f"{table.name}.{index.name}",
            )


def _validate_schema(connection, inspector):
    tables = SCHEMA.sorted_tables
    _require_match(
        set(inspector.get_table_names(schema=PUBLIC)),
        {table.name for table in tables} | {"alembic_version"},
        "public tables",
    )
    unsafe_table = connection.exec_driver_sql("""
        SELECT relation.relname
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public' AND (
            relation.relrowsecurity OR EXISTS (
                SELECT FROM pg_catalog.pg_trigger AS trigger
                WHERE trigger.tgrelid = relation.oid AND NOT trigger.tgisinternal
            )
            OR EXISTS (
                SELECT FROM pg_catalog.pg_constraint AS constraint_info
                WHERE constraint_info.conrelid = relation.oid
                    AND (NOT constraint_info.convalidated OR NOT constraint_info.conenforced)
            )
        )
        LIMIT 1
    """).scalar()
    if unsafe_table:
        raise MigrationError(f"PostgreSQL has custom triggers, row security, or an unvalidated constraint on {unsafe_table}.")
    reflected = inspector.get_multi_columns(schema=PUBLIC, filter_names=[table.name for table in tables])
    for table in tables:
        columns = reflected[(PUBLIC, table.name)]
        _require_match(
            _columns(((item["name"], item["type"], item["nullable"]) for item in columns), connection.dialect),
            _columns(((column.name, column.type, column.nullable) for column in table.columns), connection.dialect),
            f"{table.name} columns",
        )
        if table.autoincrement_column is not None:
            name = table.autoincrement_column.name
            generated = next(item for item in columns if item["name"] == name)
            owns_default = connection.execute(
                text("""
                    SELECT pg_get_expr(definition.adbin, definition.adrelid) =
                        format('nextval(%L::regclass)',
                            pg_get_serial_sequence(:table, :column)::regclass::text)
                    FROM pg_catalog.pg_attrdef AS definition
                    JOIN pg_catalog.pg_attribute AS attribute
                        ON attribute.attrelid = definition.adrelid AND attribute.attnum = definition.adnum
                    WHERE definition.adrelid = to_regclass(:table) AND attribute.attname = :column
                """),
                {"table": table.fullname, "column": name},
            ).scalar()
            if not generated.get("autoincrement") or not owns_default:
                raise MigrationError(f"PostgreSQL schema drift in the generated ID for {table.name}.")
    _validate_constraints(connection, inspector, tables)


def _inspect_connection(connection):
    if connection.dialect.server_version_info[0] != POSTGRES_MAJOR:
        raise MigrationError(f"Cardfight requires PostgreSQL {POSTGRES_MAJOR} for this baseline.")
    inspector = inspect(connection)
    migration = MigrationContext.configure(connection, opts={"version_table_schema": PUBLIC})
    revisions = migration.get_current_heads()
    if not revisions:
        if not (
            inspector.get_table_names(schema=PUBLIC)
            or inspector.get_view_names(schema=PUBLIC)
            or inspector.get_materialized_view_names(schema=PUBLIC)
            or inspector.get_sequence_names(schema=PUBLIC)
            or inspector.get_foreign_table_names(schema=PUBLIC)
        ):
            return {"status": "empty", "revision": None, "head": HEAD_REVISION}
        raise MigrationError("PostgreSQL has schema objects without a Cardfight revision. Select a target with an empty public schema.")
    if revisions != (HEAD_REVISION,):
        raise MigrationError("PostgreSQL has an unsupported Cardfight revision.")
    _validate_schema(connection, inspector)
    return {"status": "current", "revision": HEAD_REVISION, "head": HEAD_REVISION}


def inspect_postgres(engine, *, require_current=False):
    """Check a PostgreSQL database without granting startup a write path."""
    try:
        with engine.begin() as connection:
            connection.exec_driver_sql("SET TRANSACTION READ ONLY")
            result = _inspect_connection(connection)
    except SQLAlchemyError as exc:
        raise MigrationError("Could not inspect PostgreSQL. Check the connection and schema privileges.") from exc
    if require_current and result["status"] != "current":
        raise MigrationError("PostgreSQL schema is empty. Run python -m backend.postgres upgrade first.")
    return result


def upgrade_postgres(engine):
    """Create the baseline in an empty target, with one transaction per attempt."""
    with engine.begin() as connection:
        connection.exec_driver_sql("SET LOCAL lock_timeout = '5s'")
        connection.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": 507095601})
        before = _inspect_connection(connection)
        if before["status"] == "current":
            return {**before, "changed": False}
        config = Config(str(PROJECT_ROOT / "migrations" / "postgresql" / "alembic.ini"))
        config.attributes.update(connection=connection, verified_workflow=True)
        command.upgrade(config, HEAD_REVISION)
        return {**_inspect_connection(connection), "changed": True}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    subcommands = parser.add_subparsers(dest="operation", required=True)
    status = subcommands.add_parser("status", help="Inspect the PostgreSQL schema read-only")
    status.add_argument("--require-current", action="store_true")
    subcommands.add_parser("upgrade", help="Initialize the current schema on an empty PostgreSQL database")
    arguments = parser.parse_args(argv)
    try:
        load_dotenv(PROJECT_ROOT / ".env")
        url = make_url(os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL))
        if url.drivername != "postgresql+psycopg" or not url.database or not url.username:
            raise MigrationError("Set DATABASE_URL to a postgresql+psycopg URL with a database and username.")
        engine = create_engine(url, connect_args=PG_CONNECTION_ARGS, poolclass=NullPool)
        try:
            if arguments.operation == "upgrade":
                result = upgrade_postgres(engine)
            else:
                result = inspect_postgres(engine, require_current=arguments.require_current)
        finally:
            engine.dispose()
    except MigrationError as exc:
        print(f"PostgreSQL schema check failed: {exc}", file=sys.stderr)
        return 1
    except (SQLAlchemyError, ImportError, ValueError):
        # Driver connection failures may include parts of the supplied URL.
        print("Could not run the PostgreSQL command. Check DATABASE_URL, credentials, and schema privileges.", file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
