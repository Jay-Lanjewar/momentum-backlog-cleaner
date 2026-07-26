import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import Activity, ActivityType, ActivityVisibility
from app.repositories.activity_repo import ActivityRepository
from app.repositories.friend_repo import FriendshipRepository, FriendRequestRepository, UserRepository


class ActivityService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.activity_repo = ActivityRepository(db)
        self.friendship_repo = FriendshipRepository(db)
        self.friend_request_repo = FriendRequestRepository(db)
        self.user_repo = UserRepository(db)

    async def record(
        self,
        user_id: uuid.UUID,
        activity_type: ActivityType,
        metadata: dict | None = None,
        visibility: ActivityVisibility = ActivityVisibility.FRIENDS,
        occurred_at: datetime | None = None,
    ) -> Activity:
        return await self.activity_repo.record(user_id, activity_type, metadata, visibility, occurred_at)

    async def get_feed(self, user_id: uuid.UUID, limit: int = 50, offset: int = 0):
        friend_ids = await self.friendship_repo.get_friend_ids(user_id)
        activities = await self.activity_repo.get_feed_for_user(user_id, friend_ids, limit, offset)
        result = []
        for act in activities:
            friend = act.user
            result.append({
                "activity": {
                    "id": act.id,
                    "user_id": act.user_id,
                    "type": act.type,
                    "extra": act.extra,
                    "visibility": act.visibility,
                    "occurred_at": act.occurred_at,
                    "created_at": act.created_at,
                    "user": {
                        "id": friend.id,
                        "name": friend.name,
                        "avatar_url": friend.avatar_url,
                        "created_at": friend.created_at,
                    },
                },
                "friend": {
                    "id": friend.id,
                    "name": friend.name,
                    "avatar_url": friend.avatar_url,
                    "created_at": friend.created_at,
                },
            })
        return result

    async def search_users(self, query: str, current_user_id: uuid.UUID):
        trimmed = query.strip()
        if len(trimmed) < 2:
            return []

        candidates = await self.user_repo.search_by_email_or_name(trimmed, current_user_id)

        friend_ids = set(await self.friendship_repo.get_friend_ids(current_user_id))

        pending_requests = await self.friend_request_repo.get_received_pending(current_user_id)
        pending_sent = await self.friend_request_repo.get_sent_pending(current_user_id)

        excluded_ids = friend_ids.copy()
        for req in pending_requests:
            excluded_ids.add(req.sender_id)
        for req in pending_sent:
            excluded_ids.add(req.receiver_id)

        results = []
        seen_ids = set()
        for user in candidates:
            if user.id in excluded_ids or user.id in seen_ids:
                continue
            seen_ids.add(user.id)
            results.append({
                "id": user.id,
                "display_name": user.name,
                "avatar_url": user.avatar_url,
            })

        return results
