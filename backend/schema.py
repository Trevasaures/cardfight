"""Read-only startup guard. All persistent schema changes use backend.migrate."""

from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import url2pathname

from backend.migrate import MigrationError, inspect_database


def ensure_schema_current(engine):
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
