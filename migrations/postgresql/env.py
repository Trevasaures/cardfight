"""Run PostgreSQL Alembic migrations on the verified workflow's connection."""

from alembic import context

connection = context.config.attributes.get("connection")
if (
    connection is None
    or not context.config.attributes.get("verified_workflow")
    or connection.dialect.name != "postgresql"
):
    raise RuntimeError(
        "Use the Cardfight PostgreSQL migration workflow; direct Alembic upgrades are disabled."
    )

context.configure(
    connection=connection,
    version_table_schema="public",
    transactional_ddl=True,
)
with context.begin_transaction():
    context.run_migrations()
