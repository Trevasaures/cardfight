"""The identity revision adds an empty security schema, never claims player data."""

from contextlib import closing
import sqlite3

import pytest

from backend.backup import database_summary
from backend.migrate import MigrationError, inspect_database, migrate_database
from migrations.identity_v2 import TABLES as IDENTITY_TABLES
from migrations.legacy_v1 import FROZEN_SCHEMA


def baseline_database(path):
    with closing(sqlite3.connect(path)) as connection:
        for name in FROZEN_SCHEMA["table_order"]:
            table = FROZEN_SCHEMA["tables"][name]
            connection.execute(table["create_sql"])
            for index in table["indexes"]:
                connection.execute(index["create_sql"])
        connection.execute(
            "CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY)"
        )
        connection.execute("INSERT INTO alembic_version VALUES ('0001_baseline')")
        connection.execute(
            "INSERT INTO deck(id,name,type,wins,losses,active,created_at) "
            "VALUES(42,'Preserved ownerless deck','Standard',7,3,1,'2026-01-01')"
        )
        connection.commit()


def test_identity_upgrade_rehearses_and_preserves_all_old_values(tmp_path):
    path = tmp_path / "v1.db"
    baseline_database(path)
    before = database_summary(path)
    assert inspect_database(path)["status"] == "pending"
    result = migrate_database(path, backup_dir=tmp_path / "backups", app_check=False)
    assert result["rehearsal"]["saved_values_preserved"] is True
    after = database_summary(path)
    for table in FROZEN_SCHEMA["tables"]:
        assert after["tables"][table] == before["tables"][table]
    with closing(sqlite3.connect(path)) as connection:
        for table in IDENTITY_TABLES:
            assert (
                connection.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0] == 0
            )
        assert "account_id" not in {
            row[1] for row in connection.execute("PRAGMA table_info(deck)")
        }


def test_identity_collision_is_not_adopted_and_rolls_back(tmp_path):
    path = tmp_path / "collision.db"
    baseline_database(path)
    with closing(sqlite3.connect(path)) as connection:
        connection.execute(
            "CREATE TABLE auth_account(id TEXT PRIMARY KEY, contact_email TEXT)"
        )
        connection.execute(
            "INSERT INTO auth_account VALUES('unknown','existing@example.test')"
        )
        connection.commit()
    before = database_summary(path)
    with pytest.raises(MigrationError, match="collision"):
        migrate_database(path, backup_dir=tmp_path / "backups", app_check=False)
    assert database_summary(path) == before


def test_identity_constraint_or_index_damage_fails_startup_validation(tmp_path):
    path = tmp_path / "damaged.db"
    migrate_database(path, app_check=False)
    with closing(sqlite3.connect(path)) as connection:
        connection.execute("DROP INDEX ix_auth_account_contact_email_key")
        connection.commit()
    before = database_summary(path)
    with pytest.raises(MigrationError, match="Identity index"):
        inspect_database(path, require_current=True)
    assert database_summary(path) == before
