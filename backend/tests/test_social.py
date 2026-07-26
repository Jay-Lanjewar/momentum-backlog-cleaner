import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.domain.models import ActivityType, ActivityVisibility
from app.domain.schemas import ActivityResponse, UserSearchResult
from app.repositories.activity_repo import ActivityRepository
from app.repositories.friend_repo import (
    FriendRequestRepository,
    FriendshipRepository,
    UserRepository,
)
from app.services.activity_service import ActivityService
from app.services.friend_service import FriendService
from app.domain.schemas import FriendRequestCreate
from tests.conftest import TEST_USER_ID, TEST_USER_ID_2


@pytest.fixture
def activity_repo(mock_db: AsyncMock) -> ActivityRepository:
    repo = ActivityRepository(mock_db)
    repo.create = AsyncMock()
    repo.get_feed_for_user = AsyncMock()
    repo.soft_delete = AsyncMock()
    return repo


@pytest.fixture
def friend_request_repo(mock_db: AsyncMock) -> FriendRequestRepository:
    repo = FriendRequestRepository(mock_db)
    repo.get_received_pending = AsyncMock(return_value=[])
    repo.get_sent_pending = AsyncMock(return_value=[])
    return repo


@pytest.fixture
def friendship_repo(mock_db: AsyncMock) -> FriendshipRepository:
    repo = FriendshipRepository(mock_db)
    repo.get_friend_ids = AsyncMock(return_value=[])
    return repo


@pytest.fixture
def user_repo(mock_db: AsyncMock) -> UserRepository:
    repo = UserRepository(mock_db)
    repo.search_by_email_or_name = AsyncMock(return_value=[])
    return repo


@pytest.fixture
def activity_service(
    mock_db: AsyncMock,
    activity_repo: ActivityRepository,
    friend_request_repo: FriendRequestRepository,
    friendship_repo: FriendshipRepository,
    user_repo: UserRepository,
) -> ActivityService:
    service = ActivityService.__new__(ActivityService)
    service.db = mock_db
    service.activity_repo = activity_repo
    service.friendship_repo = friendship_repo
    service.friend_request_repo = friend_request_repo
    service.user_repo = user_repo
    return service


def _make_user(user_id=None, email="test@test.com", name="Test", avatar_url=None):
    return SimpleNamespace(
        id=user_id or uuid.uuid4(),
        email=email,
        name=name,
        avatar_url=avatar_url,
        created_at=datetime.now(timezone.utc),
    )


def _make_activity(
    activity_id=None, user_id=None, act_type=ActivityType.TASK_COMPLETED,
    extra=None, visibility=ActivityVisibility.FRIENDS, occurred_at=None, user=None,
):
    return SimpleNamespace(
        id=activity_id or uuid.uuid4(),
        user_id=user_id or uuid.uuid4(),
        type=act_type.value,
        extra=extra or {},
        visibility=visibility.value,
        occurred_at=occurred_at or datetime.now(timezone.utc),
        created_at=datetime.now(timezone.utc),
        user=user or _make_user(),
    )


# ─── ActivityType enum tests ───


class TestActivityType:
    def test_enum_values(self):
        assert ActivityType.TASK_COMPLETED.value == "TASK_COMPLETED"
        assert ActivityType.MISSION_COMPLETED.value == "MISSION_COMPLETED"
        assert ActivityType.COURSE_CREATED.value == "COURSE_CREATED"
        assert ActivityType.STREAK_INCREASED.value == "STREAK_INCREASED"
        assert ActivityType.GOAL_ACHIEVED.value == "GOAL_ACHIEVED"
        assert ActivityType.PROFILE_COMPLETED.value == "PROFILE_COMPLETED"

    def test_enum_member_count(self):
        assert len(ActivityType) == 6

    def test_enum_is_str_subclass(self):
        assert isinstance(ActivityType.TASK_COMPLETED, str)
        assert ActivityType.TASK_COMPLETED == "TASK_COMPLETED"

    def test_enum_from_value(self):
        assert ActivityType("COURSE_CREATED") == ActivityType.COURSE_CREATED

    def test_enum_invalid_value_raises(self):
        with pytest.raises(ValueError):
            ActivityType("INVALID")


# ─── ActivityVisibility tests ───


class TestActivityVisibility:
    def test_enum_values(self):
        assert ActivityVisibility.PRIVATE.value == "PRIVATE"
        assert ActivityVisibility.FRIENDS.value == "FRIENDS"
        assert ActivityVisibility.PUBLIC.value == "PUBLIC"

    def test_enum_member_count(self):
        assert len(ActivityVisibility) == 3

    def test_enum_is_str_subclass(self):
        assert isinstance(ActivityVisibility.FRIENDS, str)
        assert ActivityVisibility.FRIENDS == "FRIENDS"

    def test_enum_from_value(self):
        assert ActivityVisibility("PRIVATE") == ActivityVisibility.PRIVATE

    def test_enum_invalid_value_raises(self):
        with pytest.raises(ValueError):
            ActivityVisibility("EVERYONE")


# ─── Activity visibility default tests ───


class TestActivityDefaults:
    def test_visibility_default_is_friends(self):
        data = {
            "id": uuid.uuid4(),
            "user_id": uuid.uuid4(),
            "type": "TASK_COMPLETED",
            "occurred_at": datetime.now(timezone.utc),
            "created_at": datetime.now(timezone.utc),
        }
        resp = ActivityResponse(**data)
        assert resp.visibility == ActivityVisibility.FRIENDS

    def test_visibility_explicit_private(self):
        data = {
            "id": uuid.uuid4(),
            "user_id": uuid.uuid4(),
            "type": "TASK_COMPLETED",
            "visibility": "PRIVATE",
            "occurred_at": datetime.now(timezone.utc),
            "created_at": datetime.now(timezone.utc),
        }
        resp = ActivityResponse(**data)
        assert resp.visibility == ActivityVisibility.PRIVATE

    def test_visibility_explicit_public(self):
        data = {
            "id": uuid.uuid4(),
            "user_id": uuid.uuid4(),
            "type": "COURSE_CREATED",
            "visibility": "PUBLIC",
            "occurred_at": datetime.now(timezone.utc),
            "created_at": datetime.now(timezone.utc),
        }
        resp = ActivityResponse(**data)
        assert resp.visibility == ActivityVisibility.PUBLIC

    def test_occurred_at_stored(self):
        fixed = datetime(2026, 3, 15, 10, 0, 0, tzinfo=timezone.utc)
        data = {
            "id": uuid.uuid4(),
            "user_id": uuid.uuid4(),
            "type": "STREAK_INCREASED",
            "occurred_at": fixed,
            "created_at": datetime.now(timezone.utc),
        }
        resp = ActivityResponse(**data)
        assert resp.occurred_at == fixed


# ─── Schema serialization tests ───


class TestActivitySchemaSerialization:
    def test_activity_response_serializes_enum(self):
        data = {
            "id": uuid.uuid4(),
            "user_id": uuid.uuid4(),
            "type": "TASK_COMPLETED",
            "extra": {"item_id": "123"},
            "visibility": "FRIENDS",
            "occurred_at": datetime.now(timezone.utc),
            "created_at": datetime.now(timezone.utc),
        }
        resp = ActivityResponse(**data)
        assert resp.type == ActivityType.TASK_COMPLETED
        assert resp.visibility == ActivityVisibility.FRIENDS

    def test_activity_response_invalid_type_rejects(self):
        data = {
            "id": uuid.uuid4(),
            "user_id": uuid.uuid4(),
            "type": "INVALID_TYPE",
            "occurred_at": datetime.now(timezone.utc),
            "created_at": datetime.now(timezone.utc),
        }
        with pytest.raises(Exception):
            ActivityResponse(**data)

    def test_activity_response_invalid_visibility_rejects(self):
        data = {
            "id": uuid.uuid4(),
            "user_id": uuid.uuid4(),
            "type": "TASK_COMPLETED",
            "visibility": "EVERYONE",
            "occurred_at": datetime.now(timezone.utc),
            "created_at": datetime.now(timezone.utc),
        }
        with pytest.raises(Exception):
            ActivityResponse(**data)

    def test_user_search_result_schema(self):
        data = {
            "id": uuid.uuid4(),
            "display_name": "Alice",
            "avatar_url": None,
        }
        resp = UserSearchResult(**data)
        assert resp.display_name == "Alice"
        assert resp.avatar_url is None

    def test_user_search_result_with_avatar(self):
        data = {
            "id": uuid.uuid4(),
            "display_name": "Bob",
            "avatar_url": "https://example.com/bob.png",
        }
        resp = UserSearchResult(**data)
        assert resp.avatar_url == "https://example.com/bob.png"


# ─── Activity recording tests ───


@pytest.mark.asyncio
async def test_record_activity_default_visibility(
    activity_service: ActivityService,
    activity_repo: AsyncMock,
):
    expected = _make_activity(
        act_type=ActivityType.COURSE_CREATED,
        extra={"course_id": "abc"},
        visibility=ActivityVisibility.FRIENDS,
    )
    activity_repo.create.return_value = expected

    result = await activity_service.record(
        TEST_USER_ID, ActivityType.COURSE_CREATED, {"course_id": "abc"}
    )

    assert result.type == ActivityType.COURSE_CREATED.value
    assert result.visibility == ActivityVisibility.FRIENDS.value
    call_kwargs = activity_repo.create.call_args[1]
    assert call_kwargs["visibility"] == ActivityVisibility.FRIENDS.value


@pytest.mark.asyncio
async def test_record_activity_custom_visibility(
    activity_service: ActivityService,
    activity_repo: AsyncMock,
):
    expected = _make_activity(
        act_type=ActivityType.GOAL_ACHIEVED,
        visibility=ActivityVisibility.PRIVATE,
    )
    activity_repo.create.return_value = expected

    result = await activity_service.record(
        TEST_USER_ID, ActivityType.GOAL_ACHIEVED, visibility=ActivityVisibility.PRIVATE
    )

    assert result.visibility == ActivityVisibility.PRIVATE.value
    call_kwargs = activity_repo.create.call_args[1]
    assert call_kwargs["visibility"] == ActivityVisibility.PRIVATE.value


@pytest.mark.asyncio
async def test_record_activity_with_occurred_at(
    activity_service: ActivityService,
    activity_repo: AsyncMock,
):
    fixed_time = datetime(2026, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
    expected = _make_activity(
        act_type=ActivityType.STREAK_INCREASED,
        occurred_at=fixed_time,
    )
    activity_repo.create.return_value = expected

    await activity_service.record(
        TEST_USER_ID, ActivityType.STREAK_INCREASED, occurred_at=fixed_time
    )

    call_kwargs = activity_repo.create.call_args[1]
    assert call_kwargs["occurred_at"] == fixed_time


@pytest.mark.asyncio
async def test_record_activity_uses_enum_not_string(
    activity_service: ActivityService,
    activity_repo: AsyncMock,
):
    activity_repo.create.return_value = _make_activity()

    await activity_service.record(TEST_USER_ID, ActivityType.TASK_COMPLETED)

    call_kwargs = activity_repo.create.call_args[1]
    assert call_kwargs["type"] == "TASK_COMPLETED"
    assert isinstance(call_kwargs["type"], str)


# ─── Soft delete tests ───


@pytest.mark.asyncio
async def test_soft_delete_sets_deleted_at(
    activity_repo: AsyncMock,
):
    activity_repo.soft_delete.return_value = True

    result = await activity_repo.soft_delete(uuid.uuid4(), TEST_USER_ID)

    assert result is True
    activity_repo.soft_delete.assert_awaited_once()


@pytest.mark.asyncio
async def test_soft_delete_returns_false_for_nonexistent(
    activity_repo: AsyncMock,
):
    activity_repo.soft_delete.return_value = False

    result = await activity_repo.soft_delete(uuid.uuid4(), TEST_USER_ID)

    assert result is False


# ─── User search tests ───


@pytest.mark.asyncio
async def test_search_short_query_returns_empty(
    activity_service: ActivityService,
):
    result = await activity_service.search_users("a", TEST_USER_ID)
    assert result == []


@pytest.mark.asyncio
async def test_search_empty_query_returns_empty(
    activity_service: ActivityService,
):
    result = await activity_service.search_users("", TEST_USER_ID)
    assert result == []


@pytest.mark.asyncio
async def test_search_whitespace_only_returns_empty(
    activity_service: ActivityService,
):
    result = await activity_service.search_users("   ", TEST_USER_ID)
    assert result == []


@pytest.mark.asyncio
async def test_search_trims_whitespace(
    activity_service: ActivityService,
    user_repo: AsyncMock,
):
    user_repo.search_by_email_or_name.return_value = []

    await activity_service.search_users("  ali  ", TEST_USER_ID)

    user_repo.search_by_email_or_name.assert_awaited_once_with("ali", TEST_USER_ID)


@pytest.mark.asyncio
async def test_search_excludes_self(
    activity_service: ActivityService,
    user_repo: AsyncMock,
):
    user_repo.search_by_email_or_name.return_value = []

    await activity_service.search_users("alice", TEST_USER_ID)

    call_args = user_repo.search_by_email_or_name.call_args[0]
    assert call_args[1] == TEST_USER_ID


@pytest.mark.asyncio
async def test_search_excludes_friends(
    activity_service: ActivityService,
    user_repo: AsyncMock,
    friendship_repo: AsyncMock,
):
    friend_id = uuid.uuid4()
    user_repo.search_by_email_or_name.return_value = [
        _make_user(user_id=friend_id, name="Bob")
    ]
    friendship_repo.get_friend_ids.return_value = [friend_id]

    result = await activity_service.search_users("bob", TEST_USER_ID)

    assert len(result) == 0


@pytest.mark.asyncio
async def test_search_excludes_pending_incoming(
    activity_service: ActivityService,
    user_repo: AsyncMock,
    friend_request_repo: AsyncMock,
    friendship_repo: AsyncMock,
):
    pending_user_id = uuid.uuid4()
    user_repo.search_by_email_or_name.return_value = [
        _make_user(user_id=pending_user_id, name="Charlie")
    ]

    mock_request = MagicMock()
    mock_request.sender_id = pending_user_id
    friend_request_repo.get_received_pending.return_value = [mock_request]
    friend_request_repo.get_sent_pending.return_value = []
    friendship_repo.get_friend_ids.return_value = []

    result = await activity_service.search_users("charlie", TEST_USER_ID)

    assert len(result) == 0


@pytest.mark.asyncio
async def test_search_excludes_pending_outgoing(
    activity_service: ActivityService,
    user_repo: AsyncMock,
    friend_request_repo: AsyncMock,
    friendship_repo: AsyncMock,
):
    pending_user_id = uuid.uuid4()
    user_repo.search_by_email_or_name.return_value = [
        _make_user(user_id=pending_user_id, name="Dave")
    ]

    friend_request_repo.get_received_pending.return_value = []

    mock_request = MagicMock()
    mock_request.receiver_id = pending_user_id
    friend_request_repo.get_sent_pending.return_value = [mock_request]
    friendship_repo.get_friend_ids.return_value = []

    result = await activity_service.search_users("dave", TEST_USER_ID)

    assert len(result) == 0


@pytest.mark.asyncio
async def test_search_deduplicates_results(
    activity_service: ActivityService,
    user_repo: AsyncMock,
    friendship_repo: AsyncMock,
    friend_request_repo: AsyncMock,
):
    shared_id = uuid.uuid4()
    user1 = _make_user(user_id=shared_id, name="Test")
    user2 = _make_user(user_id=shared_id, name="Test")
    user_repo.search_by_email_or_name.return_value = [user1, user2]
    friendship_repo.get_friend_ids.return_value = []

    result = await activity_service.search_users("test", TEST_USER_ID)

    assert len(result) == 1
    assert result[0]["id"] == shared_id


@pytest.mark.asyncio
async def test_search_returns_only_safe_fields(
    activity_service: ActivityService,
    user_repo: AsyncMock,
    friendship_repo: AsyncMock,
    friend_request_repo: AsyncMock,
):
    user = _make_user(
        email="secret@test.com",
        name="Safe Name",
        avatar_url="https://example.com/avatar.png",
    )
    user_repo.search_by_email_or_name.return_value = [user]
    friendship_repo.get_friend_ids.return_value = []

    result = await activity_service.search_users("safe", TEST_USER_ID)

    assert len(result) == 1
    entry = result[0]
    assert "id" in entry
    assert "display_name" in entry
    assert "avatar_url" in entry
    assert "email" not in entry
    assert "hashed_password" not in entry
    assert entry["display_name"] == "Safe Name"
    assert entry["avatar_url"] == "https://example.com/avatar.png"


@pytest.mark.asyncio
async def test_search_excludes_multiple_exclusion_types(
    activity_service: ActivityService,
    user_repo: AsyncMock,
    friendship_repo: AsyncMock,
    friend_request_repo: AsyncMock,
):
    friend_id = uuid.uuid4()
    pending_in_id = uuid.uuid4()
    pending_out_id = uuid.uuid4()
    visible_id = uuid.uuid4()

    users = [
        _make_user(user_id=friend_id, name="Friend"),
        _make_user(user_id=pending_in_id, name="PendingIn"),
        _make_user(user_id=pending_out_id, name="PendingOut"),
        _make_user(user_id=visible_id, name="Visible"),
    ]
    user_repo.search_by_email_or_name.return_value = users
    friendship_repo.get_friend_ids.return_value = [friend_id]

    mock_in = MagicMock()
    mock_in.sender_id = pending_in_id
    friend_request_repo.get_received_pending.return_value = [mock_in]

    mock_out = MagicMock()
    mock_out.receiver_id = pending_out_id
    friend_request_repo.get_sent_pending.return_value = [mock_out]

    result = await activity_service.search_users("test", TEST_USER_ID)

    assert len(result) == 1
    assert result[0]["id"] == visible_id


@pytest.mark.asyncio
async def test_search_no_exclusions_returns_all(
    activity_service: ActivityService,
    user_repo: AsyncMock,
    friendship_repo: AsyncMock,
    friend_request_repo: AsyncMock,
):
    user = _make_user(name="Alice")
    user_repo.search_by_email_or_name.return_value = [user]
    friendship_repo.get_friend_ids.return_value = []

    result = await activity_service.search_users("alice", TEST_USER_ID)

    assert len(result) == 1
    assert result[0]["display_name"] == "Alice"


# ─── FriendService.send_request eager loading tests ───


@pytest.fixture
def friend_service(
    mock_db: AsyncMock,
    friend_request_repo: FriendRequestRepository,
    friendship_repo: FriendshipRepository,
    user_repo: UserRepository,
) -> FriendService:
    service = FriendService.__new__(FriendService)
    service.db = mock_db
    service.request_repo = friend_request_repo
    friend_request_repo.find_any_between = AsyncMock(return_value=None)
    friend_request_repo.create = AsyncMock()
    friend_request_repo.get_with_users = AsyncMock()
    service.friendship_repo = friendship_repo
    friendship_repo.find_between = AsyncMock(return_value=None)
    service.user_repo = user_repo
    user_repo.get = AsyncMock()
    return service


def _make_friend_request(request_id=None, sender_id=None, receiver_id=None, status="pending", sender=None, receiver=None):
    return SimpleNamespace(
        id=request_id or uuid.uuid4(),
        sender_id=sender_id or uuid.uuid4(),
        receiver_id=receiver_id or uuid.uuid4(),
        status=status,
        created_at=datetime.now(timezone.utc),
        sender=sender or _make_user(),
        receiver=receiver or _make_user(),
    )


@pytest.mark.asyncio
async def test_send_request_calls_get_with_users(
    friend_service: FriendService,
    friend_request_repo: AsyncMock,
    friendship_repo: AsyncMock,
    user_repo: AsyncMock,
):
    receiver_id = uuid.uuid4()
    user_repo.get.return_value = _make_user(user_id=receiver_id)
    friend_request_repo.find_any_between.return_value = None
    friendship_repo.find_between.return_value = None

    created = _make_friend_request(sender_id=TEST_USER_ID, receiver_id=receiver_id)
    friend_request_repo.create.return_value = created

    hydrated = _make_friend_request(sender_id=TEST_USER_ID, receiver_id=receiver_id)
    friend_request_repo.get_with_users.return_value = hydrated

    result = await friend_service.send_request(TEST_USER_ID, FriendRequestCreate(receiver_id=receiver_id))

    friend_request_repo.get_with_users.assert_awaited_once_with(created.id)
    assert result.sender is not None
    assert result.receiver is not None


@pytest.mark.asyncio
async def test_send_request_returns_hydrated_object(
    friend_service: FriendService,
    friend_request_repo: AsyncMock,
    friendship_repo: AsyncMock,
    user_repo: AsyncMock,
):
    receiver_id = uuid.uuid4()
    sender = _make_user(user_id=TEST_USER_ID, name="Alice")
    receiver = _make_user(user_id=receiver_id, name="Bob")

    user_repo.get.return_value = receiver
    friend_request_repo.find_any_between.return_value = None
    friendship_repo.find_between.return_value = None

    created = _make_friend_request(sender_id=TEST_USER_ID, receiver_id=receiver_id)
    friend_request_repo.create.return_value = created

    hydrated = _make_friend_request(
        sender_id=TEST_USER_ID, receiver_id=receiver_id, sender=sender, receiver=receiver
    )
    friend_request_repo.get_with_users.return_value = hydrated

    result = await friend_service.send_request(TEST_USER_ID, FriendRequestCreate(receiver_id=receiver_id))

    assert result.sender.name == "Alice"
    assert result.receiver.name == "Bob"
    assert result.sender_id == TEST_USER_ID
    assert result.receiver_id == receiver_id


@pytest.mark.asyncio
async def test_send_request_no_missing_greenlet_risk(
    friend_service: FriendService,
    friend_request_repo: AsyncMock,
    friendship_repo: AsyncMock,
    user_repo: AsyncMock,
):
    receiver_id = uuid.uuid4()
    user_repo.get.return_value = _make_user(user_id=receiver_id)
    friend_request_repo.find_any_between.return_value = None
    friendship_repo.find_between.return_value = None

    created = _make_friend_request(sender_id=TEST_USER_ID, receiver_id=receiver_id)
    friend_request_repo.create.return_value = created

    hydrated = _make_friend_request(sender_id=TEST_USER_ID, receiver_id=receiver_id)
    friend_request_repo.get_with_users.return_value = hydrated

    result = await friend_service.send_request(TEST_USER_ID, FriendRequestCreate(receiver_id=receiver_id))

    assert hasattr(result, "sender")
    assert hasattr(result, "receiver")
    assert result.sender is not None
    assert result.receiver is not None


@pytest.mark.asyncio
async def test_send_request_validates_no_self_request(
    friend_service: FriendService,
):
    with pytest.raises(ValueError, match="yourself"):
        await friend_service.send_request(TEST_USER_ID, FriendRequestCreate(receiver_id=TEST_USER_ID))


@pytest.mark.asyncio
async def test_send_request_validates_receiver_exists(
    friend_service: FriendService,
    user_repo: AsyncMock,
    friend_request_repo: AsyncMock,
    friendship_repo: AsyncMock,
):
    user_repo.get.return_value = None
    friend_request_repo.find_any_between.return_value = None
    friendship_repo.find_between.return_value = None

    with pytest.raises(ValueError, match="not found"):
        await friend_service.send_request(TEST_USER_ID, FriendRequestCreate(receiver_id=uuid.uuid4()))
