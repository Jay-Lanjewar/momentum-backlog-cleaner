"""revoke EXECUTE on handle_new_user from anon/authenticated/PUBLIC

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-09-19 00:00:00.000000

The SECURITY DEFINER trigger function public.handle_new_user() is invoked
by the database engine via the on_auth_user_created trigger on auth.users.
Trigger-fired functions bypass EXECUTE grants -- the trigger mechanism
uses the function owner's privileges (postgres superuser), not the
caller's.  Revoking EXECUTE from PUBLIC/anon/authenticated prevents
direct SQL calls (e.g. SELECT public.handle_new_user()) from non-superuser
roles while leaving the auth signup flow unaffected.
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

FUNCTION = "public.handle_new_user()"


def upgrade() -> None:
    op.execute(f"REVOKE EXECUTE ON FUNCTION {FUNCTION} FROM PUBLIC")
    op.execute(f"REVOKE EXECUTE ON FUNCTION {FUNCTION} FROM anon")
    op.execute(f"REVOKE EXECUTE ON FUNCTION {FUNCTION} FROM authenticated")


def downgrade() -> None:
    op.execute(f"GRANT EXECUTE ON FUNCTION {FUNCTION} TO PUBLIC")
