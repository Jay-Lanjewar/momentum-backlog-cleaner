import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from fastapi.security import HTTPAuthorizationCredentials

from app.api.v1 import router as v1_router
from app.core.dependencies import get_current_user, get_current_user_id, get_db
from app.domain.models import User

USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


@pytest.fixture
def app():
    app = FastAPI()
    app.include_router(v1_router)
    return app


def _make_user():
    return User(id=USER_ID, email="test@test.com", name="Test")


class TestGetCurrentUserId:
    def test_returns_uuid_from_valid_jwt(self, app):
        mock_db = MagicMock()
        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_id] = lambda: USER_ID

        client = TestClient(app)

        @app.get("/test-user-id")
        async def test_endpoint(user_id: uuid.UUID = Depends(get_current_user_id)):
            return {"user_id": str(user_id)}

        response = client.get("/test-user-id")

        app.dependency_overrides.clear()

        assert response.status_code == 200
        assert response.json()["user_id"] == str(USER_ID)

    def test_returns_401_on_invalid_token(self, app):
        mock_db = MagicMock()
        app.dependency_overrides[get_db] = lambda: mock_db

        with patch("app.core.dependencies.verify_token") as mock_verify:
            mock_verify.side_effect = ValueError("Invalid token")

            client = TestClient(app, raise_server_exceptions=False)

            @app.get("/test-invalid")
            async def test_endpoint(user_id: uuid.UUID = Depends(get_current_user_id)):
                return {"user_id": str(user_id)}

            response = client.get(
                "/test-invalid",
                headers={"Authorization": "Bearer invalid-token"},
            )

        app.dependency_overrides.clear()

        assert response.status_code == 401
        assert response.json()["detail"] == "Invalid or expired authentication token"

    def test_returns_401_on_missing_sub(self, app):
        mock_db = MagicMock()
        app.dependency_overrides[get_db] = lambda: mock_db

        with patch("app.core.dependencies.verify_token") as mock_verify:
            mock_verify.return_value = {}

            client = TestClient(app, raise_server_exceptions=False)

            @app.get("/test-missing-sub")
            async def test_endpoint(user_id: uuid.UUID = Depends(get_current_user_id)):
                return {"user_id": str(user_id)}

            response = client.get(
                "/test-missing-sub",
                headers={"Authorization": "Bearer token-without-sub"},
            )

        app.dependency_overrides.clear()

        assert response.status_code == 401
        assert response.json()["detail"] == "Invalid or expired authentication token"

    def test_does_not_query_database(self, app):
        mock_db = MagicMock()
        mock_db.execute = MagicMock()
        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_id] = lambda: USER_ID

        client = TestClient(app)

        @app.get("/test-no-db")
        async def test_endpoint(user_id: uuid.UUID = Depends(get_current_user_id)):
            return {"user_id": str(user_id)}

        response = client.get("/test-no-db")

        app.dependency_overrides.clear()

        assert response.status_code == 200
        mock_db.execute.assert_not_called()

    def test_get_current_user_still_works(self, app):
        mock_db = MagicMock()
        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user] = lambda: _make_user()

        client = TestClient(app)

        @app.get("/test-user")
        async def test_endpoint(user: User = Depends(get_current_user)):
            return {"user_id": str(user.id)}

        response = client.get("/test-user")

        app.dependency_overrides.clear()

        assert response.status_code == 200
        assert response.json()["user_id"] == str(USER_ID)

    def test_other_endpoints_unaffected(self, app):
        mock_db = MagicMock()
        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user] = lambda: _make_user()

        client = TestClient(app)

        @app.get("/test-user-obj")
        async def test_endpoint(user: User = Depends(get_current_user)):
            return {"email": user.email, "name": user.name}

        response = client.get("/test-user-obj")

        app.dependency_overrides.clear()

        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "test@test.com"
        assert data["name"] == "Test"
