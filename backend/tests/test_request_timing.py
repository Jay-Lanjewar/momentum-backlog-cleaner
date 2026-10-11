import logging

import pytest
from fastapi.responses import JSONResponse
from starlette.requests import Request

from app.main import log_request_duration


@pytest.mark.asyncio
@pytest.mark.parametrize("path", ["/api/v1/auth/me", "/api/v1/dashboard"])
async def test_request_timing_logs_status_for_me_and_dashboard_endpoints(
    caplog, path
):
    request = Request(
        {
            "type": "http",
            "method": "GET",
            "path": path,
            "headers": [],
            "query_string": b"",
            "server": ("testserver", 80),
        }
    )

    async def call_next(_request):
        return JSONResponse({"ok": True}, status_code=200)

    with caplog.at_level(logging.INFO, logger="app.main"):
        response = await log_request_duration(request, call_next)

    assert response.status_code == 200
    assert "status=200" in caplog.text
    assert "request_id=" in caplog.text
    assert path in caplog.text
    assert "total request duration" in caplog.text


@pytest.mark.asyncio
async def test_request_timing_does_not_intercept_other_endpoints(caplog):
    request = Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/api/v1/health",
            "headers": [],
            "query_string": b"",
            "server": ("testserver", 80),
        }
    )

    async def call_next(_request):
        return JSONResponse({"ok": True}, status_code=204)

    with caplog.at_level(logging.INFO, logger="app.main"):
        response = await log_request_duration(request, call_next)

    assert response.status_code == 204
    assert "total request duration" not in caplog.text
