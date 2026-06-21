"""
Small SQLite schema upgrade helpers.

This is intentionally lightweight while the project is still local/dev.
Later, we can replace this with Flask-Migrate/Alembic.
"""

from sqlalchemy import inspect, text

from backend.database import db


def ensure_schema_upgrades():
    inspector = inspect(db.engine)

    if "deck" not in inspector.get_table_names():
        return

    deck_columns = {column["name"] for column in inspector.get_columns("deck")}

    if "nation" not in deck_columns:
        db.session.execute(text("ALTER TABLE deck ADD COLUMN nation VARCHAR(50)"))

    if "nation_icon" not in deck_columns:
        db.session.execute(text("ALTER TABLE deck ADD COLUMN nation_icon VARCHAR(100)"))

    db.session.commit()