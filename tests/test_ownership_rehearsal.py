"""Ownership assignment verifies and protects the selected database."""

from contextlib import closing
import json
from pathlib import Path
import shutil
import sqlite3

import pytest

from backend.backup import BackupError, create_backup, manifest_path, restore_backup
from backend.migrate import MigrationError, migrate_database
from backend import ownership
from backend.ownership import (
    OwnershipError,
    assign_owner_to_copy,
    rehearse_owner_assignment,
)
from migrations.identity_v2 import FROZEN_SCHEMA as IDENTITY_SCHEMA
from migrations.legacy_v1 import FROZEN_SCHEMA as WORKSPACE_SCHEMA

ACCOUNT = "64965e6c-74cb-47e1-a9db-1e1091fa5613"
UNKNOWN_ACCOUNT = "95fa74d2-2315-4e46-86ac-3f90ed452acd"


@pytest.fixture()
def legacy_database(tmp_path):
    path = tmp_path / "legacy.db"
    with closing(sqlite3.connect(path)) as connection:
        connection.execute("PRAGMA foreign_keys=ON")
        for schema in (WORKSPACE_SCHEMA, IDENTITY_SCHEMA):
            for name in schema["table_order"]:
                table = schema["tables"][name]
                connection.execute(table["create_sql"])
                for index in table["indexes"]:
                    connection.execute(index["create_sql"])
        connection.executescript("""
            CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY);
            INSERT INTO alembic_version VALUES ('0002_identity');
            INSERT INTO deck(id,name,type,wins,losses,active,created_at) VALUES
                (1,'Legacy player','Standard',1,0,1,'2026-01-01'),
                (2,'Legacy opponent','Standard',0,1,1,'2026-01-01');
            INSERT INTO deck_version(id,deck_id,version_name,notes,is_active,created_at,updated_at)
                VALUES (3,1,'First list','Saved list notes',1,'2026-01-01','2026-01-02'),
                       (4,2,'Opponent list','',1,'2026-01-01','2026-01-02');
            INSERT INTO "match"(id,deck1_id,deck2_id,deck1_version_id,deck2_version_id,winner_id,
                                first_player_id,date_played,notes)
                VALUES (5,1,2,3,4,1,2,'2026-01-04','Saved match notes');
            INSERT INTO card(id,name,card_type,skill_text,flavor_text,source,created_at,updated_at)
                VALUES (6,'Shared unit','Normal Unit','','','manual','2026-01-01','2026-01-02');
            INSERT INTO card_image(id,full_data,thumbnail_data,mimetype,width,height,byte_size,
                                   thumbnail_byte_size,created_at,last_used_at)
                VALUES ('saved-artwork',X'012345',X'0123','image/png',1,1,3,2,'2026-01-01','2026-01-02');
            INSERT INTO card_printing(id,card_id,image_id,source,created_at,updated_at)
                VALUES (7,6,'saved-artwork','manual','2026-01-01','2026-01-02');
            INSERT INTO deck_card(id,deck_version_id,card_id,printing_id,quantity,zone,sort_order,
                                  created_at,updated_at)
                VALUES (8,3,6,7,4,'main',0,'2026-01-01','2026-01-02');
            INSERT INTO acquisition_plan(id,name,plan_type,list_source,status,build_mode,deck_id,
                                         deck_version_id,source_deck_version_id,notes,created_at,updated_at)
                VALUES (9,'Legacy purchases','existing_deck','deck_version','buying','physical',1,
                        3,4,'Saved acquisition notes','2026-01-01','2026-01-02');
            INSERT INTO acquisition_plan_item(id,plan_id,card_id,printing_id,required_quantity,
                                              source_quantity,removed_quantity,confirmed_removed_quantity,
                                              owned_quantity,ordered_quantity,unit_price_cents,notes,
                                              created_at,updated_at)
                VALUES (10,9,6,7,4,1,0,0,2,1,750,'Saved purchase notes','2026-01-01','2026-01-02');
            """)
        connection.execute(
            "INSERT INTO auth_account(id,display_name,status,role,auth_version,admission_epoch,"
            "created_at,updated_at) VALUES (?,'Operator selected','admitted','member',1,"
            "'checkpoint-generation','2026-01-01','2026-01-02')",
            (ACCOUNT,),
        )
        connection.commit()
    return path


def test_rehearsal_upgrades_checkpoint_and_preserves_source_and_backup(
    legacy_database, tmp_path
):
    backup = create_backup(legacy_database, tmp_path / "backups")
    preserved = {
        path: path.read_bytes()
        for path in (legacy_database, backup, manifest_path(backup))
    }

    report = rehearse_owner_assignment(backup, ACCOUNT)

    assert report["account_id"] == ACCOUNT
    assert report["previous_revision"] == "0002_identity"
    assert report["revision"] == "0003_ownership"
    assert report["assigned_counts"] == {"deck": 2, "match": 1, "acquisition_plan": 1}
    assert report["table_counts"]["deck_card"] == 1
    assert report["table_counts"]["acquisition_plan_item"] == 1
    assert report["table_counts"]["card_image"] == 1
    assert report["restored_copy_verified"] is True
    assert report["saved_values_preserved"] is True
    assert report["related_records_verified"] is True
    for path, content in preserved.items():
        assert path.read_bytes() == content


@pytest.mark.parametrize("state", ["missing", "suspended"])
def test_rehearsal_requires_selected_admitted_account(legacy_database, tmp_path, state):
    selected = UNKNOWN_ACCOUNT
    if state == "suspended":
        with closing(sqlite3.connect(legacy_database)) as connection:
            connection.execute("UPDATE auth_account SET status='suspended'")
            connection.commit()
        selected = ACCOUNT
    backup = create_backup(legacy_database, tmp_path / "backups")

    with pytest.raises(OwnershipError, match="admitted account UUID already present"):
        rehearse_owner_assignment(backup, selected)


def test_rehearsal_rejects_mixed_ownership(legacy_database, tmp_path):
    migrate_database(
        legacy_database, backup_dir=tmp_path / "preparation", app_check=False
    )
    with closing(sqlite3.connect(legacy_database)) as connection:
        connection.execute("UPDATE deck SET owner_account_id=? WHERE id=1", (ACCOUNT,))
        connection.commit()
    backup = create_backup(legacy_database, tmp_path / "backups")

    with pytest.raises(OwnershipError, match="already contains owned records"):
        rehearse_owner_assignment(backup, ACCOUNT)


def test_rehearsal_detects_trigger_that_changes_other_saved_values(
    legacy_database, tmp_path
):
    migrate_database(
        legacy_database, backup_dir=tmp_path / "preparation", app_check=False
    )
    with closing(sqlite3.connect(legacy_database)) as connection:
        connection.execute(
            "CREATE TRIGGER change_artwork_on_claim AFTER UPDATE OF owner_account_id ON deck "
            "BEGIN UPDATE card_image SET thumbnail_data = X'FFFF'; END"
        )
        connection.commit()
    backup = create_backup(legacy_database, tmp_path / "backups")
    before = backup.read_bytes()

    with pytest.raises(
        OwnershipError, match="changed saved values outside ownership fields"
    ):
        rehearse_owner_assignment(backup, ACCOUNT)

    assert backup.read_bytes() == before


def test_rehearsal_refuses_unverified_snapshot(legacy_database, tmp_path):
    backup = create_backup(legacy_database, tmp_path / "backups")
    with backup.open("ab") as stream:
        stream.write(b"invalid")

    with pytest.raises(BackupError, match="checksum/size mismatch"):
        rehearse_owner_assignment(backup, ACCOUNT)


@pytest.fixture()
def current_copy(legacy_database, tmp_path):
    backup = create_backup(legacy_database, tmp_path / "source-backups")
    restored = tmp_path / "restored.db"
    restore_backup(backup, restored, for_ownership=True)
    migrate_database(
        restored, backup_dir=tmp_path / "preparation", app_check=False
    )
    return restored


def test_assign_copy_cli_commits_only_owner_fields_and_retains_checkpoint(
    current_copy, tmp_path, capsys
):
    backup_dir = tmp_path / "assignment-backups"
    assert (
        ownership.main(
            [
                "assign-copy",
                "--database",
                str(current_copy),
                "--account",
                ACCOUNT,
                "--backup-dir",
                str(backup_dir),
            ]
        )
        == 0
    )
    report = json.loads(capsys.readouterr().out)
    backup = Path(report["backup"])
    assert report["database"] == str(current_copy.resolve())
    assert report["assigned_counts"] == {"deck": 2, "match": 1, "acquisition_plan": 1}
    assert report["rehearsal"]["restored_copy_verified"] is True
    assert report["saved_values_preserved"] is True
    assert manifest_path(backup).is_file()

    with closing(sqlite3.connect(current_copy)) as after, closing(
        sqlite3.connect(backup)
    ) as before:
        tables = before.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
        for (table,) in tables:
            columns = [
                row[1] for row in before.execute(f'PRAGMA table_info("{table}")')
            ]
            if table in {"deck", "match", "acquisition_plan"}:
                assert before.execute(
                    f'SELECT DISTINCT owner_account_id FROM "{table}"'
                ).fetchall() == [(None,)]
                assert after.execute(
                    f'SELECT DISTINCT owner_account_id FROM "{table}"'
                ).fetchall() == [(ACCOUNT,)]
                columns.remove("owner_account_id")
            selected = ", ".join(f'"{name}"' for name in columns)
            query = f'SELECT {selected} FROM "{table}" ORDER BY {selected}'
            assert before.execute(query).fetchall() == after.execute(query).fetchall()
        assert not after.execute("PRAGMA foreign_key_check").fetchall()

    assigned = current_copy.read_bytes()
    with pytest.raises(OwnershipError, match="already contains owned records"):
        assign_owner_to_copy(current_copy, ACCOUNT, backup_dir=backup_dir)
    assert current_copy.read_bytes() == assigned
    assert list(backup_dir.glob("*.sqlite3")) == [backup]


@pytest.mark.parametrize("alias", ["direct", "symlink", "hardlink"])
def test_assign_copy_refuses_the_usual_database_and_its_aliases(
    legacy_database, tmp_path, monkeypatch, alias
):
    project = tmp_path / "project"
    original = project / "instance" / "cardfight.db"
    original.parent.mkdir(parents=True)
    shutil.copyfile(legacy_database, original)
    monkeypatch.setattr(ownership, "PROJECT_ROOT", project)
    selected = original
    if alias != "direct":
        selected = tmp_path / "pretend-copy.db"
        try:
            if alias == "symlink":
                selected.symlink_to(original)
            else:
                selected.hardlink_to(original)
        except OSError:
            # Some Windows runners forbid link creation. Exercise the same
            # path and file-identity checks with their filesystem results.
            shutil.copyfile(original, selected)
            if alias == "symlink":
                resolve = Path.resolve

                def resolve_alias(path, *args, **kwargs):
                    return resolve(
                        original if path == selected else path, *args, **kwargs
                    )

                monkeypatch.setattr(Path, "resolve", resolve_alias)
            else:
                samefile = Path.samefile

                def samefile_alias(path, other):
                    return (path == selected and other == original) or samefile(
                        path, other
                    )

                monkeypatch.setattr(Path, "samefile", samefile_alias)
    backup_dir = tmp_path / "unexpected-backups"
    original_bytes = original.read_bytes()

    with pytest.raises(OwnershipError, match="separate restored copy"):
        assign_owner_to_copy(selected, ACCOUNT, backup_dir=backup_dir)

    assert original.read_bytes() == original_bytes
    assert not backup_dir.exists()


def test_assign_copy_refuses_unrestored_checkpoint(current_copy, tmp_path):
    backup = create_backup(current_copy, tmp_path / "backups")
    with pytest.raises(OwnershipError, match="Restore this checkpoint"):
        assign_owner_to_copy(
            backup, ACCOUNT, backup_dir=tmp_path / "unexpected-backups"
        )


def test_assign_copy_refuses_missing_or_pending_database(legacy_database, tmp_path):
    backup_dir = tmp_path / "unexpected-backups"
    with pytest.raises(OwnershipError, match="existing SQLite test copy"):
        assign_owner_to_copy(tmp_path / "missing.db", ACCOUNT, backup_dir=backup_dir)
    backup = create_backup(legacy_database, tmp_path / "source-backups")
    pending = tmp_path / "pending.db"
    restore_backup(backup, pending, for_ownership=True)
    with pytest.raises(MigrationError, match="schema is pending"):
        assign_owner_to_copy(pending, ACCOUNT, backup_dir=backup_dir)
    assert not backup_dir.exists()


def test_assign_copy_refuses_configured_database_without_restore_receipt(
    current_copy, tmp_path, monkeypatch
):
    configured = tmp_path / "other-local.db"
    shutil.copyfile(current_copy, configured)
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{configured.as_posix()}")
    before = configured.read_bytes()
    backup_dir = tmp_path / "unexpected-backups"

    with pytest.raises(OwnershipError, match="restore --for-ownership"):
        assign_owner_to_copy(configured, ACCOUNT, backup_dir=backup_dir)

    assert configured.read_bytes() == before
    assert not backup_dir.exists()


def test_assign_copy_refuses_replacement_at_restored_path(current_copy, tmp_path):
    replacement = tmp_path / "replacement.db"
    shutil.copyfile(current_copy, replacement)
    replacement.replace(current_copy)
    before = current_copy.read_bytes()
    backup_dir = tmp_path / "unexpected-backups"

    with pytest.raises(OwnershipError, match="restore --for-ownership"):
        assign_owner_to_copy(current_copy, ACCOUNT, backup_dir=backup_dir)

    assert current_copy.read_bytes() == before
    assert not backup_dir.exists()


def test_assign_copy_rejects_writes_after_checkpoint(
    current_copy, tmp_path, monkeypatch
):
    def rehearse_and_change_database(backup, account_id):
        report = rehearse_owner_assignment(backup, account_id)
        with closing(sqlite3.connect(current_copy)) as connection:
            connection.execute("UPDATE deck SET wins=17 WHERE id=1")
            connection.commit()
        return report

    monkeypatch.setattr(
        ownership, "rehearse_owner_assignment", rehearse_and_change_database
    )
    backup_dir = tmp_path / "assignment-backups"
    with pytest.raises(OwnershipError, match="changed after backup"):
        assign_owner_to_copy(current_copy, ACCOUNT, backup_dir=backup_dir)

    with closing(sqlite3.connect(current_copy)) as connection:
        assert connection.execute(
            "SELECT wins, owner_account_id FROM deck WHERE id=1"
        ).fetchone() == (17, None)
        assert connection.execute(
            'SELECT owner_account_id FROM "match"'
        ).fetchall() == [(None,)]
        assert connection.execute(
            "SELECT owner_account_id FROM acquisition_plan"
        ).fetchall() == [(None,)]
    (backup,) = backup_dir.glob("*.sqlite3")
    with closing(sqlite3.connect(backup)) as connection:
        assert connection.execute("SELECT wins FROM deck WHERE id=1").fetchone() == (1,)
