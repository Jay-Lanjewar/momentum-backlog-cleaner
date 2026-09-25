"""User-timezone transport, planning-date resolution and stale-snapshot tests.

Covers the production incident: a fresh install showed "No more sessions
today" at ~19:08 IST on a Friday because the backend (Render, UTC) floored
the study window at 13:53 UTC (= 19:53 IST was irrelevant) — sessions were
planned from 16:00 *server* time, all of them in the past by the time the
user looked at the device.

Test coverage:

* ``X-Device-Timezone`` header transport through ``UserTimezoneMiddleware``
* validated UTC fallback for missing/invalid zones
* local-time now+15 floor in ``compute_available_windows``
* weekday/local-date resolution across the UTC -> IST day boundary
* dashboard endpoint with an ``Asia/Kolkata`` header never returns
  already-past sessions (the exact real-device scenario)
* stale snapshot regeneration rules (Phase B)
"""
import uuid
from datetime import date, datetime, timezone as dt_timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1 import router as v1_router
from app.core import timezone as tz
from app.core.dependencies import get_current_user_id, get_db
from app.core.timezone import (
    UserTimezoneMiddleware,
    get_user_timezone_name,
    now_in_user_tz,
    reset_user_timezone,
    set_user_timezone,
    today_in_user_tz,
    validate_timezone,
)
from app.domain.models import (
    BacklogItem,
    Course,
    StudentProfile,
    User,
    WeeklySchedule,
)
from app.services import adaptive_service
from app.services.adaptive_service import get_or_create_active_snapshot
from app.services.deterministic_planner import generate_deterministic_plan
from app.services.planning_engine import PlanningEngine
from app.services.schedule_service import (
    _get_day_from_date,
    compute_available_windows,
)

USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")

# Production incident instant: 2026-09-25 13:38 UTC == 19:08 IST (Friday).
DEVICE_UTC = datetime(2026, 9, 25, 13, 38, tzinfo=dt_timezone.utc)
DEVICE_LOCAL_TZ = "Asia/Kolkata"
DEVICE_TODAY = date(2026, 9, 25)  # 19:08 IST is still Friday locally
FLOOR_TIME = "19:23"  # 19:08 + 15 minutes, in device-local time

# Study window 16:00-22:00, school Mon-Fri 08:00-15:00, sleep 22:00-06:00
# (mirrors the production profile that produced the dead Today screen).
INCIDENT_SCHEDULE = {
    "friday": [{"type": "school", "start": "08:00", "end": "15:00"}],
    "saturday": [],
}
INCIDENT_SLEEP = {"start": "22:00", "end": "06:00"}
INCIDENT_WINDOW = {"earliest_start": "16:00", "latest_end": "22:00"}


# ─── fixtures ───


@pytest.fixture
def set_tz():
    """Set the request timezone in this thread's context; always restores."""
    tokens = []

    def _set(name):
        tokens.append(set_user_timezone(name))

    yield _set
    for token in reversed(tokens):
        try:
            reset_user_timezone(token)
        except ValueError:
            # Token was created in a different context (set inside an async
            # test body). Restore the UTC default in this context instead.
            set_user_timezone(tz.DEFAULT_TIMEZONE)


@pytest.fixture
def incident_clock(set_tz, freeze_clock):
    """Device context of the production incident: 19:08 IST."""
    set_tz(DEVICE_LOCAL_TZ)
    freeze_clock(DEVICE_UTC)


@pytest.fixture
def freeze_clock(monkeypatch):
    """Freeze the system clock seam used by app.core.timezone."""

    def _freeze(moment: datetime):
        monkeypatch.setattr(tz, "_system_now", lambda: moment)

    return _freeze


# ─── 1. header transport ───


class TestTimezoneHeaderTransport:
    @pytest.mark.asyncio
    async def test_valid_header_reaches_nested_scope(self):
        seen = {}

        async def inner_app(scope, receive, send):
            seen["zone"] = get_user_timezone_name()
            seen["today"] = today_in_user_tz()
            body = b"ok"
            await send(
                {
                    "type": "http.response.start",
                    "status": 200,
                    "headers": [(b"content-length", str(len(body)).encode())],
                }
            )
            await send({"type": "http.response.body", "body": body})

        client = TestClient(UserTimezoneMiddleware(inner_app))
        response = client.get(
            "/", headers={"X-Device-Timezone": "Asia/Kolkata"}
        )

        assert response.status_code == 200
        assert seen["zone"] == "Asia/Kolkata"
        # 13:38 UTC -> 19:08 IST, same calendar day.
        assert seen["today"] == date(2026, 9, 25)

    @pytest.mark.asyncio
    async def test_missing_header_falls_back_to_utc(self):
        seen = {}

        async def inner_app(scope, receive, send):
            seen["zone"] = get_user_timezone_name()
            seen["utc"] = now_in_user_tz().utcoffset()
            await send(
                {"type": "http.response.start", "status": 200, "headers": []}
            )
            await send({"type": "http.response.body", "body": b""})

        client = TestClient(UserTimezoneMiddleware(inner_app))
        response = client.get("/")

        assert response.status_code == 200
        assert seen["zone"] == "UTC"
        assert seen["utc"] == dt_timezone.utc.utcoffset(None)

    @pytest.mark.asyncio
    async def test_invalid_header_falls_back_to_utc(self):
        seen = {}

        async def inner_app(scope, receive, send):
            seen["zone"] = get_user_timezone_name()
            await send(
                {"type": "http.response.start", "status": 200, "headers": []}
            )
            await send({"type": "http.response.body", "body": b""})

        client = TestClient(UserTimezoneMiddleware(inner_app))
        response = client.get("/", headers={"X-Device-Timezone": "Not/AZone"})

        assert response.status_code == 200
        assert seen["zone"] == "UTC"

    @pytest.mark.asyncio
    async def test_non_http_scope_passes_through(self):
        called = {}

        async def inner_app(scope, receive, send):
            called["type"] = scope["type"]

        app = UserTimezoneMiddleware(inner_app)
        await app({"type": "lifespan"}, None, None)

        assert called["type"] == "lifespan"

    def test_fastapi_route_reads_header_zone(self, freeze_clock):
        freeze_clock(DEVICE_UTC)

        app = FastAPI()
        app.add_middleware(UserTimezoneMiddleware)

        @app.get("/probe")
        async def probe():
            return {
                "zone": get_user_timezone_name(),
                "today": today_in_user_tz().isoformat(),
            }

        client = TestClient(app)

        with_zone = client.get(
            "/probe", headers={"X-Device-Timezone": "Asia/Kolkata"}
        )
        without_zone = client.get("/probe")

        assert with_zone.json() == {
            "zone": "Asia/Kolkata",
            "today": "2026-09-25",
        }
        assert without_zone.json()["zone"] == "UTC"


# ─── 2. timezone validation ───


class TestTimezoneValidation:
    @pytest.mark.parametrize(
        "raw",
        ["Asia/Kolkata", "UTC", "America/Argentina/Buenos_Aires", "Etc/GMT+5"],
    )
    def test_valid_names_accepted(self, raw):
        assert validate_timezone(raw) == raw

    @pytest.mark.parametrize(
        "raw",
        [
            None,
            "",
            "   ",
            "Not/AZone",
            "Asia/Kolkata; DROP TABLE users",
            "../../etc/passwd",
            "Asia/Kolkata\nX-Injected: 1",
            "a" * 65,
            123,
        ],
    )
    def test_invalid_values_fall_back_to_utc(self, raw):
        assert validate_timezone(raw) == "UTC"

    def test_now_in_user_tz_defaults_to_utc(self, set_tz, freeze_clock):
        set_tz("UTC")
        freeze_clock(DEVICE_UTC)

        assert now_in_user_tz() == DEVICE_UTC
        assert today_in_user_tz() == DEVICE_TODAY

    def test_now_in_user_tz_converts_to_device_zone(self, set_tz, freeze_clock):
        set_tz(DEVICE_LOCAL_TZ)
        freeze_clock(DEVICE_UTC)

        local = now_in_user_tz()
        assert local.utcoffset() is not None
        # 13:38 UTC + 05:30 == 19:08 IST (the incident time on device).
        assert (local.hour, local.minute) == (19, 8)
        assert local.date() == DEVICE_TODAY


# ─── 3. schedule floor in device-local time (the production bug) ───


class TestScheduleFloorUsesDeviceTime:
    def test_window_floors_at_device_local_now_plus_15(
        self, set_tz, freeze_clock
    ):
        set_tz(DEVICE_LOCAL_TZ)
        freeze_clock(DEVICE_UTC)  # 13:38 UTC == 19:08 IST

        windows = compute_available_windows(
            weekly_schedule=INCIDENT_SCHEDULE,
            sleep_schedule=INCIDENT_SLEEP,
            preferred_window=INCIDENT_WINDOW,
            energy_peak=None,
            target_date=DEVICE_TODAY,
        )

        assert windows, "expected at least one study window"
        assert windows[0]["start"] == FLOOR_TIME
        assert all(w["start"] >= FLOOR_TIME for w in windows)

    def test_utc_fallback_keeps_window_open_at_earliest_start(
        self, set_tz, freeze_clock
    ):
        # Server clock is 13:38 UTC -> floor 13:53, which sits *below* the
        # preferred window's earliest_start (16:00), so the window stays at
        # 16:00 and sessions are planned from 16:00 server time — exactly
        # the production bug: by 19:08 IST those sessions are all in the past.
        set_tz("UTC")
        freeze_clock(DEVICE_UTC)

        windows = compute_available_windows(
            weekly_schedule=INCIDENT_SCHEDULE,
            sleep_schedule=INCIDENT_SLEEP,
            preferred_window=INCIDENT_WINDOW,
            energy_peak=None,
            target_date=DEVICE_TODAY,
        )

        assert windows[0]["start"] == "16:00"

    def test_local_floor_differs_from_utc_floor(self, set_tz, freeze_clock):
        freeze_clock(DEVICE_UTC)

        set_tz(DEVICE_LOCAL_TZ)
        local_windows = compute_available_windows(
            weekly_schedule=INCIDENT_SCHEDULE,
            sleep_schedule=INCIDENT_SLEEP,
            preferred_window=INCIDENT_WINDOW,
            target_date=DEVICE_TODAY,
        )

        set_tz("UTC")
        utc_windows = compute_available_windows(
            weekly_schedule=INCIDENT_SCHEDULE,
            sleep_schedule=INCIDENT_SLEEP,
            preferred_window=INCIDENT_WINDOW,
            target_date=DEVICE_TODAY,
        )

        assert local_windows[0]["start"] == FLOOR_TIME
        assert utc_windows[0]["start"] == "16:00"
        assert local_windows[0]["start"] != utc_windows[0]["start"]


# ─── 4. weekday / local-date resolution across the day boundary ───


class TestLocalDateAcrossDayBoundary:
    def test_local_date_is_next_calendar_day_after_ist_midnight(
        self, set_tz, freeze_clock
    ):
        # 2026-09-25 19:00 UTC == 2026-09-26 00:30 IST (Saturday locally,
        # still Friday on the server).  The device-local date rolls over a
        # calendar day before the server's does.
        set_tz(DEVICE_LOCAL_TZ)
        freeze_clock(datetime(2026, 9, 25, 19, 0, tzinfo=dt_timezone.utc))

        assert today_in_user_tz() == date(2026, 9, 26)
        assert today_in_user_tz() != datetime(
            2026, 9, 25, 19, 0, tzinfo=dt_timezone.utc
        ).date()

    def test_weekday_resolves_to_device_weekday(
        self, set_tz, freeze_clock
    ):
        set_tz(DEVICE_LOCAL_TZ)
        freeze_clock(datetime(2026, 9, 25, 19, 0, tzinfo=dt_timezone.utc))

        assert _get_day_from_date(None) == "saturday"

    def test_weekday_resolves_to_utc_weekday_on_fallback(
        self, set_tz, freeze_clock
    ):
        set_tz("UTC")
        freeze_clock(datetime(2026, 9, 25, 19, 0, tzinfo=dt_timezone.utc))

        assert _get_day_from_date(None) == "friday"

    def test_windows_use_device_weekday_schedule(self, set_tz, freeze_clock):
        # Friday has a 16:00-20:00 coaching block inside the preferred
        # window; Saturday has none.  Resolving the wrong weekday changes
        # the resulting windows, so the assertion is meaningful.
        schedule = {
            "friday": [{"type": "coaching", "start": "16:00", "end": "20:00"}],
            "saturday": [],
        }

        set_tz(DEVICE_LOCAL_TZ)
        freeze_clock(datetime(2026, 9, 25, 19, 0, tzinfo=dt_timezone.utc))
        local_windows = compute_available_windows(
            weekly_schedule=schedule,
            sleep_schedule=INCIDENT_SLEEP,
            preferred_window=INCIDENT_WINDOW,
            target_date=None,
        )

        set_tz("UTC")
        utc_windows = compute_available_windows(
            weekly_schedule=schedule,
            sleep_schedule=INCIDENT_SLEEP,
            preferred_window=INCIDENT_WINDOW,
            target_date=None,
        )

        # Saturday (device): no coaching, one full 16:00-22:00 window.
        assert len(local_windows) == 1
        assert local_windows[0]["start"] == "16:00"
        assert local_windows[0]["end"] == "22:00"
        # Friday (server): coaching block splits the window.
        assert utc_windows[0]["start"] == "20:00"


# ─── 5. dashboard endpoint: no already-past sessions ───


def _mock_scalar(return_value):
    m = MagicMock()
    m.scalar_one_or_none = MagicMock(return_value=return_value)
    return m


def _mock_scalars(return_values):
    scalars = MagicMock()
    scalars.all = MagicMock(return_value=return_values)
    m = MagicMock()
    m.scalars = MagicMock(return_value=scalars)
    return m


def _mock_unique_scalar(return_value):
    m = MagicMock()
    unique_mock = MagicMock()
    unique_mock.scalar_one_or_none = MagicMock(return_value=return_value)
    m.unique = MagicMock(return_value=unique_mock)
    return m


def _mock_rows(rows):
    m = MagicMock()
    m.all = MagicMock(return_value=rows)
    return m


def _make_profile() -> StudentProfile:
    return StudentProfile(
        id=uuid.uuid4(),
        user_id=USER_ID,
        sleep_schedule=INCIDENT_SLEEP,
        preferred_study_window=INCIDENT_WINDOW,
        energy_peak=None,
        daily_target_minutes=120,
        created_at=datetime(2026, 9, 25, 13, 36),
        updated_at=datetime(2026, 9, 25, 13, 36),
    )


def _make_schedule() -> WeeklySchedule:
    return WeeklySchedule(id=uuid.uuid4(), user_id=USER_ID, schedule=INCIDENT_SCHEDULE)


def _incident_backlog(course: Course) -> list[BacklogItem]:
    specs = [
        ("Revise notes for Motion", 1, 45, date(2026, 9, 25)),
        ("Complete Maths worksheet", 1, 40, date(2026, 9, 26)),
        ("Practice quadratic equations", 2, 60, None),
        ("Read Atoms and Molecules", 3, 40, None),
    ]
    return [
        BacklogItem(
            id=uuid.uuid4(),
            user_id=USER_ID,
            course_id=course.id,
            title=title,
            priority=priority,
            estimated_minutes=minutes,
            due_date=due,
            status="pending",
        )
        for title, priority, minutes, due in specs
    ]


MOCK_STREAKS = {
    "momentum": {
        "current_streak": 0,
        "longest_streak": 0,
        "total_study_days": 0,
        "last_completed_date": None,
        "recovery_tokens_current": 0,
        "recovery_tokens_earned": 0,
        "recovery_tokens_used": 0,
        "streak_protected_today": False,
    },
    "subjects": [],
}
MOCK_BALANCE = {"score": 0, "message": "", "neglected_subjects": []}
MOCK_INSIGHT = {"title": "Start", "message": "Go.", "priority": 1}


class TestDashboardWithDeviceTimezone:
    @pytest.fixture
    def app(self):
        app = FastAPI()
        app.include_router(v1_router)
        app.add_middleware(UserTimezoneMiddleware)
        return app

    @pytest.fixture
    def mock_db(self):
        db = AsyncMock()
        db.execute = AsyncMock()
        return db

    def _wire_dashboard(self, app, mock_db):
        course = Course(
            id=uuid.uuid4(), user_id=USER_ID, name="Science", color="#6366f1"
        )
        backlog_items = _incident_backlog(course)
        profile = _make_profile()
        schedule = _make_schedule()

        user = User(id=USER_ID, email="test@test.com", name="Test")
        user.profile = profile
        user.schedule = schedule
        user.study_streak = None

        mock_db.execute.side_effect = [
            _mock_unique_scalar(user),
            _mock_rows([(course, item) for item in backlog_items]),
            _mock_scalars([]),  # goals
            _mock_scalar(None),  # subject streaks
            _mock_scalars([]),  # today's completions
        ]

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_current_user_id] = lambda: USER_ID
        return backlog_items

    def _call_dashboard(self, app, mock_db, header_tz=None):
        captured = {}

        async def fake_get_or_create(
            db,
            user_id,
            plan_date,
            planning_data,
            daily_capacity_minutes=None,
        ):
            captured["plan_date"] = plan_date
            captured["planning_data"] = planning_data
            plan = generate_deterministic_plan(
                planning_data,
                daily_capacity_minutes=daily_capacity_minutes,
                target_date=plan_date,
            )
            return SimpleNamespace(
                id=uuid.uuid4(),
                sessions=plan["sessions"],
                daily_message=plan["daily_message"],
                overflow=plan["overflow"],
                source="deterministic",
                version=1,
            )

        headers = (
            {"X-Device-Timezone": header_tz} if header_tz is not None else {}
        )

        try:
            with patch(
                "app.api.v1.dashboard.get_or_create_active_snapshot",
                new=fake_get_or_create,
            ), patch(
                "app.api.v1.dashboard.StreakService"
            ) as mock_streak_cls, patch(
                "app.api.v1.dashboard.MotivationService"
            ) as mock_motivation_cls:
                mock_streak = mock_streak_cls.return_value
                mock_streak.get_streaks = AsyncMock(return_value=MOCK_STREAKS)
                mock_streak.compute_balance_score = AsyncMock(
                    return_value=MOCK_BALANCE
                )
                mock_motivation = mock_motivation_cls.return_value
                mock_motivation.get_insight = AsyncMock(
                    return_value=MOCK_INSIGHT
                )

                client = TestClient(app)
                response = client.get("/api/v1/dashboard", headers=headers)
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 200, response.text
        return response.json(), captured

    def test_no_already_past_sessions_with_kolkata_header(
        self, app, mock_db, freeze_clock
    ):
        freeze_clock(DEVICE_UTC)  # 13:38 UTC == 19:08 IST
        self._wire_dashboard(app, mock_db)

        data, captured = self._call_dashboard(
            app, mock_db, header_tz=DEVICE_LOCAL_TZ
        )

        # Planning used the device's local date.
        assert captured["plan_date"] == DEVICE_TODAY

        # Study windows must start at/after device-local now+15 (19:23),
        # never at the preferred window's earliest_start (16:00), which by
        # 19:08 IST is entirely in the past.
        windows = data["planning"]["available_windows"]
        assert windows, "expected available windows in the response"
        assert all(w["start"] >= FLOOR_TIME for w in windows)

        # Every planned session must start at/after the local floor.
        sessions = data["plan"]["plan"]["sessions"]
        assert sessions, "expected at least one planned session"
        assert all(s["start_time"] >= FLOOR_TIME for s in sessions)
        assert not any(s["start_time"] == "16:00" for s in sessions)

    def test_missing_header_still_returns_a_plan(self, app, mock_db, freeze_clock):
        freeze_clock(DEVICE_UTC)
        self._wire_dashboard(app, mock_db)

        data, captured = self._call_dashboard(app, mock_db, header_tz=None)

        assert captured["plan_date"] == DEVICE_TODAY  # UTC fallback date
        assert data["plan"]["source"] == "deterministic"


# ─── 6. stale snapshot regeneration (Phase B) ───


def _session(start: str, end: str) -> dict:
    return {
        "backlog_item_id": str(uuid.uuid4()),
        "session_id": f"{uuid.uuid4()}:s1",
        "start_time": start,
        "end_time": end,
        "reason": "Work on Physics",
        "remaining_minutes": 0,
    }


def _snapshot(sessions: list[dict], version: int = 1) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(),
        plan_date=DEVICE_TODAY,
        version=version,
        sessions=sessions,
        daily_message="plan",
        overflow=[],
        source="deterministic",
        active=True,
    )


class TestStaleSnapshotRegeneration:
    @pytest.fixture
    def harness(self, set_tz, freeze_clock, monkeypatch):
        """Wire adaptive_service collaborators with controllable doubles."""
        set_tz(DEVICE_LOCAL_TZ)
        freeze_clock(DEVICE_UTC)  # 19:08 IST

        state = {
            "existing": None,
            "superseded": [],
            "created": [],
            "plans": [],
        }

        async def fake_get_active(db, user_id, plan_date):
            return state["existing"]

        async def fake_supersede(db, snapshot_id):
            state["superseded"].append(snapshot_id)

        async def fake_create(
            db,
            user_id,
            plan_date,
            plan,
            source="deterministic",
            version=1,
        ):
            state["created"].append(
                {"version": version, "plan_date": plan_date, "plan": plan}
            )
            return SimpleNamespace(
                id=uuid.uuid4(),
                plan_date=plan_date,
                version=version,
                sessions=plan.get("sessions", []),
                daily_message=plan.get("daily_message", ""),
                overflow=plan.get("overflow", []),
                source=source,
                active=True,
            )

        def fake_plan(planning_data, **kwargs):
            state["plans"].append(kwargs)
            return {
                "sessions": [_session(FLOOR_TIME, "20:03")],
                "daily_message": "regenerated",
                "overflow": [],
            }

        monkeypatch.setattr(adaptive_service, "get_active_snapshot", fake_get_active)
        monkeypatch.setattr(adaptive_service, "supersede_snapshot", fake_supersede)
        monkeypatch.setattr(adaptive_service, "create_snapshot", fake_create)
        monkeypatch.setattr(
            adaptive_service, "generate_deterministic_plan", fake_plan
        )

        state["planning_data"] = {
            "prioritized_backlog": [{"id": "a", "title": "Pending task"}],
            "available_windows": [
                {"start": FLOOR_TIME, "end": "22:00", "total_minutes": 157}
            ],
        }
        return state

    @pytest.mark.asyncio
    async def test_stale_snapshot_all_sessions_past_is_regenerated(self, harness):
        harness["existing"] = _snapshot(
            [_session("16:00", "16:40"), _session("16:40", "17:25"), _session("17:25", "17:55")],
            version=1,
        )

        result = await get_or_create_active_snapshot(
            None, USER_ID, DEVICE_TODAY, harness["planning_data"],
            daily_capacity_minutes=120,
        )

        assert harness["superseded"] == [harness["existing"].id]
        assert len(harness["created"]) == 1
        assert harness["created"][0]["version"] == 2
        assert result.version == 2
        assert harness["plans"]  # a fresh plan was generated

    @pytest.mark.asyncio
    async def test_snapshot_with_future_session_is_reused(self, harness):
        existing = _snapshot(
            [_session("16:00", "16:40"), _session("19:21", "20:01")],
            version=1,
        )
        harness["existing"] = existing

        result = await get_or_create_active_snapshot(
            None, USER_ID, DEVICE_TODAY, harness["planning_data"]
        )

        assert result is existing
        assert harness["superseded"] == []
        assert harness["created"] == []

    @pytest.mark.asyncio
    async def test_snapshot_all_sessions_future_is_reused(self, harness):
        existing = _snapshot(
            [_session("19:23", "20:03"), _session("20:03", "20:48")],
            version=1,
        )
        harness["existing"] = existing

        result = await get_or_create_active_snapshot(
            None, USER_ID, DEVICE_TODAY, harness["planning_data"]
        )

        assert result is existing
        assert harness["superseded"] == []

    @pytest.mark.asyncio
    async def test_session_ending_exactly_now_is_not_stale(self, harness):
        # Boundary: last session ends at 19:08 == current local time.
        # Staleness is strictly "ended before now", so the snapshot is kept.
        existing = _snapshot([_session("18:28", "19:08")], version=1)
        harness["existing"] = existing

        result = await get_or_create_active_snapshot(
            None, USER_ID, DEVICE_TODAY, harness["planning_data"]
        )

        assert result is existing
        assert harness["superseded"] == []

    @pytest.mark.asyncio
    async def test_empty_session_snapshot_is_not_regenerated(self, harness):
        # Documented decision: an empty-session snapshot is not stale.
        # Regenerating it on every request would mint a new version each
        # time even though no window can be moved forward.
        existing = _snapshot([], version=1)
        harness["existing"] = existing

        result = await get_or_create_active_snapshot(
            None, USER_ID, DEVICE_TODAY, harness["planning_data"]
        )

        assert result is existing
        assert harness["superseded"] == []
        assert harness["created"] == []

    @pytest.mark.asyncio
    async def test_stale_snapshot_without_pending_backlog_is_reused(
        self, harness
    ):
        # Everything was completed: keep the stored plan so the UI can show
        # its completed state instead of replanning an empty backlog.
        harness["existing"] = _snapshot([_session("16:00", "16:40")], version=3)
        planning_data = {"prioritized_backlog": [], "available_windows": []}

        result = await get_or_create_active_snapshot(
            None, USER_ID, DEVICE_TODAY, planning_data
        )

        assert result is harness["existing"]
        assert harness["superseded"] == []
        assert harness["created"] == []

    @pytest.mark.asyncio
    async def test_historical_date_snapshot_is_never_regenerated(self, harness):
        yesterday = date(2026, 9, 24)
        existing = _snapshot([_session("16:00", "17:00")], version=1)
        existing.plan_date = yesterday
        harness["existing"] = existing

        result = await get_or_create_active_snapshot(
            None, USER_ID, yesterday, harness["planning_data"]
        )

        assert result is existing
        assert harness["superseded"] == []

    @pytest.mark.asyncio
    async def test_malformed_session_without_end_time_is_reused(self, harness):
        existing = _snapshot(
            [
                {
                    "backlog_item_id": str(uuid.uuid4()),
                    "session_id": f"{uuid.uuid4()}:s1",
                    "start_time": "16:00",
                }
            ],
            version=1,
        )
        harness["existing"] = existing

        result = await get_or_create_active_snapshot(
            None, USER_ID, DEVICE_TODAY, harness["planning_data"]
        )

        assert result is existing
        assert harness["superseded"] == []

    @pytest.mark.asyncio
    async def test_missing_snapshot_creates_version_one(self, harness):
        harness["existing"] = None

        result = await get_or_create_active_snapshot(
            None, USER_ID, DEVICE_TODAY, harness["planning_data"]
        )

        assert harness["superseded"] == []
        assert len(harness["created"]) == 1
        assert harness["created"][0]["version"] == 1
        assert result.version == 1

    @pytest.mark.asyncio
    async def test_regenerated_plan_starts_at_local_floor(
        self, incident_clock, monkeypatch
    ):
        """End-to-end: a stale snapshot is replaced by a real plan whose
        sessions all start at/after the device-local floor (19:23)."""

        course = Course(
            id=uuid.uuid4(), user_id=USER_ID, name="Science", color="#6366f1"
        )
        backlog_items = _incident_backlog(course)
        engine = PlanningEngine(
            profile=_make_profile(),
            schedule=_make_schedule(),
            courses=[course],
            backlog_items=backlog_items,
            goals=[],
        )
        planning_data = engine.compute(target_date=DEVICE_TODAY)
        assert planning_data["prioritized_backlog"], "need pending backlog"

        existing = _snapshot(
            [_session("16:00", "16:40"), _session("16:40", "17:25")],
            version=1,
        )
        state = {"superseded": [], "created": []}

        async def fake_get_active(db, user_id, plan_date):
            return existing

        async def fake_supersede(db, snapshot_id):
            state["superseded"].append(snapshot_id)

        async def fake_create(
            db, user_id, plan_date, plan, source="deterministic", version=1
        ):
            state["created"].append({"version": version, "plan": plan})
            return SimpleNamespace(version=version, sessions=plan["sessions"])

        monkeypatch.setattr(adaptive_service, "get_active_snapshot", fake_get_active)
        monkeypatch.setattr(adaptive_service, "supersede_snapshot", fake_supersede)
        monkeypatch.setattr(adaptive_service, "create_snapshot", fake_create)
        # Real generate_deterministic_plan is intentionally NOT patched.

        await get_or_create_active_snapshot(
            None, USER_ID, DEVICE_TODAY, planning_data,
            daily_capacity_minutes=120,
        )

        assert state["superseded"] == [existing.id]
        assert len(state["created"]) == 1
        assert state["created"][0]["version"] == 2

        new_sessions = state["created"][0]["plan"]["sessions"]
        assert new_sessions, "regenerated plan should contain sessions"
        assert all(s["start_time"] >= FLOOR_TIME for s in new_sessions)
        assert not any(s["start_time"] < FLOOR_TIME for s in new_sessions)
