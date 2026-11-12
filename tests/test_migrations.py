"""Explicit schema changes and recovery rehearsals use disposable SQLite files."""

from contextlib import closing
from hashlib import sha256
from io import BytesIO
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import sys

from PIL import Image
import pytest
from sqlalchemy.engine import Connection

from backend import migrate as migration_module
from backend.backup import create_backup, database_summary, restore_backup
from backend.migrate import (
    HEAD_REVISION,
    MigrationError,
    inspect_database,
    migrate_database,
)
from migrations.legacy_v1 import FROZEN_SCHEMA as BASELINE_SCHEMA


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def file_digest(path):
    return sha256(path.read_bytes()).hexdigest()


def saved_rows(path):
    """Read stored values independently of ORM serializers and migration metadata."""
    with closing(sqlite3.connect(path)) as connection:
        connection.row_factory = sqlite3.Row
        tables = [row[0] for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name NOT LIKE 'sqlite_%' AND name!='alembic_version' ORDER BY name"
        )]
        result = {}
        for table in tables:
            primary = sorted(
                (row[5], row[1])
                for row in connection.execute(f'PRAGMA table_info("{table}")')
                if row[5]
            )
            order = ", ".join('"' + name + '"' for _, name in primary) or "rowid"
            result[table] = [dict(row) for row in connection.execute(
                f'SELECT * FROM "{table}" ORDER BY {order}'
            )]
        return result


def assert_saved_values_preserved(before, after):
    for table, rows in before.items():
        for old, new in zip(rows, after[table], strict=True):
            assert {field: new[field] for field in old} == old, table


@pytest.fixture()
def unversioned_database(tmp_path):
    """An existing workspace made before revision tracking, with all entity types."""
    database = tmp_path / "existing workspace.db"
    full = BytesIO()
    Image.new("RGB", (16, 24), "navy").save(full, format="PNG")
    thumbnail = BytesIO()
    Image.new("RGB", (8, 12), "navy").save(thumbnail, format="WEBP")
    data, thumb = full.getvalue(), thumbnail.getvalue()
    image_id = sha256(data).hexdigest()
    date = "2026-01-01 12:00:00"
    # Seed frozen v1 columns directly so current ORM metadata can evolve.
    with closing(sqlite3.connect(database)) as connection:
        connection.execute("PRAGMA foreign_keys=ON")
        for name in BASELINE_SCHEMA["table_order"]:
            table = BASELINE_SCHEMA["tables"][name]
            connection.execute(table["create_sql"])
            for index in table["indexes"]:
                connection.execute(index["create_sql"])
        connection.execute(
            "INSERT INTO card_image VALUES (?, ?, ?, 'image/png', 16, 24, ?, ?, ?, ?)",
            (image_id, data, thumb, len(data), len(thumb), date, date),
        )
        connection.execute(
            "INSERT INTO card (id, name, grade, card_type, skill_text, flavor_text, source, created_at, updated_at) "
            "VALUES (1, 'Migration artwork unit', 3, 'Normal Unit', '', '', 'manual', ?, ?)",
            (date, date),
        )
        connection.execute("INSERT INTO card_set VALUES (1, 'KEEP', 'Saved set', ?, ?)", (date, date))
        connection.executemany(
            "INSERT INTO deck (id, name, type, wins, losses, active, created_at) "
            "VALUES (?, ?, 'Standard', ?, ?, 1, ?)",
            [(1, "Existing player", 1, 0, date), (2, "Existing opponent", 0, 1, date)],
        )
        connection.executemany(
            "INSERT INTO deck_version (id, deck_id, version_name, notes, is_active, created_at, updated_at) "
            "VALUES (?, ?, ?, '', 1, ?, ?)",
            [(1, 1, "Preserved version", date, date), (2, 2, "Opponent version", date, date)],
        )
        connection.execute(
            "INSERT INTO card_printing (id, card_id, image_id, rarity, set_code, card_number, "
            "product_url, source, created_at, updated_at) VALUES (1, 1, ?, 'SP', 'KEEP', '001', "
            "'https://example.com/retained-reference', 'manual', ?, ?)",
            (image_id, date, date),
        )
        connection.execute(
            "INSERT INTO deck_card (id, deck_version_id, card_id, printing_id, quantity, zone, "
            "sort_order, created_at, updated_at) VALUES (1, 1, 1, 1, 4, 'main', 0, ?, ?)",
            (date, date),
        )
        connection.execute(
            'INSERT INTO "match" (id, deck1_id, deck2_id, deck1_version_id, deck2_version_id, '
            "winner_id, date_played, notes) VALUES (1, 1, 2, 1, 2, 1, ?, 'Preserve history and version references')",
            (date,),
        )
        connection.execute(
            "INSERT INTO acquisition_plan (id, name, plan_type, list_source, status, build_mode, "
            "deck_id, deck_version_id, source_deck_version_id, notes, created_at, updated_at) "
            "VALUES (1, 'Existing purchase', 'existing_deck', 'deck_version', 'planning', 'physical', "
            "1, 1, 1, 'Preserve purchase notes', ?, ?)",
            (date, date),
        )
        connection.execute(
            "INSERT INTO acquisition_plan_item (id, plan_id, card_id, printing_id, required_quantity, "
            "source_quantity, removed_quantity, confirmed_removed_quantity, owned_quantity, ordered_quantity, "
            "unit_price_cents, notes, created_at, updated_at) "
            "VALUES (1, 1, 1, 1, 4, 0, 0, 0, 0, 0, 3025, 'Original quote', ?, ?)",
            (date, date),
        )
        connection.commit()
    return database


def rewrite_legacy_table(database, table, *, missing=(), replacements=()):
    """Freeze a supported old layout without calling any application startup code."""
    with closing(sqlite3.connect(database)) as connection:
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=OFF")
        ddl = connection.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (table,)
        ).fetchone()[0]
        rows = [dict(row) for row in connection.execute(f'SELECT * FROM "{table}"')]
        objects = connection.execute(
            "SELECT sql FROM sqlite_master WHERE tbl_name=? "
            "AND type IN ('index','trigger') AND sql IS NOT NULL", (table,)
        ).fetchall()
        # SQLAlchemy emits one column or named CHECK per line in these fixtures.
        lines = [line for line in ddl.splitlines() if not any(
            re.search(rf"\b{re.escape(column)}\b", line) for column in missing
        )]
        ddl = re.sub(r",\s*\)$", "\n)", "\n".join(lines))
        for old, new in replacements:
            ddl = ddl.replace(old, new)
        connection.execute("BEGIN IMMEDIATE")
        try:
            connection.execute(f'DROP TABLE "{table}"')
            connection.execute(ddl)
            for row in rows:
                kept = {key: value for key, value in row.items() if key not in missing}
                columns = ", ".join(f'"{key}"' for key in kept)
                parameters = ", ".join("?" for _ in kept)
                connection.execute(
                    f'INSERT INTO "{table}" ({columns}) VALUES ({parameters})', tuple(kept.values())
                )
            for (statement,) in objects:
                if not any(re.search(rf"\b{re.escape(column)}\b", statement) for column in missing):
                    connection.execute(statement)
            connection.commit()
        except BaseException:
            connection.rollback()
            raise


@pytest.fixture()
def legacy_database(unversioned_database):
    rewrite_legacy_table(
        unversioned_database, "deck_card", replacements=[(",'crest'", "")]
    )
    rewrite_legacy_table(unversioned_database, "acquisition_plan", missing=["archived_at"])
    rewrite_legacy_table(
        unversioned_database,
        "acquisition_plan_item",
        missing=["source_quantity", "removed_quantity", "confirmed_removed_quantity", "removal_confirmed_at"],
        replacements=[
            ("required_quantity >= 0", "required_quantity > 0"),
            ("ck_acquisition_item_required_nonnegative", "ck_acquisition_item_required_positive"),
        ],
    )
    return unversioned_database


def test_status_is_read_only_for_missing_and_empty_databases(tmp_path):
    database = tmp_path / "not-created" / "cardfight.db"
    assert inspect_database(database)["status"] == "missing"
    assert not database.parent.exists()
    database.parent.mkdir()
    database.touch()
    before = file_digest(database)
    assert inspect_database(database)["status"] == "empty"
    assert file_digest(database) == before


def test_fresh_initialization_creates_the_frozen_head_and_is_idempotent(tmp_path):
    database = tmp_path / "new" / "cardfight.db"
    migrate_database(database, app_check=False)
    status = inspect_database(database, require_current=True)
    assert status["status"] == "current"
    assert status["revision"] == status["head"] == HEAD_REVISION
    before = file_digest(database)
    migrate_database(database, app_check=False)
    assert file_digest(database) == before
    assert {name for name in saved_rows(database) if not name.startswith("auth_")} == {
        "deck", "match", "card", "card_set", "card_image", "card_printing",
        "deck_version", "deck_card", "acquisition_plan", "acquisition_plan_item",
    }


def test_unversioned_workspace_requires_explicit_baseline(unversioned_database, tmp_path):
    before = file_digest(unversioned_database)
    assert inspect_database(unversioned_database)["status"] == "unversioned"
    with pytest.raises(MigrationError):
        migrate_database(unversioned_database, backup_dir=tmp_path / "backups", app_check=False)
    assert file_digest(unversioned_database) == before
    with pytest.raises(MigrationError):
        inspect_database(unversioned_database, require_current=True)


def test_baseline_preserves_current_workspace_and_its_recovery_snapshot(unversioned_database, tmp_path):
    before = saved_rows(unversioned_database)
    fingerprint = database_summary(unversioned_database)
    result = migrate_database(
        unversioned_database, baseline=True, backup_dir=tmp_path / "backups", app_check=False
    )
    assert result["rehearsal"]["saved_values_preserved"] is True
    assert inspect_database(unversioned_database, require_current=True)["revision"] == HEAD_REVISION
    after = saved_rows(unversioned_database)
    assert_saved_values_preserved(before, after)
    for table in ("deck", "match", "acquisition_plan"):
        assert all(row["owner_account_id"] is None for row in after[table])
    assert all(not rows for name, rows in after.items() if name.startswith("auth_"))
    backups = list((tmp_path / "backups").glob("*.sqlite3"))
    assert len(backups) == 1
    assert database_summary(backups[0]) == fingerprint
    restored = tmp_path / "recovered-before-baseline.db"
    restore_backup(backups[0], restored)
    assert database_summary(restored) == fingerprint
    stamp = file_digest(unversioned_database)
    migrate_database(
        unversioned_database, baseline=True, backup_dir=tmp_path / "backups", app_check=False
    )
    assert file_digest(unversioned_database) == stamp
    assert len(list((tmp_path / "backups").glob("*.sqlite3"))) == 1


def test_supported_legacy_upgrade_preserves_rows_blobs_and_references(legacy_database, tmp_path):
    before = saved_rows(legacy_database)
    migrate_database(legacy_database, baseline=True, backup_dir=tmp_path / "backups", app_check=False)
    assert inspect_database(legacy_database, require_current=True)["status"] == "current"
    after = saved_rows(legacy_database)
    assert_saved_values_preserved(before, after)
    assert after["acquisition_plan"][0]["archived_at"] is None
    item = after["acquisition_plan_item"][0]
    assert item["source_quantity"] == 4
    assert item["removed_quantity"] == item["confirmed_removed_quantity"] == 0
    assert item["removal_confirmed_at"] is None
    with closing(sqlite3.connect(legacy_database)) as connection:
        assert connection.execute("PRAGMA foreign_key_check").fetchall() == []
        connection.execute("UPDATE deck_card SET zone='crest' WHERE id=1")
        connection.execute("UPDATE acquisition_plan_item SET required_quantity=0 WHERE id=1")
        connection.rollback()


@pytest.mark.parametrize("damage", [
    "unknown_revision", "multiple_revisions", "empty_revision",
    "missing_column", "missing_table", "incomplete_rebuild",
])
def test_unsupported_or_incomplete_schema_is_rejected_without_mutation(tmp_path, damage):
    database = tmp_path / "invalid.db"
    migrate_database(database, app_check=False)
    with closing(sqlite3.connect(database)) as connection:
        if damage == "unknown_revision":
            connection.execute("UPDATE alembic_version SET version_num='future_revision'")
        elif damage == "multiple_revisions":
            connection.execute("INSERT INTO alembic_version VALUES('unexpected_branch')")
        elif damage == "empty_revision":
            connection.execute("DELETE FROM alembic_version")
        elif damage == "missing_column":
            connection.execute("ALTER TABLE deck DROP COLUMN nation_icon")
        elif damage == "missing_table":
            connection.execute("DROP TABLE card_set")
        else:
            connection.execute("CREATE TABLE deck_card_crest_upgrade(id INTEGER PRIMARY KEY)")
        connection.commit()
    before = file_digest(database)
    with pytest.raises(MigrationError):
        inspect_database(database)
    with pytest.raises(MigrationError):
        migrate_database(database, backup_dir=tmp_path / "backups", app_check=False)
    assert file_digest(database) == before


def test_unrecognized_legacy_shape_is_not_partially_repaired(unversioned_database, tmp_path):
    with closing(sqlite3.connect(unversioned_database)) as connection:
        connection.execute("ALTER TABLE card DROP COLUMN skill_text")
        connection.commit()
    before = file_digest(unversioned_database)
    with pytest.raises(MigrationError):
        migrate_database(unversioned_database, baseline=True, backup_dir=tmp_path / "backups", app_check=False)
    assert file_digest(unversioned_database) == before


def test_auxiliary_tables_indexes_and_triggers_survive_baseline(unversioned_database, tmp_path):
    with closing(sqlite3.connect(unversioned_database)) as connection:
        connection.executescript(
            "CREATE TABLE player_audit(id INTEGER PRIMARY KEY, deck_id INTEGER NOT NULL);"
            "CREATE INDEX player_deck_name_search ON deck(name COLLATE NOCASE);"
            "CREATE TRIGGER player_name_audit AFTER UPDATE OF name ON deck "
            "BEGIN INSERT INTO player_audit(deck_id) VALUES(NEW.id); END;"
        )
        before = connection.execute(
            "SELECT name,sql FROM sqlite_master WHERE name LIKE 'player_%' ORDER BY name"
        ).fetchall()
    migrate_database(
        unversioned_database, baseline=True, backup_dir=tmp_path / "backups", app_check=False
    )
    with closing(sqlite3.connect(unversioned_database)) as connection:
        assert connection.execute(
            "SELECT name,sql FROM sqlite_master WHERE name LIKE 'player_%' ORDER BY name"
        ).fetchall() == before
        connection.execute("UPDATE deck SET name='Verified audit behavior' WHERE id=1")
        assert connection.execute("SELECT deck_id FROM player_audit").fetchall() == [(1,)]
        connection.rollback()


def test_a_write_after_backup_prevents_source_migration(unversioned_database, tmp_path, monkeypatch):
    original = migration_module.create_backup

    def snapshot_then_change_source(source, backup_dir):
        backup = original(source, backup_dir)
        with closing(sqlite3.connect(source)) as connection:
            connection.execute("UPDATE deck SET name='Concurrent saved edit' WHERE id=1")
            connection.commit()
        return backup

    monkeypatch.setattr(migration_module, "create_backup", snapshot_then_change_source)
    with pytest.raises(MigrationError, match="changed after backup"):
        migrate_database(
            unversioned_database, baseline=True, backup_dir=tmp_path / "backups", app_check=False
        )
    assert inspect_database(unversioned_database)["status"] == "unversioned"
    assert saved_rows(unversioned_database)["deck"][0]["name"] == "Concurrent saved edit"
    checkpoints = list((tmp_path / "backups").glob("*.sqlite3"))
    assert len(checkpoints) == 1
    assert saved_rows(checkpoints[0])["deck"][0]["name"] == "Existing player"


def test_failed_real_upgrade_rolls_back_and_backup_restores_original_data(
    legacy_database, tmp_path, monkeypatch
):
    before = database_summary(legacy_database)
    original = Connection.exec_driver_sql
    failures = []

    def fail_on_source_index(connection, statement, *args, **kwargs):
        if statement.lstrip().upper().startswith("CREATE INDEX") and "ix_deck_card_version" in statement:
            driver = connection.connection.driver_connection
            actual = Path(driver.execute("PRAGMA database_list").fetchone()[2]).resolve()
            if actual == legacy_database.resolve():
                failures.append(statement)
                raise RuntimeError("Injected failure after replacement data was copied")
        return original(connection, statement, *args, **kwargs)

    monkeypatch.setattr(Connection, "exec_driver_sql", fail_on_source_index)
    with pytest.raises(MigrationError):
        migrate_database(legacy_database, baseline=True, backup_dir=tmp_path / "backups", app_check=False)
    assert failures, "The failure must occur in the real target, after the disposable rehearsal"
    assert database_summary(legacy_database) == before
    assert inspect_database(legacy_database)["status"] == "unversioned"
    backups = list((tmp_path / "backups").glob("*.sqlite3"))
    assert len(backups) == 1
    recovered = tmp_path / "recovered.db"
    restore_backup(backups[0], recovered)
    assert database_summary(recovered) == before


def test_revision_stamp_failure_rolls_back_completed_ddl_and_retains_recovery(
    legacy_database, tmp_path, monkeypatch
):
    before = database_summary(legacy_database)
    original = Connection.execute
    observed = []

    def fail_target_stamp(connection, statement, *args, **kwargs):
        if (
            getattr(statement, "__visit_name__", None) == "insert"
            and getattr(getattr(statement, "table", None), "name", None) == "alembic_version"
        ):
            driver = connection.connection.driver_connection
            actual = Path(driver.execute("PRAGMA database_list").fetchone()[2]).resolve()
            if actual == legacy_database.resolve():
                tables = {row[0] for row in driver.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                )}
                ddl = driver.execute(
                    "SELECT sql FROM sqlite_master WHERE name='deck_card'"
                ).fetchone()[0]
                observed.append((tables, ddl))
                raise RuntimeError("Injected failure while recording the completed revision")
        return original(connection, statement, *args, **kwargs)

    monkeypatch.setattr(Connection, "execute", fail_target_stamp)
    with pytest.raises(MigrationError, match="recording the completed revision"):
        migrate_database(
            legacy_database, baseline=True, backup_dir=tmp_path / "backups", app_check=False
        )
    assert len(observed) == 1
    tables_before_stamp, completed_ddl = observed[0]
    assert "alembic_version" in tables_before_stamp
    assert "'crest'" in completed_ddl, "The failure must follow the schema replacements"
    assert not any(name.startswith("_cardfight_v1_copy_") for name in tables_before_stamp)
    assert database_summary(legacy_database) == before
    assert inspect_database(legacy_database)["status"] == "unversioned"
    with closing(sqlite3.connect(legacy_database)) as connection:
        tables_after_rollback = {row[0] for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )}
    assert "alembic_version" not in tables_after_rollback
    assert not any(name.startswith("_cardfight_v1_copy_") for name in tables_after_rollback)
    backups = list((tmp_path / "backups").glob("*.sqlite3"))
    assert len(backups) == 1
    restored = tmp_path / "restored-before-stamp.db"
    restore_backup(backups[0], restored)
    assert database_summary(restored) == before


def test_recognized_pending_revision_rehearses_upgrades_and_then_noops(
    unversioned_database, tmp_path, monkeypatch
):
    migrate_database(
        unversioned_database, baseline=True,
        backup_dir=tmp_path / "baseline-backups", app_check=False,
    )
    before_rows = saved_rows(unversioned_database)
    before_snapshot = database_summary(unversioned_database)
    scripts = tmp_path / "synthetic-migrations"
    shutil.copytree(
        PROJECT_ROOT / "migrations", scripts,
        ignore=shutil.ignore_patterns("__pycache__"),
    )
    pending_head = "future_revision_probe"
    (scripts / "versions" / f"{pending_head}.py").write_text(
        '"""Disposable test revision; never part of the application history."""\n'
        "from alembic import op\n"
        f"revision = {pending_head!r}\n"
        f"down_revision = {HEAD_REVISION!r}\n"
        "branch_labels = None\ndepends_on = None\n"
        "def upgrade():\n"
        "    op.create_index('ix_pending_probe_deck_type', 'deck', ['type'])\n"
        "def downgrade():\n"
        "    op.drop_index('ix_pending_probe_deck_type', table_name='deck')\n",
        encoding="utf-8",
    )
    original_config = migration_module._config

    def synthetic_config(connection=None):
        config = original_config(connection)
        config.set_main_option("script_location", scripts.as_posix())
        return config

    monkeypatch.setattr(migration_module, "_config", synthetic_config)
    monkeypatch.setattr(migration_module, "HEAD_REVISION", pending_head)
    before_check = file_digest(unversioned_database)
    pending = inspect_database(unversioned_database)
    assert pending == {"status": "pending", "revision": HEAD_REVISION, "head": pending_head}
    with pytest.raises(MigrationError, match="pending"):
        inspect_database(unversioned_database, require_current=True)
    assert file_digest(unversioned_database) == before_check

    backups_directory = tmp_path / "upgrade-backups"
    result = migrate_database(
        unversioned_database, backup_dir=backups_directory, app_check=False
    )
    assert result["rehearsal"]["revision"] == pending_head
    assert inspect_database(unversioned_database, require_current=True) == {
        "status": "current", "revision": pending_head, "head": pending_head,
    }
    assert saved_rows(unversioned_database) == before_rows
    with closing(sqlite3.connect(unversioned_database)) as connection:
        assert connection.execute(
            "SELECT name FROM sqlite_master WHERE type='index' "
            "AND name='ix_pending_probe_deck_type'"
        ).fetchone() == ("ix_pending_probe_deck_type",)
    backups = list(backups_directory.glob("*.sqlite3"))
    assert len(backups) == 1
    assert database_summary(backups[0]) == before_snapshot
    assert inspect_database(backups[0])["revision"] == HEAD_REVISION
    completed = file_digest(unversioned_database)
    repeated = migrate_database(
        unversioned_database, backup_dir=backups_directory, app_check=False
    )
    assert repeated["changed"] is False
    assert file_digest(unversioned_database) == completed
    assert len(list(backups_directory.glob("*.sqlite3"))) == 1


def test_cli_rehearsal_uses_only_a_restored_copy(unversioned_database, tmp_path):
    backup = create_backup(unversioned_database, tmp_path / "backups")
    source_before, backup_before = file_digest(unversioned_database), file_digest(backup)
    process = subprocess.run(
        [sys.executable, "-m", "backend.migrate", "rehearse", str(backup)],
        cwd=PROJECT_ROOT,
        env={**os.environ, "DATABASE_URL": "sqlite:///:memory:"},
        text=True, capture_output=True, timeout=60,
    )
    assert process.returncode == 0, process.stderr
    assert isinstance(json.loads(process.stdout), dict)
    assert file_digest(unversioned_database) == source_before
    assert file_digest(backup) == backup_before
    assert inspect_database(unversioned_database)["status"] == "unversioned"


def test_migration_module_import_does_not_import_or_initialize_application(tmp_path):
    database = tmp_path / "must-not-exist.db"
    process = subprocess.run(
        [sys.executable, "-c", "import backend.migrate,sys; print('backend.app' in sys.modules)"],
        cwd=PROJECT_ROOT,
        env={**os.environ, "DATABASE_URL": f"sqlite:///{database.as_posix()}"},
        text=True, capture_output=True, timeout=30,
    )
    assert process.returncode == 0, process.stderr
    assert process.stdout.strip() == "False"
    assert not database.exists()


@pytest.mark.parametrize("explicit", [False, True])
def test_migration_backup_uses_shared_default_or_explicit_override(
    unversioned_database, monkeypatch, tmp_path, explicit
):
    destination = tmp_path / ("explicit recovery" if explicit else "configured recovery")
    monkeypatch.setenv("CARDFIGHT_BACKUP_DIR", "invalid/relative" if explicit else str(destination))
    result = migrate_database(
        unversioned_database, baseline=True,
        backup_dir=destination if explicit else None, app_check=False,
    )
    assert result["changed"] is True
    assert Path(result["backup"]).parent == destination.resolve()
    assert inspect_database(unversioned_database, require_current=True)["status"] == "current"
    restored = tmp_path / "recovered-original.db"
    restore_backup(result["backup"], restored)
    assert inspect_database(restored)["status"] == "unversioned"


def test_invalid_backup_configuration_prevents_migration_without_fallback(
    unversioned_database, monkeypatch, tmp_path
):
    monkeypatch.setenv("CARDFIGHT_BACKUP_DIR", "invalid/relative")
    before = file_digest(unversioned_database)
    with pytest.raises(MigrationError, match="CARDFIGHT_BACKUP_DIR"):
        migrate_database(unversioned_database, baseline=True, app_check=False)
    assert file_digest(unversioned_database) == before
    assert not list(tmp_path.rglob("*.sqlite3"))
