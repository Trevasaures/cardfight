"""Frozen SQLite schema bridge for the first versioned Cardfight baseline.

This module is part of revision 0001, not a reflection of current application
models. Its schema and supported historical variants must remain immutable once
released. Callers own the transaction, writer exclusion, and foreign-key mode.
"""

import json
from pathlib import Path
import re

from sqlalchemy import inspect


class SchemaError(ValueError):
    """An unrecognized or incomplete schema must not be stamped as supported."""


FROZEN_SCHEMA = json.loads(
    Path(__file__).with_name("schema_v1.json").read_text(encoding="utf-8")
)
TABLES = FROZEN_SCHEMA["tables"]
TABLE_ORDER = FROZEN_SCHEMA["table_order"]

# These were added by the old, unversioned startup helpers. No other missing
# columns are inferred, and no existing player values are rewritten.
OPTIONAL_COLUMNS = {
    "deck": {"nation", "nation_icon"},
    "match": {"deck1_version_id", "deck2_version_id"},
    "card_printing": {"image_id"},
    "acquisition_plan": {"archived_at"},
    "acquisition_plan_item": {
        "source_quantity", "removed_quantity", "confirmed_removed_quantity",
        "removal_confirmed_at",
    },
}
ZERO_COLUMNS = {"source_quantity", "removed_quantity", "confirmed_removed_quantity"}
COPY_PREFIX = "_cardfight_v1_copy_"
INCOMPLETE_TABLES = {"deck_card_crest_upgrade", "acquisition_plan_item_target_upgrade"}


def _quote(name):
    return '"' + name.replace('"', '""') + '"'


def _sql(expression):
    """Normalize insignificant SQL spelling without changing string literals."""
    tokens = re.findall(r"'(?:''|[^'])*'|\"(?:\"\"|[^\"])*\"|`[^`]*`|\[[^]]*\]|[^\s]+", expression)
    normalized = []
    # Split punctuation separately while retaining every quoted string literal.
    for token in tokens:
        pieces = re.findall(r"'(?:''|[^'])*'|\"(?:\"\"|[^\"])*\"|`[^`]*`|\[[^]]*\]|[A-Za-z_][A-Za-z_0-9]*|\d+|>=|<=|<>|!=|.", token)
        for piece in pieces:
            if piece.startswith("'"):
                normalized.append(piece)
            elif piece.startswith(('"', '`', '[')):
                normalized.append(piece[1:-1].lower())
            else:
                normalized.append(piece.lower())
    result = "".join(normalized)
    while result.startswith("(") and result.endswith(")"):
        # Only remove a wrapper enclosing the complete expression.
        depth = 0
        wrapped = True
        for index, character in enumerate(result):
            depth += (character == "(") - (character == ")")
            if depth == 0 and index != len(result) - 1:
                wrapped = False
                break
        if not wrapped:
            break
        result = result[1:-1]
    return result


def _default(value):
    return None if value is None else _sql(str(value))


def _foreign_key(key):
    return (
        tuple(key["constrained_columns"]), key.get("referred_schema"),
        key["referred_table"], tuple(key["referred_columns"]),
        tuple(sorted((name, str(value).lower()) for name, value in key.get("options", {}).items())),
    )


def _fail(table, message):
    raise SchemaError(f"Unsupported schema for {table}: {message}. No automatic inference is safe.")


def _check_table(connection, table, *, legacy, check_indexes=True, expected=None):
    inspector = inspect(connection)
    if expected is None:
        expected = TABLES[table]
    columns = {column["name"]: column for column in inspector.get_columns(table)}
    target = {column["name"]: column for column in expected["columns"]}
    absent = set(target) - set(columns)
    permitted = OPTIONAL_COLUMNS.get(table, set()) if legacy else set()
    if set(columns) - set(target) or absent - permitted:
        _fail(table, "column names differ from the supported layout")
    for name, column in columns.items():
        frozen = target[name]
        if (
            _sql(str(column["type"])) != _sql(frozen["type"])
            or bool(column["nullable"]) != frozen["nullable"]
            or bool(column["primary_key"]) != bool(frozen["primary_key"])
            or column.get("computed") is not None
            or column.get("identity") is not None
        ):
            _fail(table, f"type, nullability, or key definition differs for {name}")
        actual_default, target_default = _default(column.get("default")), _default(frozen["default"])
        historical_zero = legacy and table == "acquisition_plan_item" and name in ZERO_COLUMNS and actual_default == "0"
        if actual_default != target_default and not historical_zero:
            _fail(table, f"unexpected database default for {name}")
    primary = inspector.get_pk_constraint(table)["constrained_columns"]
    expected_primary = [column["name"] for column in expected["columns"] if column["primary_key"]]
    if primary != expected_primary:
        _fail(table, "primary key differs")
    ddl = connection.exec_driver_sql(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).scalar_one()
    if re.search(r"\b(?:AUTOINCREMENT|GENERATED|WITHOUT\s+ROWID|STRICT)\b", ddl, re.I):
        _fail(table, "unsupported table storage or generated-column options")

    actual_keys = {_foreign_key(key) for key in inspector.get_foreign_keys(table)}
    expected_keys = {_foreign_key(key) for key in expected["foreign_keys"]}
    allowed_missing_keys = set()
    if legacy:
        for key in expected_keys:
            if set(key[0]).intersection(absent) or (
                table == "match" and key[0] in {("deck1_version_id",), ("deck2_version_id",)}
            ):
                allowed_missing_keys.add(key)
    if actual_keys - expected_keys or expected_keys - actual_keys - allowed_missing_keys:
        _fail(table, "foreign keys differ")
    # Read declared UNIQUE constraints directly. SQLAlchemy's index reflection
    # warns/skips custom expression indexes, which must remain valid auxiliaries.
    actual_unique = {
        tuple(item[2] for item in connection.exec_driver_sql(
            f"PRAGMA index_info({_quote(index[1])})"
        ))
        for index in connection.exec_driver_sql(f"PRAGMA index_list({_quote(table)})")
        if index[3] == "u"
    }
    expected_unique = {tuple(item["column_names"]) for item in expected["unique_constraints"]}
    if actual_unique != expected_unique:
        _fail(table, "unique constraints differ")

    checks = {_sql(check["sqltext"]) for check in inspector.get_check_constraints(table)}
    expected_checks = {_sql(check["sqltext"]) for check in expected["checks"]}
    missing_checks = set()
    accepted_alternatives = set()
    if legacy:
        for check in expected["checks"]:
            sql = _sql(check["sqltext"])
            if any(re.search(rf"\b{re.escape(column)}\b", check["sqltext"]) for column in absent):
                missing_checks.add(sql)
        if table == "acquisition_plan_item":
            missing_checks.update({_sql("source_quantity >= 0"), _sql("removed_quantity >= 0")})
            old = _sql("required_quantity > 0")
            if old in checks:
                accepted_alternatives.add(old)
                missing_checks.add(_sql("required_quantity >= 0"))
        elif table == "deck_card":
            new = _sql("zone IN ('main','ride','g','token','other','crest')")
            old = _sql("zone IN ('main','ride','g','token','other')")
            # The original helper documented both the old CHECK and no CHECK.
            missing_checks.add(new)
            if old in checks:
                accepted_alternatives.add(old)
    if checks - expected_checks - accepted_alternatives or expected_checks - checks - missing_checks:
        _fail(table, "check constraints differ")

    if check_indexes:
        # sqlite_master retains custom/expression/partial indexes losslessly;
        # only the application-owned, frozen names have a required definition.
        for index in expected["indexes"]:
            actual = connection.exec_driver_sql(
                "SELECT tbl_name, sql FROM sqlite_master WHERE type='index' AND name=?", (index["name"],)
            ).fetchone()
            if actual is None:
                if legacy:
                    continue
                _fail(table, f"missing index {index['name']}")
            if actual[0] != table or _sql(actual[1] or "") != _sql(index["create_sql"]):
                _fail(table, f"index {index['name']} differs")


def validate_schema(connection, *, legacy=False, expected_tables=None):
    """Read-only validation against fixed v1 semantics and bounded old layouts.

    Auxiliary tables, views, indexes and triggers are retained. Existing app
    tables cannot contain unknown columns or unexpected core constraints. The
    historical deck/match-only application is the minimum supported layout.
    Later revisions can reuse the checks with their own frozen table definitions.
    """
    if connection.dialect.name != "sqlite":
        raise SchemaError("Revision 0001 supports SQLite only.")
    existing = set(inspect(connection).get_table_names())
    if existing.intersection(INCOMPLETE_TABLES) or any(name.startswith(COPY_PREFIX) for name in existing):
        raise SchemaError("An incomplete previous schema replacement is present; restore a verified backup.")
    tables = TABLES if expected_tables is None else expected_tables
    table_order = TABLE_ORDER if expected_tables is None else tables
    required = {"deck", "match"} if legacy else set(tables)
    if not required.issubset(existing):
        raise SchemaError("Required Cardfight tables are missing; initialize a new database explicitly.")
    for table in table_order:
        if table in existing:
            _check_table(connection, table, legacy=legacy, expected=tables[table])


def _new_value(table, column):
    if table == "acquisition_plan_item" and column == "source_quantity":
        return """COALESCE((
            SELECT SUM(deck_card.quantity)
            FROM acquisition_plan JOIN deck_card
              ON deck_card.deck_version_id = acquisition_plan.source_deck_version_id
            WHERE acquisition_plan.id = legacy.plan_id
              AND acquisition_plan.plan_type = 'existing_deck'
              AND deck_card.card_id = legacy.card_id
              AND COALESCE(deck_card.printing_id, -1) = COALESCE(legacy.printing_id, -1)
        ), 0)"""
    if table == "acquisition_plan_item" and column in ZERO_COLUMNS:
        return "0"
    return "NULL"


def _rebuild(connection, table):
    columns = {column["name"] for column in inspect(connection).get_columns(table)}
    objects = connection.exec_driver_sql(
        "SELECT type, name, sql FROM sqlite_master WHERE tbl_name=? "
        "AND type IN ('index','trigger') AND sql IS NOT NULL ORDER BY type,name", (table,)
    ).fetchall()
    known_indexes = {item["name"] for item in TABLES[table]["indexes"]}
    retained = [sql for kind, name, sql in objects if kind == "trigger" or name not in known_indexes]
    temporary = COPY_PREFIX + table
    # Avoid ALTER TABLE renaming: it can rewrite incoming foreign-key/view/trigger
    # references. The original name is recreated directly inside the transaction.
    connection.exec_driver_sql(f"CREATE TABLE {_quote(temporary)} AS SELECT * FROM {_quote(table)}")
    connection.exec_driver_sql(f"DROP TABLE {_quote(table)}")
    connection.exec_driver_sql(TABLES[table]["create_sql"])
    names = [column["name"] for column in TABLES[table]["columns"]]
    values = [
        "legacy." + _quote(name) if name in columns else _new_value(table, name)
        for name in names
    ]
    connection.exec_driver_sql(
        f"INSERT INTO {_quote(table)} ({', '.join(map(_quote, names))}) "
        f"SELECT {', '.join(values)} FROM {_quote(temporary)} AS legacy"
    )
    connection.exec_driver_sql(f"DROP TABLE {_quote(temporary)}")
    return retained


def upgrade_schema(connection):
    """Create/normalize the frozen baseline in the caller's existing transaction.

    Existing values, IDs, BLOBs and auxiliary schema objects are copied intact.
    Only a newly added source_quantity is inferred from matching source deck
    entries; owned_quantity and all other pre-existing values are preserved.
    """
    if connection.dialect.name != "sqlite":
        raise SchemaError("Revision 0001 supports SQLite only.")
    existing = set(inspect(connection).get_table_names())
    application_tables = existing.intersection(TABLES)
    if application_tables:
        validate_schema(connection, legacy=True)
    elif existing - {"alembic_version", "sqlite_sequence"}:
        raise SchemaError("An unrelated database cannot be initialized as Cardfight.")
    rebuild = []
    for table in TABLE_ORDER:
        if table in existing:
            try:
                _check_table(connection, table, legacy=False, check_indexes=False)
            except SchemaError:
                rebuild.append(table)
    if rebuild and connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one():
        raise SchemaError("Schema replacement requires foreign keys disabled before the caller's transaction.")
    # All source tables needed by a historical backfill exist before copying.
    for table in TABLE_ORDER:
        if table not in existing:
            connection.exec_driver_sql(TABLES[table]["create_sql"])
    retained = []
    for table in rebuild:
        retained.extend(_rebuild(connection, table))
    for statement in retained:
        connection.exec_driver_sql(statement)
    for table in TABLE_ORDER:
        for index in TABLES[table]["indexes"]:
            if connection.exec_driver_sql(
                "SELECT 1 FROM sqlite_master WHERE type='index' AND name=?", (index["name"],)
            ).first() is None:
                connection.exec_driver_sql(index["create_sql"])
    if connection.exec_driver_sql("PRAGMA foreign_key_check").first() is not None:
        raise SchemaError("The upgraded schema contains invalid references; restore the verified checkpoint.")
    validate_schema(connection)
