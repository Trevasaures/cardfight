import os

import pytest


os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from backend.app import app  # noqa: E402
from backend.database import db  # noqa: E402


@pytest.fixture(autouse=True)
def clean_database():
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
