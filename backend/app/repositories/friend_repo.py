import uuid
from collections.abc import Sequence

from sqlalchemy import or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.domain.models import Friendship, FriendRequest, User
from app.repositories.base import BaseRepository


class FriendRequestRepository(BaseRepository[FriendRequest]):
    def __init__(self, db: AsyncSession):
        super().__init__(FriendRequest, db)

    async def get_with_users(self, request_id: uuid.UUID) -> FriendRequest | None:
        from sqlalchemy import select

        result = await self.db.execute(
            select(FriendRequest)
            .options(
                selectinload(FriendRequest.sender),
                selectinload(FriendRequest.receiver),
            )
            .where(FriendRequest.id == request_id)
        )
        return result.scalar_one_or_none()

    async def find_pending_between(
        self, sender_id: uuid.UUID, receiver_id: uuid.UUID
    ) -> FriendRequest | None:
        from sqlalchemy import select

        result = await self.db.execute(
            select(FriendRequest).where(
                FriendRequest.sender_id == sender_id,
                FriendRequest.receiver_id == receiver_id,
                FriendRequest.status == "pending",
            )
        )
        return result.scalar_one_or_none()

    async def find_any_between(
        self, user1_id: uuid.UUID, user2_id: uuid.UUID
    ) -> FriendRequest | None:
        from sqlalchemy import select

        result = await self.db.execute(
            select(FriendRequest).where(
                or_(
                    (FriendRequest.sender_id == user1_id) & (FriendRequest.receiver_id == user2_id),
                    (FriendRequest.sender_id == user2_id) & (FriendRequest.receiver_id == user1_id),
                ),
                FriendRequest.status == "pending",
            )
        )
        return result.scalar_one_or_none()

    async def get_received_pending(self, user_id: uuid.UUID) -> Sequence[FriendRequest]:
        from sqlalchemy import select

        result = await self.db.execute(
            select(FriendRequest)
            .options(
                selectinload(FriendRequest.sender),
                selectinload(FriendRequest.receiver),
            )
            .where(FriendRequest.receiver_id == user_id, FriendRequest.status == "pending")
            .order_by(FriendRequest.created_at.desc())
        )
        return result.scalars().all()

    async def get_sent_pending(self, user_id: uuid.UUID) -> Sequence[FriendRequest]:
        from sqlalchemy import select

        result = await self.db.execute(
            select(FriendRequest)
            .options(
                selectinload(FriendRequest.sender),
                selectinload(FriendRequest.receiver),
            )
            .where(FriendRequest.sender_id == user_id, FriendRequest.status == "pending")
            .order_by(FriendRequest.created_at.desc())
        )
        return result.scalars().all()


class FriendshipRepository(BaseRepository[Friendship]):
    def __init__(self, db: AsyncSession):
        super().__init__(Friendship, db)

    async def get_friend_ids(self, user_id: uuid.UUID) -> list[uuid.UUID]:
        from sqlalchemy import select

        result = await self.db.execute(
            select(Friendship).where(
                or_(Friendship.user1_id == user_id, Friendship.user2_id == user_id)
            )
        )
        friendships = result.scalars().all()
        friend_ids = []
        for f in friendships:
            if f.user1_id == user_id:
                friend_ids.append(f.user2_id)
            else:
                friend_ids.append(f.user1_id)
        return friend_ids

    async def find_between(self, user1_id: uuid.UUID, user2_id: uuid.UUID) -> Friendship | None:
        from sqlalchemy import select

        result = await self.db.execute(
            select(Friendship).where(
                or_(
                    (Friendship.user1_id == user1_id) & (Friendship.user2_id == user2_id),
                    (Friendship.user1_id == user2_id) & (Friendship.user2_id == user1_id),
                )
            )
        )
        return result.scalar_one_or_none()

    async def get_friendships_with_users(self, user_id: uuid.UUID) -> Sequence[Friendship]:
        from sqlalchemy import select

        result = await self.db.execute(
            select(Friendship)
            .options(selectinload(Friendship.user1), selectinload(Friendship.user2))
            .where(or_(Friendship.user1_id == user_id, Friendship.user2_id == user_id))
            .order_by(Friendship.created_at.desc())
        )
        return result.scalars().all()

    async def delete_between(self, user1_id: uuid.UUID, user2_id: uuid.UUID) -> bool:
        existing = await self.find_between(user1_id, user2_id)
        if existing is None:
            return False
        await self.db.delete(existing)
        await self.db.flush()
        return True


class UserRepository(BaseRepository[User]):
    def __init__(self, db: AsyncSession):
        super().__init__(User, db)

    async def search_by_email_or_name(self, query: str, exclude_id: uuid.UUID) -> Sequence[User]:
        from sqlalchemy import select

        result = await self.db.execute(
            select(User)
            .where(
                User.id != exclude_id,
                or_(User.email.ilike(f"%{query}%"), User.name.ilike(f"%{query}%")),
            )
            .limit(20)
        )
        return result.scalars().all()
