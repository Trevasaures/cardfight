"""Read-only startup guard. All persistent schema changes use backend.migrate."""

from contextlib import closing
from pathlib import Path
import sqlite3
from urllib.parse import urlsplit
from urllib.request import url2pathname

from backend.backup import BackupError, _read_connection
from backend.migrate import MigrationError, inspect_database

# These columns keep custom uniqueness conflicts inside one workspace.
_PRIVATE_INDEX_SCOPES = {
    "deck": "owner_account_id",
    "match": "owner_account_id",
    "acquisition_plan": "owner_account_id",
    "deck_version": "deck_id",
    "deck_card": "deck_version_id",
    "acquisition_plan_item": "plan_id",
}


def _ensure_hosted_schema(path):
    try:
        with closing(_read_connection(path)) as connection:
            connection.execute("BEGIN")
            # SQLite triggers run outside the app's owner filters. Foreign-key
            # actions can also fire triggers attached to auxiliary tables.
            trigger = connection.execute(
                "SELECT name, tbl_name FROM sqlite_master WHERE type='trigger' "
                "ORDER BY name LIMIT 1"
            ).fetchone()
            if trigger:
                name, table = trigger
                raise MigrationError(
                    f"Hosted SQLite cannot use custom trigger {name!r} on {table!r}. "
                    "Review the trigger on a separate restored copy."
                )

            for table, scope in _PRIVATE_INDEX_SCOPES.items():
                indexes = connection.execute(
                    "SELECT name FROM pragma_index_list(?) "
                    "WHERE \"unique\" = 1 AND origin = 'c' ORDER BY name",
                    (table,),
                )
                for (name,) in indexes:
                    if (table, name) == ("deck", "uq_deck_local_name"):
                        # Its local-only predicate was checked against v3 above.
                        continue
                    keys = {
                        column
                        for (column,) in connection.execute(
                            "SELECT name FROM pragma_index_xinfo(?) "
                            "WHERE \"key\" = 1 AND upper(coll) = 'BINARY'",
                            (name,),
                        )
                    }
                    if keys.isdisjoint({scope, "id"}):
                        raise MigrationError(
                            f"Hosted SQLite cannot use custom unique index {name!r} on {table!r}. "
                            f"Its key must include {scope!r} or 'id' with BINARY collation."
                        )
    except (BackupError, OSError, sqlite3.Error) as exc:
        raise MigrationError(f"Hosted SQLite schema check failed: {exc}") from exc


def ensure_schema_current(engine, *, hosted=False):
    """Refuse missing/unversioned/drifted persistent data without initializing it."""
    if engine.dialect.name != "sqlite":
        raise MigrationError("This migration baseline supports SQLite only.")
    database = engine.url.database
    if not database or database == ":memory:":
        # Disposable unit-test databases are explicitly built by their fixtures.
        return
    if database.startswith("file:"):
        if engine.url.query.get("mode") == "memory":
            return
        parts = urlsplit(database)
        if parts.netloc and parts.netloc != "localhost":
            raise MigrationError("Use a local SQLite file for the migration baseline.")
        path = Path(url2pathname(parts.path))
    else:
        path = Path(database)
    inspect_database(path, require_current=True)
    if hosted:
        _ensure_hosted_schema(path)
