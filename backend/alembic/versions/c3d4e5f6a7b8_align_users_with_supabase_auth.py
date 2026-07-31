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
    _phase_a_build_mapping()
    _phase_b_update_child_tables()
    _phase_c_delete_mapped_rows()
    _phase_d_recreate_mapped_rows()
    _recreate_child_fks()
    _purge_dev_users()
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


def _phase_a_build_mapping() -> None:
    op.execute("""
        CREATE TEMP TABLE user_id_map (
            old_id UUID PRIMARY KEY,
            new_id UUID NOT NULL,
            email VARCHAR(255) NOT NULL,
            name VARCHAR(255),
            avatar_url TEXT,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL
        );
    """)

    op.execute("""
        INSERT INTO user_id_map (old_id, new_id, email, name, avatar_url, created_at, updated_at)
        SELECT pu.id, au.id, pu.email, pu.name, pu.avatar_url, pu.created_at, pu.updated_at
        FROM public.users pu
        INNER JOIN auth.users au ON lower(trim(pu.email)) = lower(trim(au.email))
        WHERE pu.id != au.id
          AND pu.email NOT LIKE '%@dev.local';
    """)

    op.execute("""
        DO $$ BEGIN
            RAISE NOTICE 'Phase A: mapped % users', (SELECT COUNT(*)::TEXT FROM user_id_map);
        END $$;
    """)

    op.execute("""
        DO $$
        DECLARE
            r RECORD;
            has_danger BOOLEAN := FALSE;
            total_child BIGINT;
            mapped_count BIGINT;
            msg TEXT := '';
        BEGIN
            SELECT COUNT(*) INTO mapped_count FROM user_id_map;

            FOR r IN
                SELECT pu.id, pu.email
                FROM public.users pu
                WHERE NOT EXISTS (SELECT 1 FROM user_id_map m WHERE m.old_id = pu.id)
                  AND NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = pu.id)
                  AND pu.email NOT LIKE '%@dev.local'
            LOOP
                total_child := 0;
                SELECT COUNT(*) INTO total_child FROM public.student_profiles WHERE user_id = r.id;
                IF total_child > 0 THEN has_danger := TRUE; END IF;
                SELECT total_child + COUNT(*) INTO total_child FROM public.weekly_schedules WHERE user_id = r.id;
                SELECT total_child + COUNT(*) INTO total_child FROM public.courses WHERE user_id = r.id;
                SELECT total_child + COUNT(*) INTO total_child FROM public.backlog_items WHERE user_id = r.id;
                SELECT total_child + COUNT(*) INTO total_child FROM public.goals WHERE user_id = r.id;
                SELECT total_child + COUNT(*) INTO total_child FROM public.study_streaks WHERE user_id = r.id;
                SELECT total_child + COUNT(*) INTO total_child FROM public.subject_streaks WHERE user_id = r.id;
                SELECT total_child + COUNT(*) INTO total_child FROM public.friend_requests WHERE sender_id = r.id;
                SELECT total_child + COUNT(*) INTO total_child FROM public.friend_requests WHERE receiver_id = r.id;
                SELECT total_child + COUNT(*) INTO total_child FROM public.friendships WHERE user1_id = r.id;
                SELECT total_child + COUNT(*) INTO total_child FROM public.friendships WHERE user2_id = r.id;
                SELECT total_child + COUNT(*) INTO total_child FROM public.activities WHERE user_id = r.id;

                IF total_child > 0 THEN
                    msg := msg || E'\n  pub.id=' || r.id::TEXT
                        || E'\n  email=' || r.email
                        || E'\n  child_rows=' || total_child::TEXT
                        || E'\n  in_user_id_map=false'
                        || E'\n  in_auth_users=false'
                        || E'\n';
                END IF;
            END LOOP;

            IF has_danger THEN
                RAISE EXCEPTION E'Phase A ABORT\n'
                                 'mapped_count=%\n'
                                 'Offending rows:%',
                                 mapped_count, msg;
            END IF;
        END $$;
    """)





def _phase_b_update_child_tables() -> None:
    op.execute("UPDATE public.student_profiles sp SET user_id = m.new_id FROM user_id_map m WHERE sp.user_id = m.old_id;")
    op.execute("UPDATE public.weekly_schedules ws SET user_id = m.new_id FROM user_id_map m WHERE ws.user_id = m.old_id;")
    op.execute("UPDATE public.courses c SET user_id = m.new_id FROM user_id_map m WHERE c.user_id = m.old_id;")
    op.execute("UPDATE public.backlog_items bi SET user_id = m.new_id FROM user_id_map m WHERE bi.user_id = m.old_id;")
    op.execute("UPDATE public.goals g SET user_id = m.new_id FROM user_id_map m WHERE g.user_id = m.old_id;")
    op.execute("UPDATE public.study_streaks ss SET user_id = m.new_id FROM user_id_map m WHERE ss.user_id = m.old_id;")
    op.execute("UPDATE public.subject_streaks ss SET user_id = m.new_id FROM user_id_map m WHERE ss.user_id = m.old_id;")
    op.execute("UPDATE public.friend_requests fr SET sender_id = m.new_id FROM user_id_map m WHERE fr.sender_id = m.old_id;")
    op.execute("UPDATE public.friend_requests fr SET receiver_id = m.new_id FROM user_id_map m WHERE fr.receiver_id = m.old_id;")
    op.execute("UPDATE public.friendships f SET user1_id = m.new_id FROM user_id_map m WHERE f.user1_id = m.old_id;")
    op.execute("UPDATE public.friendships f SET user2_id = m.new_id FROM user_id_map m WHERE f.user2_id = m.old_id;")
    op.execute("UPDATE public.activities a SET user_id = m.new_id FROM user_id_map m WHERE a.user_id = m.old_id;")


def _phase_c_delete_mapped_rows() -> None:
    op.execute("DELETE FROM public.users u USING user_id_map m WHERE u.id = m.old_id;")


def _phase_d_recreate_mapped_rows() -> None:
    op.execute("""
        INSERT INTO public.users (id, email, name, avatar_url, created_at, updated_at)
        SELECT m.new_id, m.email, m.name, m.avatar_url, m.created_at, m.updated_at
        FROM user_id_map m;
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


def _purge_dev_users() -> None:
    op.execute("""
        DO $$
        DECLARE
            purged BIGINT;
        BEGIN
            WITH deleted AS (
                DELETE FROM public.users pu
                WHERE pu.email LIKE '%@dev.local'
                  AND NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = pu.id)
                RETURNING 1
            )
            SELECT COUNT(*) INTO purged FROM deleted;

            RAISE NOTICE 'Purged % dev user(s) with email ending in @dev.local (no matching auth.users)', purged;
        END $$;
    """)


def _add_auth_fk() -> None:
    op.execute("""
        ALTER TABLE public.users
        ADD CONSTRAINT users_id_fkey
        FOREIGN KEY (id)
        REFERENCES auth.users(id)
        ON DELETE CASCADE;
    """)


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
            SELECT COUNT(*) INTO orphan_count
            FROM public.users pu
            LEFT JOIN auth.users au ON au.id = pu.id
            WHERE au.id IS NULL
              AND pu.email NOT LIKE '%@dev.local';

            IF orphan_count > 0 THEN
                RAISE EXCEPTION 'VERIFICATION FAILED: % orphaned public.users row(s) without matching auth.users entry', orphan_count;
            END IF;

            SELECT COUNT(*) INTO missing_count
            FROM auth.users au
            LEFT JOIN public.users pu ON pu.id = au.id
            WHERE pu.id IS NULL;

            IF missing_count > 0 THEN
                RAISE EXCEPTION 'VERIFICATION FAILED: % auth.users row(s) missing public.users entry', missing_count;
            END IF;

            SELECT EXISTS (
                SELECT 1
                FROM pg_constraint con
                JOIN pg_class src ON src.oid = con.conrelid
                JOIN pg_namespace src_ns ON src_ns.oid = src.relnamespace
                JOIN pg_class ref ON ref.oid = con.confrelid
                JOIN pg_namespace ref_ns ON ref_ns.oid = ref.relnamespace
                WHERE con.contype = 'f'
                  AND con.conname = 'users_id_fkey'
                  AND src_ns.nspname = 'public'
                  AND src.relname = 'users'
                  AND ref_ns.nspname = 'auth'
                  AND ref.relname = 'users'
            ) INTO fk_exists;

            IF NOT fk_exists THEN
                RAISE EXCEPTION 'VERIFICATION FAILED: FK constraint users_id_fkey (public.users -> auth.users) not found';
            END IF;

            SELECT EXISTS (
                SELECT 1 FROM information_schema.triggers
                WHERE event_object_schema = 'auth'
                  AND event_object_table = 'users'
                  AND trigger_name = 'on_auth_user_created'
            ) INTO trigger_exists;

            IF NOT trigger_exists THEN
                RAISE EXCEPTION 'VERIFICATION FAILED: Trigger on_auth_user_created on auth.users not found';
            END IF;

            SELECT EXISTS (
                SELECT 1 FROM information_schema.routines
                WHERE routine_schema = 'public'
                  AND routine_name = 'handle_new_user'
                  AND routine_type = 'FUNCTION'
            ) INTO func_exists;

            IF NOT func_exists THEN
                RAISE EXCEPTION 'VERIFICATION FAILED: Function public.handle_new_user() not found';
            END IF;

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
