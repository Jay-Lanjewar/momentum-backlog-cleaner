import uuid
import logging
import time
from collections.abc import AsyncGenerator

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db as _get_db
from app.core.security import verify_token
from app.domain.models import User

logger = logging.getLogger(__name__)

security_scheme = HTTPBearer(auto_error=True)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async for session in _get_db():
        yield session


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    t0 = time.perf_counter()
    logger.info("[AUTH] before JWT decode")
    try:
        payload = verify_token(credentials.credentials)
        logger.info("[AUTH] after JWT decode in %.2f ms", (time.perf_counter() - t0) * 1000)

        logger.info("JWT payload: %s", payload)

        user_id = uuid.UUID(payload.get("sub", ""))

        logger.info("Looking up user with id: %s", user_id)

    except Exception as e:
        logger.warning("Token verification failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
        )

    t_db = time.perf_counter()
    logger.info("[AUTH] before database lookup")

    t_exec = time.perf_counter()
    logger.info("[AUTH] before session.execute")
    result = await db.execute(select(User).where(User.id == user_id))
    logger.info("[AUTH] session.execute returned in %.2f ms", (time.perf_counter() - t_exec) * 1000)

    t_proc = time.perf_counter()
    logger.info("[AUTH] before result processing")
    user = result.scalar_one_or_none()
    logger.info("[AUTH] result processing in %.2f ms", (time.perf_counter() - t_proc) * 1000)

    logger.info("[AUTH] after database lookup in %.2f ms", (time.perf_counter() - t_db) * 1000)

    logger.info("[AUTH] completed in %.2f ms", (time.perf_counter() - t0) * 1000)
    logger.info("[AUTH] before returning the user")
    logger.info("Database returned user: %s", user)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return user
