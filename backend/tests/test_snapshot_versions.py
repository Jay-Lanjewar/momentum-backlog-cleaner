from datetime import date
from unittest.mock import AsyncMock, MagicMock
import uuid

import pytest

from app.services.adaptive_service import create_snapshot


def _max_result(version: int | None):
    result = MagicMock()
    result.scalar_one.return_value = version
    return result


def _mock_db(*results):
    db = AsyncMock()
    db.add = MagicMock()
    db.execute.side_effect = list(results)
    return db


@pytest.mark.asyncio
async def test_first_snapshot_uses_version_one():
    db = _mock_db(MagicMock(), _max_result(None))

    snapshot = await create_snapshot(
        db,
        uuid.uuid4(),
        date(2026, 10, 9),
        {"sessions": [], "overflow": []},
    )

    assert snapshot.version == 1


@pytest.mark.asyncio
async def test_snapshot_version_includes_inactive_rows():
    db = _mock_db(MagicMock(), _max_result(3))

    snapshot = await create_snapshot(
        db,
        uuid.uuid4(),
        date(2026, 10, 9),
        {"sessions": [], "overflow": []},
    )

    assert snapshot.version == 4
    db.flush.assert_awaited_once()
    db.refresh.assert_awaited_once_with(snapshot)
