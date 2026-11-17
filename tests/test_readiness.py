"""Check probe behavior without connecting to a developer's database."""

from contextlib import contextmanager
from importlib import import_module
from types import SimpleNamespace
import traceback

from cryptography.fernet import Fernet
import pytest
from sqlalchemy import event
from sqlalchemy.exc import OperationalError

from backend.app import create_app
from backend.database import db
from backend.migrate import MigrationError, migrate_database
from backend.postgres import HEAD_REVISION


ORIGIN = "https://staging.example.test"


@pytest.fixture()
def oidc_config():
    return {
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "AUTH_MODE": "oidc",
        "AUTH_PUBLIC_ORIGIN": ORIGIN,
        "AUTH_ISSUER": "https://identity.example.test/",
        "AUTH_CLIENT_ID": "test-client",
        "AUTH_CLIENT_SECRET": "test-secret",
        "AUTH_TRANSACTION_KEY": Fernet.generate_key().decode(),
        "AUTH_RESTORE_EPOCH": "disposable-restore-epoch",
        "AUTH_ADMISSION_HOLD": True,
    }


def test_public_probes_never_start_a_browser_session(oidc_config):
    app = create_app(oidc_config)
    with app.app_context():
        engine = db.engine
    statements = []

    def record_query(_connection, _cursor, statement, *_args):
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", record_query)
    try:
        # Health monitors may use an internal Host header and no browser cookie.
        client = app.test_client()
        liveness = client.get("/api/health", base_url="http://internal.test")
        assert liveness.get_json() == {"status": "ok", "service": "cardfight-api"}
        assert not statements

        for path in ("/api/ready", "/ready"):
            response = client.get(path, base_url="http://internal.test")
            assert response.status_code == 200
            assert response.get_json() == {"status": "ready", "service": "cardfight-api"}
            assert response.headers["Cache-Control"] == "no-store"
            assert "Set-Cookie" not in response.headers
        assert statements == ["SELECT 1", "SELECT 1"]
    finally:
        event.remove(engine, "before_cursor_execute", record_query)
        engine.dispose()


@pytest.mark.parametrize("revisions", [[HEAD_REVISION], [], ["old"], [HEAD_REVISION, "old"]])
def test_postgres_readiness_checks_one_revision_in_read_only_transaction(
    monkeypatch, oidc_config, revisions,
):
    app_module = import_module("backend.app")
    monkeypatch.setattr(app_module, "ensure_schema_current", lambda *_args, **_kwargs: None)
    app = create_app({
        **oidc_config,
        "SQLALCHEMY_DATABASE_URI": "postgresql+psycopg://test@127.0.0.1:1/test",
    })

    def sql(statement):
        statements.append(statement)
        return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: revisions))

    @contextmanager
    def connect():
        yield SimpleNamespace(exec_driver_sql=sql)

    statements = []
    with app.app_context():
        engine = db.engine
    assert engine.hide_parameters is True
    assert engine.pool.timeout() == 5
    monkeypatch.setattr(engine, "connect", connect)
    try:
        response = app.test_client().get("/api/ready")
        assert statements == [
            "SET TRANSACTION READ ONLY",
            "SET LOCAL statement_timeout = '3s'",
            "SELECT version_num FROM public.alembic_version LIMIT 2",
        ]
        assert response.status_code == (200 if revisions == [HEAD_REVISION] else 503)
        assert response.get_json()["status"] == (
            "ready" if revisions == [HEAD_REVISION] else "unavailable"
        )
    finally:
        engine.dispose()


def test_storage_outage_does_not_affect_liveness_or_expose_details(monkeypatch, oidc_config, caplog):
    app_module = import_module("backend.app")

    def fail(_engine):
        raise OperationalError(
            "private SQL statement", ["private SQL value"], RuntimeError("private DSN"),
        )

    monkeypatch.setattr(app_module, "_check_database_readiness", fail)
    client = create_app(oidc_config).test_client()
    ready = client.get("/api/ready")
    assert ready.status_code == 503
    assert ready.get_json() == {"status": "unavailable", "service": "cardfight-api"}
    assert ready.headers["Cache-Control"] == "no-store"
    assert "Set-Cookie" not in ready.headers
    assert "Database readiness check failed (OperationalError)" in caplog.text
    assert "private" not in caplog.text
    assert client.get("/api/health").status_code == 200


def test_legacy_sqlite_probe_never_recreates_a_missing_file(tmp_path):
    path = tmp_path / "legacy.db"
    migrate_database(path, app_check=False)
    app = create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": f"sqlite:///{path.as_posix()}"})
    client = app.test_client()
    assert client.get("/api/ready").status_code == 200
    path.unlink()
    assert client.get("/api/ready").status_code == 503
    assert not path.exists()


def test_hosted_logs_only_safe_details_for_unexpected_api_errors(oidc_config, caplog):
    app = create_app(oidc_config)

    @app.get("/test-error/<value>")
    def fail(value):
        raise RuntimeError(f"private exception value: {value}")

    response = app.test_client().get("/test-error/secret-value?code=secret-code", base_url=ORIGIN)
    assert response.status_code == 500
    assert response.get_json() == {"error": "internal server error"}
    assert "Unexpected API failure for GET /test-error/<value> (RuntimeError)" in caplog.text
    assert "secret-value" not in caplog.text
    assert "secret-code" not in caplog.text
    assert "private exception" not in caplog.text


def test_hosted_startup_suppresses_database_exception_chain(monkeypatch, oidc_config):
    app_module = import_module("backend.app")

    def fail(*_args, **_kwargs):
        try:
            raise RuntimeError("secret connection diagnostics")
        except RuntimeError as exc:
            raise MigrationError("Could not inspect PostgreSQL") from exc

    monkeypatch.setattr(app_module, "ensure_schema_current", fail)
    with pytest.raises(MigrationError) as error:
        create_app({
            **oidc_config,
            "SQLALCHEMY_DATABASE_URI": "postgresql+psycopg://test@127.0.0.1:1/test",
        })
    diagnostic = "".join(traceback.format_exception(error.value))
    assert "backend.postgres status --require-current" in diagnostic
    assert "secret connection diagnostics" not in diagnostic
