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
from migrations.legacy_v1 import TABLES as BASELINE_TABLES, upgrade_schema as upgrade_legacy  # noqa: E402
from migrations.ownership_v3 import OWNED_TABLES, WORKSPACE_TABLES, upgrade_schema as upgrade_ownership  # noqa: E402


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
def explicit_legacy_upgrade():
    """Run frozen v1 against a test schema seeded through the current ORM."""

    def run():
        assert db.engine.url.database == ":memory:"
        db.session.commit()
        with db.engine.connect() as connection:
            connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
            connection.commit()
            connection.exec_driver_sql("BEGIN IMMEDIATE")
            try:
                for table in OWNED_TABLES:
                    baseline = BASELINE_TABLES[table]
                    original = f'"{table}"'
                    temporary = f'"test_legacy_{table}"'
                    actual_columns = {
                        row[1] for row in connection.exec_driver_sql(f"PRAGMA table_info({original})")
                    }
                    assert connection.exec_driver_sql(
                        f"SELECT 1 FROM {original} WHERE owner_account_id IS NOT NULL LIMIT 1"
                    ).first() is None
                    baseline_columns = [column["name"] for column in baseline["columns"]]
                    missing = set(baseline_columns) - actual_columns
                    # The archive test deliberately removed this column already.
                    # Keep that old shape until the v1 upgrade itself runs.
                    assert not missing or (table == "acquisition_plan" and missing == {"archived_at"})
                    create_sql = "\n".join(
                        line for line in baseline["create_sql"].splitlines()
                        if not any(line.strip().startswith(column + " ") for column in missing)
                    )
                    columns = ", ".join(
                        f'"{column}"' for column in baseline_columns if column in actual_columns
                    )
                    baseline_indexes = {index["name"] for index in baseline["indexes"]}
                    owner_indexes = {
                        index["name"] for index in WORKSPACE_TABLES[table]["indexes"]
                    } - baseline_indexes
                    objects = connection.exec_driver_sql(
                        "SELECT name, sql FROM sqlite_master WHERE tbl_name=? "
                        "AND type IN ('index','trigger') AND sql IS NOT NULL",
                        (table,),
                    ).all()
                    connection.exec_driver_sql(f"CREATE TEMP TABLE {temporary} AS SELECT {columns} FROM {original}")
                    connection.exec_driver_sql(f"DROP TABLE {original}")
                    connection.exec_driver_sql(create_sql)
                    connection.exec_driver_sql(f"INSERT INTO {original} ({columns}) SELECT {columns} FROM {temporary}")
                    connection.exec_driver_sql(f"DROP TABLE {temporary}")
                    for name, statement in objects:
                        if name not in owner_indexes:
                            connection.exec_driver_sql(statement)
                upgrade_legacy(connection)
                # Restore the current columns before the ORM/API assertions.
                upgrade_ownership(connection)
                assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []
                connection.commit()
                db.session.expire_all()
            except BaseException:
                connection.rollback()
                raise
            finally:
                connection.exec_driver_sql("PRAGMA foreign_keys=ON")
                connection.commit()

    return run


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
