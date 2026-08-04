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

    if "acquisition_plan_item" in table_names:
        item_columns = _column_names("acquisition_plan_item")
        added_source_quantity = "source_quantity" not in item_columns

        if added_source_quantity:
            db.session.execute(
                text(
                    "ALTER TABLE acquisition_plan_item "
                    "ADD COLUMN source_quantity INTEGER NOT NULL DEFAULT 0"
                )
            )

        if "removed_quantity" not in item_columns:
            db.session.execute(
                text(
                    "ALTER TABLE acquisition_plan_item "
                    "ADD COLUMN removed_quantity INTEGER NOT NULL DEFAULT 0"
                )
            )

        if added_source_quantity:
            db.session.execute(
                text(
                    """
                    UPDATE acquisition_plan_item
                    SET source_quantity = COALESCE((
                        SELECT SUM(deck_card.quantity)
                        FROM acquisition_plan
                        JOIN deck_card
                          ON deck_card.deck_version_id =
                             acquisition_plan.source_deck_version_id
                        WHERE acquisition_plan.id =
                              acquisition_plan_item.plan_id
                          AND acquisition_plan.plan_type = 'existing_deck'
                          AND deck_card.card_id =
                              acquisition_plan_item.card_id
                          AND COALESCE(deck_card.printing_id, -1) =
                              COALESCE(acquisition_plan_item.printing_id, -1)
                    ), 0)
                    """
                )
            )
            db.session.execute(
                text(
                    """
                    UPDATE acquisition_plan_item
                    SET owned_quantity = source_quantity
                    WHERE source_quantity > 0
                      AND owned_quantity = 0
                      AND ordered_quantity = 0
                    """
                )
            )

    db.session.commit()
