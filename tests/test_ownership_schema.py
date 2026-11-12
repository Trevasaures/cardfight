"""Exercise the frozen ownership migration through the guarded SQLite workflow."""

from contextlib import closing
import sqlite3

import pytest

from backend.migrate import MigrationError, inspect_database, migrate_database
from migrations.identity_v2 import FROZEN_SCHEMA as IDENTITY_SCHEMA
from migrations.legacy_v1 import FROZEN_SCHEMA as BASELINE_SCHEMA

OWNER_A = "11111111-1111-4111-8111-111111111111"
OWNER_B = "22222222-2222-4222-8222-222222222222"
STAMP = "2026-01-01 12:00:00"


def _insert_account(connection, account_id):
    connection.execute(
        "INSERT INTO auth_account(id,display_name,status,role,auth_version,"
        "admission_epoch,created_at,updated_at) "
        "VALUES (?, 'Fixture account', 'admitted', 'member', 1, 'test-epoch', ?, ?)",
        (account_id, STAMP, STAMP),
    )


def _legacy_rows(connection):
    snapshots = {
        "deck": "SELECT id,name,type,wins,losses,active,created_at FROM deck ORDER BY id",
        "match": 'SELECT id,deck1_id,deck2_id,winner_id,notes,date_played FROM "match" ORDER BY id',
        "acquisition_plan": "SELECT id,name,deck_id,notes,updated_at FROM acquisition_plan ORDER BY id",
        "auth_account": "SELECT * FROM auth_account ORDER BY id",
    }
    return {name: connection.execute(sql).fetchall() for name, sql in snapshots.items()}


def _identity_database(path):
    with closing(sqlite3.connect(path)) as connection:
        connection.execute("PRAGMA foreign_keys=ON")
        for schema in (BASELINE_SCHEMA, IDENTITY_SCHEMA):
            for name in schema["table_order"]:
                table = schema["tables"][name]
                connection.execute(table["create_sql"])
                for index in table["indexes"]:
                    connection.execute(index["create_sql"])
        connection.execute(
            "CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY)"
        )
        connection.execute("INSERT INTO alembic_version VALUES ('0002_identity')")
        connection.executemany(
            "INSERT INTO deck(id,name,type,wins,losses,active,created_at) "
            "VALUES (?, ?, 'Standard', ?, ?, 1, ?)",
            [(11, "Fixture deck", 7, 3, STAMP), (12, "Fixture opponent", 2, 8, STAMP)],
        )
        connection.execute(
            'INSERT INTO "match"(id,deck1_id,deck2_id,winner_id,notes,date_played) '
            "VALUES (25, 11, 12, 11, 'Saved history', ?)",
            (STAMP,),
        )
        connection.execute(
            "INSERT INTO acquisition_plan(id,name,plan_type,list_source,status,build_mode,"
            "deck_id,notes,created_at,updated_at) VALUES "
            "(31, 'Saved plan', 'new_build', 'empty', 'planning', 'physical', 11, 'Saved notes', ?, ?)",
            (STAMP, STAMP),
        )
        _insert_account(connection, OWNER_A)
        connection.commit()
        return _legacy_rows(connection)


def test_ownership_upgrade_preserves_legacy_data_without_claiming_an_account(tmp_path):
    path = tmp_path / "identity.db"
    saved = _identity_database(path)
    assert inspect_database(path)["revision"] == "0002_identity"
    result = migrate_database(path, backup_dir=tmp_path / "backups", app_check=False)

    assert result["revision"] == "0003_ownership"
    assert result["rehearsal"]["saved_values_preserved"] is True
    with closing(sqlite3.connect(path)) as connection:
        connection.execute("PRAGMA foreign_keys=ON")
        assert _legacy_rows(connection) == saved
        for table in ("deck", "match", "acquisition_plan"):
            owners = connection.execute(
                f'SELECT owner_account_id FROM "{table}"'
            ).fetchall()
            assert owners and all(owner is None for (owner,) in owners)
            with pytest.raises(sqlite3.IntegrityError, match="FOREIGN KEY"):
                connection.execute(
                    f'UPDATE "{table}" SET owner_account_id=?', (OWNER_B,)
                )
            connection.execute(f'UPDATE "{table}" SET owner_account_id=?', (OWNER_A,))
        with pytest.raises(sqlite3.IntegrityError, match="FOREIGN KEY"):
            connection.execute("DELETE FROM auth_account WHERE id=?", (OWNER_A,))
        assert connection.execute("PRAGMA foreign_key_check").fetchall() == []


def test_deck_name_uniqueness_is_partitioned_by_owner_and_local_workspace(tmp_path):
    path = tmp_path / "new.db"
    migrate_database(path, app_check=False)
    with closing(sqlite3.connect(path)) as connection:
        connection.execute("PRAGMA foreign_keys=ON")
        _insert_account(connection, OWNER_A)
        _insert_account(connection, OWNER_B)
        insert = (
            "INSERT INTO deck(name,type,wins,losses,active,created_at,owner_account_id) "
            "VALUES ('Shared spelling', 'Standard', 0, 0, 1, ?, ?)"
        )
        for owner in (None, OWNER_A, OWNER_B):
            connection.execute(insert, (STAMP, owner))
            with pytest.raises(sqlite3.IntegrityError, match="UNIQUE"):
                connection.execute(insert, (STAMP, owner))
        assert connection.execute("SELECT COUNT(*) FROM deck").fetchone() == (3,)


def test_ownership_revision_rejects_drifted_local_name_index(tmp_path):
    path = tmp_path / "drifted.db"
    migrate_database(path, app_check=False)
    with closing(sqlite3.connect(path)) as connection:
        connection.execute("DROP INDEX uq_deck_local_name")
        connection.execute(
            "CREATE UNIQUE INDEX uq_deck_local_name ON deck(name) WHERE owner_account_id IS NOT NULL"
        )
        connection.commit()

    with pytest.raises(MigrationError, match="index uq_deck_local_name differs"):
        inspect_database(path, require_current=True)


def test_upgrade_refuses_cross_workspace_unique_index_and_preserves_v2_source(tmp_path):
    path = tmp_path / "custom-v2.db"
    saved = _identity_database(path)
    with closing(sqlite3.connect(path)) as connection:
        connection.execute("CREATE UNIQUE INDEX manual_deck_name ON deck(name)")
        connection.commit()
    original_bytes = path.read_bytes()

    with pytest.raises(
        MigrationError, match="Custom unique deck index 'manual_deck_name'"
    ):
        migrate_database(path, backup_dir=tmp_path / "backups", app_check=False)

    assert path.read_bytes() == original_bytes
    assert inspect_database(path)["revision"] == "0002_identity"
    with closing(sqlite3.connect(path)) as connection:
        assert _legacy_rows(connection) == saved


def test_current_schema_refuses_only_custom_unique_indexes_spanning_workspaces(
    tmp_path,
):
    path = tmp_path / "custom-v3.db"
    migrate_database(path, app_check=False)
    with closing(sqlite3.connect(path)) as connection:
        connection.execute("CREATE INDEX manual_name_search ON deck(LOWER(name))")
        connection.execute("CREATE UNIQUE INDEX manual_deck_id ON deck(id)")
        connection.execute(
            "CREATE UNIQUE INDEX manual_owned_name ON deck(owner_account_id, LOWER(name))"
        )
        connection.commit()
        assert inspect_database(path, require_current=True)["status"] == "current"

        connection.execute("CREATE UNIQUE INDEX manual_deck_name ON deck(LOWER(name))")
        connection.commit()

    with pytest.raises(
        MigrationError, match="Custom unique deck index 'manual_deck_name'"
    ):
        inspect_database(path, require_current=True)
