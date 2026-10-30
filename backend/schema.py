"""
Small SQLite schema upgrade helpers.

This is intentionally lightweight while the project is still local/dev.
Later, we can replace this with Flask-Migrate/Alembic.
"""

import re

from sqlalchemy import inspect, text

from backend.database import db


def _column_names(table_name: str) -> set[str]:
    inspector = inspect(db.engine)

    if table_name not in inspector.get_table_names():
        return set()

    return {column["name"] for column in inspector.get_columns(table_name)}


def _upgrade_deck_card_crest_zone():
    """Expand SQLite's existing zone CHECK without changing deck entry IDs."""
    if db.engine.dialect.name != "sqlite":
        return
    with db.engine.connect() as connection:
        ddl = connection.execute(
            text(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name='deck_card'"
            )
        ).scalar()
        if not ddl:
            return
        zone_rule = re.search(r"zone\s+IN\s*\(([^)]*)\)", ddl, re.IGNORECASE)
        # Legacy tables without this check already accept the new auxiliary zone.
        if not zone_rule or "'crest'" in zone_rule.group(1).lower():
            return
        indexes = (
            connection.execute(
                text(
                    "SELECT sql FROM sqlite_master WHERE tbl_name='deck_card' "
                    "AND type IN ('index', 'trigger') AND sql IS NOT NULL"
                )
            )
            .scalars()
            .all()
        )
        columns = [
            column["name"] for column in inspect(connection).get_columns("deck_card")
        ]
        column_list = ", ".join('"' + name.replace('"', '""') + '"' for name in columns)
        next_ddl = (
            ddl[: zone_rule.start()]
            + ("zone IN ('main','ride','g','token','other','crest')")
            + ddl[zone_rule.end() :]
        )
        next_ddl = re.sub(
            r'^(CREATE\s+TABLE\s+)(?:"deck_card"|`deck_card`|\[deck_card\]|deck_card)',
            r'\1"deck_card_crest_upgrade"',
            next_ddl,
            count=1,
            flags=re.IGNORECASE,
        )
        connection.commit()
        # SQLite's legacy transaction mode does not wrap DDL automatically.
        # Explicit BEGIN keeps the copy, replacement, and index recreation atomic.
        connection.exec_driver_sql("BEGIN IMMEDIATE")
        try:
            connection.exec_driver_sql(next_ddl)
            connection.exec_driver_sql(
                f"INSERT INTO deck_card_crest_upgrade ({column_list}) "
                f"SELECT {column_list} FROM deck_card"
            )
            connection.exec_driver_sql("DROP TABLE deck_card")
            connection.exec_driver_sql(
                "ALTER TABLE deck_card_crest_upgrade RENAME TO deck_card"
            )
            for index in indexes:
                connection.exec_driver_sql(index)
            connection.commit()
        except Exception:
            connection.rollback()
            raise


def _upgrade_acquisition_zero_targets():
    """Retain original printing rows after all requested copies move elsewhere.

    SQLite cannot alter a CHECK in place. Rebuild the table transactionally,
    copying every existing column, row ID, index, and trigger unchanged.
    """
    if db.engine.dialect.name != "sqlite":
        return
    with db.engine.connect() as connection:
        ddl = connection.execute(
            text(
                "SELECT sql FROM sqlite_master "
                "WHERE type='table' AND name='acquisition_plan_item'"
            )
        ).scalar()
        if not ddl:
            return
        positive_rule = re.search(
            r'(?P<column>"required_quantity"|`required_quantity`|\[required_quantity\]|required_quantity)\s*>\s*0\b',
            ddl,
            re.IGNORECASE,
        )
        if not positive_rule:
            return
        indexes = (
            connection.execute(
                text(
                    "SELECT sql FROM sqlite_master WHERE tbl_name='acquisition_plan_item' "
                    "AND type IN ('index', 'trigger') AND sql IS NOT NULL"
                )
            )
            .scalars()
            .all()
        )
        columns = [
            column["name"]
            for column in inspect(connection).get_columns("acquisition_plan_item")
        ]
        column_list = ", ".join('"' + name.replace('"', '""') + '"' for name in columns)
        next_ddl = (
            ddl[: positive_rule.start()]
            + positive_rule.group("column")
            + " >= 0"
            + ddl[positive_rule.end() :]
        ).replace(
            "ck_acquisition_item_required_positive",
            "ck_acquisition_item_required_nonnegative",
        )
        next_ddl = re.sub(
            r'^(CREATE\s+TABLE\s+)(?:"acquisition_plan_item"|`acquisition_plan_item`|\[acquisition_plan_item\]|acquisition_plan_item)',
            r'\1"acquisition_plan_item_target_upgrade"',
            next_ddl,
            count=1,
            flags=re.IGNORECASE,
        )
        connection.commit()
        connection.exec_driver_sql("BEGIN IMMEDIATE")
        try:
            connection.exec_driver_sql(next_ddl)
            connection.exec_driver_sql(
                f"INSERT INTO acquisition_plan_item_target_upgrade ({column_list}) "
                f"SELECT {column_list} FROM acquisition_plan_item"
            )
            connection.exec_driver_sql("DROP TABLE acquisition_plan_item")
            connection.exec_driver_sql(
                "ALTER TABLE acquisition_plan_item_target_upgrade RENAME TO acquisition_plan_item"
            )
            for index in indexes:
                connection.exec_driver_sql(index)
            connection.commit()
        except Exception:
            connection.rollback()
            raise


def ensure_schema_upgrades():
    _upgrade_deck_card_crest_zone()
    _upgrade_acquisition_zero_targets()
    inspector = inspect(db.engine)
    table_names = set(inspector.get_table_names())

    if "card_printing" in table_names:
        if "image_id" not in _column_names("card_printing"):
            db.session.execute(
                text(
                    "ALTER TABLE card_printing ADD COLUMN image_id VARCHAR(64) "
                    "REFERENCES card_image(id)"
                )
            )
        db.session.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_card_printing_image ON card_printing(image_id)"
            )
        )

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

    if "acquisition_plan" in table_names:
        if "archived_at" not in _column_names("acquisition_plan"):
            db.session.execute(
                text("ALTER TABLE acquisition_plan ADD COLUMN archived_at DATETIME")
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
