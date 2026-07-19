from fastapi import APIRouter

from app.api.v1.health import router as health_router
from app.api.v1.courses import router as courses_router
from app.api.v1.backlog import router as backlog_router
from app.api.v1.profile import router as profile_router
from app.api.v1.goals import router as goals_router
from app.api.v1.planning import router as planning_router
from app.api.v1.plans import router as plans_router
from app.api.v1.streaks import router as streaks_router

router = APIRouter(prefix="/api/v1")
router.include_router(health_router)
router.include_router(courses_router)
router.include_router(backlog_router)
router.include_router(profile_router)
router.include_router(goals_router)
router.include_router(planning_router)
router.include_router(plans_router)
router.include_router(streaks_router)
