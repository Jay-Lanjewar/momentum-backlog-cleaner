import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1 import router as v1_router
from app.api.v1.auth import get_auth_service
from app.core.config import settings
from app.domain.models import User
from app.services.auth_service import AuthService, SupabaseTimeoutError

USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
EMAIL = "student@example.com"


def make_user() -> User:
    now = datetime.now(timezone.utc)
    return User(
        id=USER_ID,
        email=EMAIL,
        name="Student",
        created_at=now,
        updated_at=now,
    )


@pytest.fixture
def app() -> FastAPI:
    app = FastAPI()
    app.include_router(v1_router)
    return app


@pytest.fixture
def auth_service() -> AsyncMock:
    return AsyncMock()


def _post_signup(client: TestClient, email: str = EMAIL):
    return client.post(
        "/api/v1/auth/signup",
        json={"email": email, "password": "password123", "name": "Student"},
    )


# ─── Signup ───


class TestSignup:
    def test_success_returns_user_with_empty_tokens_when_unverified(self, app, auth_service):
        auth_service.signup = AsyncMock(
            return_value={"user": make_user(), "access_token": "", "refresh_token": ""}
        )
        app.dependency_overrides[get_auth_service] = lambda: auth_service
        client = TestClient(app)
        resp = _post_signup(client)
        app.dependency_overrides.clear()

        assert resp.status_code == 200
        data = resp.json()
        assert data["access_token"] == ""
        assert data["refresh_token"] == ""
        assert data["user"]["email"] == EMAIL

    def test_success_returns_tokens_when_confirmation_not_required(self, app, auth_service):
        auth_service.signup = AsyncMock(
            return_value={
                "user": make_user(),
                "access_token": "abc",
                "refresh_token": "def",
            }
        )
        app.dependency_overrides[get_auth_service] = lambda: auth_service
        client = TestClient(app)
        resp = _post_signup(client)
        app.dependency_overrides.clear()

        assert resp.status_code == 200
        assert resp.json()["access_token"] == "abc"

    def test_existing_unverified_account_redirects_to_verify_email(self, app, auth_service):
        auth_service.signup = AsyncMock(side_effect=ValueError("User already registered"))
        auth_service.is_email_verified = AsyncMock(return_value=False)
        auth_service.resend_verification = AsyncMock()
        app.dependency_overrides[get_auth_service] = lambda: auth_service
        client = TestClient(app)
        resp = _post_signup(client)
        app.dependency_overrides.clear()

        assert resp.status_code == 409
        assert resp.json()["detail"]["code"] == "email_not_confirmed"
        auth_service.resend_verification.assert_awaited_once_with(EMAIL)

    def test_existing_verified_account_returns_friendly_exists_error(self, app, auth_service):
        auth_service.signup = AsyncMock(side_effect=ValueError("User already registered"))
        auth_service.is_email_verified = AsyncMock(return_value=True)
        app.dependency_overrides[get_auth_service] = lambda: auth_service
        client = TestClient(app)
        resp = _post_signup(client)
        app.dependency_overrides.clear()

        assert resp.status_code == 409
        assert resp.json()["detail"]["code"] == "account_exists"
        assert "already exists" in resp.json()["detail"]["message"]
        auth_service.resend_verification.assert_not_awaited()

    def test_weak_password_uses_friendly_copy(self, app, auth_service):
        auth_service.signup = AsyncMock(side_effect=ValueError("Password should be at least 6 characters"))
        app.dependency_overrides[get_auth_service] = lambda: auth_service
        client = TestClient(app)
        resp = _post_signup(client)
        app.dependency_overrides.clear()

        assert resp.status_code == 400
        assert resp.json()["detail"]["code"] == "weak_password"

    def test_unknown_error_never_leaks_raw_message(self, app, auth_service):
        auth_service.signup = AsyncMock(
            side_effect=ValueError("some internal supabase detail token-xyz")
        )
        app.dependency_overrides[get_auth_service] = lambda: auth_service
        client = TestClient(app)
        resp = _post_signup(client)
        app.dependency_overrides.clear()

        assert resp.status_code == 400
        assert resp.json()["detail"] == "Something went wrong. Please try again."

    def test_signup_forwards_email_redirect_to(self, app, auth_service):
        auth_service.signup = AsyncMock(
            return_value={"user": make_user(), "access_token": "abc", "refresh_token": "def"}
        )
        app.dependency_overrides[get_auth_service] = lambda: auth_service
        client = TestClient(app)
        resp = client.post(
            "/api/v1/auth/signup",
            json={
                "email": EMAIL,
                "password": "password123",
                "name": "Student",
                "email_redirect_to": "momentum://confirm",
            },
        )
        app.dependency_overrides.clear()

        assert resp.status_code == 200
        auth_service.signup.assert_awaited_once_with(
            EMAIL,
            "password123",
            "Student",
            email_redirect_to="momentum://confirm",
        )

    def test_signup_works_without_email_redirect_to(self, app, auth_service):
        auth_service.signup = AsyncMock(
            return_value={"user": make_user(), "access_token": "abc", "refresh_token": "def"}
        )
        app.dependency_overrides[get_auth_service] = lambda: auth_service
        client = TestClient(app)
        resp = _post_signup(client)
        app.dependency_overrides.clear()

        assert resp.status_code == 200
        auth_service.signup.assert_awaited_once_with(
            EMAIL, "password123", "Student", email_redirect_to=None
        )


# ─── Login ───


class TestLogin:
    def test_unverified_login_returns_email_not_confirmed_code(self, app, auth_service):
        auth_service.login = AsyncMock(side_effect=ValueError("Email not confirmed"))
        app.dependency_overrides[get_auth_service] = lambda: auth_service
        client = TestClient(app)
        resp = client.post(
            "/api/v1/auth/login",
            json={"email": EMAIL, "password": "password123"},
        )
        app.dependency_overrides.clear()

        assert resp.status_code == 401
        assert resp.json()["detail"]["code"] == "email_not_confirmed"
        assert resp.json()["detail"]["message"] == "Please verify your email first"

    def test_bad_credentials_return_friendly_message(self, app, auth_service):
        auth_service.login = AsyncMock(side_effect=ValueError("Invalid login credentials"))
        app.dependency_overrides[get_auth_service] = lambda: auth_service
        client = TestClient(app)
        resp = client.post(
            "/api/v1/auth/login",
            json={"email": EMAIL, "password": "wrong-password"},
        )
        app.dependency_overrides.clear()

        assert resp.status_code == 401
        assert resp.json()["detail"] == "Incorrect email or password"

    def test_unknown_error_never_leaks_raw_message(self, app, auth_service):
        auth_service.login = AsyncMock(side_effect=ValueError("internal supabase failure"))
        app.dependency_overrides[get_auth_service] = lambda: auth_service
        client = TestClient(app)
        resp = client.post(
            "/api/v1/auth/login",
            json={"email": EMAIL, "password": "password123"},
        )
        app.dependency_overrides.clear()

        assert resp.status_code == 401
        assert resp.json()["detail"] == "Something went wrong. Please try again."


# ─── Resend verification ───


class TestResendVerification:
    def test_resend_calls_service_and_returns_generic_message(self, app, auth_service):
        auth_service.resend_verification = AsyncMock()
        app.dependency_overrides[get_auth_service] = lambda: auth_service
        client = TestClient(app)
        resp = client.post(
            "/api/v1/auth/resend-verification",
            json={"email": EMAIL},
        )
        app.dependency_overrides.clear()

        assert resp.status_code == 200
        assert resp.json()["message"] == "Verification email sent"
        auth_service.resend_verification.assert_awaited_once_with(EMAIL)

    def test_resend_never_exposes_internal_failure(self, app, auth_service):
        auth_service.resend_verification = AsyncMock(side_effect=ValueError("provider down"))
        app.dependency_overrides[get_auth_service] = lambda: auth_service
        client = TestClient(app)
        resp = client.post(
            "/api/v1/auth/resend-verification",
            json={"email": EMAIL},
        )
        app.dependency_overrides.clear()

        assert resp.status_code == 200
        assert resp.json()["message"] == "Verification email sent"


# ─── AuthService behaviour ───


class TestAuthService:
    async def test_signup_returns_empty_tokens_when_auto_login_unconfirmed(self):
        service = AuthService(db=AsyncMock())
        with (
            patch.object(AuthService, "_supabase_request", new=AsyncMock()) as mock_request,
            patch.object(AuthService, "_get_or_create_user", new=AsyncMock()) as mock_user,
        ):
            mock_user.return_value = make_user()
            mock_request.side_effect = [
                {"user": {"id": str(USER_ID), "email": EMAIL}},
                ValueError("Email not confirmed"),
            ]

            result = await service.signup(EMAIL, "password123", "Student")

        assert result["user"].email == EMAIL
        assert result["access_token"] == ""
        assert result["refresh_token"] == ""

    async def test_signup_returns_tokens_when_auto_login_succeeds(self):
        service = AuthService(db=AsyncMock())
        with (
            patch.object(AuthService, "_supabase_request", new=AsyncMock()) as mock_request,
            patch.object(AuthService, "_get_or_create_user", new=AsyncMock()) as mock_user,
        ):
            mock_user.return_value = make_user()
            mock_request.side_effect = [
                {"user": {"id": str(USER_ID), "email": EMAIL}},
                {"access_token": "abc", "refresh_token": "def"},
            ]

            result = await service.signup(EMAIL, "password123", "Student")

        assert result["access_token"] == "abc"

    async def test_signup_forwards_email_redirect_to_supabase(self):
        service = AuthService(db=AsyncMock())
        with (
            patch.object(AuthService, "_supabase_request", new=AsyncMock()) as mock_request,
            patch.object(AuthService, "_get_or_create_user", new=AsyncMock()) as mock_user,
        ):
            mock_user.return_value = make_user()
            mock_request.side_effect = [
                {"user": {"id": str(USER_ID), "email": EMAIL}},
                {"access_token": "abc", "refresh_token": "def"},
            ]

            await service.signup(
                EMAIL,
                "password123",
                "Student",
                email_redirect_to="momentum://confirm",
            )

        signup_body = mock_request.call_args_list[0].args[1]
        assert signup_body["email_redirect_to"] == "momentum://confirm"
        assert signup_body["data"] == {"name": "Student"}

    async def test_signup_omits_email_redirect_to_when_not_provided(self):
        service = AuthService(db=AsyncMock())
        with (
            patch.object(AuthService, "_supabase_request", new=AsyncMock()) as mock_request,
            patch.object(AuthService, "_get_or_create_user", new=AsyncMock()) as mock_user,
        ):
            mock_user.return_value = make_user()
            mock_request.side_effect = [
                {"user": {"id": str(USER_ID), "email": EMAIL}},
                {"access_token": "abc", "refresh_token": "def"},
            ]

            await service.signup(EMAIL, "password123", "Student")

        signup_body = mock_request.call_args_list[0].args[1]
        assert "email_redirect_to" not in signup_body

    async def test_resend_verification_posts_to_supabase_resend(self):
        service = AuthService(db=AsyncMock())
        with patch.object(
            AuthService, "_supabase_request", new=AsyncMock(return_value={})
        ) as mock_request:
            await service.resend_verification(EMAIL)

        mock_request.assert_awaited_once_with(
            "resend",
            {"type": "signup", "email": EMAIL},
            use_service_key=True,
        )

    async def test_is_email_verified_checks_confirmed_at(self):
        service = AuthService(db=AsyncMock())
        with patch.object(
            AuthService,
            "_supabase_request",
            new=AsyncMock(return_value={"users": [{"email": EMAIL, "email_confirmed_at": None}]}),
        ):
            assert await service.is_email_verified(EMAIL) is False

        with patch.object(
            AuthService,
            "_supabase_request",
            new=AsyncMock(return_value={"users": [{"email": EMAIL, "email_confirmed_at": "2026-01-01T00:00:00Z"}]}),
        ):
            assert await service.is_email_verified(EMAIL) is True

    async def test_is_email_verified_requires_exact_email_match(self):
        service = AuthService(db=AsyncMock())
        with patch.object(
            AuthService,
            "_supabase_request",
            new=AsyncMock(return_value={"users": [{"email": "other@example.com", "email_confirmed_at": "2026-01-01T00:00:00Z"}]}),
        ):
            assert await service.is_email_verified(EMAIL) is False


# ─── Supabase timeout resilience ───


def _timeout_error() -> SupabaseTimeoutError:
    return SupabaseTimeoutError("Supabase Auth request timed out: signup")


class _StubOkResponse:
    status_code = 200
    text = "{}"

    def json(self):
        return {"access_token": "tok", "refresh_token": "ref"}


class TestSupabaseTimeoutConfig:
    def test_default_timeout_is_15_seconds(self):
        assert settings.SUPABASE_TIMEOUT_SECONDS == 15

    async def test_configured_timeout_is_passed_to_httpx_client(self):
        captured: dict = {}

        class _StubAsyncClient:
            def __init__(self, *args, **kwargs):
                captured.update(kwargs)

            async def __aenter__(self):
                return self

            async def __aexit__(self, *exc):
                return False

            async def post(self, url, json=None, headers=None):
                return _StubOkResponse()

            async def get(self, url, headers=None, params=None):
                return _StubOkResponse()

        service = AuthService(db=AsyncMock())
        with patch.object(settings, "SUPABASE_URL", "https://project.supabase.co"), \
                patch.object(settings, "SUPABASE_ANON_KEY", "anon-key"), \
                patch.object(settings, "SUPABASE_TIMEOUT_SECONDS", 22), \
                patch("httpx.AsyncClient", _StubAsyncClient):
            result = await service._supabase_request(
                "token?grant_type=password",
                {"email": EMAIL, "password": "password123"},
            )

        timeout = captured.get("timeout")
        assert isinstance(timeout, httpx.Timeout)
        assert timeout.read == 22.0
        assert timeout.write == 22.0
        assert timeout.pool == 22.0
        assert timeout.connect == 5.0
        assert result["access_token"] == "tok"

    async def test_connect_timeout_stays_at_five_seconds(self):
        captured: dict = {}

        class _StubAsyncClient:
            def __init__(self, *args, **kwargs):
                captured.update(kwargs)

            async def __aenter__(self):
                return self

            async def __aexit__(self, *exc):
                return False

            async def post(self, url, json=None, headers=None):
                return _StubOkResponse()

            async def get(self, url, headers=None, params=None):
                return _StubOkResponse()

        service = AuthService(db=AsyncMock())
        with patch.object(settings, "SUPABASE_URL", "https://project.supabase.co"), \
                patch.object(settings, "SUPABASE_ANON_KEY", "anon-key"), \
                patch("httpx.AsyncClient", _StubAsyncClient):
            await service._supabase_request("signup", {"email": EMAIL})

        timeout = captured.get("timeout")
        assert isinstance(timeout, httpx.Timeout)
        assert timeout.read == float(settings.SUPABASE_TIMEOUT_SECONDS)
        assert timeout.connect == 5.0


class TestSignupTimeoutProbe:
    async def test_probe_unconfirmed_returns_empty_tokens_and_never_retries_signup(self):
        service = AuthService(db=AsyncMock())
        probe_user = {"id": str(USER_ID), "email": EMAIL, "email_confirmed_at": None}
        with patch.object(
            AuthService,
            "_supabase_request",
            new=AsyncMock(side_effect=[_timeout_error(), {"users": [probe_user]}]),
        ) as mock_request, patch.object(
            AuthService,
            "_get_or_create_user",
            new=AsyncMock(return_value=make_user()),
        ) as mock_create:
            result = await service.signup(EMAIL, "password123", "Student")

        assert result["access_token"] == ""
        assert result["refresh_token"] == ""
        assert result["user"].email == EMAIL
        paths = [call.args[0] for call in mock_request.call_args_list]
        assert paths.count("signup") == 1
        assert paths.count("admin/users") == 1
        mock_create.assert_awaited_once()

    async def test_probe_confirmed_raises_account_exists_value_error(self):
        service = AuthService(db=AsyncMock())
        confirmed = {
            "id": str(USER_ID),
            "email": EMAIL,
            "email_confirmed_at": "2026-01-01T00:00:00Z",
        }
        with patch.object(
            AuthService,
            "_supabase_request",
            new=AsyncMock(side_effect=[_timeout_error(), {"users": [confirmed]}]),
        ) as mock_request, patch.object(
            AuthService, "_get_or_create_user", new=AsyncMock()
        ) as mock_create:
            with pytest.raises(ValueError, match="already registered"):
                await service.signup(EMAIL, "password123", "Student")

        assert [c.args[0] for c in mock_request.call_args_list].count("signup") == 1
        mock_create.assert_not_awaited()

    async def test_probe_failure_raises_typed_timeout_without_leaking_details(self):
        service = AuthService(db=AsyncMock())
        with patch.object(
            AuthService,
            "_supabase_request",
            new=AsyncMock(side_effect=[_timeout_error(), ValueError("admin lookup failed")]),
        ):
            with pytest.raises(SupabaseTimeoutError) as excinfo:
                await service.signup(EMAIL, "password123", "Student")

        assert "admin lookup failed" not in str(excinfo.value)

    async def test_probe_no_user_raises_typed_timeout_without_retrying_signup(self):
        service = AuthService(db=AsyncMock())
        with patch.object(
            AuthService,
            "_supabase_request",
            new=AsyncMock(side_effect=[_timeout_error(), {"users": []}]),
        ) as mock_request:
            with pytest.raises(SupabaseTimeoutError):
                await service.signup(EMAIL, "password123", "Student")

        assert [c.args[0] for c in mock_request.call_args_list].count("signup") == 1

    async def test_token_grant_timeout_returns_empty_tokens_without_retry(self):
        service = AuthService(db=AsyncMock())
        created = {"user": {"id": str(USER_ID), "email": EMAIL}}
        with patch.object(
            AuthService,
            "_supabase_request",
            new=AsyncMock(side_effect=[created, _timeout_error()]),
        ) as mock_request, patch.object(
            AuthService,
            "_get_or_create_user",
            new=AsyncMock(return_value=make_user()),
        ):
            result = await service.signup(EMAIL, "password123", "Student")

        assert result["access_token"] == ""
        assert result["refresh_token"] == ""
        assert result["user"].email == EMAIL
        paths = [call.args[0] for call in mock_request.call_args_list]
        assert paths.count("signup") == 1
        assert paths.count("token?grant_type=password") == 1


class TestSignupTimeoutRoute:
    def test_confirmed_account_after_timeout_maps_to_409_account_exists(self, app):
        service = AuthService(db=AsyncMock())
        confirmed = {
            "id": str(USER_ID),
            "email": EMAIL,
            "email_confirmed_at": "2026-01-01T00:00:00Z",
        }
        with patch.object(
            AuthService,
            "_supabase_request",
            new=AsyncMock(
                side_effect=[
                    _timeout_error(),          # signup POST times out
                    {"users": [confirmed]},    # service probe: confirmed -> ValueError
                    {"users": [confirmed]},    # route is_email_verified probe
                ]
            ),
        ):
            app.dependency_overrides[get_auth_service] = lambda: service
            client = TestClient(app)
            resp = _post_signup(client)
            app.dependency_overrides.clear()

        assert resp.status_code == 409
        assert resp.json()["detail"]["code"] == "account_exists"

    def test_probe_failure_maps_to_503_signup_unavailable(self, app):
        service = AuthService(db=AsyncMock())
        with patch.object(
            AuthService,
            "_supabase_request",
            new=AsyncMock(side_effect=[_timeout_error(), ValueError("admin lookup failed")]),
        ) as mock_request:
            app.dependency_overrides[get_auth_service] = lambda: service
            client = TestClient(app)
            resp = _post_signup(client)
            app.dependency_overrides.clear()

        assert resp.status_code == 503
        detail = resp.json()["detail"]
        assert detail["code"] == "signup_unavailable"
        assert "try again" in detail["message"].lower()
        body = resp.text
        assert "timed out" not in body.lower()
        assert "admin lookup failed" not in body
        assert "SupabaseTimeout" not in body
        assert "Signup outcome could not be determined" not in body
        assert [c.args[0] for c in mock_request.call_args_list].count("signup") == 1

    def test_probe_no_user_maps_to_503_signup_unavailable(self, app):
        service = AuthService(db=AsyncMock())
        with patch.object(
            AuthService,
            "_supabase_request",
            new=AsyncMock(side_effect=[_timeout_error(), {"users": []}]),
        ):
            app.dependency_overrides[get_auth_service] = lambda: service
            client = TestClient(app)
            resp = _post_signup(client)
            app.dependency_overrides.clear()

        assert resp.status_code == 503
        assert resp.json()["detail"]["code"] == "signup_unavailable"
