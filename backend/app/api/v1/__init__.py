from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.health import router as health_router
from app.api.v1.courses import router as courses_router
from app.api.v1.backlog import router as backlog_router
from app.api.v1.profile import router as profile_router
from app.api.v1.goals import router as goals_router
from app.api.v1.planning import router as planning_router
from app.api.v1.plans import router as plans_router
from app.api.v1.streaks import router as streaks_router
from app.api.v1.motivation import router as motivation_router
from app.api.v1.friends import router as friends_router
from app.api.v1.activities import router as activities_router
from app.api.v1.users import router as users_router
from app.api.v1.onboarding import router as onboarding_router
from app.api.v1.dashboard import router as dashboard_router

router = APIRouter(prefix="/api/v1")
router.include_router(auth_router)
router.include_router(health_router)
router.include_router(courses_router)
router.include_router(backlog_router)
router.include_router(profile_router)
router.include_router(goals_router)
router.include_router(planning_router)
router.include_router(plans_router)
router.include_router(streaks_router)
router.include_router(motivation_router)
router.include_router(friends_router)
router.include_router(activities_router)
router.include_router(users_router)
router.include_router(onboarding_router)
router.include_router(dashboard_router)
