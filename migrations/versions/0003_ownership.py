"""Add nullable account ownership to the private workspace roots."""

from alembic import op

from migrations.legacy_v1 import SchemaError
from migrations.ownership_v3 import upgrade_schema

revision = "0003_ownership"
down_revision = "0002_identity"
branch_labels = None
depends_on = None


def upgrade():
    upgrade_schema(op.get_bind())


def downgrade():
    raise SchemaError(
        "Ownership cannot be dropped by downgrade. Restore a verified "
        "pre-upgrade backup to a new path and use compatible code."
    )
