"""Verify legacy assignment and account isolation on separate PostgreSQL copies."""

from contextlib import closing
from copy import deepcopy
import sqlite3

from cryptography.fernet import Fernet
import pytest
from sqlalchemy import event, select
from sqlalchemy.exc import SQLAlchemyError

from backend.app import create_app
from backend.backup import create_backup
from backend.database import db
from backend.models import AuthAccount
from migrations.postgresql.baseline import SCHEMA
from migrations.postgresql.ownership import (
    PostgresOwnershipError,
    assign_postgres_owner,
    rehearse_postgres_owner,
)
from migrations.postgresql.transfer import transfer_backup
from test_ownership_rehearsal import ACCOUNT, legacy_database
from test_postgres_transfer import disposable_postgres_engine
from test_workspace_analytics import EPOCH, ORIGIN, _browser, _get, _request


OTHER_ACCOUNT = "ed88131e-e662-4704-81df-5aaceba85760"
EXPECTED_COUNTS = {"deck": 2, "match": 1, "acquisition_plan": 1}


def _seed_other_account(engine):
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "INSERT INTO auth_account (id,display_name,status,role,auth_version,"
            "admission_epoch,created_at,updated_at) VALUES (%s,'Other player',"
            "'admitted','member',1,%s,'2026-01-01','2026-01-02')",
            (OTHER_ACCOUNT, EPOCH),
        )
        connection.exec_driver_sql(
            "INSERT INTO deck (id,name,type,wins,losses,active,created_at,owner_account_id) "
            "VALUES (21,'Legacy player','Standard',0,1,true,'2026-01-02',%s),"
            "(22,'Other opponent','Standard',1,0,true,'2026-01-02',%s)",
            (OTHER_ACCOUNT, OTHER_ACCOUNT),
        )
        connection.exec_driver_sql(
            'INSERT INTO "match" (id,deck1_id,deck2_id,winner_id,first_player_id,'
            "date_played,notes,owner_account_id) VALUES (23,21,22,22,21,"
            "'2026-01-04','Other account notes',%s)",
            (OTHER_ACCOUNT,),
        )
        connection.exec_driver_sql(
            "INSERT INTO acquisition_plan (id,name,plan_type,list_source,status,"
            "build_mode,deck_id,notes,created_at,updated_at,owner_account_id) "
            "VALUES (24,'Other purchase plan','existing_deck','empty','planning',"
            "'physical',21,'Other plan notes','2026-01-01','2026-01-02',%s)",
            (OTHER_ACCOUNT,),
        )


@pytest.fixture()
def ownership_copies(legacy_database, tmp_path, disposable_postgres_engine):
    with closing(sqlite3.connect(legacy_database)) as connection:
        connection.execute(
            "UPDATE auth_account SET admission_epoch=? WHERE id=?", (EPOCH, ACCOUNT)
        )
        connection.commit()
    backup = create_backup(legacy_database, tmp_path / "backups")
    with (
        disposable_postgres_engine() as target,
        disposable_postgres_engine() as rehearsal,
    ):
        for engine in (target, rehearsal):
            transfer_backup(backup, engine)
            _seed_other_account(engine)
        yield target, rehearsal


def _saved_rows(engine):
    with engine.connect() as connection:
        return {
            table.name: [
                dict(row)
                for row in connection.execute(
                    select(table).order_by(*table.primary_key.columns)
                ).mappings()
            ]
            for table in SCHEMA.sorted_tables
        }


def test_postgres_assignment_preserves_values_and_separates_two_accounts(
    ownership_copies,
):
    target, rehearsal = ownership_copies
    before = _saved_rows(target)
    preview = rehearse_postgres_owner(rehearsal, ACCOUNT)
    assert preview["changed"] is False
    assert preview["assigned_counts"] == EXPECTED_COUNTS
    assert _saved_rows(rehearsal) == before

    report = assign_postgres_owner(target, ACCOUNT, rehearsal_engine=rehearsal)
    assert report["changed"] is True
    assert report["assigned_counts"] == EXPECTED_COUNTS
    assert report["saved_values_preserved"] and report["related_records_verified"]
    expected = deepcopy(before)
    for table in EXPECTED_COUNTS:
        for row in expected[table]:
            if row["owner_account_id"] is None:
                row["owner_account_id"] = ACCOUNT
    assert _saved_rows(target) == expected
    assert _saved_rows(rehearsal) == before

    application = create_app(
        {
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": target.url,
            "AUTH_MODE": "oidc",
            "AUTH_PUBLIC_ORIGIN": ORIGIN,
            "AUTH_ISSUER": "https://identity.example/",
            "AUTH_CLIENT_ID": "disposable-client",
            "AUTH_CLIENT_SECRET": "disposable-secret",
            "AUTH_TRANSACTION_KEY": Fernet.generate_key().decode(),
            "AUTH_RESTORE_EPOCH": EPOCH,
            "AUTH_ADMISSION_HOLD": False,
        }
    )
    try:
        with application.app_context():
            selected = _browser(application, db.session.get(AuthAccount, ACCOUNT))
            other = _browser(application, db.session.get(AuthAccount, OTHER_ACCOUNT))
            db.session.commit()
        for browser, deck_ids, match_id, foreign_match_id, plan_id in (
            (selected, {1, 2}, 5, 23, 9),
            (other, {21, 22}, 23, 5, 24),
        ):
            assert {deck["id"] for deck in _get(browser, "/api/decks")} == deck_ids
            assert _request(browser, f"/api/matches/{foreign_match_id}").status_code == 404
            dashboard = _get(browser, "/api/dashboard")
            assert dashboard["summary"]["total_matches"] == 1
            assert [row["id"] for row in dashboard["recent_matches"]] == [match_id]
            assert dashboard["command_center"]["resume"]["purchase_plan"]["id"] == plan_id
    finally:
        with application.app_context():
            db.engine.dispose()


def test_postgres_assignment_rejects_the_same_database_and_drifted_checkpoint(
    ownership_copies,
):
    target, rehearsal = ownership_copies
    before = _saved_rows(target)
    with pytest.raises(PostgresOwnershipError, match="distinctly named"):
        assign_postgres_owner(
            target, ACCOUNT, rehearsal_engine=target.execution_options()
        )
    assert _saved_rows(target) == before

    with target.begin() as connection:
        connection.exec_driver_sql(
            "UPDATE deck_version SET notes='Edited after checkpoint' WHERE id=3"
        )
    edited = _saved_rows(target)
    with pytest.raises(PostgresOwnershipError, match="differs from its restored"):
        assign_postgres_owner(target, ACCOUNT, rehearsal_engine=rehearsal)
    assert _saved_rows(target) == edited
    assert _saved_rows(rehearsal) == before


@pytest.mark.parametrize(
    "invalid_sql, params, error",
    [
        ('UPDATE "match" SET deck2_id=21 WHERE id=5', (), "cross-account relationship"),
        (
            "UPDATE acquisition_plan SET source_deck_version_id=3 WHERE id=24",
            (),
            "cross-account relationship",
        ),
        (
            "INSERT INTO deck (id,name,type,wins,losses,active,created_at,owner_account_id) "
            "SELECT 25,name,type,wins,losses,active,created_at,%s FROM deck WHERE id=1",
            (ACCOUNT,),
            "deck name already exists",
        ),
    ],
    ids=("legacy-match", "owned-plan", "duplicate-deck-name"),
)
def test_postgres_assignment_rejects_conflicts_without_changing_rows(
    ownership_copies, invalid_sql, params, error,
):
    target, rehearsal = ownership_copies
    for engine in ownership_copies:
        with engine.begin() as connection:
            connection.exec_driver_sql(invalid_sql, params)
    before = _saved_rows(target)
    with pytest.raises(PostgresOwnershipError, match=error):
        assign_postgres_owner(target, ACCOUNT, rehearsal_engine=rehearsal)
    assert _saved_rows(target) == _saved_rows(rehearsal) == before


def test_postgres_assignment_rolls_back_all_roots_if_final_update_fails(
    ownership_copies,
):
    target, rehearsal = ownership_copies
    before = _saved_rows(target)
    root_updates = []

    @event.listens_for(target, "before_cursor_execute")
    def fail_last_update(_connection, _cursor, statement, _parameters, _context, _many):
        if (
            statement.lstrip().upper().startswith("UPDATE")
            and "owner_account_id" in statement
        ):
            root_updates.append(statement)
            if len(root_updates) == len(EXPECTED_COUNTS):
                raise SQLAlchemyError("Injected failure after the first owner updates")

    try:
        with pytest.raises(PostgresOwnershipError):
            assign_postgres_owner(target, ACCOUNT, rehearsal_engine=rehearsal)
    finally:
        event.remove(target, "before_cursor_execute", fail_last_update)
    assert len(root_updates) == len(EXPECTED_COUNTS)
    assert _saved_rows(target) == _saved_rows(rehearsal) == before
