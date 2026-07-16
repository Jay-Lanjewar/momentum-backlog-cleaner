import uuid
from unittest.mock import AsyncMock

import pytest

from app.domain.models import StudentProfile, WeeklySchedule
from app.domain.schemas import StudentProfileCreate, StudentProfileUpdate, WeeklyScheduleUpdate
from app.services.profile_service import StudentProfileService, WeeklyScheduleService
from tests.conftest import TEST_USER_ID, TEST_USER_ID_2


@pytest.fixture
def sample_profile() -> StudentProfile:
    return StudentProfile(
        id=uuid.uuid4(),
        user_id=TEST_USER_ID,
        class_name="12th Grade",
        board="CBSE",
        energy_peak="morning",
        daily_target_minutes=120,
    )


@pytest.fixture
def sample_schedule() -> WeeklySchedule:
    return WeeklySchedule(
        id=uuid.uuid4(),
        user_id=TEST_USER_ID,
        schedule={
            "monday": [
                {"type": "school", "label": "School", "start": "07:00", "end": "14:00"}
            ]
        },
    )


@pytest.mark.asyncio
async def test_get_profile(
    profile_service: StudentProfileService,
    profile_repo: AsyncMock,
    sample_profile: StudentProfile,
):
    profile_repo.get_by_user_id.return_value = sample_profile

    result = await profile_service.get(TEST_USER_ID)

    assert result is not None
    assert result.class_name == "12th Grade"
    assert result.board == "CBSE"
    profile_repo.get_by_user_id.assert_awaited_once_with(TEST_USER_ID)


@pytest.mark.asyncio
async def test_get_profile_not_found(
    profile_service: StudentProfileService,
    profile_repo: AsyncMock,
):
    profile_repo.get_by_user_id.return_value = None

    result = await profile_service.get(TEST_USER_ID)

    assert result is None


@pytest.mark.asyncio
async def test_upsert_profile_create(
    profile_service: StudentProfileService,
    profile_repo: AsyncMock,
):
    data = StudentProfileCreate(
        class_name="11th Grade",
        board="ICSE",
        energy_peak="afternoon",
    )
    expected = StudentProfile(
        id=uuid.uuid4(),
        user_id=TEST_USER_ID,
        class_name="11th Grade",
        board="ICSE",
        energy_peak="afternoon",
    )
    profile_repo.upsert.return_value = expected

    result = await profile_service.upsert(TEST_USER_ID, data)

    assert result.class_name == "11th Grade"
    assert result.board == "ICSE"
    profile_repo.upsert.assert_awaited_once()


@pytest.mark.asyncio
async def test_upsert_profile_update(
    profile_service: StudentProfileService,
    profile_repo: AsyncMock,
    sample_profile: StudentProfile,
):
    data = StudentProfileUpdate(daily_target_minutes=180)
    updated = StudentProfile(
        id=sample_profile.id,
        user_id=TEST_USER_ID,
        class_name=sample_profile.class_name,
        board=sample_profile.board,
        energy_peak=sample_profile.energy_peak,
        daily_target_minutes=180,
    )
    profile_repo.upsert.return_value = updated

    result = await profile_service.upsert(TEST_USER_ID, data)

    assert result.daily_target_minutes == 180


@pytest.mark.asyncio
async def test_delete_profile(
    profile_service: StudentProfileService,
    profile_repo: AsyncMock,
    sample_profile: StudentProfile,
):
    profile_repo.get_by_user_id.return_value = sample_profile
    profile_repo.delete.return_value = True

    result = await profile_service.delete(TEST_USER_ID)

    assert result is True


@pytest.mark.asyncio
async def test_delete_profile_not_found(
    profile_service: StudentProfileService,
    profile_repo: AsyncMock,
):
    profile_repo.get_by_user_id.return_value = None

    result = await profile_service.delete(TEST_USER_ID)

    assert result is False


@pytest.mark.asyncio
async def test_get_schedule(
    schedule_service: WeeklyScheduleService,
    schedule_repo: AsyncMock,
    sample_schedule: WeeklySchedule,
):
    schedule_repo.get_by_user_id.return_value = sample_schedule

    result = await schedule_service.get(TEST_USER_ID)

    assert result is not None
    assert "monday" in result.schedule
    schedule_repo.get_by_user_id.assert_awaited_once_with(TEST_USER_ID)


@pytest.mark.asyncio
async def test_upsert_schedule(
    schedule_service: WeeklyScheduleService,
    schedule_repo: AsyncMock,
):
    data = WeeklyScheduleUpdate(schedule={"tuesday": []})
    expected = WeeklySchedule(
        id=uuid.uuid4(),
        user_id=TEST_USER_ID,
        schedule={"tuesday": []},
    )
    schedule_repo.upsert.return_value = expected

    result = await schedule_service.upsert(TEST_USER_ID, data)

    assert "tuesday" in result.schedule
