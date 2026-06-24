"""
Small SQLite schema upgrade helpers.

This is intentionally lightweight while the project is still local/dev.
Later, we can replace this with Flask-Migrate/Alembic.
"""

from sqlalchemy import inspect, text

from backend.database import db


def _column_names(table_name: str) -> set[str]:
    inspector = inspect(db.engine)

    if table_name not in inspector.get_table_names():
        return set()

    return {column["name"] for column in inspector.get_columns(table_name)}


def ensure_schema_upgrades():
    inspector = inspect(db.engine)
    table_names = set(inspector.get_table_names())

    if "deck" in table_names:
        deck_columns = _column_names("deck")

        if "nation" not in deck_columns:
            db.session.execute(text("ALTER TABLE deck ADD COLUMN nation VARCHAR(50)"))

        if "nation_icon" not in deck_columns:
            db.session.execute(
                text("ALTER TABLE deck ADD COLUMN nation_icon VARCHAR(100)")
            )

    if "match" in table_names:
        match_columns = _column_names("match")

        if "deck1_version_id" not in match_columns:
            db.session.execute(
                text("ALTER TABLE match ADD COLUMN deck1_version_id INTEGER")
            )

        if "deck2_version_id" not in match_columns:
            db.session.execute(
                text("ALTER TABLE match ADD COLUMN deck2_version_id INTEGER")
            )

    db.session.commit()