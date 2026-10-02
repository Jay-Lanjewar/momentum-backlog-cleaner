import logging
import time
import uuid

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


class MfaStateUnavailable(Exception):
    """Raised when MFA factor state cannot be determined from Supabase Auth."""


# user_id -> (has_verified_factor, cached_at from time.monotonic()).
# Positive entries live for MFA_STATE_CACHE_TTL_SECONDS, negative entries for
# MFA_NEGATIVE_STATE_CACHE_TTL_SECONDS (deliberately much shorter so newly
# enrolled factors start being enforced quickly). Failed lookups are never
# cached.
_cache: dict[uuid.UUID, tuple[bool, float]] = {}


def clear_cache() -> None:
    """Drop all cached MFA factor state (used by tests)."""
    _cache.clear()


def _cache_ttl(has_factor: bool) -> float:
    if has_factor:
        return float(settings.MFA_STATE_CACHE_TTL_SECONDS)
    return float(settings.MFA_NEGATIVE_STATE_CACHE_TTL_SECONDS)


async def has_verified_factor(user_id: uuid.UUID) -> bool:
    """Return True when the Supabase Auth user has at least one verified MFA factor.

    Unverified factors (enrollment started but not confirmed) do not count.
    Uses the GoTrue admin factors endpoint with the service key; the result is
    cached per user with an asymmetric TTL and failures are never cached.
    """
    cached = _cache.get(user_id)
    if cached is not None:
        has_factor, cached_at = cached
        if time.monotonic() - cached_at < _cache_ttl(has_factor):
            return has_factor
        _cache.pop(user_id, None)

    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
        raise MfaStateUnavailable("Supabase Auth admin is not configured")

    url = f"{settings.SUPABASE_URL}/auth/v1/admin/users/{user_id}/factors"
    headers = {
        "apikey": settings.SUPABASE_SERVICE_KEY,
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers)
    except httpx.HTTPError as exc:
        logger.warning("MFA factor lookup failed for user %s: %s", user_id, exc)
        raise MfaStateUnavailable("MFA factor lookup request failed") from exc

    if resp.status_code >= 400:
        logger.warning(
            "MFA factor lookup returned HTTP %s for user %s", resp.status_code, user_id
        )
        raise MfaStateUnavailable(f"MFA factor lookup returned HTTP {resp.status_code}")

    try:
        factors = resp.json().get("factors") or []
    except ValueError as exc:
        raise MfaStateUnavailable("MFA factor lookup returned invalid JSON") from exc

    has_factor = any(f.get("status") == "verified" for f in factors)
    _cache[user_id] = (has_factor, time.monotonic())
    return has_factor
