import json
import logging
import uuid
from abc import ABC, abstractmethod
from collections.abc import Sequence
from datetime import date, datetime
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models"


class PromptBuilder:
    def build(self, planning_data: dict, target_date: date | None = None) -> str:
        if target_date is None:
            target_date = date.today()

        windows = planning_data.get("available_windows", [])
        backlog = planning_data.get("prioritized_backlog", [])
        health = planning_data.get("backlog_health", {})

        windows_text = self._format_windows(windows)
        backlog_text = self._format_backlog(backlog)
        health_text = self._format_health(health)
        totals_text = self._format_totals(planning_data)

        return f"""You are a study planner for a student. Create a daily study plan for {target_date.isoformat()}.

AVAILABLE STUDY TIME:
{windows_text}

BACKLOG ITEMS (sorted by priority):
{backlog_text}

BACKLOG HEALTH:
{health_text}

TOTALS:
{totals_text}

TASK:
Create a study plan that schedules as many backlog items as possible within the available time windows.
- Each session must fit entirely within one available time window.
- Sessions cannot overlap.
- Respect the estimated_minutes for each item; if not provided, assume 60 minutes.
- Allocate more time to higher-priority items.

OUTPUT FORMAT:
Return ONLY valid JSON with this exact structure:
{{
    "sessions": [
        {{
            "backlog_item_id": "<uuid>",
            "start_time": "HH:MM",
            "end_time": "HH:MM",
            "reason": "Brief explanation"
        }}
    ],
    "daily_message": "A short encouraging message for the student",
    "overflow": ["<uuid>"]
}}

- backlog_item_id must be one of the IDs listed above.
- overflow contains IDs of items that could not be scheduled.
- Times must be in 24-hour format within the available windows above.
- Respond with ONLY the JSON object, no other text."""

    def _format_windows(self, windows: list[dict]) -> str:
        if not windows:
            return "No available time."
        lines = []
        for i, w in enumerate(windows, 1):
            lines.append(
                f"  {i}. {w['start']}-{w['end']} ({w['total_minutes']} min, energy: {w.get('energy_rating', 'medium')})"
            )
        return "\n".join(lines)

    def _format_backlog(self, backlog: list[dict]) -> str:
        if not backlog:
            return "No backlog items."
        lines = []
        for i, item in enumerate(backlog, 1):
            due = ""
            if item.get("due_date"):
                if isinstance(item["due_date"], datetime):
                    due = f", due: {item['due_date'].strftime('%Y-%m-%d')}"
                else:
                    due = f", due: {item['due_date']}"
            overdue = " (OVERDUE)" if item.get("overdue") else ""
            est = item.get("estimated_minutes")
            est_str = f"{est} min" if est else "60 min (estimated)"
            lines.append(
                f"  {i}. [{item.get('course_name', 'Unknown')}] "
                f"{item['title']}{overdue} — {est_str} — priority {item.get('priority', 3)}"
                f"{due}"
            )
        return "\n".join(lines)

    def _format_health(self, health: dict) -> str:
        if not health:
            return "Unknown."
        return (
            f"  Pending: {health.get('pending_items', 0)}, "
            f"Overdue: {health.get('overdue_items', 0)}, "
            f"Health: {health.get('health_score', 'unknown')}"
        )

    def _format_totals(self, data: dict) -> str:
        return (
            f"  Total available: {data.get('total_available_minutes', 0)} min\n"
            f"  Total required: {data.get('total_required_minutes', 0)} min\n"
            f"  Estimated days to clear: {data.get('estimated_days_to_clear', 'unknown')}"
        )


class AIService(ABC):
    @abstractmethod
    async def generate_plan(self, prompt: str) -> dict | None:
        ...


class GeminiAIService(AIService):
    def __init__(self, api_key: str | None = None, model: str | None = None):
        self.api_key = api_key or settings.GEMINI_API_KEY
        self.model = model or settings.GEMINI_MODEL

    async def generate_plan(self, prompt: str) -> dict | None:
        if not self.api_key:
            logger.warning("Gemini API key not configured")
            return None

        url = f"{GEMINI_API_URL}/{self.model}:generateContent?key={self.api_key}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.2,
                "topP": 0.8,
                "topK": 40,
                "maxOutputTokens": 2048,
            },
        }

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                data = response.json()

            candidates = data.get("candidates", [])
            if not candidates:
                logger.error("Gemini returned no candidates")
                return None

            text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            return self._parse_response(text)
        except httpx.HTTPStatusError as e:
            logger.error("Gemini API error: %s - %s", e.response.status_code, e.response.text)
            return None
        except httpx.RequestError as e:
            logger.error("Gemini request failed: %s", e)
            return None
        except Exception as e:
            logger.error("Unexpected Gemini error: %s", e)
            return None

    def _parse_response(self, text: str) -> dict | None:
        text = text.strip()
        if text.startswith("```json"):
            text = text[len("```json"):]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            logger.error("Failed to parse Gemini JSON: %s", e)
            return None


class OpenAIService(AIService):
    async def generate_plan(self, prompt: str) -> dict | None:
        logger.warning("OpenAI not yet implemented")
        return None


class OllamaService(AIService):
    async def generate_plan(self, prompt: str) -> dict | None:
        logger.warning("Ollama not yet implemented")
        return None


def create_ai_service(provider: str | None = None) -> AIService:
    provider = provider or settings.AI_PROVIDER
    if provider == "gemini":
        return GeminiAIService()
    elif provider == "openai":
        return OpenAIService()
    elif provider == "ollama":
        return OllamaService()
    else:
        logger.warning("Unknown AI provider '%s', falling back to Gemini", provider)
        return GeminiAIService()
