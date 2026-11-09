import os
from contextlib import contextmanager

import pytest
from sqlalchemy import event


os.environ["DATABASE_URL"] = "sqlite:///:memory:"
# A developer may have enabled real sign-in in .env. The shared regression app
# stays an isolated local lab; auth tests explicitly supply their own provider
# and disposable configuration. Never read live credentials or admission state.
os.environ["CARDFIGHT_AUTH_MODE"] = "local"
os.environ["CARDFIGHT_AUTH_PUBLIC_ORIGIN"] = "http://127.0.0.1:5173"
os.environ["CARDFIGHT_AUTH_ADMISSION_HOLD"] = "true"
for auth_setting in (
    "ISSUER", "CLIENT_ID", "CLIENT_SECRET", "TRANSACTION_KEY", "RESTORE_EPOCH"
):
    os.environ["CARDFIGHT_AUTH_" + auth_setting] = ""

from backend.app import app  # noqa: E402
from backend.database import db  # noqa: E402


@pytest.fixture(autouse=True)
def clean_database():
    """Own the disposable memory schema; persistent setup uses migration tests."""
    app.config.update(TESTING=True)

    with app.app_context():
        db.drop_all()
        db.create_all()
        yield
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def app_context():
    with app.app_context():
        yield


@pytest.fixture()
def client():
    return app.test_client()


@pytest.fixture()
def select_queries():
    """Count cold-request SELECTs without including fixture/setup writes."""

    @contextmanager
    def capture_queries():
        statements = []

        def capture(_connection, _cursor, statement, parameters, _context, _many):
            if statement.lstrip().upper().startswith("SELECT"):
                statements.append((statement, parameters))

        engine = db.engine
        event.listen(engine, "before_cursor_execute", capture)
        try:
            yield statements
        finally:
            event.remove(engine, "before_cursor_execute", capture)

    return capture_queries
