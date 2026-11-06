"""Frozen baseline and explicit bridge from supported unversioned SQLite layouts."""

from alembic import op

from migrations.legacy_v1 import SchemaError, upgrade_schema


revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    upgrade_schema(op.get_bind())


def downgrade():
    raise SchemaError(
        "The initial baseline cannot be downgraded destructively. Restore a verified "
        "pre-upgrade backup to a new path and use its compatible application version."
    )
