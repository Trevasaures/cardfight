"""Frozen additive identity schema for revision 0002.

Never import application models here: future model changes must not change an
already released migration. Existing workspace tables are validated by v1 and
are never rewritten, assigned to an account, or seeded by this revision.
"""

import json
from pathlib import Path

from sqlalchemy import inspect

from migrations.legacy_v1 import SchemaError, _sql, validate_schema as validate_v1

FROZEN_SCHEMA = json.loads(
    Path(__file__).with_name("schema_identity_v2.json").read_text(encoding="utf-8")
)
TABLES = FROZEN_SCHEMA["tables"]


def validate_schema(connection):
    """Validate both the preserved workspace and security-critical constraints."""
    validate_v1(connection)
    existing = set(inspect(connection).get_table_names())
    if not set(TABLES).issubset(existing):
        raise SchemaError(
            "Required identity tables are missing; run the verified upgrade."
        )
    for name, expected in TABLES.items():
        actual = connection.exec_driver_sql(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (name,)
        ).scalar_one()
        if _sql(actual) != _sql(expected["create_sql"]):
            raise SchemaError(
                f"Identity table {name} differs from its reviewed schema."
            )
        for index in expected["indexes"]:
            actual = connection.exec_driver_sql(
                "SELECT sql FROM sqlite_master WHERE type='index' AND name=? AND tbl_name=?",
                (index["name"], name),
            ).scalar_one_or_none()
            if actual is None or _sql(actual) != _sql(index["create_sql"]):
                raise SchemaError(
                    f"Identity index {index['name']} is missing or differs."
                )
        if connection.exec_driver_sql(
            "SELECT 1 FROM sqlite_master WHERE type='trigger' AND tbl_name=?", (name,)
        ).first():
            raise SchemaError(
                f"Unreviewed identity trigger on {name}; retain a verified backup."
            )


def upgrade_schema(connection):
    """Add empty identity tables only, in the migration caller's transaction."""
    validate_v1(connection)
    existing = set(inspect(connection).get_table_names())
    if existing.intersection(TABLES):
        raise SchemaError(
            "Identity table name collision; no existing table will be adopted."
        )
    for name in FROZEN_SCHEMA["table_order"]:
        connection.exec_driver_sql(TABLES[name]["create_sql"])
        for index in TABLES[name]["indexes"]:
            connection.exec_driver_sql(index["create_sql"])
    validate_schema(connection)
