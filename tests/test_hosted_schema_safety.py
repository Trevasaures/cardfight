"""Persistent SQLite customization must not bypass hosted workspace isolation."""

from contextlib import closing
import sqlite3

from cryptography.fernet import Fernet
import pytest

from backend.app import create_app
from backend.database import db
from backend.migrate import MigrationError, migrate_database


@pytest.fixture()
def sqlite_copy(tmp_path):
    path = tmp_path / "cardfight-test.db"
    migrate_database(path, app_check=False)
    return path


def _config(path, mode):
    return {
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{path.as_posix()}",
        "AUTH_MODE": mode,
        "AUTH_PUBLIC_ORIGIN": (
            "https://cardfight.example" if mode == "oidc" else "http://127.0.0.1:5173"
        ),
        "AUTH_ISSUER": "https://identity.example/",
        "AUTH_CLIENT_ID": "disposable-client",
        "AUTH_CLIENT_SECRET": "disposable-secret",
        "AUTH_TRANSACTION_KEY": Fernet.generate_key().decode(),
        "AUTH_RESTORE_EPOCH": "disposable-copy-generation",
    }


def _assert_healthy(path, mode):
    app = create_app(_config(path, mode))
    try:
        assert app.test_client().get("/api/health").status_code == 200
    finally:
        with app.app_context():
            db.engine.dispose()


def _assert_hosted_refusal(path, diagnostic):
    saved = path.read_bytes()
    _assert_healthy(path, "local")
    for mode in ("oidc", "oidc-dev"):
        with pytest.raises(MigrationError, match=diagnostic):
            create_app(_config(path, mode))
    assert path.read_bytes() == saved


@pytest.mark.parametrize(
    "statements, table",
    [
        (
            "CREATE TRIGGER legacy_side_effect AFTER UPDATE OF name ON deck "
            "BEGIN UPDATE deck SET name = (SELECT name FROM deck WHERE id = 100) "
            "WHERE id = NEW.id; END;",
            "deck",
        ),
        (
            "CREATE TABLE legacy_deck_notes (deck_id REFERENCES deck(id) ON DELETE CASCADE); "
            "CREATE TRIGGER legacy_side_effect AFTER DELETE ON legacy_deck_notes "
            "BEGIN UPDATE deck SET name = 'changed by cascade' WHERE id = 100; END;",
            "legacy_deck_notes",
        ),
    ],
)
def test_hosted_startup_refuses_persisted_triggers(sqlite_copy, statements, table):
    with closing(sqlite3.connect(sqlite_copy)) as connection:
        connection.executescript(statements)

    _assert_hosted_refusal(
        sqlite_copy,
        rf"Hosted SQLite cannot use custom trigger 'legacy_side_effect' on '{table}'",
    )


@pytest.mark.parametrize(
    "table, columns",
    [
        ("match", "notes"),
        ("deck_card", "card_id"),
        ("match", "owner_account_id COLLATE NOCASE, notes"),
    ],
)
def test_hosted_startup_refuses_cross_workspace_unique_indexes(
    sqlite_copy, table, columns
):
    with closing(sqlite3.connect(sqlite_copy)) as connection:
        connection.execute(
            f'CREATE UNIQUE INDEX legacy_constraint ON "{table}" ({columns})'
        )
        connection.commit()

    _assert_hosted_refusal(
        sqlite_copy,
        rf"Hosted SQLite cannot use custom unique index 'legacy_constraint' on '{table}'",
    )


def test_hosted_startup_accepts_scoped_uniqueness_and_nonunique_indexes(sqlite_copy):
    with closing(sqlite3.connect(sqlite_copy)) as connection:
        connection.executescript(
            'CREATE UNIQUE INDEX owned_notes ON "match"(owner_account_id, notes); '
            "CREATE UNIQUE INDEX owned_version_name ON deck_version(deck_id, lower(version_name)); "
            "CREATE UNIQUE INDEX identified_card ON deck_card(id, card_id); "
            'CREATE INDEX notes_lookup ON "match"(notes); '
            "CREATE UNIQUE INDEX shared_card_names ON card(name);"
        )

    saved = sqlite_copy.read_bytes()
    for mode in ("oidc", "oidc-dev"):
        _assert_healthy(sqlite_copy, mode)
    assert sqlite_copy.read_bytes() == saved
