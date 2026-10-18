"""add database-backed Study Buddy rate limits

Revision ID: a7b8c9d0e1f2
Revises: f7a8b9c0d1e2
Create Date: 2026-10-18 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, None] = "f7a8b9c0d1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "study_buddy_rate_limits",
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("window_started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("request_count", sa.Integer(), nullable=False),
        sa.CheckConstraint("request_count >= 0", name="ck_study_buddy_rate_limit_count"),
    )
    op.execute("REVOKE ALL ON public.study_buddy_rate_limits FROM anon, authenticated")
    op.execute("ALTER TABLE public.study_buddy_rate_limits ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_table("study_buddy_rate_limits")
