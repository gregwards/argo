"""Add slug and max_attempts to assessments, assessment_id to auth_tokens."""

revision = "001"
down_revision = None
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


def upgrade() -> None:
    op.add_column("assessments", sa.Column("slug", sa.String(255), unique=True, nullable=True))
    op.add_column("assessments", sa.Column("max_attempts", sa.Integer(), server_default="1", nullable=True))
    op.add_column("auth_tokens", sa.Column("assessment_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_auth_tokens_assessment_id",
        "auth_tokens",
        "assessments",
        ["assessment_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_auth_tokens_assessment_id", "auth_tokens", type_="foreignkey")
    op.drop_column("auth_tokens", "assessment_id")
    op.drop_column("assessments", "max_attempts")
    op.drop_column("assessments", "slug")
