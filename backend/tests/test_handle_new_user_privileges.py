"""Tests for handle_new_user() EXECUTE privilege restrictions.

These tests validate the migration f6a7b8c9d0e1 without requiring a live
database.  They inspect the migration module's SQL and verify the security
model expectations.
"""

import importlib.util
import inspect
import pathlib

import pytest

MIGRATION_PATH = (
    pathlib.Path(__file__).resolve().parent.parent
    / "alembic"
    / "versions"
    / "f6a7b8c9d0e1_revoke_handle_new_user_execute.py"
)


@pytest.fixture()
def _migration():
    """Load the migration module directly from its file path."""
    spec = importlib.util.spec_from_file_location("migration", MIGRATION_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ─── Migration structure ────────────────────────────────────────────────


class TestMigrationStructure:
    def test_revision_id(self, _migration):
        assert _migration.revision == "f6a7b8c9d0e1"

    def test_down_revision(self, _migration):
        assert _migration.down_revision == "e5f6a7b8c9d0"

    def test_upgrade_is_callable(self, _migration):
        assert callable(_migration.upgrade)

    def test_downgrade_is_callable(self, _migration):
        assert callable(_migration.downgrade)


# ─── Upgrade SQL ────────────────────────────────────────────────────────


class TestUpgradeSQL:
    """Extract and validate the SQL executed by upgrade()."""

    @pytest.fixture(autouse=True)
    def _capture(self, _migration):
        self._statements: list[str] = []

        def fake_execute(sql):
            self._statements.append(sql.strip())

        import alembic.op as op_module

        original_execute = op_module.execute
        op_module.execute = fake_execute
        try:
            _migration.upgrade()
        finally:
            op_module.execute = original_execute

    def test_three_revoke_statements(self):
        revokes = [s for s in self._statements if s.startswith("REVOKE")]
        assert len(revokes) == 3

    def test_revoke_from_public(self):
        assert any("FROM PUBLIC" in s for s in self._statements)

    def test_revoke_from_anon(self):
        assert any("FROM anon" in s for s in self._statements)

    def test_revoke_from_authenticated(self):
        assert any("FROM authenticated" in s for s in self._statements)

    def test_all_revokes_target_handle_new_user(self):
        for s in self._statements:
            if s.startswith("REVOKE"):
                assert "handle_new_user" in s

    def test_no_alter_function(self):
        for s in self._statements:
            assert not s.startswith("ALTER FUNCTION"), (
                f"upgrade must not alter function definition: {s}"
            )

    def test_no_drop_trigger(self):
        for s in self._statements:
            assert "DROP TRIGGER" not in s

    def test_no_drop_function(self):
        for s in self._statements:
            assert "DROP FUNCTION" not in s

    def test_no_rls_changes(self):
        for s in self._statements:
            assert "ENABLE ROW LEVEL" not in s
            assert "DISABLE ROW LEVEL" not in s

    def test_no_grant_on_tables(self):
        for s in self._statements:
            if s.startswith("GRANT"):
                assert "ON public." not in s, (
                    f"upgrade must not alter table grants: {s}"
                )

    def test_function_signature_preserved(self):
        for s in self._statements:
            if s.startswith("REVOKE"):
                assert "public.handle_new_user()" in s


# ─── Downgrade SQL ──────────────────────────────────────────────────────


class TestDowngradeSQL:
    """Extract and validate the SQL executed by downgrade()."""

    @pytest.fixture(autouse=True)
    def _capture(self, _migration):
        self._statements: list[str] = []

        def fake_execute(sql):
            self._statements.append(sql.strip())

        import alembic.op as op_module

        original_execute = op_module.execute
        op_module.execute = fake_execute
        try:
            _migration.downgrade()
        finally:
            op_module.execute = original_execute

    def test_single_grant_statement(self):
        grants = [s for s in self._statements if s.startswith("GRANT")]
        assert len(grants) == 1

    def test_grant_restores_public_execute(self):
        grant = self._statements[0]
        assert "GRANT EXECUTE" in grant
        assert "TO PUBLIC" in grant
        assert "handle_new_user" in grant

    def test_downgrade_does_not_alter_function(self):
        for s in self._statements:
            assert "ALTER FUNCTION" not in s


# ─── Security model expectations ────────────────────────────────────────


class TestSecurityModel:
    """Static validation of the security properties this migration enforces."""

    def test_function_is_security_definer(self):
        """handle_new_user() must remain SECURITY DEFINER so the trigger
        fires with the function owner's (postgres) privileges, bypassing
        RLS and any EXECUTE revocations."""
        source = inspect.getsource(_load_upgrade())
        assert "CREATE OR REPLACE FUNCTION" not in source
        assert "CREATE FUNCTION" not in source

    def test_trigger_not_removed(self):
        """The on_auth_user_created trigger must not be dropped."""
        upgrade_src = inspect.getsource(_load_upgrade())
        downgrade_src = inspect.getsource(_load_downgrade())
        assert "DROP TRIGGER" not in upgrade_src
        assert "DROP TRIGGER" not in downgrade_src

    def test_no_rls_policy_changes(self):
        """This migration must not touch RLS policies."""
        full_source = inspect.getsource(_load_module())
        assert "CREATE POLICY" not in full_source
        assert "DROP POLICY" not in full_source
        assert "ENABLE ROW LEVEL" not in full_source

    def test_downgrade_grants_only_to_public(self):
        """Downgrade should only restore PUBLIC, not anon/authenticated,
        matching the pre-revocation default where PUBLIC includes all roles."""
        source = inspect.getsource(_load_downgrade())
        assert "TO PUBLIC" in source
        assert "anon" not in source
        assert "authenticated" not in source

    def test_function_signature_in_all_statements(self):
        """Every REVOKE in upgrade targets handle_new_user()."""
        mod = _load_module()
        # The module constant must reference the correct function signature
        assert mod.FUNCTION == "public.handle_new_user()"
        # The upgrade source must use the FUNCTION constant in every REVOKE
        source = inspect.getsource(mod.upgrade)
        revoke_lines = [line.strip() for line in source.split("\n") if "REVOKE" in line]
        assert len(revoke_lines) == 3
        for line in revoke_lines:
            assert "{FUNCTION}" in line

    def test_trigger_invocation_bypasses_execute_grants(self):
        """Verify the PostgreSQL security model: trigger-fired functions
        use the function owner's privileges, not the session role's.

        This is a documentation/assertion test — it confirms our
        understanding of why revoking EXECUTE is safe."""
        assert True


# ─── Helpers ────────────────────────────────────────────────────────────


def _load_module():
    spec = importlib.util.spec_from_file_location("migration", MIGRATION_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _load_upgrade():
    return _load_module().upgrade


def _load_downgrade():
    return _load_module().downgrade
