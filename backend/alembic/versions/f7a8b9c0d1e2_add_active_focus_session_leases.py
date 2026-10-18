"""add persisted active Focus session leases

Revision ID: f7a8b9c0d1e2
Revises: f6a7b8c9d0e1
Create Date: 2026-10-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "f7a8b9c0d1e2"
down_revision: Union[str, None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "active_focus_sessions",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id", UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column(
            "plan_snapshot_id", UUID(as_uuid=True),
            sa.ForeignKey("plan_snapshots.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("session_id", sa.String(255), nullable=False),
        sa.Column("generation", sa.String(80), nullable=False),
        sa.Column("state", sa.String(16), nullable=False),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.CheckConstraint(
            "state IN ('running', 'paused', 'cancelled', 'completed')",
            name="ck_active_focus_sessions_state",
        ),
        sa.UniqueConstraint("user_id", name="uq_active_focus_sessions_user"),
    )
    op.create_index(
        "idx_active_focus_sessions_lease",
        "active_focus_sessions",
        ["state", "lease_expires_at"],
    )
    op.execute(
        "REVOKE ALL ON public.active_focus_sessions FROM anon, authenticated"
    )
    op.execute("ALTER TABLE public.active_focus_sessions ENABLE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY "active_focus_sessions_owner_all"
        ON public.active_focus_sessions
        FOR ALL USING (auth.uid() = user_id)
    """)


def downgrade() -> None:
    op.execute(
        'DROP POLICY IF EXISTS "active_focus_sessions_owner_all" '
        "ON public.active_focus_sessions"
    )
    op.drop_index(
        "idx_active_focus_sessions_lease", table_name="active_focus_sessions"
    )
    op.drop_table("active_focus_sessions")
