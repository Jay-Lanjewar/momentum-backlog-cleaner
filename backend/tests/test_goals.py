import uuid
from unittest.mock import AsyncMock

import pytest

from app.domain.models import Goal
from app.domain.schemas import GoalCreate, GoalUpdate
from app.services.goal_service import GoalService
from tests.conftest import TEST_USER_ID, TEST_USER_ID_2


@pytest.fixture
def sample_goal() -> Goal:
    return Goal(
        id=uuid.uuid4(),
        user_id=TEST_USER_ID,
        title="Complete all pending work",
        status="active",
        category="academic",
    )


@pytest.mark.asyncio
async def test_create_goal(goal_service: GoalService, goal_repo: AsyncMock):
    data = GoalCreate(title="Finish chemistry", category="academic")
    expected = Goal(
        id=uuid.uuid4(),
        user_id=TEST_USER_ID,
        title="Finish chemistry",
        status="active",
        category="academic",
    )
    goal_repo.create.return_value = expected

    result = await goal_service.create(TEST_USER_ID, data)

    assert result.title == "Finish chemistry"
    assert result.status == "active"
    goal_repo.create.assert_awaited_once_with(
        user_id=TEST_USER_ID,
        title="Finish chemistry",
        description=None,
        target_date=None,
        category="academic",
    )


@pytest.mark.asyncio
async def test_get_goal_own(
    goal_service: GoalService,
    goal_repo: AsyncMock,
    sample_goal: Goal,
):
    goal_repo.get.return_value = sample_goal

    result = await goal_service.get(sample_goal.id, TEST_USER_ID)

    assert result is not None
    assert result.id == sample_goal.id


@pytest.mark.asyncio
async def test_get_goal_not_owned(
    goal_service: GoalService,
    goal_repo: AsyncMock,
    sample_goal: Goal,
):
    goal_repo.get.return_value = sample_goal

    result = await goal_service.get(sample_goal.id, TEST_USER_ID_2)

    assert result is None


@pytest.mark.asyncio
async def test_get_goal_not_found(goal_service: GoalService, goal_repo: AsyncMock):
    goal_repo.get.return_value = None

    result = await goal_service.get(uuid.uuid4(), TEST_USER_ID)

    assert result is None


@pytest.mark.asyncio
async def test_list_goals(
    goal_service: GoalService,
    goal_repo: AsyncMock,
    sample_goal: Goal,
):
    goal_repo.list.return_value = ([sample_goal], 1)

    items, total = await goal_service.list(TEST_USER_ID)

    assert len(items) == 1
    assert total == 1


@pytest.mark.asyncio
async def test_list_goals_with_status_filter(
    goal_service: GoalService,
    goal_repo: AsyncMock,
    sample_goal: Goal,
):
    goal_repo.list.return_value = ([sample_goal], 1)

    items, total = await goal_service.list(TEST_USER_ID, status="active")

    assert len(items) == 1


@pytest.mark.asyncio
async def test_update_goal_status(
    goal_service: GoalService,
    goal_repo: AsyncMock,
    sample_goal: Goal,
):
    goal_repo.get.return_value = sample_goal
    updated = Goal(
        id=sample_goal.id,
        user_id=TEST_USER_ID,
        title=sample_goal.title,
        status="achieved",
        category=sample_goal.category,
    )
    goal_repo.update.return_value = updated

    data = GoalUpdate(status="achieved")
    result = await goal_service.update(sample_goal.id, TEST_USER_ID, data)

    assert result is not None
    assert result.status == "achieved"
    goal_repo.update.assert_awaited_once_with(
        sample_goal.id, status="achieved"
    )


@pytest.mark.asyncio
async def test_update_goal_not_owned(
    goal_service: GoalService,
    goal_repo: AsyncMock,
    sample_goal: Goal,
):
    goal_repo.get.return_value = sample_goal

    data = GoalUpdate(title="Hacked")
    result = await goal_service.update(sample_goal.id, TEST_USER_ID_2, data)

    assert result is None
    goal_repo.update.assert_not_awaited()


@pytest.mark.asyncio
async def test_delete_goal_own(
    goal_service: GoalService,
    goal_repo: AsyncMock,
    sample_goal: Goal,
):
    goal_repo.get.return_value = sample_goal
    goal_repo.delete.return_value = True

    result = await goal_service.delete(sample_goal.id, TEST_USER_ID)

    assert result is True
    goal_repo.delete.assert_awaited_once_with(sample_goal.id)


@pytest.mark.asyncio
async def test_delete_goal_not_owned(
    goal_service: GoalService,
    goal_repo: AsyncMock,
    sample_goal: Goal,
):
    goal_repo.get.return_value = sample_goal

    result = await goal_service.delete(sample_goal.id, TEST_USER_ID_2)

    assert result is False
    goal_repo.delete.assert_not_awaited()
