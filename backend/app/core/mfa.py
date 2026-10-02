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


def _extract_factors(body: object) -> list:
    """Extract the factors list from a GoTrue ``GET /user`` response body.

    A user object without a ``factors`` key simply has no factors.  A
    ``factors`` value that is present but not a list (or a non-object body)
    fails closed as unavailable so an unexpected response can never escape as
    an unhandled exception or be silently read as "no factors" when it might
    contain one.
    """
    if not isinstance(body, dict):
        raise MfaStateUnavailable("MFA factor lookup returned unexpected JSON shape")
    if "factors" not in body:
        return []
    factors = body["factors"]
    if isinstance(factors, list):
        return factors
    raise MfaStateUnavailable("MFA factor lookup returned unexpected JSON shape")


async def has_verified_factor(user_id: uuid.UUID, access_token: str) -> bool:
    """Return True when the Supabase Auth user has at least one verified MFA factor.

    Unverified factors (enrollment started but not confirmed) do not count.
    Uses the caller-scoped ``GET /auth/v1/user`` endpoint authenticated with
    the request's own access token (the same call auth-js makes to list
    factors); the service key is never used.  The result is cached per user
    with an asymmetric TTL and failures are never cached.
    """
    cached = _cache.get(user_id)
    if cached is not None:
        has_factor, cached_at = cached
        if time.monotonic() - cached_at < _cache_ttl(has_factor):
            return has_factor
        _cache.pop(user_id, None)

    if not settings.SUPABASE_URL or not access_token:
        raise MfaStateUnavailable("Supabase Auth is not configured")

    url = f"{settings.SUPABASE_URL}/auth/v1/user"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    if settings.SUPABASE_ANON_KEY:
        headers["apikey"] = settings.SUPABASE_ANON_KEY

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers)
    except httpx.HTTPError as exc:
        logger.warning("MFA factor lookup failed for user %s: %s", user_id, exc)
        raise MfaStateUnavailable("MFA factor lookup request failed") from exc

    if resp.status_code >= 400:
        # Short excerpt only, for diagnosing the failure; never any headers.
        excerpt = resp.text[:200]
        logger.warning(
            "MFA factor lookup returned HTTP %s for user %s: %s",
            resp.status_code,
            user_id,
            excerpt,
        )
        raise MfaStateUnavailable(f"MFA factor lookup returned HTTP {resp.status_code}")

    try:
        body = resp.json()
    except ValueError as exc:
        raise MfaStateUnavailable("MFA factor lookup returned invalid JSON") from exc

    factors = _extract_factors(body)
    has_factor = any(
        isinstance(factor, dict) and factor.get("status") == "verified"
        for factor in factors
    )
    _cache[user_id] = (has_factor, time.monotonic())
    return has_factor
