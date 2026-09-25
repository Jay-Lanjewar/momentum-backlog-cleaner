import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api.v1 import router as v1_router
from app.core.dependencies import get_current_user, get_db
from app.domain.models import User
from app.domain.schemas import OnboardingBacklogItem, OnboardingRequest
from tests.conftest import TEST_USER_ID


@pytest.fixture
def app() -> FastAPI:
    app = FastAPI()
    app.include_router(v1_router)
    return app


@pytest.fixture
def mock_user() -> User:
    return User(id=TEST_USER_ID, email="test@test.com", name="Test")


class TestOnboardingBacklogItemSchema:
    def test_estimated_minutes_defaults_to_none(self):
        item = OnboardingBacklogItem(title="Motion")

        assert item.estimated_minutes is None

    def test_accepts_explicit_estimated_minutes(self):
        item = OnboardingBacklogItem(title="Motion", estimated_minutes=45)

        assert item.estimated_minutes == 45

    def test_rejects_estimate_below_minimum(self):
        with pytest.raises(ValidationError):
            OnboardingBacklogItem(title="Motion", estimated_minutes=4)

    def test_rejects_estimate_above_maximum(self):
        with pytest.raises(ValidationError):
            OnboardingBacklogItem(title="Motion", estimated_minutes=2000)

    def test_keeps_description(self):
        item = OnboardingBacklogItem(
            title="Motion",
            description="20 questions",
        )

        assert item.description == "20 questions"

    def test_description_defaults_to_none(self):
        item = OnboardingBacklogItem(title="Motion")

        assert item.description is None

    def test_defaults_priority_to_3(self):
        item = OnboardingBacklogItem(title="Motion")

        assert item.priority == 3

    def test_request_parses_null_estimate_from_mobile(self):
        request = OnboardingRequest.model_validate(
            {
                "courses": [{"name": "Physics", "color": "#6366f1"}],
                "backlog": [
                    {
                        "title": "Motion",
                        "course_index": 0,
                        "priority": 3,
                        "estimated_minutes": None,
                        "description": "20 questions",
                    }
                ],
            }
        )

        assert request.backlog[0].estimated_minutes is None
        assert request.backlog[0].description == "20 questions"


class TestOnboardingBacklogPassthrough:
    @staticmethod
    def _services(mock_course_cls, mock_backlog_cls, mock_goal_cls, course_id):
        course_service = MagicMock()
        course_service.create = AsyncMock(return_value=MagicMock(id=course_id))
        mock_course_cls.return_value = course_service

        backlog_service = MagicMock()
        backlog_service.create = AsyncMock()
        mock_backlog_cls.return_value = backlog_service

        goal_service = MagicMock()
        goal_service.create = AsyncMock()
        mock_goal_cls.return_value = goal_service

        return backlog_service

    @patch("app.api.v1.onboarding.GoalService")
    @patch("app.api.v1.onboarding.BacklogService")
    @patch("app.api.v1.onboarding.CourseService")
    def test_unknown_duration_and_description_reach_backlog_service(
        self,
        mock_course_cls,
        mock_backlog_cls,
        mock_goal_cls,
        app,
        mock_user,
    ):
        course_id = uuid.uuid4()
        backlog_service = self._services(
            mock_course_cls, mock_backlog_cls, mock_goal_cls, course_id
        )
        app.dependency_overrides[get_current_user] = lambda: mock_user
        app.dependency_overrides[get_db] = lambda: AsyncMock()

        client = TestClient(app)
        response = client.post(
            "/api/v1/onboarding",
            json={
                "courses": [{"name": "Physics", "color": "#6366f1"}],
                "backlog": [
                    {
                        "title": "Motion",
                        "course_index": 0,
                        "priority": 3,
                        "estimated_minutes": None,
                        "description": "20 questions",
                    },
                    {
                        "title": "Gravitation",
                        "course_index": 0,
                        "priority": 1,
                        "estimated_minutes": 45,
                    },
                ],
            },
        )
        app.dependency_overrides.clear()

        assert response.status_code == 201
        assert response.json()["backlog_items_created"] == 2

        calls = backlog_service.create.await_args_list
        assert len(calls) == 2

        first = calls[0].args[1]
        assert first.estimated_minutes is None
        assert first.description == "20 questions"
        assert first.course_id == course_id
        assert first.priority == 3

        second = calls[1].args[1]
        assert second.estimated_minutes == 45
        assert second.description is None
        assert second.priority == 1

    @patch("app.api.v1.onboarding.GoalService")
    @patch("app.api.v1.onboarding.BacklogService")
    @patch("app.api.v1.onboarding.CourseService")
    def test_due_date_reaches_backlog_service(
        self,
        mock_course_cls,
        mock_backlog_cls,
        mock_goal_cls,
        app,
        mock_user,
    ):
        course_id = uuid.uuid4()
        backlog_service = self._services(
            mock_course_cls, mock_backlog_cls, mock_goal_cls, course_id
        )
        app.dependency_overrides[get_current_user] = lambda: mock_user
        app.dependency_overrides[get_db] = lambda: AsyncMock()

        client = TestClient(app)
        response = client.post(
            "/api/v1/onboarding",
            json={
                "courses": [{"name": "Chemistry", "color": "#6366f1"}],
                "backlog": [
                    {
                        "title": "Lab write-up",
                        "course_index": 0,
                        "priority": 3,
                        "estimated_minutes": None,
                        "due_date": "2026-10-05T00:00:00",
                    }
                ],
            },
        )
        app.dependency_overrides.clear()

        assert response.status_code == 201
        payload = backlog_service.create.await_args.args[1]
        assert payload.due_date is not None
        assert payload.due_date.year == 2026
        assert payload.estimated_minutes is None

    @patch("app.api.v1.onboarding.GoalService")
    @patch("app.api.v1.onboarding.BacklogService")
    @patch("app.api.v1.onboarding.CourseService")
    def test_invalid_course_index_returns_400(
        self,
        mock_course_cls,
        mock_backlog_cls,
        mock_goal_cls,
        app,
        mock_user,
    ):
        course_id = uuid.uuid4()
        backlog_service = self._services(
            mock_course_cls, mock_backlog_cls, mock_goal_cls, course_id
        )
        app.dependency_overrides[get_current_user] = lambda: mock_user
        app.dependency_overrides[get_db] = lambda: AsyncMock()

        client = TestClient(app)
        response = client.post(
            "/api/v1/onboarding",
            json={
                "courses": [{"name": "Physics", "color": "#6366f1"}],
                "backlog": [
                    {
                        "title": "Motion",
                        "course_index": 3,
                        "estimated_minutes": None,
                    }
                ],
            },
        )
        app.dependency_overrides.clear()

        assert response.status_code == 400
        backlog_service.create.assert_not_awaited()

    def test_estimate_outside_bounds_returns_422(self, app, mock_user):
        app.dependency_overrides[get_current_user] = lambda: mock_user
        app.dependency_overrides[get_db] = lambda: AsyncMock()

        client = TestClient(app)
        response = client.post(
            "/api/v1/onboarding",
            json={
                "courses": [{"name": "Physics", "color": "#6366f1"}],
                "backlog": [
                    {
                        "title": "Motion",
                        "course_index": 0,
                        "estimated_minutes": 3,
                    }
                ],
            },
        )
        app.dependency_overrides.clear()

        assert response.status_code == 422
