import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import Friendship, FriendRequest
from app.repositories.friend_repo import FriendRequestRepository, FriendshipRepository, UserRepository
from app.domain.schemas import FriendRequestCreate


class FriendService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.request_repo = FriendRequestRepository(db)
        self.friendship_repo = FriendshipRepository(db)
        self.user_repo = UserRepository(db)

    async def send_request(self, sender_id: uuid.UUID, data: FriendRequestCreate) -> FriendRequest:
        if sender_id == data.receiver_id:
            raise ValueError("Cannot send friend request to yourself")

        receiver = await self.user_repo.get(data.receiver_id)
        if receiver is None:
            raise ValueError("User not found")

        existing = await self.request_repo.find_any_between(sender_id, data.receiver_id)
        if existing is not None:
            raise ValueError("A pending friend request already exists between these users")

        already_friends = await self.friendship_repo.find_between(sender_id, data.receiver_id)
        if already_friends is not None:
            raise ValueError("Already friends with this user")

        return await self.request_repo.create(sender_id=sender_id, receiver_id=data.receiver_id, status="pending")

    async def accept_request(self, user_id: uuid.UUID, request_id: uuid.UUID) -> Friendship:
        req = await self.request_repo.get(request_id)
        if req is None or req.receiver_id != user_id:
            raise ValueError("Friend request not found")
        if req.status != "pending":
            raise ValueError("Friend request is no longer pending")

        await self.request_repo.update(req.id, status="accepted")

        user1 = min(req.sender_id, req.receiver_id, key=lambda x: str(x))
        user2 = max(req.sender_id, req.receiver_id, key=lambda x: str(x))
        friendship = await self.friendship_repo.create(user1_id=user1, user2_id=user2)
        return friendship

    async def reject_request(self, user_id: uuid.UUID, request_id: uuid.UUID) -> None:
        req = await self.request_repo.get(request_id)
        if req is None or req.receiver_id != user_id:
            raise ValueError("Friend request not found")
        if req.status != "pending":
            raise ValueError("Friend request is no longer pending")
        await self.request_repo.update(req.id, status="rejected")

    async def cancel_request(self, user_id: uuid.UUID, request_id: uuid.UUID) -> None:
        req = await self.request_repo.get(request_id)
        if req is None or req.sender_id != user_id:
            raise ValueError("Friend request not found")
        if req.status != "pending":
            raise ValueError("Friend request is no longer pending")
        await self.request_repo.update(req.id, status="cancelled")

    async def remove_friend(self, user_id: uuid.UUID, friend_id: uuid.UUID) -> None:
        deleted = await self.friendship_repo.delete_between(user_id, friend_id)
        if not deleted:
            raise ValueError("Friendship not found")

    async def list_friends(self, user_id: uuid.UUID):
        friend_ids = await self.friendship_repo.get_friend_ids(user_id)
        friendships = await self.friendship_repo.get_friendships_with_users(user_id)
        result = []
        for fs in friendships:
            friend = fs.user2 if fs.user1_id == user_id else fs.user1
            result.append({"friend": friend, "since": fs.created_at})
        return result

    async def list_pending_requests(self, user_id: uuid.UUID):
        received = await self.request_repo.get_received_pending(user_id)
        sent = await self.request_repo.get_sent_pending(user_id)
        return {"received": received, "sent": sent}
