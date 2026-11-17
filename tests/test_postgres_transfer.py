"""Rehearse a SQLite checkpoint transfer into an explicitly disposable PostgreSQL database."""

from contextlib import closing, contextmanager
from datetime import datetime
import os
import sqlite3
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.pool import NullPool

from backend.backup import create_backup, manifest_path
from backend.migrate import migrate_database
from backend.postgres import PG_CONNECTION_ARGS, inspect_postgres, upgrade_postgres
from migrations.postgresql.transfer import TransferError, transfer_backup
from test_ownership_rehearsal import ACCOUNT, legacy_database


@pytest.fixture()
def disposable_postgres_engine():
    configured = os.getenv("CARDFIGHT_POSTGRES_TRANSFER_TEST_URL")
    if not configured:
        pytest.skip(
            "Set CARDFIGHT_POSTGRES_TRANSFER_TEST_URL for PostgreSQL transfer tests."
        )
    url = make_url(configured)
    if url.drivername != "postgresql+psycopg" or not (url.database or "").startswith(
        "cardfight_test_"
    ):
        pytest.fail(
            "Use a disposable PostgreSQL instance and a cardfight_test_ database."
        )

    @contextmanager
    def new_database():
        database = "cardfight_test_" + uuid4().hex
        admin = create_engine(
            url,
            connect_args=PG_CONNECTION_ARGS,
            poolclass=NullPool,
            isolation_level="AUTOCOMMIT",
        )
        try:
            with admin.connect() as connection:
                connection.exec_driver_sql(f"CREATE DATABASE {database}")
            try:
                engine = create_engine(
                    url.set(database=database),
                    connect_args=PG_CONNECTION_ARGS,
                    poolclass=NullPool,
                )
                try:
                    assert upgrade_postgres(engine)["changed"]
                    yield engine
                finally:
                    engine.dispose()
            finally:
                with admin.connect() as connection:
                    connection.exec_driver_sql(f"DROP DATABASE {database}")
        finally:
            admin.dispose()

    return new_database


@pytest.fixture()
def transfer_target(disposable_postgres_engine):
    with disposable_postgres_engine() as engine:
        yield engine


def _source_values(database):
    with closing(sqlite3.connect(database)) as connection:
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute(
            "UPDATE \"match\" SET date_played='2026-11-01 01:30:25.123456' WHERE id=5"
        )
        connection.execute(
            "UPDATE auth_account SET created_at='2026-11-01 06:30:25.123456' WHERE id=?",
            (ACCOUNT,),
        )
        connection.executescript("""
            INSERT INTO card_set (id,code,name,created_at,updated_at)
                VALUES (11,'SHARED','Shared set','2026-01-01','2026-01-01');
            INSERT INTO auth_external_identity (id,account_id,issuer,subject,method,created_at)
                SELECT 'identity-record',id,'https://issuer.example/','subject-123','google',
                       '2026-11-01 06:30:25.123456' FROM auth_account;
            INSERT INTO auth_audit_event (id,account_id,category,outcome,correlation_id,created_at)
                SELECT 'audit-record',id,'login','accepted','audit-correlation','2026-11-01'
                       FROM auth_account;
            INSERT INTO auth_invitation (id,token_hash,recipient_email,recipient_email_key,
                                         restore_epoch,expires_at,created_at)
                VALUES ('old-invitation','invitation-hash','member@example.com','member@example.com',
                        'checkpoint-generation','2027-01-01','2026-11-01');
            INSERT INTO auth_session (token_hash,public_id,account_id,method,csrf_secret,
                restore_epoch,account_auth_version,created_at,last_seen_at,idle_expires_at,
                absolute_expires_at,mfa_verified)
                SELECT 'old-session-hash','old-session-generation',id,'google','old-csrf',
                       'checkpoint-generation',1,'2026-11-01','2026-11-01',
                       '2027-01-01','2027-01-01',1 FROM auth_account;
            INSERT INTO auth_transaction (state_hash,session_hash,encrypted_payload,expires_at,created_at)
                VALUES ('old-state-hash','old-session-hash','old-payload','2027-01-01','2026-11-01');
            INSERT INTO auth_throttle (key_hash,attempts,expires_at)
                VALUES ('old-throttle',3,'2027-01-01');
            """)
        connection.commit()


@pytest.mark.parametrize("owned", [False, True])
def test_transfer_preserves_workspace_and_durable_identity(
    legacy_database, tmp_path, transfer_target, owned
):
    _source_values(legacy_database)
    if owned:
        migrate_database(
            legacy_database, backup_dir=tmp_path / "sqlite-upgrade", app_check=False
        )
        with closing(sqlite3.connect(legacy_database)) as connection:
            for table in ("deck", "match", "acquisition_plan"):
                connection.execute(
                    f'UPDATE "{table}" SET owner_account_id=?', (ACCOUNT,)
                )
            connection.commit()
    backup = create_backup(legacy_database, tmp_path / "backups")
    original = {
        path: path.read_bytes()
        for path in (legacy_database, backup, manifest_path(backup))
    }

    report = transfer_backup(backup, transfer_target)
    assert report["table_counts"] == {
        "deck": 2,
        "match": 1,
        "deck_version": 2,
        "deck_card": 1,
        "card": 1,
        "card_image": 1,
        "card_printing": 1,
        "card_set": 1,
        "acquisition_plan": 1,
        "acquisition_plan_item": 1,
        "auth_account": 1,
        "auth_external_identity": 1,
        "auth_audit_event": 1,
    }
    excluded = ("auth_invitation", "auth_session", "auth_transaction", "auth_throttle")
    assert report["excluded_auth_counts"] == dict.fromkeys(excluded, 1)
    assert (
        inspect_postgres(transfer_target, require_current=True)["status"] == "current"
    )
    with transfer_target.connect() as connection:
        owner = ACCOUNT if owned else None
        assert connection.exec_driver_sql(
            "SELECT id, owner_account_id, active FROM deck ORDER BY id"
        ).all() == [(1, owner, True), (2, owner, True)]
        assert connection.exec_driver_sql(
            "SELECT id, owner_account_id, deck1_version_id, deck2_version_id, winner_id, "
            'first_player_id, date_played, notes FROM "match"'
        ).one() == (
            5,
            owner,
            3,
            4,
            1,
            2,
            datetime(2026, 11, 1, 1, 30, 25, 123456),
            "Saved match notes",
        )
        assert connection.exec_driver_sql(
            "SELECT id, owner_account_id, deck_id, deck_version_id, source_deck_version_id "
            "FROM acquisition_plan"
        ).one() == (9, owner, 1, 3, 4)
        assert connection.exec_driver_sql(
            "SELECT id, plan_id, card_id, printing_id, required_quantity, source_quantity, "
            "owned_quantity, ordered_quantity, unit_price_cents, notes FROM acquisition_plan_item"
        ).one() == (10, 9, 6, 7, 4, 1, 2, 1, 750, "Saved purchase notes")
        assert connection.exec_driver_sql(
            "SELECT id, deck_version_id, card_id, printing_id, quantity FROM deck_card"
        ).one() == (8, 3, 6, 7, 4)
        assert (
            connection.exec_driver_sql(
                "SELECT image_id FROM card_printing"
            ).scalar_one()
            == "saved-artwork"
        )
        assert connection.exec_driver_sql(
            "SELECT full_data, thumbnail_data FROM card_image WHERE id='saved-artwork'"
        ).one() == (b"\x01\x23\x45", b"\x01\x23")
        assert connection.exec_driver_sql(
            "SELECT id, status, role, created_at FROM auth_account"
        ).one() == (
            ACCOUNT,
            "admitted",
            "member",
            datetime(2026, 11, 1, 6, 30, 25, 123456),
        )
        assert connection.exec_driver_sql(
            "SELECT id, account_id, subject FROM auth_external_identity"
        ).one() == ("identity-record", ACCOUNT, "subject-123")
        assert connection.exec_driver_sql(
            "SELECT id, account_id, category, outcome FROM auth_audit_event"
        ).one() == ("audit-record", ACCOUNT, "login", "accepted")
        for table in excluded:
            assert (
                connection.exec_driver_sql(f"SELECT COUNT(*) FROM {table}").scalar_one()
                == 0
            )

        # Ask PostgreSQL itself for the next IDs rather than inferring from defaults.
        for table, maximum in {
            "deck": 2,
            "deck_version": 4,
            "match": 5,
            "card": 6,
            "card_printing": 7,
            "deck_card": 8,
            "acquisition_plan": 9,
            "acquisition_plan_item": 10,
            "card_set": 11,
        }.items():
            assert (
                connection.execute(
                    text("SELECT nextval(pg_get_serial_sequence(:table, 'id'))"),
                    {"table": f"public.{table}"},
                ).scalar_one()
                == maximum + 1
            )

    for path, saved in original.items():
        assert path.read_bytes() == saved


def test_transfer_refuses_a_database_with_even_one_operational_row(
    legacy_database, tmp_path, transfer_target
):
    backup = create_backup(legacy_database, tmp_path / "backups")
    with transfer_target.begin() as connection:
        connection.exec_driver_sql(
            "INSERT INTO auth_throttle VALUES ('preexisting', 2, '2027-01-01')"
        )
    with pytest.raises(TransferError):
        transfer_backup(backup, transfer_target)
    with transfer_target.connect() as connection:
        assert connection.exec_driver_sql(
            "SELECT key_hash, attempts FROM auth_throttle"
        ).one() == ("preexisting", 2)
        assert connection.exec_driver_sql("SELECT COUNT(*) FROM deck").scalar_one() == 0


def test_transfer_leaves_target_empty_after_a_row_that_postgresql_rejects(
    legacy_database, tmp_path, transfer_target
):
    with closing(sqlite3.connect(legacy_database)) as connection:
        connection.execute("UPDATE acquisition_plan SET name=?", ("a" * 161,))
        connection.commit()
    backup = create_backup(legacy_database, tmp_path / "backups")
    with pytest.raises(TransferError):
        transfer_backup(backup, transfer_target)
    with transfer_target.connect() as connection:
        for table in ("auth_account", "deck", "deck_version", "acquisition_plan"):
            assert (
                connection.exec_driver_sql(f"SELECT COUNT(*) FROM {table}").scalar_one()
                == 0
            )
        assert connection.exec_driver_sql(
            "SELECT last_value, is_called FROM deck_id_seq"
        ).one() == (1, False)

    # The failed attempt must leave the same target usable for a corrected checkpoint.
    with closing(sqlite3.connect(legacy_database)) as connection:
        connection.execute("UPDATE acquisition_plan SET name='Corrected purchase plan'")
        connection.commit()
    corrected = create_backup(legacy_database, tmp_path / "backups")
    assert transfer_backup(corrected, transfer_target)["table_counts"]["deck"] == 2


def test_transfer_validates_the_manifest_before_opening_postgresql(
    legacy_database, tmp_path
):
    backup = create_backup(legacy_database, tmp_path / "backups")
    manifest_path(backup).unlink()

    class UnopenableEngine:
        dialect = SimpleNamespace(name="postgresql")

        def begin(self):
            pytest.fail("Opened PostgreSQL before verifying the source checkpoint")

        connect = begin

    with pytest.raises(TransferError, match="[Mm]anifest"):
        transfer_backup(backup, UnopenableEngine())
