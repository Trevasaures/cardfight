"""Add independent accounts, invitations, login transactions and sessions."""

from alembic import op

from migrations.identity_v2 import upgrade_schema
from migrations.legacy_v1 import SchemaError

revision = "0002_identity"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None


def upgrade():
    upgrade_schema(op.get_bind())


def downgrade():
    raise SchemaError(
        "Identity records must not be dropped by downgrade. Restore a verified "
        "backup to a new path with compatible code and follow the identity recovery runbook."
    )
