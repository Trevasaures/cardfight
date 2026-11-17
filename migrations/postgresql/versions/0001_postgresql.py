"""Create the initial PostgreSQL catalog, identity and ownership schema."""

from alembic import op
from sqlalchemy.schema import CreateIndex, CreateTable

from migrations.postgresql.baseline import SCHEMA

revision = "0001_postgresql"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    connection = op.get_bind()
    for table in SCHEMA.sorted_tables:
        connection.execute(CreateTable(table))
        for index in sorted(table.indexes, key=lambda item: item.name):
            connection.execute(CreateIndex(index))


def downgrade():
    raise RuntimeError(
        "Restore a verified pre-upgrade PostgreSQL backup with its matching code version."
    )
