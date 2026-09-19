"""harden Supabase tables with RLS and revoke PostgREST access

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-09-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = (
    "users",
    "student_profiles",
    "weekly_schedules",
    "courses",
    "backlog_items",
    "goals",
    "study_streaks",
    "subject_streaks",
    "friend_requests",
    "friendships",
    "activities",
    "plan_snapshots",
    "session_completions",
    "alembic_version",
)


def upgrade() -> None:
    # ── Phase 1: Revoke all PostgREST access ──
    for table in TABLES:
        op.execute(f"REVOKE ALL ON public.{table} FROM anon, authenticated")

    # ── Phase 2: Enable RLS ──
    for table in TABLES:
        op.execute(f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY")

    # ── Phase 3: Ownership policies ──

    # -- Owner-only tables (single user_id column) --
    _owner_tables = (
        "student_profiles",
        "weekly_schedules",
        "courses",
        "backlog_items",
        "goals",
        "study_streaks",
        "subject_streaks",
        "plan_snapshots",
    )
    for table in _owner_tables:
        op.execute(f"""
            CREATE POLICY "{table}_owner_all" ON public.{table}
            FOR ALL USING (auth.uid() = user_id)
        """)

    # -- users: self-only (id is the auth user id) --
    op.execute("""
        CREATE POLICY "users_self_select" ON public.users
        FOR SELECT USING (auth.uid() = id)
    """)
    op.execute("""
        CREATE POLICY "users_self_update" ON public.users
        FOR UPDATE USING (auth.uid() = id)
    """)

    # -- friend_requests: composite ownership (sender_id / receiver_id) --
    op.execute("""
        CREATE POLICY "friend_requests_select" ON public.friend_requests
        FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id)
    """)
    op.execute("""
        CREATE POLICY "friend_requests_insert" ON public.friend_requests
        FOR INSERT WITH CHECK (auth.uid() = sender_id)
    """)
    op.execute("""
        CREATE POLICY "friend_requests_update" ON public.friend_requests
        FOR UPDATE USING (auth.uid() = receiver_id OR auth.uid() = sender_id)
    """)
    op.execute("""
        CREATE POLICY "friend_requests_delete" ON public.friend_requests
        FOR DELETE USING (auth.uid() = sender_id OR auth.uid() = receiver_id)
    """)

    # -- friendships: composite ownership (user1_id / user2_id) --
    op.execute("""
        CREATE POLICY "friendships_owner_all" ON public.friendships
        FOR ALL USING (auth.uid() = user1_id OR auth.uid() = user2_id)
    """)

    # -- activities: owner-only writes, read own rows --
    op.execute("""
        CREATE POLICY "activities_select" ON public.activities
        FOR SELECT USING (auth.uid() = user_id)
    """)
    op.execute("""
        CREATE POLICY "activities_insert" ON public.activities
        FOR INSERT WITH CHECK (auth.uid() = user_id)
    """)
    op.execute("""
        CREATE POLICY "activities_update" ON public.activities
        FOR UPDATE USING (auth.uid() = user_id)
    """)
    op.execute("""
        CREATE POLICY "activities_delete" ON public.activities
        FOR DELETE USING (auth.uid() = user_id)
    """)

    # -- session_completions: ownership via plan_snapshots join --
    op.execute("""
        CREATE POLICY "session_completions_owner_all" ON public.session_completions
        FOR ALL USING (
            EXISTS (
                SELECT 1 FROM public.plan_snapshots
                WHERE plan_snapshots.id = session_completions.plan_snapshot_id
                  AND plan_snapshots.user_id = auth.uid()
            )
        )
    """)

    # -- alembic_version: RLS enabled, no policies = blocked from PostgREST --


def downgrade() -> None:
    # ── Drop all policies ──
    for table in TABLES:
        op.execute(f"""
            DO $$
            DECLARE
                pol RECORD;
            BEGIN
                FOR pol IN
                    SELECT policyname FROM pg_policies
                    WHERE schemaname = 'public' AND tablename = '{table}'
                LOOP
                    EXECUTE format('DROP POLICY IF EXISTS %I ON public.{table}', pol.policyname);
                END LOOP;
            END $$;
        """)

    # ── Disable RLS ──
    for table in TABLES:
        op.execute(f"ALTER TABLE public.{table} DISABLE ROW LEVEL SECURITY")

    # ── Restore PostgREST access ──
    for table in TABLES:
        op.execute(f"GRANT ALL ON public.{table} TO anon, authenticated")
