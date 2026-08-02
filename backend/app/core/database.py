import logging
import time
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from collections.abc import AsyncGenerator
from app.core.config import settings
from uuid import uuid4  
from sqlalchemy.pool import QueuePool

logger = logging.getLogger(__name__)

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    poolclass=QueuePool,
    pool_size=10,
    max_overflow=5,
    pool_timeout=10,
    pool_recycle=1800,
    pool_pre_ping=True,
    connect_args={
        "prepared_statement_cache_size": 0,
        "prepared_statement_name_func": lambda: f"__asyncpg_{uuid4()}__",
    },
)


@event.listens_for(engine.sync_engine, "before_cursor_execute")
def _log_query_start(conn, cursor, statement, parameters, context, executemany):
    context._query_started = time.perf_counter()


@event.listens_for(engine.sync_engine, "after_cursor_execute")
def _log_query_duration(conn, cursor, statement, parameters, context, executemany):
    elapsed_ms = (time.perf_counter() - context._query_started) * 1000
    sql = " ".join(statement.split())[:200]
    logger.info("[DB QUERY] %.2f ms | %s", elapsed_ms, sql)


async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    t0 = time.perf_counter()
    async with async_session_factory() as session:
        logger.info("[DB SESSION] acquired in %.2f ms", (time.perf_counter() - t0) * 1000)
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
