"""align public.users with auth.users (Supabase auth pattern)

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-07-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    _drop_child_fks()
    _migrate_data()
    _recreate_child_fks()
    _add_auth_fk()
    _create_trigger_function()
    _create_trigger()
    _verify_sync()


def _drop_child_fks() -> None:
    op.drop_constraint("student_profiles_user_id_fkey", "student_profiles", type_="foreignkey")
    op.drop_constraint("weekly_schedules_user_id_fkey", "weekly_schedules", type_="foreignkey")
    op.drop_constraint("courses_user_id_fkey", "courses", type_="foreignkey")
    op.drop_constraint("backlog_items_user_id_fkey", "backlog_items", type_="foreignkey")
    op.drop_constraint("goals_user_id_fkey", "goals", type_="foreignkey")
    op.drop_constraint("study_streaks_user_id_fkey", "study_streaks", type_="foreignkey")
    op.drop_constraint("subject_streaks_user_id_fkey", "subject_streaks", type_="foreignkey")
    op.drop_constraint("friend_requests_sender_id_fkey", "friend_requests", type_="foreignkey")
    op.drop_constraint("friend_requests_receiver_id_fkey", "friend_requests", type_="foreignkey")
    op.drop_constraint("friendships_user1_id_fkey", "friendships", type_="foreignkey")
    op.drop_constraint("friendships_user2_id_fkey", "friendships", type_="foreignkey")
    op.drop_constraint("activities_user_id_fkey", "activities", type_="foreignkey")


def _migrate_data() -> None:
    op.execute("""
        DO $$
        DECLARE
            rec RECORD;
            old_id UUID;
            new_id UUID;
            migrated_count INTEGER := 0;
            created_count INTEGER := 0;
            orphan_id UUID;
            orphan_email TEXT;
            child_count INTEGER;
            total_orphan_count INTEGER := 0;
            has_dangerous_orphan BOOLEAN := FALSE;
        BEGIN
            -- Phase 1: Migrate users whose email matches auth.users but IDs differ
            FOR rec IN
                SELECT pu.id AS old_pub_id, au.id AS new_auth_id,
                       pu.email, pu.name, pu.avatar_url,
                       pu.created_at, pu.updated_at
                FROM public.users pu
                INNER JOIN auth.users au ON au.email = pu.email
                WHERE pu.id != au.id
            LOOP
                old_id := rec.old_pub_id;
                new_id := rec.new_auth_id;

                UPDATE public.student_profiles SET user_id = new_id WHERE user_id = old_id;
                UPDATE public.weekly_schedules SET user_id = new_id WHERE user_id = old_id;
                UPDATE public.courses SET user_id = new_id WHERE user_id = old_id;
                UPDATE public.backlog_items SET user_id = new_id WHERE user_id = old_id;
                UPDATE public.goals SET user_id = new_id WHERE user_id = old_id;
                UPDATE public.study_streaks SET user_id = new_id WHERE user_id = old_id;
                UPDATE public.subject_streaks SET user_id = new_id WHERE user_id = old_id;
                UPDATE public.friend_requests SET sender_id = new_id WHERE sender_id = old_id;
                UPDATE public.friend_requests SET receiver_id = new_id WHERE receiver_id = old_id;
                UPDATE public.friendships SET user1_id = new_id WHERE user1_id = old_id;
                UPDATE public.friendships SET user2_id = new_id WHERE user2_id = old_id;
                UPDATE public.activities SET user_id = new_id WHERE user_id = old_id;

                DELETE FROM public.users WHERE id = old_id;

                INSERT INTO public.users (id, email, name, avatar_url, created_at, updated_at)
                VALUES (new_id, rec.email, rec.name, rec.avatar_url, rec.created_at, rec.updated_at);

                migrated_count := migrated_count + 1;
            END LOOP;

            -- Phase 2: Create public.users rows for auth.users entries that have none
            FOR rec IN
                SELECT au.id, au.email,
                       COALESCE(au.raw_user_meta_data->>'name', au.email) AS name,
                       au.created_at
                FROM auth.users au
                LEFT JOIN public.users pu ON pu.id = au.id
                WHERE pu.id IS NULL
            LOOP
                INSERT INTO public.users (id, email, name, created_at, updated_at)
                VALUES (rec.id, rec.email, rec.name, rec.created_at, rec.created_at);

                created_count := created_count + 1;
            END LOOP;

            -- Phase 3: Conservative orphan cleanup.
            -- A public.user is deleted ONLY if it has no matching auth.users
            -- AND no child table references it. Otherwise the migration aborts.
            FOR rec IN
                SELECT pu.id, pu.email
                FROM public.users pu
                LEFT JOIN auth.users au ON au.id = pu.id
                WHERE au.id IS NULL
            LOOP
                orphan_id := rec.id;
                orphan_email := rec.email;

                child_count := 0;
                SELECT COUNT(*) INTO child_count FROM public.student_profiles WHERE user_id = orphan_id;
                IF child_count > 0 THEN has_dangerous_orphan := TRUE; END IF;
                SELECT child_count + COUNT(*) INTO child_count FROM public.weekly_schedules WHERE user_id = orphan_id;
                SELECT child_count + COUNT(*) INTO child_count FROM public.courses WHERE user_id = orphan_id;
                SELECT child_count + COUNT(*) INTO child_count FROM public.backlog_items WHERE user_id = orphan_id;
                SELECT child_count + COUNT(*) INTO child_count FROM public.goals WHERE user_id = orphan_id;
                SELECT child_count + COUNT(*) INTO child_count FROM public.study_streaks WHERE user_id = orphan_id;
                SELECT child_count + COUNT(*) INTO child_count FROM public.subject_streaks WHERE user_id = orphan_id;
                SELECT child_count + COUNT(*) INTO child_count FROM public.friend_requests WHERE sender_id = orphan_id;
                SELECT child_count + COUNT(*) INTO child_count FROM public.friend_requests WHERE receiver_id = orphan_id;
                SELECT child_count + COUNT(*) INTO child_count FROM public.friendships WHERE user1_id = orphan_id;
                SELECT child_count + COUNT(*) INTO child_count FROM public.friendships WHERE user2_id = orphan_id;
                SELECT child_count + COUNT(*) INTO child_count FROM public.activities WHERE user_id = orphan_id;

                IF child_count = 0 THEN
                    DELETE FROM public.users WHERE id = orphan_id;
                    total_orphan_count := total_orphan_count + 1;
                ELSE
                    RAISE WARNING 'ORPHAN SKIPPED: public.users id=% email=% has % child record(s)',
                                  orphan_id, orphan_email, child_count;
                END IF;
            END LOOP;

            IF has_dangerous_orphan THEN
                RAISE EXCEPTION E'MIGRATION ABORTED: public.users row(s) exist without matching auth.users AND with existing child data.\n'
                                 'These are not simple orphans — they have real related records.\n'
                                 'Manually resolve each user listed in the WARNINGs above, then re-run this migration.\n'
                                 'Possible resolutions per user:\n'
                                 '  1. Create a matching auth.users entry via Supabase Admin API.\n'
                                 '  2. If the user is a test artifact, delete the public.users row and all child data manually.\n'
                                 '  3. If the email is valid, sign up the user via the normal flow and then transfer child data.';
            END IF;

            RAISE NOTICE 'auth_migration: migrated=%, created=%, orphans_cleanly_removed=%',
                         migrated_count, created_count, total_orphan_count;
        END $$;
    """)


def _recreate_child_fks() -> None:
    op.create_foreign_key(
        "student_profiles_user_id_fkey", "student_profiles", "users",
        ["user_id"], ["id"], ondelete="CASCADE"
    )
    op.create_foreign_key(
        "weekly_schedules_user_id_fkey", "weekly_schedules", "users",
        ["user_id"], ["id"], ondelete="CASCADE"
    )
    op.create_foreign_key(
        "courses_user_id_fkey", "courses", "users",
        ["user_id"], ["id"], ondelete="CASCADE"
    )
    op.create_foreign_key(
        "backlog_items_user_id_fkey", "backlog_items", "users",
        ["user_id"], ["id"], ondelete="CASCADE"
    )
    op.create_foreign_key(
        "goals_user_id_fkey", "goals", "users",
        ["user_id"], ["id"], ondelete="CASCADE"
    )
    op.create_foreign_key(
        "study_streaks_user_id_fkey", "study_streaks", "users",
        ["user_id"], ["id"], ondelete="CASCADE"
    )
    op.create_foreign_key(
        "subject_streaks_user_id_fkey", "subject_streaks", "users",
        ["user_id"], ["id"], ondelete="CASCADE"
    )
    op.create_foreign_key(
        "friend_requests_sender_id_fkey", "friend_requests", "users",
        ["sender_id"], ["id"], ondelete="CASCADE"
    )
    op.create_foreign_key(
        "friend_requests_receiver_id_fkey", "friend_requests", "users",
        ["receiver_id"], ["id"], ondelete="CASCADE"
    )
    op.create_foreign_key(
        "friendships_user1_id_fkey", "friendships", "users",
        ["user1_id"], ["id"], ondelete="CASCADE"
    )
    op.create_foreign_key(
        "friendships_user2_id_fkey", "friendships", "users",
        ["user2_id"], ["id"], ondelete="CASCADE"
    )
    op.create_foreign_key(
        "activities_user_id_fkey", "activities", "users",
        ["user_id"], ["id"], ondelete="CASCADE"
    )


def _add_auth_fk() -> None:
    op.create_foreign_key(
        "users_id_fkey", "users", "auth.users",
        ["id"], ["id"], ondelete="CASCADE"
    )


def _create_trigger_function() -> None:
    op.execute("""
        CREATE OR REPLACE FUNCTION public.handle_new_user()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        SECURITY DEFINER SET search_path = ''
        AS $$
        BEGIN
            INSERT INTO public.users (id, email, name)
            VALUES (
                NEW.id,
                NEW.email,
                COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
            )
            ON CONFLICT (id) DO UPDATE SET
                email = EXCLUDED.email,
                name = EXCLUDED.name;
            RETURN NEW;
        END;
        $$;
    """)


def _create_trigger() -> None:
    op.execute("DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;")
    op.execute("""
        CREATE TRIGGER on_auth_user_created
            AFTER INSERT ON auth.users
            FOR EACH ROW
            EXECUTE FUNCTION public.handle_new_user();
    """)


def _verify_sync() -> None:
    op.execute("""
        DO $$
        DECLARE
            orphan_count INTEGER;
            missing_count INTEGER;
            fk_exists BOOLEAN;
            trigger_exists BOOLEAN;
            func_exists BOOLEAN;
        BEGIN
            -- Check 1: No public.users without matching auth.users
            SELECT COUNT(*) INTO orphan_count
            FROM public.users pu
            LEFT JOIN auth.users au ON au.id = pu.id
            WHERE au.id IS NULL;

            IF orphan_count > 0 THEN
                RAISE EXCEPTION 'VERIFICATION FAILED: % orphaned public.users row(s) without matching auth.users entry', orphan_count;
            END IF;

            -- Check 2: Every auth.users has a corresponding public.users
            SELECT COUNT(*) INTO missing_count
            FROM auth.users au
            LEFT JOIN public.users pu ON pu.id = au.id
            WHERE pu.id IS NULL;

            IF missing_count > 0 THEN
                RAISE EXCEPTION 'VERIFICATION FAILED: % auth.users row(s) missing public.users entry', missing_count;
            END IF;

            -- Check 3: FK constraint exists: public.users.id -> auth.users.id
            SELECT EXISTS (
                SELECT 1 FROM information_schema.table_constraints tc
                INNER JOIN information_schema.constraint_column_usage ccu
                    ON tc.constraint_name = ccu.constraint_name
                    AND tc.constraint_schema = ccu.constraint_schema
                WHERE tc.constraint_type = 'FOREIGN KEY'
                  AND tc.table_schema = 'public'
                  AND tc.table_name = 'users'
                  AND tc.constraint_name = 'users_id_fkey'
                  AND ccu.table_schema = 'auth'
                  AND ccu.table_name = 'users'
            ) INTO fk_exists;

            IF NOT fk_exists THEN
                RAISE EXCEPTION 'VERIFICATION FAILED: FK constraint users_id_fkey (public.users -> auth.users) not found';
            END IF;

            -- Check 4: Trigger exists on auth.users
            SELECT EXISTS (
                SELECT 1 FROM information_schema.triggers
                WHERE event_object_schema = 'auth'
                  AND event_object_table = 'users'
                  AND trigger_name = 'on_auth_user_created'
            ) INTO trigger_exists;

            IF NOT trigger_exists THEN
                RAISE EXCEPTION 'VERIFICATION FAILED: Trigger on_auth_user_created on auth.users not found';
            END IF;

            -- Check 5: Function exists
            SELECT EXISTS (
                SELECT 1 FROM information_schema.routines
                WHERE routine_schema = 'public'
                  AND routine_name = 'handle_new_user'
                  AND routine_type = 'FUNCTION'
            ) INTO func_exists;

            IF NOT func_exists THEN
                RAISE EXCEPTION 'VERIFICATION FAILED: Function public.handle_new_user() not found';
            END IF;

            -- Check 6: All child FK constraints exist
            IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'student_profiles_user_id_fkey' AND table_schema = 'public') THEN
                RAISE EXCEPTION 'VERIFICATION FAILED: Missing FK student_profiles_user_id_fkey';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'weekly_schedules_user_id_fkey' AND table_schema = 'public') THEN
                RAISE EXCEPTION 'VERIFICATION FAILED: Missing FK weekly_schedules_user_id_fkey';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'courses_user_id_fkey' AND table_schema = 'public') THEN
                RAISE EXCEPTION 'VERIFICATION FAILED: Missing FK courses_user_id_fkey';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'backlog_items_user_id_fkey' AND table_schema = 'public') THEN
                RAISE EXCEPTION 'VERIFICATION FAILED: Missing FK backlog_items_user_id_fkey';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'goals_user_id_fkey' AND table_schema = 'public') THEN
                RAISE EXCEPTION 'VERIFICATION FAILED: Missing FK goals_user_id_fkey';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'study_streaks_user_id_fkey' AND table_schema = 'public') THEN
                RAISE EXCEPTION 'VERIFICATION FAILED: Missing FK study_streaks_user_id_fkey';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'subject_streaks_user_id_fkey' AND table_schema = 'public') THEN
                RAISE EXCEPTION 'VERIFICATION FAILED: Missing FK subject_streaks_user_id_fkey';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'friend_requests_sender_id_fkey' AND table_schema = 'public') THEN
                RAISE EXCEPTION 'VERIFICATION FAILED: Missing FK friend_requests_sender_id_fkey';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'friend_requests_receiver_id_fkey' AND table_schema = 'public') THEN
                RAISE EXCEPTION 'VERIFICATION FAILED: Missing FK friend_requests_receiver_id_fkey';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'friendships_user1_id_fkey' AND table_schema = 'public') THEN
                RAISE EXCEPTION 'VERIFICATION FAILED: Missing FK friendships_user1_id_fkey';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'friendships_user2_id_fkey' AND table_schema = 'public') THEN
                RAISE EXCEPTION 'VERIFICATION FAILED: Missing FK friendships_user2_id_fkey';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'activities_user_id_fkey' AND table_schema = 'public') THEN
                RAISE EXCEPTION 'VERIFICATION FAILED: Missing FK activities_user_id_fkey';
            END IF;

            RAISE NOTICE 'VERIFICATION PASSED: public.users is fully synchronized with auth.users';
            RAISE NOTICE '  - Zero orphan rows';
            RAISE NOTICE '  - Zero missing rows';
            RAISE NOTICE '  - FK users_id_fkey -> auth.users(id) present';
            RAISE NOTICE '  - Trigger on_auth_user_created present';
            RAISE NOTICE '  - Function handle_new_user() present';
            RAISE NOTICE '  - All 12 child FK constraints present';
        END $$;
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;")
    op.execute("DROP FUNCTION IF EXISTS public.handle_new_user();")

    op.drop_constraint("users_id_fkey", "users", type_="foreignkey")

    op.drop_constraint("student_profiles_user_id_fkey", "student_profiles", type_="foreignkey")
    op.drop_constraint("weekly_schedules_user_id_fkey", "weekly_schedules", type_="foreignkey")
    op.drop_constraint("courses_user_id_fkey", "courses", type_="foreignkey")
    op.drop_constraint("backlog_items_user_id_fkey", "backlog_items", type_="foreignkey")
    op.drop_constraint("goals_user_id_fkey", "goals", type_="foreignkey")
    op.drop_constraint("study_streaks_user_id_fkey", "study_streaks", type_="foreignkey")
    op.drop_constraint("subject_streaks_user_id_fkey", "subject_streaks", type_="foreignkey")
    op.drop_constraint("friend_requests_sender_id_fkey", "friend_requests", type_="foreignkey")
    op.drop_constraint("friend_requests_receiver_id_fkey", "friend_requests", type_="foreignkey")
    op.drop_constraint("friendships_user1_id_fkey", "friendships", type_="foreignkey")
    op.drop_constraint("friendships_user2_id_fkey", "friendships", type_="foreignkey")
    op.drop_constraint("activities_user_id_fkey", "activities", type_="foreignkey")

    op.create_foreign_key(
        "student_profiles_user_id_fkey", "student_profiles", "users",
        ["user_id"], ["id"], ondelete="CASCADE"
    )
    op.create_foreign_key(
        "weekly_schedules_user_id_fkey", "weekly_schedules", "users",
        ["user_id"], ["id"], ondelete="CASCADE"
    )
    op.create_foreign_key(
        "courses_user_id_fkey", "courses", "users",
        ["user_id"], ["id"], ondelete="CASCADE"
    )
    op.create_foreign_key(
        "backlog_items_user_id_fkey", "backlog_items", "users",
        ["user_id"], ["id"], ondelete="CASCADE"
    )
    op.create_foreign_key(
        "goals_user_id_fkey", "goals", "users",
        ["user_id"], ["id"], ondelete="CASCADE"
    )
    op.create_foreign_key(
        "study_streaks_user_id_fkey", "study_streaks", "users",
        ["user_id"], ["id"], ondelete="CASCADE"
    )
    op.create_foreign_key(
        "subject_streaks_user_id_fkey", "subject_streaks", "users",
        ["user_id"], ["id"], ondelete="CASCADE"
    )
    op.create_foreign_key(
        "friend_requests_sender_id_fkey", "friend_requests", "users",
        ["sender_id"], ["id"], ondelete="CASCADE"
    )
    op.create_foreign_key(
        "friend_requests_receiver_id_fkey", "friend_requests", "users",
        ["receiver_id"], ["id"], ondelete="CASCADE"
    )
    op.create_foreign_key(
        "friendships_user1_id_fkey", "friendships", "users",
        ["user1_id"], ["id"], ondelete="CASCADE"
    )
    op.create_foreign_key(
        "friendships_user2_id_fkey", "friendships", "users",
        ["user2_id"], ["id"], ondelete="CASCADE"
    )
    op.create_foreign_key(
        "activities_user_id_fkey", "activities", "users",
        ["user_id"], ["id"], ondelete="CASCADE"
    )
