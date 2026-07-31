import logging
import time

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import router as v1_router
from app.core.config import settings
from app.core.logging import setup_logging

logger = logging.getLogger(__name__)

TIMED_PATH_PREFIX = "/api/v1/profile"


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    logger.info("Starting %s v%s", settings.PROJECT_NAME, settings.VERSION)
    yield
    logger.info("Shutting down %s", settings.PROJECT_NAME)


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    lifespan=lifespan,
)


@app.middleware("http")
async def log_request_duration(request, call_next):
    if not request.url.path.startswith(TIMED_PATH_PREFIX):
        return await call_next(request)
    t0 = time.perf_counter()
    logger.info("[HTTP] request enters %s %s", request.method, request.url.path)
    response = await call_next(request)
    logger.info(
        "[HTTP] total request duration %.2f ms (%s %s)",
        (time.perf_counter() - t0) * 1000,
        request.method,
        request.url.path,
    )
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://frontend:5173",
        "https://momentum-backlog-cleaner.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(v1_router)


@app.get("/")
async def root():
    return {
        "app": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "docs": "/docs",
    }
