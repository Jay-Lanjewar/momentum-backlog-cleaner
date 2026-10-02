import time
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.api.v1 import router as v1_router
from app.core import mfa
from app.core.config import settings
from app.core.dependencies import get_current_user_id, get_db
from app.domain.models import User

USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
EMAIL = "student@example.com"

SUPABASE_URL = "https://test.supabase.co"
ANON_KEY = "anon-public-key"
CALLER_TOKEN = "caller-access-token"


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict | list | None = None):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}

    @property
    def text(self) -> str:
        return str(self._payload)

    def json(self) -> dict | list:
        return self._payload


@pytest.fixture
def app() -> FastAPI:
    app = FastAPI()
    app.include_router(v1_router)
    return app


@pytest.fixture(autouse=True)
def clean_mfa_cache():
    mfa.clear_cache()
    yield
    mfa.clear_cache()


def _headers() -> dict:
    return {"Authorization": "Bearer test-token"}


def _payload(aal: str | None = "aal1") -> dict:
    payload = {"sub": str(USER_ID)}
    if aal is not None:
        payload["aal"] = aal
    return payload


def make_user() -> User:
    now = datetime.now(timezone.utc)
    return User(
        id=USER_ID,
        email=EMAIL,
        name="Student",
        created_at=now,
        updated_at=now,
    )


def _me_db() -> MagicMock:
    """Mock session for /auth/me: user lookup, then profile and streak lookups."""
    db = MagicMock()
    user_result = MagicMock()
    user_result.scalar_one_or_none.return_value = make_user()
    empty_result = MagicMock()
    empty_result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(side_effect=[user_result, empty_result, empty_result])
    return db


def _blocked_db() -> MagicMock:
    """Mock session that records calls; the assurance gate must stop them."""
    db = MagicMock()
    db.execute = AsyncMock()
    return db


def _patch_supabase():
    return (
        patch.object(settings, "SUPABASE_URL", SUPABASE_URL),
        patch.object(settings, "SUPABASE_ANON_KEY", ANON_KEY),
    )


# ─── /auth/me assurance enforcement ───


class TestAuthMeEnforcement:
    def test_aal2_passes_without_factor_lookup(self, app):
        db = _me_db()
        app.dependency_overrides[get_db] = lambda: db
        with (
            patch(
                "app.core.dependencies.verify_token", return_value=_payload("aal2")
            ),
            patch("app.core.dependencies.has_verified_factor", new=AsyncMock())
            as mock_factor,
        ):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get("/api/v1/auth/me", headers=_headers())
        app.dependency_overrides.clear()

        assert resp.status_code == 200
        assert resp.json()["email"] == EMAIL
        mock_factor.assert_not_awaited()

    def test_aal1_without_verified_factor_succeeds(self, app):
        db = _me_db()
        app.dependency_overrides[get_db] = lambda: db
        with (
            patch(
                "app.core.dependencies.verify_token", return_value=_payload("aal1")
            ),
            patch(
                "app.core.dependencies.has_verified_factor",
                new=AsyncMock(return_value=False),
            ) as mock_factor,
        ):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get("/api/v1/auth/me", headers=_headers())
        app.dependency_overrides.clear()

        assert resp.status_code == 200
        assert resp.json()["email"] == EMAIL
        # The dependency threads the caller's raw access token through.
        mock_factor.assert_awaited_once_with(USER_ID, "test-token")
        # Normal behavior preserved: user + profile + streak lookups all ran.
        assert db.execute.await_count == 3

    def test_aal1_with_verified_factor_returns_401_insufficient_aal(self, app):
        db = _blocked_db()
        app.dependency_overrides[get_db] = lambda: db
        with (
            patch(
                "app.core.dependencies.verify_token", return_value=_payload("aal1")
            ),
            patch(
                "app.core.dependencies.has_verified_factor",
                new=AsyncMock(return_value=True),
            ),
        ):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get("/api/v1/auth/me", headers=_headers())
        app.dependency_overrides.clear()

        assert resp.status_code == 401
        detail = resp.json()["detail"]
        assert detail["code"] == "insufficient_aal"
        assert "authentication is required" in detail["message"].lower()

    def test_aal1_with_verified_factor_never_reaches_db_lookup(self, app):
        db = _blocked_db()
        app.dependency_overrides[get_db] = lambda: db
        with (
            patch(
                "app.core.dependencies.verify_token", return_value=_payload("aal1")
            ),
            patch(
                "app.core.dependencies.has_verified_factor",
                new=AsyncMock(return_value=True),
            ),
        ):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get("/api/v1/auth/me", headers=_headers())
        app.dependency_overrides.clear()

        assert resp.status_code == 401
        db.execute.assert_not_awaited()

    def test_aal1_with_only_unverified_factor_succeeds(self, app):
        db = _me_db()
        app.dependency_overrides[get_db] = lambda: db
        url_patch, key_patch = _patch_supabase()
        with (
            patch(
                "app.core.dependencies.verify_token", return_value=_payload("aal1")
            ),
            url_patch,
            key_patch,
            patch(
                "httpx.AsyncClient.get",
                new=AsyncMock(
                    return_value=_FakeResponse(
                        200,
                        {"factors": [{"status": "unverified", "factor_type": "totp"}]},
                    )
                ),
            ),
        ):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get("/api/v1/auth/me", headers=_headers())
        app.dependency_overrides.clear()

        assert resp.status_code == 200
        assert resp.json()["email"] == EMAIL

    def test_missing_aal_with_verified_factor_returns_401(self, app):
        db = _blocked_db()
        app.dependency_overrides[get_db] = lambda: db
        with (
            patch(
                "app.core.dependencies.verify_token",
                return_value=_payload(aal=None),
            ),
            patch(
                "app.core.dependencies.has_verified_factor",
                new=AsyncMock(return_value=True),
            ),
        ):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get("/api/v1/auth/me", headers=_headers())
        app.dependency_overrides.clear()

        assert resp.status_code == 401
        assert resp.json()["detail"]["code"] == "insufficient_aal"

    def test_factor_lookup_unavailable_returns_503(self, app):
        db = _blocked_db()
        app.dependency_overrides[get_db] = lambda: db
        with (
            patch(
                "app.core.dependencies.verify_token", return_value=_payload("aal1")
            ),
            patch(
                "app.core.dependencies.has_verified_factor",
                new=AsyncMock(side_effect=mfa.MfaStateUnavailable("internal detail")),
            ),
        ):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get("/api/v1/auth/me", headers=_headers())
        app.dependency_overrides.clear()

        assert resp.status_code == 503
        detail = resp.json()["detail"]
        assert detail["code"] == "mfa_check_unavailable"
        assert "temporarily unavailable" in detail["message"].lower()
        assert "internal detail" not in resp.text
        db.execute.assert_not_awaited()

    def test_aal1_verified_factor_via_user_endpoint_returns_401(self, app):
        """End-to-end: real lookup against GET /user with the caller token."""
        db = _blocked_db()
        app.dependency_overrides[get_db] = lambda: db
        url_patch, key_patch = _patch_supabase()
        with (
            patch(
                "app.core.dependencies.verify_token", return_value=_payload("aal1")
            ),
            url_patch,
            key_patch,
            patch(
                "httpx.AsyncClient.get",
                new=AsyncMock(
                    return_value=_FakeResponse(
                        200,
                        {
                            "id": str(USER_ID),
                            "factors": [{"status": "verified", "factor_type": "totp"}],
                        },
                    )
                ),
            ) as mock_get,
        ):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get("/api/v1/auth/me", headers=_headers())
        app.dependency_overrides.clear()

        assert resp.status_code == 401
        assert resp.json()["detail"]["code"] == "insufficient_aal"
        db.execute.assert_not_awaited()
        assert mock_get.await_args.args[0] == f"{SUPABASE_URL}/auth/v1/user"
        assert (
            mock_get.await_args.kwargs["headers"]["Authorization"]
            == "Bearer test-token"
        )

    def test_aal1_without_factors_key_succeeds(self, app):
        """End-to-end: a user object with no factors key is an ordinary AAL1 user."""
        db = _me_db()
        app.dependency_overrides[get_db] = lambda: db
        url_patch, key_patch = _patch_supabase()
        with (
            patch(
                "app.core.dependencies.verify_token", return_value=_payload("aal1")
            ),
            url_patch,
            key_patch,
            patch(
                "httpx.AsyncClient.get",
                new=AsyncMock(
                    return_value=_FakeResponse(
                        200, {"id": str(USER_ID), "email": EMAIL}
                    )
                ),
            ),
        ):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get("/api/v1/auth/me", headers=_headers())
        app.dependency_overrides.clear()

        assert resp.status_code == 200
        assert resp.json()["email"] == EMAIL


# ─── get_current_user_id path ───


class TestUserIdEnforcement:
    def test_real_dashboard_route_blocked_at_aal1_with_verified_factor(self, app):
        db = _blocked_db()
        app.dependency_overrides[get_db] = lambda: db
        with (
            patch(
                "app.core.dependencies.verify_token", return_value=_payload("aal1")
            ),
            patch(
                "app.core.dependencies.has_verified_factor",
                new=AsyncMock(return_value=True),
            ),
        ):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get("/api/v1/dashboard", headers=_headers())
        app.dependency_overrides.clear()

        assert resp.status_code == 401
        assert resp.json()["detail"]["code"] == "insufficient_aal"
        db.execute.assert_not_awaited()

    def test_id_endpoint_aal2_passes_without_factor_lookup(self, app):
        @app.get("/test-id-aal2")
        async def endpoint(user_id: uuid.UUID = Depends(get_current_user_id)):
            return {"user_id": str(user_id)}

        with (
            patch(
                "app.core.dependencies.verify_token", return_value=_payload("aal2")
            ),
            patch("app.core.dependencies.has_verified_factor", new=AsyncMock())
            as mock_factor,
        ):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get("/test-id-aal2", headers=_headers())

        assert resp.status_code == 200
        assert resp.json()["user_id"] == str(USER_ID)
        mock_factor.assert_not_awaited()

    def test_id_endpoint_aal1_without_factor_passes(self, app):
        @app.get("/test-id-no-factor")
        async def endpoint(user_id: uuid.UUID = Depends(get_current_user_id)):
            return {"user_id": str(user_id)}

        with (
            patch(
                "app.core.dependencies.verify_token", return_value=_payload("aal1")
            ),
            patch(
                "app.core.dependencies.has_verified_factor",
                new=AsyncMock(return_value=False),
            ) as mock_factor,
        ):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get("/test-id-no-factor", headers=_headers())

        assert resp.status_code == 200
        assert resp.json()["user_id"] == str(USER_ID)
        mock_factor.assert_awaited_once_with(USER_ID, "test-token")

    def test_id_endpoint_aal1_with_verified_factor_401(self, app):
        @app.get("/test-id-verified")
        async def endpoint(user_id: uuid.UUID = Depends(get_current_user_id)):
            return {"user_id": str(user_id)}

        with (
            patch(
                "app.core.dependencies.verify_token", return_value=_payload("aal1")
            ),
            patch(
                "app.core.dependencies.has_verified_factor",
                new=AsyncMock(return_value=True),
            ),
        ):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get("/test-id-verified", headers=_headers())

        assert resp.status_code == 401
        assert resp.json()["detail"]["code"] == "insufficient_aal"


# ─── Existing invalid-token behavior preserved ───


class TestTokenErrorsPreserved:
    def test_invalid_token_keeps_exact_401_detail(self, app):
        db = _blocked_db()
        app.dependency_overrides[get_db] = lambda: db
        with patch(
            "app.core.dependencies.verify_token",
            side_effect=ValueError("Invalid token"),
        ):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get("/api/v1/auth/me", headers=_headers())
        app.dependency_overrides.clear()

        assert resp.status_code == 401
        assert resp.json()["detail"] == "Invalid or expired authentication token"

    def test_missing_sub_keeps_exact_401_and_skips_factor_check(self, app):
        db = _blocked_db()
        app.dependency_overrides[get_db] = lambda: db
        with (
            patch("app.core.dependencies.verify_token", return_value={}),
            patch(
                "app.core.dependencies.has_verified_factor", new=AsyncMock()
            ) as mock_factor,
        ):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get("/api/v1/auth/me", headers=_headers())
        app.dependency_overrides.clear()

        assert resp.status_code == 401
        assert resp.json()["detail"] == "Invalid or expired authentication token"
        mock_factor.assert_not_awaited()
        db.execute.assert_not_awaited()


# ─── has_verified_factor lookup (GET /auth/v1/user with caller token) ───


class TestHasVerifiedFactorLookup:
    async def test_uses_user_endpoint_url_and_caller_token_headers(self):
        url_patch, key_patch = _patch_supabase()
        with (
            url_patch,
            key_patch,
            patch(
                "httpx.AsyncClient.get",
                new=AsyncMock(
                    return_value=_FakeResponse(
                        200,
                        {
                            "id": str(USER_ID),
                            "factors": [{"status": "verified", "factor_type": "totp"}],
                        },
                    )
                ),
            ) as mock_get,
        ):
            result = await mfa.has_verified_factor(USER_ID, CALLER_TOKEN)

        assert result is True
        call = mock_get.await_args
        assert call.args[0] == f"{SUPABASE_URL}/auth/v1/user"
        headers = call.kwargs["headers"]
        assert headers["Authorization"] == f"Bearer {CALLER_TOKEN}"
        assert headers["apikey"] == ANON_KEY

    async def test_user_object_with_only_unverified_factor_is_false(self):
        url_patch, key_patch = _patch_supabase()
        with (
            url_patch,
            key_patch,
            patch(
                "httpx.AsyncClient.get",
                new=AsyncMock(
                    return_value=_FakeResponse(
                        200,
                        {"factors": [{"status": "unverified", "factor_type": "totp"}]},
                    )
                ),
            ),
        ):
            assert await mfa.has_verified_factor(USER_ID, CALLER_TOKEN) is False

    async def test_empty_factors_list_is_false(self):
        url_patch, key_patch = _patch_supabase()
        with (
            url_patch,
            key_patch,
            patch(
                "httpx.AsyncClient.get",
                new=AsyncMock(return_value=_FakeResponse(200, {"factors": []})),
            ),
        ):
            assert await mfa.has_verified_factor(USER_ID, CALLER_TOKEN) is False

    async def test_user_object_without_factors_key_is_false(self):
        url_patch, key_patch = _patch_supabase()
        with (
            url_patch,
            key_patch,
            patch(
                "httpx.AsyncClient.get",
                new=AsyncMock(
                    return_value=_FakeResponse(
                        200, {"id": str(USER_ID), "email": EMAIL}
                    )
                ),
            ),
        ):
            assert await mfa.has_verified_factor(USER_ID, CALLER_TOKEN) is False

    async def test_malformed_list_entries_do_not_crash(self):
        url_patch, key_patch = _patch_supabase()
        with (
            url_patch,
            key_patch,
            patch(
                "httpx.AsyncClient.get",
                new=AsyncMock(
                    return_value=_FakeResponse(
                        200,
                        {"factors": [{"status": "verified"}, "garbage", 7, None]},
                    )
                ),
            ),
        ):
            assert await mfa.has_verified_factor(USER_ID, CALLER_TOKEN) is True

    async def test_factors_list_of_non_dict_entries_is_false(self):
        url_patch, key_patch = _patch_supabase()
        with (
            url_patch,
            key_patch,
            patch(
                "httpx.AsyncClient.get",
                new=AsyncMock(
                    return_value=_FakeResponse(200, {"factors": ["garbage", 7]})
                ),
            ),
        ):
            assert await mfa.has_verified_factor(USER_ID, CALLER_TOKEN) is False

    @pytest.mark.parametrize(
        "body",
        [
            42,
            "unexpected",
            [],
            {"factors": "not-a-list"},
            {"factors": None},
            {"factors": {"nested": True}},
        ],
    )
    async def test_malformed_body_shape_raises_mfa_state_unavailable(self, body):
        url_patch, key_patch = _patch_supabase()
        with (
            url_patch,
            key_patch,
            patch(
                "httpx.AsyncClient.get",
                new=AsyncMock(return_value=_FakeResponse(200, body)),
            ),
        ):
            with pytest.raises(mfa.MfaStateUnavailable):
                await mfa.has_verified_factor(USER_ID, CALLER_TOKEN)

        assert USER_ID not in mfa._cache

    @pytest.mark.parametrize("status_code", [404, 401, 500])
    async def test_http_errors_raise_mfa_state_unavailable_and_are_not_cached(
        self, status_code
    ):
        url_patch, key_patch = _patch_supabase()
        with (
            url_patch,
            key_patch,
            patch(
                "httpx.AsyncClient.get",
                new=AsyncMock(return_value=_FakeResponse(status_code, {})),
            ),
        ):
            with pytest.raises(mfa.MfaStateUnavailable):
                await mfa.has_verified_factor(USER_ID, CALLER_TOKEN)

        assert USER_ID not in mfa._cache

    async def test_network_failure_raises_mfa_state_unavailable_and_is_not_cached(self):
        url_patch, key_patch = _patch_supabase()
        with (
            url_patch,
            key_patch,
            patch(
                "httpx.AsyncClient.get",
                new=AsyncMock(side_effect=httpx.ConnectError("network down")),
            ),
        ):
            with pytest.raises(mfa.MfaStateUnavailable):
                await mfa.has_verified_factor(USER_ID, CALLER_TOKEN)

        assert USER_ID not in mfa._cache

    async def test_missing_url_raises_without_request(self):
        with (
            patch.object(settings, "SUPABASE_URL", None),
            patch.object(settings, "SUPABASE_ANON_KEY", ANON_KEY),
            patch("httpx.AsyncClient.get", new=AsyncMock()) as mock_get,
        ):
            with pytest.raises(mfa.MfaStateUnavailable):
                await mfa.has_verified_factor(USER_ID, CALLER_TOKEN)

        mock_get.assert_not_awaited()

    async def test_missing_access_token_raises_without_request(self):
        url_patch, key_patch = _patch_supabase()
        with (
            url_patch,
            key_patch,
            patch("httpx.AsyncClient.get", new=AsyncMock()) as mock_get,
        ):
            with pytest.raises(mfa.MfaStateUnavailable):
                await mfa.has_verified_factor(USER_ID, "")

        mock_get.assert_not_awaited()


# ─── Cache policy: positive 30s / negative 5s / failures never cached ───


class TestCachePolicy:
    def test_cache_ttl_settings(self):
        assert settings.MFA_STATE_CACHE_TTL_SECONDS == 30
        assert settings.MFA_NEGATIVE_STATE_CACHE_TTL_SECONDS == 5

    async def test_positive_result_cached_for_30_seconds(self):
        url_patch, key_patch = _patch_supabase()
        with (
            url_patch,
            key_patch,
            patch(
                "httpx.AsyncClient.get",
                new=AsyncMock(
                    return_value=_FakeResponse(
                        200, {"factors": [{"status": "verified"}]}
                    )
                ),
            ) as mock_get,
        ):
            assert await mfa.has_verified_factor(USER_ID, CALLER_TOKEN) is True
            assert await mfa.has_verified_factor(USER_ID, CALLER_TOKEN) is True
            assert mock_get.await_count == 1

            # Still fresh at 29 seconds old (< 30s TTL).
            has_factor, _ = mfa._cache[USER_ID]
            mfa._cache[USER_ID] = (has_factor, time.monotonic() - 29)
            assert await mfa.has_verified_factor(USER_ID, CALLER_TOKEN) is True
            assert mock_get.await_count == 1

            # Expired at 31 seconds old (> 30s TTL).
            mfa._cache[USER_ID] = (True, time.monotonic() - 31)
            assert await mfa.has_verified_factor(USER_ID, CALLER_TOKEN) is True
            assert mock_get.await_count == 2

    async def test_negative_result_cached_only_5_seconds(self):
        url_patch, key_patch = _patch_supabase()
        with (
            url_patch,
            key_patch,
            patch(
                "httpx.AsyncClient.get",
                new=AsyncMock(return_value=_FakeResponse(200, {"factors": []})),
            ) as mock_get,
        ):
            assert await mfa.has_verified_factor(USER_ID, CALLER_TOKEN) is False
            assert await mfa.has_verified_factor(USER_ID, CALLER_TOKEN) is False
            assert mock_get.await_count == 1

            # Still fresh at 4 seconds old (< 5s negative TTL).
            mfa._cache[USER_ID] = (False, time.monotonic() - 4)
            assert await mfa.has_verified_factor(USER_ID, CALLER_TOKEN) is False
            assert mock_get.await_count == 1

            # Expired at 6 seconds old: proves the negative TTL is 5s, not 30s.
            mfa._cache[USER_ID] = (False, time.monotonic() - 6)
            assert await mfa.has_verified_factor(USER_ID, CALLER_TOKEN) is False
            assert mock_get.await_count == 2

    async def test_failed_lookup_is_never_cached(self):
        url_patch, key_patch = _patch_supabase()
        with (
            url_patch,
            key_patch,
            patch(
                "httpx.AsyncClient.get",
                new=AsyncMock(
                    side_effect=[
                        httpx.ConnectError("network down"),
                        _FakeResponse(200, {"factors": []}),
                    ]
                ),
            ) as mock_get,
        ):
            with pytest.raises(mfa.MfaStateUnavailable):
                await mfa.has_verified_factor(USER_ID, CALLER_TOKEN)
            assert USER_ID not in mfa._cache
            assert mock_get.await_count == 1

            assert await mfa.has_verified_factor(USER_ID, CALLER_TOKEN) is False
            assert mock_get.await_count == 2

            # Successful result is now cached.
            assert await mfa.has_verified_factor(USER_ID, CALLER_TOKEN) is False
            assert mock_get.await_count == 2
