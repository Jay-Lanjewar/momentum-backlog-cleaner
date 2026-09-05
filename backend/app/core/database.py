import logging
import time
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from collections.abc import AsyncGenerator
from app.core.config import settings
from uuid import uuid4
from sqlalchemy.pool import AsyncAdaptedQueuePool

logger = logging.getLogger(__name__)
_pool_diag = logging.getLogger("pool_diag")

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    poolclass=AsyncAdaptedQueuePool,
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


@event.listens_for(engine.sync_engine, "checkout")
def _pool_checkout_event(dbapi_conn, connection_rec, connection_proxy):
    conn_id = id(dbapi_conn)
    try:
        pool = engine.pool
        # checkedout() includes this connection — subtract 1 for pre-checkout count
        _pool_diag.info(
            "[POOL CHECKOUT] id=%s checkedout_before=%d size=%d overflow=%d",
            conn_id,
            pool.checkedout() - 1, pool.size(), pool.overflow(),
        )
    except Exception:
        _pool_diag.info("[POOL CHECKOUT] id=%s", conn_id)


@event.listens_for(engine.sync_engine, "checkin")
def _pool_checkin_event(dbapi_conn, connection_rec):
    conn_id = id(dbapi_conn)
    try:
        pool = engine.pool
        _pool_diag.info(
            "[POOL CHECKIN]  id=%s checkedout=%d size=%d overflow=%d",
            conn_id,
            pool.checkedout(), pool.size(), pool.overflow(),
        )
    except Exception:
        _pool_diag.info("[POOL CHECKIN]  id=%s", conn_id)


@event.listens_for(engine.sync_engine, "connect")
def _pool_connect_event(dbapi_conn, connection_record):
    _pool_diag.info("[POOL CONNECT]  id=%s", id(dbapi_conn))


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
        elapsed_ms = (time.perf_counter() - t0) * 1000
        logger.info("[DB SESSION] acquired in %.2f ms", elapsed_ms)
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
