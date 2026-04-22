"""Phase 4: Restructure competency profile for per-criterion scoring and add audit table."""

revision = "004"
down_revision = "001"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID


def upgrade() -> None:
    # Add per-criterion scores column to competency_profiles
    op.add_column(
        "competency_profiles",
        sa.Column("criteria_scores", JSONB, nullable=False, server_default="[]"),
    )

    # Add belief model notes column (qualitative signal analysis)
    op.add_column(
        "competency_profiles",
        sa.Column("belief_model_notes", sa.Text(), nullable=True),
    )

    # Make competency_map nullable for backward compatibility (no longer populated by profiler)
    op.alter_column("competency_profiles", "competency_map", nullable=True)

    # Create the instructor score override audit table
    op.create_table(
        "profile_score_edits",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "profile_id",
            UUID(as_uuid=True),
            sa.ForeignKey("competency_profiles.id"),
            nullable=False,
        ),
        sa.Column("criterion_id", sa.String(100), nullable=False),
        sa.Column("original_score", sa.Integer(), nullable=False),
        sa.Column("new_score", sa.Integer(), nullable=False),
        sa.Column(
            "edited_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "edited_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=True,
        ),
    )

    op.create_index(
        "idx_profile_edits_profile",
        "profile_score_edits",
        ["profile_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_profile_edits_profile", table_name="profile_score_edits")
    op.drop_table("profile_score_edits")
    op.alter_column("competency_profiles", "competency_map", nullable=False)
    op.drop_column("competency_profiles", "belief_model_notes")
    op.drop_column("competency_profiles", "criteria_scores")
