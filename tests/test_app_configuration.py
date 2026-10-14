"""App-factory, database, and HTTP defaults independent of route business rules."""

import pytest
from sqlalchemy import text

from backend.app import create_app
from backend.config import frontend_origins
from backend.database import db


def isolated_app(**overrides):
    return create_app(
        {
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            **overrides,
        }
    )


def test_factory_stays_non_debug_with_an_inherited_development_environment(monkeypatch):
    monkeypatch.setenv("FLASK_DEBUG", "true")
    first = isolated_app()
    second = isolated_app()
    assert not first.debug and not second.debug
    assert first is not second
    for application in (first, second):
        with application.app_context():
            assert db.session.scalar(text("PRAGMA foreign_keys")) == 1
    assert first.test_client().get("/api/health").get_json()["status"] == "ok"


def test_local_frontends_are_allowed_without_allowing_arbitrary_origins(monkeypatch):
    monkeypatch.delenv("CARDFIGHT_CORS_ORIGINS", raising=False)
    client = isolated_app().test_client()
    for origin in ("http://localhost:5173", "http://127.0.0.1:4173"):
        response = client.get("/api/health", headers={"Origin": origin})
        assert response.headers["Access-Control-Allow-Origin"] == origin
        assert response.headers["X-Content-Type-Options"] == "nosniff"
    for origin in ("https://unrelated.example", "http://localhost:5173.example"):
        response = client.get("/api/health", headers={"Origin": origin})
        assert "Access-Control-Allow-Origin" not in response.headers


def test_custom_origin_and_preflight_preserve_api_access(monkeypatch):
    monkeypatch.setenv("CARDFIGHT_CORS_ORIGINS", "https://lab.example/")
    client = isolated_app().test_client()
    response = client.options(
        "/api/cards",
        headers={
            "Origin": "https://lab.example",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type",
        },
    )
    assert response.headers["Access-Control-Allow-Origin"] == "https://lab.example"
    assert "POST" in response.headers["Access-Control-Allow-Methods"]
    assert "Content-Type" in response.headers["Access-Control-Allow-Headers"]
    response = client.get("/api/health", headers={"Origin": "http://localhost:5173"})
    assert "Access-Control-Allow-Origin" not in response.headers


def test_blank_origin_setting_disables_cross_origin_headers(monkeypatch):
    monkeypatch.setenv("CARDFIGHT_CORS_ORIGINS", "")
    response = (
        isolated_app()
        .test_client()
        .get("/api/health", headers={"Origin": "http://localhost:5173"})
    )
    assert response.status_code == 200
    assert "Access-Control-Allow-Origin" not in response.headers


@pytest.mark.parametrize(
    "value",
    [
        "*",
        "https://*.example",
        "https://user:password@example.com",
        "https://example.com/path",
        "http://localhost:invalid",
        "http://localhost:65536",
        "https://example .com",
        "https://exam\tple.com",
    ],
)
def test_origin_configuration_rejects_non_origins(monkeypatch, value):
    monkeypatch.setenv("CARDFIGHT_CORS_ORIGINS", value)
    with pytest.raises(ValueError, match="HTTP"):
        frontend_origins()


def test_oversized_non_image_request_gets_a_safe_json_error():
    client = isolated_app(MAX_CONTENT_LENGTH=32).test_client()
    response = client.post("/api/decks", json={"name": "x" * 100, "type": "Standard"})
    assert response.status_code == 413
    assert response.get_json() == {"error": "request entity too large"}
