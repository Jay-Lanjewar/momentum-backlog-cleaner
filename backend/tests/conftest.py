import uuid
from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.repositories.backlog_repo import BacklogItemRepository
from app.repositories.course_repo import CourseRepository
from app.repositories.goal_repo import GoalRepository
from app.repositories.profile_repo import (
    StudentProfileRepository,
    WeeklyScheduleRepository,
)
from app.services.backlog_service import BacklogService
from app.services.course_service import CourseService
from app.services.goal_service import GoalService
from app.services.profile_service import (
    StudentProfileService,
    WeeklyScheduleService,
)

TEST_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
TEST_USER_ID_2 = uuid.UUID("00000000-0000-0000-0000-000000000002")


@pytest.fixture
def mock_db() -> AsyncMock:
    return AsyncMock()


@pytest.fixture
def course_repo(mock_db: AsyncMock) -> CourseRepository:
    repo = CourseRepository(mock_db)
    repo.create = AsyncMock()
    repo.get = AsyncMock()
    repo.list = AsyncMock()
    repo.update = AsyncMock()
    repo.delete = AsyncMock()
    return repo


@pytest.fixture
def backlog_repo(mock_db: AsyncMock) -> BacklogItemRepository:
    repo = BacklogItemRepository(mock_db)
    repo.create = AsyncMock()
    repo.get = AsyncMock()
    repo.list = AsyncMock()
    repo.update = AsyncMock()
    repo.delete = AsyncMock()
    return repo


@pytest.fixture
def goal_repo(mock_db: AsyncMock) -> GoalRepository:
    repo = GoalRepository(mock_db)
    repo.create = AsyncMock()
    repo.get = AsyncMock()
    repo.list = AsyncMock()
    repo.update = AsyncMock()
    repo.delete = AsyncMock()
    return repo


@pytest.fixture
def profile_repo(mock_db: AsyncMock) -> StudentProfileRepository:
    repo = StudentProfileRepository(mock_db)
    repo.get_by_user_id = AsyncMock()
    repo.upsert = AsyncMock()
    repo.delete = AsyncMock()
    repo.get = AsyncMock()
    return repo


@pytest.fixture
def schedule_repo(mock_db: AsyncMock) -> WeeklyScheduleRepository:
    repo = WeeklyScheduleRepository(mock_db)
    repo.get_by_user_id = AsyncMock()
    repo.upsert = AsyncMock()
    repo.delete = AsyncMock()
    repo.get = AsyncMock()
    return repo


@pytest.fixture
def course_service(course_repo: CourseRepository) -> CourseService:
    return CourseService(course_repo)


@pytest.fixture
def backlog_service(
    backlog_repo: BacklogItemRepository, course_repo: CourseRepository
) -> BacklogService:
    return BacklogService(backlog_repo, course_repo)


@pytest.fixture
def goal_service(goal_repo: GoalRepository) -> GoalService:
    return GoalService(goal_repo)


@pytest.fixture
def profile_service(profile_repo: StudentProfileRepository) -> StudentProfileService:
    return StudentProfileService(profile_repo)


@pytest.fixture
def schedule_service(schedule_repo: WeeklyScheduleRepository) -> WeeklyScheduleService:
    return WeeklyScheduleService(schedule_repo)
