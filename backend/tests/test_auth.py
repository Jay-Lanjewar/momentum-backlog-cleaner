import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1 import router as v1_router
from app.api.v1.auth import get_auth_service
from app.domain.models import User
from app.services.auth_service import AuthService

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
