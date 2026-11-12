"""Frozen workspace ownership schema for revision 0003."""

from migrations.identity_v2 import (
    validate_identity_tables,
    validate_schema as validate_v2,
)
from migrations.legacy_v1 import TABLES as V1_TABLES, SchemaError, _quote
from migrations.legacy_v1 import validate_schema as validate_workspace_schema

OWNED_TABLES = ("deck", "match", "acquisition_plan")
COPY_PREFIX = "_cardfight_v3_copy_"
OWNER_COLUMN = {
    "name": "owner_account_id",
    "type": "VARCHAR(36)",
    "nullable": True,
    "primary_key": 0,
    "default": None,
}


def _ownership_table(name):
    """Extend a frozen v1 table without importing the runtime ORM models."""
    previous = V1_TABLES[name]
    owner_constraint = f"fk_{name}_owner"
    owner_index = f"ix_{name}_owner"
    owner_key = {
        "name": owner_constraint,
        "constrained_columns": ["owner_account_id"],
        "referred_schema": None,
        "referred_table": "auth_account",
        "referred_columns": ["id"],
        "options": {"ondelete": "RESTRICT"},
    }
    create_sql = previous["create_sql"].replace(
        "\n\tPRIMARY KEY", "\n\towner_account_id VARCHAR(36),\n\tPRIMARY KEY", 1
    )
    unique_constraints = previous["unique_constraints"]
    indexes = [
        *previous["indexes"],
        {
            "name": owner_index,
            "create_sql": f"CREATE INDEX {owner_index} ON {_quote(name)} (owner_account_id)",
        },
    ]
    if name == "deck":
        create_sql = create_sql.replace(
            "UNIQUE (name)",
            "CONSTRAINT uq_deck_owner_name UNIQUE (owner_account_id, name)",
            1,
        )
        unique_constraints = [
            {"name": "uq_deck_owner_name", "column_names": ["owner_account_id", "name"]}
        ]
        indexes.append(
            {
                "name": "uq_deck_local_name",
                "create_sql": "CREATE UNIQUE INDEX uq_deck_local_name ON deck (name) WHERE owner_account_id IS NULL",
            }
        )
    create_sql = create_sql.removesuffix("\n)") + (
        f",\n\tCONSTRAINT {owner_constraint} FOREIGN KEY (owner_account_id) "
        "REFERENCES auth_account (id) ON DELETE RESTRICT\n)"
    )
    return {
        **previous,
        "create_sql": create_sql,
        "columns": [*previous["columns"], OWNER_COLUMN],
        "foreign_keys": [*previous["foreign_keys"], owner_key],
        "unique_constraints": unique_constraints,
        "indexes": indexes,
    }


WORKSPACE_TABLES = {
    **V1_TABLES,
    **{name: _ownership_table(name) for name in OWNED_TABLES},
}


def _validate_deck_unique_indexes(connection, *, ownership_schema=False):
    # Explicit unique indexes are distinct from the frozen table constraints.
    # An index lacking the owner or unique row ID can block names across owners.
    for index in connection.exec_driver_sql('PRAGMA index_list("deck")'):
        _, name, unique, origin, _ = index
        if not unique or origin != "c":
            continue
        if ownership_schema and name == "uq_deck_local_name":
            # The exact predicate was checked against the frozen definition.
            continue
        columns = {
            column[2]
            for column in connection.exec_driver_sql(
                f"PRAGMA index_info({_quote(name)})"
            )
        }
        if columns.isdisjoint({"id", "owner_account_id"}):
            raise SchemaError(
                f"Custom unique deck index {name!r} can enforce uniqueness across workspaces. "
                "Keep a verified backup and review removing the index or scoping it to owner_account_id."
            )


def validate_schema(connection):
    """Check the v3 workspace constraints and unchanged identity tables."""
    validate_workspace_schema(connection, expected_tables=WORKSPACE_TABLES)
    _validate_deck_unique_indexes(connection, ownership_schema=True)
    for name in OWNED_TABLES:
        if connection.exec_driver_sql(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
            (COPY_PREFIX + name,),
        ).first():
            raise SchemaError(
                "An incomplete ownership migration is present; restore a verified backup."
            )
    validate_identity_tables(connection)


def _rebuild_owned_table(connection, name):
    statements = (
        connection.exec_driver_sql(
            "SELECT sql FROM sqlite_master WHERE tbl_name=? "
            "AND type IN ('index','trigger') AND sql IS NOT NULL ORDER BY type,name",
            (name,),
        )
        .scalars()
        .all()
    )
    original = _quote(name)
    temporary = _quote(COPY_PREFIX + name)
    columns = ", ".join(_quote(column["name"]) for column in V1_TABLES[name]["columns"])

    # Recreate the original name directly so incoming references and views keep
    # pointing at the same table. Owner fields default to NULL for existing rows.
    connection.exec_driver_sql(f"CREATE TABLE {temporary} AS SELECT * FROM {original}")
    connection.exec_driver_sql(f"DROP TABLE {original}")
    connection.exec_driver_sql(WORKSPACE_TABLES[name]["create_sql"])
    connection.exec_driver_sql(
        f"INSERT INTO {original} ({columns}) SELECT {columns} FROM {temporary}"
    )
    connection.exec_driver_sql(f"DROP TABLE {temporary}")
    return statements


def upgrade_schema(connection):
    """Add owner relationships without assigning existing personal records."""
    validate_v2(connection)
    _validate_deck_unique_indexes(connection)
    if connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one():
        raise SchemaError(
            "Ownership migration requires foreign keys disabled before the transaction."
        )
    retained = []
    for name in OWNED_TABLES:
        retained.extend(_rebuild_owned_table(connection, name))
    for statement in retained:
        connection.exec_driver_sql(statement)
    for name in OWNED_TABLES:
        prior_indexes = {index["name"] for index in V1_TABLES[name]["indexes"]}
        for index in WORKSPACE_TABLES[name]["indexes"]:
            if index["name"] not in prior_indexes:
                connection.exec_driver_sql(index["create_sql"])
    validate_schema(connection)
