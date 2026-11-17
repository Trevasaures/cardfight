import os

import pytest
from sqlalchemy.engine import URL, make_url

from deploy.container import configure_database


@pytest.mark.parametrize(
    "database_url",
    [None, "sqlite:////tmp/cardfight.db", "postgresql://app:secret@localhost/app"],
)
def test_deployment_rejects_missing_or_local_database(monkeypatch, database_url):
    if database_url is None:
        monkeypatch.delenv("DATABASE_URL", raising=False)
    else:
        monkeypatch.setenv("DATABASE_URL", database_url)

    with pytest.raises(SystemExit, match="Set DATABASE_URL") as error:
        configure_database()
    assert "secret" not in str(error.value)


@pytest.mark.parametrize("drivername", ["postgres", "postgresql", "postgresql+psycopg"])
def test_deployment_normalizes_host_supplied_url(monkeypatch, drivername):
    url = URL.create(
        drivername,
        "cardfight",
        "p@ss%word",
        "staging-database",
        5432,
        "cardfight_staging",
        {"sslmode": "require"},
    )
    monkeypatch.setenv("DATABASE_URL", url.render_as_string(hide_password=False))

    configure_database()

    assert make_url(os.environ["DATABASE_URL"]) == url.set(
        drivername="postgresql+psycopg"
    )
