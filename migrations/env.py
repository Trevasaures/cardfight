"""Alembic runs only on the connection managed by backend.migrate.

The supported CLI owns backups, rehearsals, SQLite locking and transactions.
Running an unguarded `alembic upgrade` must not bypass those checks.
"""

from alembic import context


connection = context.config.attributes.get("connection")
if connection is None or not context.config.attributes.get("verified_workflow"):
    raise RuntimeError("Use python -m backend.migrate; direct Alembic upgrades are disabled.")

context.configure(
    connection=connection,
    target_metadata=None,
    render_as_batch=True,
    transactional_ddl=True,
)
with context.begin_transaction():
    context.run_migrations()
