"""
Database setup using SQLAlchemy.
Includes the database instance for use in models and application setup.
"""

import sqlite3

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import event
from sqlalchemy.engine import Engine

db = SQLAlchemy()


@event.listens_for(Engine, "connect")
def enable_sqlite_foreign_keys(connection, _record):
    """Register once, rather than adding another listener for every app factory."""
    if not isinstance(connection, sqlite3.Connection):
        return
    # Python 3.12+ exposes autocommit. SQLite ignores this PRAGMA inside a
    # transaction, so temporarily enable it and then restore the caller's mode.
    has_autocommit = hasattr(connection, "autocommit")
    previous_autocommit = getattr(connection, "autocommit", None)
    if has_autocommit:
        connection.autocommit = True
    cursor = connection.cursor()
    try:
        cursor.execute("PRAGMA foreign_keys=ON")
    finally:
        cursor.close()
        if has_autocommit:
            connection.autocommit = previous_autocommit
