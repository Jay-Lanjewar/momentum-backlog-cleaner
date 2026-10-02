import uuid
import logging
import time
from collections.abc import AsyncGenerator

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db as _get_db
from app.core.mfa import MfaStateUnavailable, has_verified_factor
from app.core.security import verify_token
from app.domain.models import User

logger = logging.getLogger(__name__)

security_scheme = HTTPBearer(auto_error=True)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async for session in _get_db():
        yield session


async def _ensure_assurance(payload: dict, user_id: uuid.UUID) -> None:
    """Require an aal2 session unless the account has no verified MFA factor.

    Non-MFA accounts keep working on aal1 tokens exactly as before; accounts
    with a verified factor must present an aal2 token issued by GoTrue after a
    successful challenge.  Must be called outside the generic token-decode
    ``try`` block so its 401/503 responses are not swallowed.
    """
    if payload.get("aal") == "aal2":
        return

    try:
        factor_present = await has_verified_factor(user_id)
    except MfaStateUnavailable as e:
        logger.error("MFA state check unavailable for user %s: %s", user_id, e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "mfa_check_unavailable",
                "message": (
                    "Additional authentication check is temporarily unavailable. "
                    "Please try again."
                ),
            },
        ) from e

    if factor_present:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "insufficient_aal",
                "message": (
                    "Additional authentication is required to continue. "
                    "Please sign in again."
                ),
            },
        )


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

    await _ensure_assurance(payload, user_id)

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


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
) -> uuid.UUID:
    """Extract authenticated user ID from JWT without a database query.

    Unlike ``get_current_user``, this dependency does **not** touch the
    ``users`` table.  It simply decodes the verified JWT and returns the
    ``sub`` claim as a ``uuid.UUID``.  Use this when the endpoint only
    needs the user ID (e.g. filtering related rows) and does not require
    the full ``User`` ORM object.

    The same AAL assurance gate as ``get_current_user`` applies: aal2 tokens
    pass directly, aal1 tokens are rejected when the account has a verified
    MFA factor.
    """
    try:
        payload = verify_token(credentials.credentials)
        user_id = uuid.UUID(payload.get("sub", ""))
    except Exception as e:
        logger.warning("Token verification failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
        )

    await _ensure_assurance(payload, user_id)
    return user_id
