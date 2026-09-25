"""Timezone-aware clock helpers for user-facing planning decisions.

The backend runs in UTC (Render), but planning decisions (which weekday is
"today", the now+15 minute floor, whether a session is in the past, ... ) are
made from the *user's* perspective.  The mobile client sends its IANA zone on
every request via the ``X-Device-Timezone`` header; a pure-ASGI middleware
stores it in a ContextVar so nested code (services, planners) can resolve
"now"/"today" without threading a tz argument through every call.

Design notes:

* ``_system_now`` is the single seam for the system clock.  Tests freeze time
  by monkeypatching ``app.core.timezone._system_now``.
* Fallback is UTC when the header is missing or invalid (last-known-good
  behaviour for pre-tz clients and non-request contexts such as CLI/cron).
* This module only affects user-facing wall-clock planning logic.  Database
  timestamps (``created_at``/``updated_at``) remain UTC.
"""

from __future__ import annotations

import re
from contextvars import ContextVar, Token
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

USER_TIMEZONE_HEADER = "X-Device-Timezone"
DEFAULT_TIMEZONE = "UTC"
MAX_TIMEZONE_LENGTH = 64

# Deliberately permissive but single-segment safe: IANA names like
# "Asia/Kolkata", "America/Argentina/Buenos_Aires" or "UTC".  Rejects
# traversal-ish input before it ever reaches ZoneInfo.
_TIMEZONE_RE = re.compile(r"^[A-Za-z0-9_+\-]+(/[A-Za-z0-9_+\-]+)*$")

_user_timezone: ContextVar[str] = ContextVar(
    "user_timezone", default=DEFAULT_TIMEZONE
)


def validate_timezone(value: str | None) -> str:
    """Return a safe IANA timezone name, falling back to UTC."""
    if not value or not isinstance(value, str):
        return DEFAULT_TIMEZONE
    name = value.strip()
    if not name or len(name) > MAX_TIMEZONE_LENGTH:
        return DEFAULT_TIMEZONE
    if not _TIMEZONE_RE.match(name):
        return DEFAULT_TIMEZONE
    try:
        ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError, KeyError, OSError):
        return DEFAULT_TIMEZONE
    return name


def set_user_timezone(value: str | None) -> Token:
    """Store the validated request timezone; returns a reset token."""
    return _user_timezone.set(validate_timezone(value))


def reset_user_timezone(token: Token) -> None:
    _user_timezone.reset(token)


def get_user_timezone_name() -> str:
    return _user_timezone.get()


def get_user_timezone() -> ZoneInfo:
    return ZoneInfo(get_user_timezone_name())


def _system_now() -> datetime:
    """System clock (UTC-aware).  Test seam."""
    return datetime.now(timezone.utc)


def now_in_user_tz() -> datetime:
    """Current instant in the request's user timezone (aware)."""
    return _system_now().astimezone(get_user_timezone())


def today_in_user_tz() -> date:
    """Today's date in the request's user timezone."""
    return now_in_user_tz().date()


class UserTimezoneMiddleware:
    """Pure ASGI middleware: read the device zone once per HTTP request.

    A plain ASGI wrapper (rather than BaseHTTPMiddleware) keeps the endpoint
    in the same task/context, so the ContextVar is guaranteed visible to the
    route handler and everything it awaits.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        raw = None
        for name, value in scope.get("headers", []):
            if name == b"x-device-timezone":
                raw = value.decode("latin-1")
                break

        token = set_user_timezone(raw)
        try:
            await self.app(scope, receive, send)
        finally:
            reset_user_timezone(token)
