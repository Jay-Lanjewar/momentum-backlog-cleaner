"""Gemini tutoring call, intentionally separate from the planning provider."""
from __future__ import annotations

import logging
from collections.abc import Sequence

import httpx

from app.ai_tutor.prompt_builder import SYSTEM_INSTRUCTION, build_contents
from app.core.config import settings
from app.domain.schemas import StudyBuddyMessage
from app.services.ai_service import GEMINI_API_URL

logger = logging.getLogger(__name__)


class TutorUnavailable(Exception):
    pass


class TutorProviderError(Exception):
    pass


class TutorRateLimited(TutorProviderError):
    """Gemini throttled the request; caller can retry after this delay."""

    retry_after_seconds = 60


class GeminiTutor:
    def __init__(self, *, api_key: str | None = None, model: str | None = None):
        self.api_key = api_key if api_key is not None else settings.GEMINI_API_KEY
        self.model = model or settings.GEMINI_MODEL

    async def answer(
        self,
        question: str,
        history: Sequence[StudyBuddyMessage],
        *,
        task_title: str | None = None,
        subject_name: str | None = None,
    ) -> str:
        if not self.api_key:
            raise TutorUnavailable
        url = f"{GEMINI_API_URL}/{self.model}:generateContent?key={self.api_key}"
        payload = {
            "system_instruction": {"parts": [{"text": SYSTEM_INSTRUCTION}]},
            "contents": build_contents(
                history, question, task_title=task_title, subject_name=subject_name
            ),
            "generationConfig": {
                "temperature": 0.4,
                "maxOutputTokens": settings.STUDY_BUDDY_MAX_OUTPUT_TOKENS,
            },
        }
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                data = response.json()
        except httpx.TimeoutException as exc:
            logger.warning("Study Buddy provider timed out")
            raise TutorProviderError from exc
        except httpx.HTTPStatusError as exc:
            logger.warning("Study Buddy provider returned HTTP %s", exc.response.status_code)
            if exc.response.status_code == 429:
                raise TutorRateLimited from exc
            raise TutorProviderError from exc
        except (httpx.RequestError, ValueError) as exc:
            logger.warning("Study Buddy provider request/response failed")
            raise TutorProviderError from exc

        try:
            answer = data["candidates"][0]["content"]["parts"][0]["text"].strip()
        except (KeyError, IndexError, TypeError, AttributeError):
            logger.warning("Study Buddy provider returned malformed output")
            raise TutorProviderError
        if not answer:
            logger.warning("Study Buddy provider returned empty output")
            raise TutorProviderError
        if len(answer) > 4000:
            answer = answer[:4000].rsplit(" ", 1)[0].rstrip()
        return answer
