import uuid
from datetime import date, datetime

import pytest

from app.services.ai_service import (
    PromptBuilder,
    GeminiAIService,
    OpenAIService,
    OllamaService,
    create_ai_service,
)
from app.core.config import settings


class TestPromptBuilder:
    def test_build_includes_date(self):
        builder = PromptBuilder()
        prompt = builder.build(
            {
                "available_windows": [],
                "prioritized_backlog": [],
                "backlog_health": {},
                "total_available_minutes": 0,
                "total_required_minutes": 0,
            },
            target_date=date(2026, 7, 20),
        )
        assert "2026-07-20" in prompt

    def test_build_includes_windows(self):
        builder = PromptBuilder()
        windows = [
            {"start": "06:00", "end": "08:00", "total_minutes": 120, "energy_rating": "high"},
            {"start": "14:00", "end": "18:00", "total_minutes": 240, "energy_rating": "medium"},
        ]
        prompt = builder.build(
            {
                "available_windows": windows,
                "prioritized_backlog": [],
                "backlog_health": {"pending_items": 0, "overdue_items": 0, "health_score": "good"},
                "total_available_minutes": 360,
                "total_required_minutes": 0,
            }
        )
        assert "06:00-08:00" in prompt
        assert "14:00-18:00" in prompt
        assert "360 min" in prompt

    def test_build_includes_backlog(self):
        builder = PromptBuilder()
        backlog = [
            {
                "id": uuid.uuid4(),
                "title": "Math Homework",
                "course_name": "Mathematics",
                "priority": 1,
                "estimated_minutes": 45,
                "overdue": True,
                "due_date": datetime(2026, 7, 15),
            }
        ]
        prompt = builder.build(
            {
                "available_windows": [],
                "prioritized_backlog": backlog,
                "backlog_health": {},
                "total_available_minutes": 0,
                "total_required_minutes": 45,
            }
        )
        assert "Math Homework" in prompt
        assert "Mathematics" in prompt
        assert "(OVERDUE)" in prompt
        assert "45 min" in prompt

    def test_build_no_windows(self):
        builder = PromptBuilder()
        prompt = builder.build(
            {
                "available_windows": [],
                "prioritized_backlog": [],
                "backlog_health": {},
                "total_available_minutes": 0,
                "total_required_minutes": 0,
            }
        )
        assert "No available time" in prompt

    def test_build_no_backlog(self):
        builder = PromptBuilder()
        prompt = builder.build(
            {
                "available_windows": [{"start": "06:00", "end": "08:00", "total_minutes": 120, "energy_rating": "high"}],
                "prioritized_backlog": [],
                "backlog_health": {},
                "total_available_minutes": 120,
                "total_required_minutes": 0,
            }
        )
        assert "No backlog items" in prompt

    def test_build_requires_json_output(self):
        builder = PromptBuilder()
        prompt = builder.build(
            {
                "available_windows": [],
                "prioritized_backlog": [],
                "backlog_health": {},
                "total_available_minutes": 0,
                "total_required_minutes": 0,
            }
        )
        assert "backlog_item_id" in prompt
        assert "start_time" in prompt
        assert "end_time" in prompt
        assert "daily_message" in prompt
        assert "overflow" in prompt


class TestGeminiAIService:
    @pytest.mark.asyncio
    async def test_no_api_key_returns_none(self):
        service = GeminiAIService(api_key=None)
        result = await service.generate_plan("test prompt")
        assert result is None

    @pytest.mark.asyncio
    async def test_parse_response_strips_code_block(self):
        service = GeminiAIService(api_key="fake")
        raw = '```json\n{"sessions": [], "daily_message": "ok", "overflow": []}\n```'
        result = service._parse_response(raw)
        assert result == {"sessions": [], "daily_message": "ok", "overflow": []}

    @pytest.mark.asyncio
    async def test_parse_response_no_code_block(self):
        service = GeminiAIService(api_key="fake")
        raw = '{"sessions": [{"backlog_item_id": "123", "start_time": "10:00", "end_time": "11:00", "reason": "test"}], "daily_message": "ok", "overflow": []}'
        result = service._parse_response(raw)
        assert result["sessions"][0]["backlog_item_id"] == "123"

    @pytest.mark.asyncio
    async def test_parse_response_invalid_json_returns_none(self):
        service = GeminiAIService(api_key="fake")
        result = service._parse_response("not json at all")
        assert result is None


class TestOtherServices:
    @pytest.mark.asyncio
    async def test_openai_returns_none(self):
        service = OpenAIService()
        result = await service.generate_plan("test")
        assert result is None

    @pytest.mark.asyncio
    async def test_ollama_returns_none(self):
        service = OllamaService()
        result = await service.generate_plan("test")
        assert result is None


class TestCreateAIService:
    def test_defaults_to_gemini(self):
        service = create_ai_service()
        assert isinstance(service, GeminiAIService)

    def test_gemini_provider(self):
        service = create_ai_service("gemini")
        assert isinstance(service, GeminiAIService)

    def test_openai_provider(self):
        service = create_ai_service("openai")
        assert isinstance(service, OpenAIService)

    def test_ollama_provider(self):
        service = create_ai_service("ollama")
        assert isinstance(service, OllamaService)

    def test_unknown_provider_falls_back(self):
        service = create_ai_service("unknown")
        assert isinstance(service, GeminiAIService)
