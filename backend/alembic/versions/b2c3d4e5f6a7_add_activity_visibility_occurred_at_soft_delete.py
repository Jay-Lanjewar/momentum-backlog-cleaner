"""add activity visibility occurred_at soft delete

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-26 01:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'activities',
        sa.Column('visibility', sa.String(length=20), nullable=False, server_default='FRIENDS'),
    )
    op.add_column(
        'activities',
        sa.Column('occurred_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.add_column(
        'activities',
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('activities', 'deleted_at')
    op.drop_column('activities', 'occurred_at')
    op.drop_column('activities', 'visibility')
