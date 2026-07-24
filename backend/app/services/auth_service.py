import uuid
import logging

import httpx

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.domain.models import User, StudyStreak

logger = logging.getLogger(__name__)


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _supabase_request(
        self, path: str, body: dict | None = None, method: str = "POST", use_service_key: bool = False
    ) -> dict:
        if not settings.SUPABASE_URL or not settings.SUPABASE_ANON_KEY:
            raise ValueError("Supabase not configured")

        url = f"{settings.SUPABASE_URL}/auth/v1/{path}"
        api_key = settings.SUPABASE_SERVICE_KEY if use_service_key else settings.SUPABASE_ANON_KEY
        headers = {
            "apikey": api_key,
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient() as client:
            if method == "POST":
                resp = await client.post(url, json=body, headers=headers)
            else:
                resp = await client.get(url, headers=headers, params=body)

            if resp.status_code >= 400:
                error_detail = resp.json().get("error_description") or resp.json().get("msg") or resp.text
                logger.warning("Supabase Auth error: %s", error_detail)
                raise ValueError(error_detail)

            return resp.json()

    async def _get_or_create_user(self, supabase_user_id: str, email: str, name: str | None = None) -> User:
        uid = uuid.UUID(supabase_user_id)
        result = await self.db.execute(select(User).where(User.id == uid))
        user = result.scalar_one_or_none()

        if user is None:
            user = User(
                id=uid,
                email=email,
                name=name or email.split("@")[0],
            )
            self.db.add(user)
            await self.db.flush()
            await self.db.refresh(user)

            streak = StudyStreak(user_id=uid)
            self.db.add(streak)
            await self.db.flush()

        return user

    async def signup(self, email: str, password: str, name: str | None = None) -> dict:
        result = await self._supabase_request(
            "signup",
            {"email": email, "password": password},
            use_service_key=True,
        )

        supabase_user = result.get("user") or result
        supabase_id = supabase_user.get("id")
        supabase_email = supabase_user.get("email", email)

        if not supabase_id:
            raise ValueError(f"Supabase signup returned no user id. Response: {result}")

        user = await self._get_or_create_user(supabase_id, supabase_email, name)

        token_result = await self._supabase_request(
            "token?grant_type=password",
            {"email": email, "password": password},
        )

        return {
            "user": user,
            "access_token": token_result.get("access_token", ""),
        }

    async def login(self, email: str, password: str) -> dict:
        result = await self._supabase_request("token?grant_type=password", {
            "email": email,
            "password": password,
        })

        supabase_user = result.get("user", {})
        supabase_id = supabase_user.get("id")
        supabase_email = supabase_user.get("email", email)

        user = await self._get_or_create_user(supabase_id, supabase_email)

        return {
            "user": user,
            "access_token": result.get("access_token", ""),
        }

    async def forgot_password(self, email: str) -> None:
        redirect_to = f"{settings.SUPABASE_URL}/auth/v1/verify"
        await self._supabase_request("recover", {
            "email": email,
            "data": {"redirect_to": redirect_to},
        })

