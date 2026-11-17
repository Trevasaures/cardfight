"""Rehearse and assign a legacy workspace on PostgreSQL."""

from datetime import datetime
from hashlib import sha256
import json
from uuid import UUID

from sqlalchemy import String, func, or_, select
from sqlalchemy.exc import SQLAlchemyError

from backend.backup import _hash_value
from backend.migrate import MigrationError
from backend.postgres import HEAD_REVISION, _inspect_connection
from migrations.postgresql.baseline import SCHEMA

TABLES = tuple(SCHEMA.sorted_tables)
OWNED_ROOTS = tuple(
    SCHEMA.tables[f"public.{name}"] for name in ("deck", "match", "acquisition_plan")
)
DECK, MATCH, PLAN = OWNED_ROOTS
VERSION = SCHEMA.tables["public.deck_version"]
ACCOUNT = SCHEMA.tables["public.auth_account"]


class PostgresOwnershipError(MigrationError):
    """The selected PostgreSQL workspace could not be assigned safely."""


def _account_uuid(account_id):
    try:
        return str(UUID(str(account_id)))
    except ValueError as exc:
        raise PostgresOwnershipError(
            "Provide the exact UUID of the selected account."
        ) from exc


def _database_name(connection):
    return connection.scalar(select(func.current_database()))


def _require_postgres(engine):
    if engine.dialect.name != "postgresql":
        raise PostgresOwnershipError("Select an initialized PostgreSQL database.")


def _lock_workspace(connection):
    # Take fresh reads after the lock, even when the role defaults to repeatable read.
    connection.exec_driver_sql("SET TRANSACTION ISOLATION LEVEL READ COMMITTED")
    connection.exec_driver_sql("SET LOCAL lock_timeout = '5s'")
    connection.exec_driver_sql("SELECT pg_advisory_xact_lock(507095601)")
    names = ", ".join(f'public."{table.name}"' for table in TABLES)
    connection.exec_driver_sql(
        f"LOCK TABLE public.alembic_version, {names} IN EXCLUSIVE MODE"
    )
    if _inspect_connection(connection)["status"] != "current":
        raise PostgresOwnershipError("Select a current PostgreSQL Cardfight schema.")


def _fingerprint(connection, account_id=None):
    """Return saved-row digests and the digests expected after assignment."""
    saved, projected, counts = {}, {}, {}
    for table in TABLES:
        (primary_key,) = table.primary_key.columns
        order = (
            primary_key.collate("C")
            if isinstance(primary_key.type, String)
            else primary_key
        )
        primary = sha256()
        assigned = sha256()
        owner = table.c.get("owner_account_id")
        index = table.columns.keys().index(owner.name) if owner is not None else None
        rows = connection.execute(
            select(table).order_by(order).execution_options(yield_per=64)
        )
        count = 0
        for row in rows:
            for position, original in enumerate(row):
                value = (
                    original.isoformat() if isinstance(original, datetime) else original
                )
                if type(value) is bool:
                    value = int(value)
                _hash_value(primary, value)
                if account_id is not None:
                    replacement = (
                        account_id if position == index and value is None else value
                    )
                    _hash_value(assigned, replacement)
            count += 1
        saved[table.name] = primary.hexdigest()
        projected[table.name] = (
            assigned.hexdigest() if account_id is not None else saved[table.name]
        )
        counts[table.name] = count
    return saved, projected, counts


def _require_admitted_account(connection, account_id):
    status = connection.scalar(
        select(ACCOUNT.c.status).where(ACCOUNT.c.id == account_id)
    )
    if status != "admitted":
        raise PostgresOwnershipError(
            "Select an admitted account UUID already present in this workspace."
        )

    existing = DECK.alias("assigned_deck")
    conflict = (
        select(DECK.c.id)
        .join(existing, existing.c.name == DECK.c.name)
        .where(
            DECK.c.owner_account_id.is_(None), existing.c.owner_account_id == account_id
        )
        .limit(1)
    )
    if connection.scalar(conflict) is not None:
        raise PostgresOwnershipError(
            "A legacy deck name already exists in the selected account. Resolve the duplicate name before assigning."
        )


def _verify_relationships(connection, account_id):
    # Deck versions inherit their deck's owner. Deck cards and acquisition
    # items have no private links outside their owning parent.
    relationships = (
        (
            MATCH,
            ("deck1_id", "deck2_id", "winner_id", "first_player_id"),
            ("deck1_version_id", "deck2_version_id"),
        ),
        (PLAN, ("deck_id",), ("deck_version_id", "source_deck_version_id")),
    )
    for table, deck_keys, version_keys in relationships:
        links = [table.join(DECK, table.c[key] == DECK.c.id) for key in deck_keys] + [
            table.join(VERSION, table.c[key] == VERSION.c.id).join(
                DECK, VERSION.c.deck_id == DECK.c.id
            )
            for key in version_keys
        ]
        for link in links:
            parent_owner = table.c.owner_account_id
            deck_owner = DECK.c.owner_account_id
            mismatch = (
                select(table.c.id)
                .select_from(link)
                .where(
                    or_(parent_owner.is_(None), deck_owner.is_(None)),
                    func.coalesce(parent_owner, account_id).is_distinct_from(
                        func.coalesce(deck_owner, account_id)
                    ),
                )
                .limit(1)
            )
            if connection.scalar(mismatch) is not None:
                raise PostgresOwnershipError(
                    f"Assigning ownership would leave a cross-account relationship in {table.name}."
                )


def _apply_assignment(connection, account_id, *, expected_fingerprint=None):
    _lock_workspace(connection)
    _require_admitted_account(connection, account_id)
    before, projected, counts = _fingerprint(connection, account_id)
    checkpoint = sha256(
        json.dumps([before, counts], sort_keys=True).encode()
    ).hexdigest()
    if expected_fingerprint is not None and checkpoint != expected_fingerprint:
        raise PostgresOwnershipError(
            "The target differs from its restored rehearsal database. Stop app writes and take a new backup."
        )

    _verify_relationships(connection, account_id)
    assigned = {}
    for table in OWNED_ROOTS:
        result = connection.execute(
            table.update()
            .where(table.c.owner_account_id.is_(None))
            .values(owner_account_id=account_id)
        )
        assigned[table.name] = result.rowcount

    after, _, after_counts = _fingerprint(connection)
    if projected != after or counts != after_counts:
        raise PostgresOwnershipError(
            "Ownership assignment changed saved values outside the expected owner fields."
        )
    return {
        "account_id": account_id,
        "assigned_counts": assigned,
        "table_counts": counts,
        "database": _database_name(connection),
        "revision": HEAD_REVISION,
        "source_fingerprint": checkpoint,
        "saved_values_preserved": True,
        "related_records_verified": True,
        "changed": any(assigned.values()),
    }


def rehearse_postgres_owner(engine, account_id):
    """Attempt assignment on the restored database and always roll it back."""
    account_id = _account_uuid(account_id)
    _require_postgres(engine)
    try:
        with engine.connect() as connection:
            transaction = connection.begin()
            try:
                report = _apply_assignment(connection, account_id)
                return {**report, "changed": False}
            finally:
                transaction.rollback()
    except SQLAlchemyError as exc:
        raise PostgresOwnershipError(
            "Could not rehearse ownership. Check the PostgreSQL schema, privileges, and active writers."
        ) from exc


def assign_postgres_owner(engine, account_id, *, rehearsal_engine):
    """Commit only if a distinct restored database passes the same assignment."""
    account_id = _account_uuid(account_id)
    _require_postgres(engine)
    _require_postgres(rehearsal_engine)
    try:
        with engine.connect() as target, rehearsal_engine.connect() as copy:
            if _database_name(target) == _database_name(copy):
                raise PostgresOwnershipError(
                    "Use a separate, distinctly named restored PostgreSQL database."
                )
        rehearsal = rehearse_postgres_owner(rehearsal_engine, account_id)
        with engine.begin() as target:
            report = _apply_assignment(
                target, account_id, expected_fingerprint=rehearsal["source_fingerprint"]
            )
        return {**report, "rehearsal": rehearsal}
    except SQLAlchemyError as exc:
        raise PostgresOwnershipError(
            "Could not assign ownership. Check the PostgreSQL schema, privileges, and active writers."
        ) from exc
