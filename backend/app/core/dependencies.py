import uuid
import logging
from collections.abc import AsyncGenerator

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db as _get_db
from app.domain.models import User

logger = logging.getLogger(__name__)

security_scheme = HTTPBearer(auto_error=False)

DEV_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async for session in _get_db():
        yield session


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    user_id: uuid.UUID | None = None

    if credentials:
        try:
            from app.core.security import verify_token
            payload = verify_token(credentials.credentials)
            user_id = uuid.UUID(payload.get("sub", ""))
        except Exception as e:
            logger.warning("Token verification failed: %s", e)

    if user_id is None:
        user_id = DEV_USER_ID
        logger.info("Using dev user: %s", user_id)

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        user = User(
            id=user_id,
            email=f"{user_id}@dev.local",
            name="Dev User",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    return user
