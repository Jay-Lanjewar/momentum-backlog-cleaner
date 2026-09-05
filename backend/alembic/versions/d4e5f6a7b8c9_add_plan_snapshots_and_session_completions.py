"""add plan_snapshots and session_completions tables

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-09-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "plan_snapshots",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("plan_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("sessions", JSONB, nullable=False, server_default="[]"),
        sa.Column("daily_message", sa.Text, nullable=False, server_default=""),
        sa.Column("overflow", JSONB, nullable=False, server_default="[]"),
        sa.Column("source", sa.String(20), nullable=False, server_default="deterministic"),
        sa.Column("active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("user_id", "plan_date", "version", name="uq_plan_snapshot_version"),
    )
    op.execute(
        "CREATE INDEX idx_plan_snapshots_active ON plan_snapshots(user_id, plan_date) WHERE active = true"
    )

    op.create_table(
        "session_completions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("plan_snapshot_id", UUID(as_uuid=True), sa.ForeignKey("plan_snapshots.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_id", sa.String(255), nullable=False),
        sa.Column("backlog_item_id", UUID(as_uuid=True), sa.ForeignKey("backlog_items.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_number", sa.Integer, nullable=False),
        sa.Column("estimated_minutes", sa.Integer, nullable=False),
        sa.Column("actual_minutes", sa.Integer, nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="completed"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.execute(
        "CREATE INDEX idx_session_completions_snapshot ON session_completions(plan_snapshot_id)"
    )


def downgrade() -> None:
    op.drop_table("session_completions")
    op.execute("DROP INDEX IF EXISTS idx_plan_snapshots_active")
    op.drop_table("plan_snapshots")
