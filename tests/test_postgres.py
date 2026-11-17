"""Verify the PostgreSQL baseline and application ownership against PostgreSQL 18."""

import os
from types import SimpleNamespace

from cryptography.fernet import Fernet
import pytest
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url

from backend.app import create_app
from backend.database import db
from backend.migrate import MigrationError
from backend.models import AuthAccount
from backend import postgres
from backend.postgres import PG_CONNECTION_ARGS, inspect_postgres, upgrade_postgres
from test_workspace_analytics import EPOCH, ORIGIN, _browser, _get, _request


@pytest.mark.parametrize(
    "dotenv_url, inherited_url, expected_url",
    [
        (None, None, "postgresql+psycopg://cardfight@127.0.0.1:5432/cardfight"),
        (
            "postgresql+psycopg://cardfight@127.0.0.1:5433/from_dotenv",
            None,
            "postgresql+psycopg://cardfight@127.0.0.1:5433/from_dotenv",
        ),
        (
            "postgresql+psycopg://cardfight@127.0.0.1:5433/from_dotenv",
            "postgresql+psycopg://cardfight@127.0.0.1:5434/from_shell",
            "postgresql+psycopg://cardfight@127.0.0.1:5434/from_shell",
        ),
        (
            "postgresql+psycopg://cardfight@127.0.0.1:5433/from_dotenv",
            "sqlite:///:memory:",
            None,
        ),
    ],
    ids=("default", "dotenv", "shell-over-dotenv", "explicit-sqlite"),
)
def test_postgres_status_selects_database_without_connecting(
    tmp_path, monkeypatch, dotenv_url, inherited_url, expected_url,
):
    monkeypatch.setattr(postgres, "PROJECT_ROOT", tmp_path)
    monkeypatch.delenv("PYTHON_DOTENV_DISABLED", raising=False)
    if dotenv_url:
        (tmp_path / ".env").write_text(f"DATABASE_URL={dotenv_url}\n", encoding="utf-8")
    if inherited_url:
        monkeypatch.setenv("DATABASE_URL", inherited_url)
    else:
        monkeypatch.delenv("DATABASE_URL", raising=False)

    requested_urls = []
    engine = SimpleNamespace(dispose=lambda: None)

    def capture_engine(url, **_options):
        requested_urls.append(url)
        return engine

    def check_status(requested_engine, *, require_current):
        assert requested_engine is engine
        assert require_current is True
        return {"status": "current"}

    monkeypatch.setattr(postgres, "create_engine", capture_engine)
    monkeypatch.setattr(postgres, "inspect_postgres", check_status)
    result = postgres.main(["status", "--require-current"])

    if expected_url:
        assert result == 0
        assert requested_urls == [make_url(expected_url)]
    else:
        assert result == 1
        assert not requested_urls


@pytest.fixture()
def postgres_url():
    value = os.getenv("CARDFIGHT_POSTGRES_TEST_URL")
    if not value:
        pytest.skip("Set CARDFIGHT_POSTGRES_TEST_URL to a disposable PostgreSQL database.")
    url = make_url(value)
    if url.drivername != "postgresql+psycopg" or not (url.database or "").startswith("cardfight_test_"):
        pytest.fail("Use a disposable PostgreSQL database named cardfight_test_…")
    return url


def test_postgres_baseline_and_owned_deck_workflow(postgres_url):
    engine = create_engine(postgres_url, connect_args=PG_CONNECTION_ARGS)
    try:
        assert inspect_postgres(engine)["status"] == "empty"
        with pytest.raises(MigrationError, match="schema is empty"):
            inspect_postgres(engine, require_current=True)
        assert upgrade_postgres(engine)["changed"]
        assert inspect_postgres(engine, require_current=True)["status"] == "current"
        assert not upgrade_postgres(engine)["changed"]
    finally:
        engine.dispose()

    app = create_app({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": postgres_url,
        "AUTH_MODE": "oidc",
        "AUTH_PUBLIC_ORIGIN": ORIGIN,
        "AUTH_ISSUER": "https://identity.example/",
        "AUTH_CLIENT_ID": "disposable-client",
        "AUTH_CLIENT_SECRET": "disposable-secret",
        "AUTH_TRANSACTION_KEY": Fernet.generate_key().decode(),
        "AUTH_RESTORE_EPOCH": EPOCH,
        "AUTH_ADMISSION_HOLD": False,
    })
    try:
        with app.app_context():
            first = AuthAccount(display_name="First", admission_epoch=EPOCH)
            second = AuthAccount(display_name="Second", admission_epoch=EPOCH)
            db.session.add_all([first, second])
            db.session.flush()
            first_browser = _browser(app, first)
            second_browser = _browser(app, second)
            db.session.commit()

        def post(browser, path, payload):
            client, headers = browser
            result = client.post(path, base_url=ORIGIN, headers=headers, json=payload)
            assert result.status_code == 201, result.get_json()
            return result.get_json()

        same_deck = {"name": "Same deck name", "type": "Standard"}
        first_deck = post(first_browser, "/api/decks", same_deck)["id"]
        second_deck = post(second_browser, "/api/decks", same_deck)["id"]
        assert second_deck > first_deck
        assert _get(first_browser, f"/api/decks/{first_deck}")["name"] == "Same deck name"
        assert _get(second_browser, f"/api/decks/{second_deck}")["name"] == "Same deck name"
        assert _request(first_browser, f"/api/decks/{second_deck}").status_code == 404
        assert _request(second_browser, f"/api/decks/{first_deck}").status_code == 404
        assert _get(first_browser, "/api/dashboard")["summary"]["active_decks"] == 1
        assert _get(second_browser, "/api/dashboard")["summary"]["active_decks"] == 1

        opponent = post(first_browser, "/api/decks", {**same_deck, "name": "Opponent"})["id"]
        for utc_time, central_time in (
            ("2026-06-09T19:30:00+00:00", "06/09/2026 02:30 PM"),
            ("2026-12-09T19:30:00+00:00", "12/09/2026 01:30 PM"),
        ):
            match = post(first_browser, "/api/matches", {
                "deck1_id": first_deck,
                "deck2_id": opponent,
                "date_played": utc_time,
            })
            assert _get(first_browser, f"/api/matches/{match['id']}")["date_played"] == central_time
            assert _request(second_browser, f"/api/matches/{match['id']}").status_code == 404
    finally:
        with app.app_context():
            db.engine.dispose()
