import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.domain.models import User, StudyStreak, StudentProfile
from app.domain.schemas import (
    AuthLoginRequest,
    AuthSignupRequest,
    AuthResponse,
    AuthMeResponse,
    ForgotPasswordRequest,
    ResendVerificationRequest,
    UserResponse,
    StudentProfileResponse,
    StudyStreakResponse,
)
from app.services.auth_service import AuthService
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


async def get_auth_service(db: AsyncSession = Depends(get_db)) -> AuthService:
    return AuthService(db)


@router.post("/signup", response_model=AuthResponse)
async def signup(
    data: AuthSignupRequest,
    service: AuthService = Depends(get_auth_service),
):
    try:
        result = await service.signup(data.email, data.password, data.name)
        user = result["user"]
        return AuthResponse(
            access_token=result["access_token"],
            refresh_token=result["refresh_token"],
            user=UserResponse.model_validate(user),
        )
    except ValueError as e:
        msg = str(e).lower()
        if "weak password" in msg or "at least 6 characters" in msg:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "weak_password",
                    "message": "Password is too weak. Use at least 6 characters.",
                },
            )
        if any(
            token in msg
            for token in ("already registered", "already exists", "duplicate")
        ):
            # The account already exists. If it is still unverified, guide the
            # student to the Verify Email screen instead of showing an error.
            try:
                verified = await service.is_email_verified(data.email)
            except ValueError:
                verified = False
            if verified:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "code": "account_exists",
                        "message": "An account with this email already exists",
                    },
                )
            try:
                await service.resend_verification(data.email)
            except ValueError:
                pass
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "email_not_confirmed",
                    "message": "Please verify your email first",
                },
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Something went wrong. Please try again.",
        )


@router.post("/login", response_model=AuthResponse)
async def login(
    data: AuthLoginRequest,
    service: AuthService = Depends(get_auth_service),
):
    try:
        result = await service.login(data.email, data.password)
        user = result["user"]
        return AuthResponse(
            access_token=result["access_token"],
            refresh_token=result["refresh_token"],
            user=UserResponse.model_validate(user),
        )
    except ValueError as e:
        msg = str(e).lower()
        if "email not confirmed" in msg:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "code": "email_not_confirmed",
                    "message": "Please verify your email first",
                },
            )
        if "invalid login credentials" in msg or "invalid grant" in msg:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Something went wrong. Please try again.",
        )


@router.post("/resend-verification", status_code=status.HTTP_200_OK)
async def resend_verification(
    data: ResendVerificationRequest,
    service: AuthService = Depends(get_auth_service),
):
    try:
        await service.resend_verification(data.email)
    except ValueError:
        # Always answer the same way so we never leak account details.
        pass
    return {"message": "Verification email sent"}


@router.post("/forgot-password", status_code=status.HTTP_200_OK)
async def forgot_password(
    data: ForgotPasswordRequest,
    service: AuthService = Depends(get_auth_service),
):
    try:
        await service.forgot_password(data.email)
        return {"message": "Password reset email sent if the account exists"}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/me", response_model=AuthMeResponse)
async def get_me(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    profile_result = await db.execute(
        select(StudentProfile).where(StudentProfile.user_id == user.id)
    )
    profile = profile_result.scalar_one_or_none()

    streak_result = await db.execute(
        select(StudyStreak).where(StudyStreak.user_id == user.id)
    )
    streak = streak_result.scalar_one_or_none()

    return AuthMeResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        avatar_url=user.avatar_url,
        created_at=user.created_at,
        updated_at=user.updated_at,
        profile=StudentProfileResponse.model_validate(profile) if profile else None,
        streak=StudyStreakResponse.model_validate(streak) if streak else None,
    )