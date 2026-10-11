"""Bounded database latency benchmark.

Run from the backend directory with:

    python -m app.tools.db_latency_benchmark

The benchmark prints timings only. It never prints the configured database
URL or any connection credentials.
"""

from __future__ import annotations

import argparse
import asyncio
import statistics
import sys
import time
from dataclasses import dataclass
from typing import Sequence

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlalchemy.pool import AsyncAdaptedQueuePool

from app.core.config import settings
from uuid import uuid4

DEFAULT_FRESH_TRIALS = 3
DEFAULT_WARM_TRIALS = 5
MAX_TRIALS = 20


@dataclass(frozen=True)
class BenchmarkResult:
    fresh_connection_ms: tuple[float, ...]
    fresh_select_1_ms: tuple[float, ...]
    warm_select_1_ms: tuple[float, ...]

    @property
    def fresh_connection_median_ms(self) -> float:
        return statistics.median(self.fresh_connection_ms)

    @property
    def fresh_select_1_median_ms(self) -> float:
        return statistics.median(self.fresh_select_1_ms)

    @property
    def warm_select_1_median_ms(self) -> float:
        return statistics.median(self.warm_select_1_ms)


def validate_trial_count(value: int, name: str) -> int:
    if not 1 <= value <= MAX_TRIALS:
        raise ValueError(f"{name} must be between 1 and {MAX_TRIALS}")
    return value


def _median(values: Sequence[float]) -> float:
    if not values:
        raise ValueError("at least one timing is required")
    return statistics.median(values)


def format_report(result: BenchmarkResult) -> str:
    """Format a secret-free benchmark report."""
    def values(items: Sequence[float]) -> str:
        return ", ".join(f"{item:.2f}" for item in items)

    return "\n".join(
        [
            "Momentum database latency benchmark",
            f"Fresh connection trials (ms): {values(result.fresh_connection_ms)}",
            f"Fresh SELECT 1 trials (ms): {values(result.fresh_select_1_ms)}",
            f"Warm SELECT 1 trials (ms): {values(result.warm_select_1_ms)}",
            f"Median fresh connection (ms): {result.fresh_connection_median_ms:.2f}",
            f"Median fresh SELECT 1 (ms): {result.fresh_select_1_median_ms:.2f}",
            f"Median warm SELECT 1 (ms): {result.warm_select_1_median_ms:.2f}",
        ]
    )


def _create_engine() -> AsyncEngine:
    return create_async_engine(
        settings.DATABASE_URL,
        poolclass=AsyncAdaptedQueuePool,
        pool_size=1,
        max_overflow=0,
        pool_timeout=10,
        pool_recycle=1800,
        pool_pre_ping=True,
        connect_args={
            "prepared_statement_cache_size": 0,
            "prepared_statement_name_func": lambda: f"__asyncpg_{uuid4()}__",
        },
    )


async def _measure_fresh_trial() -> tuple[float, float]:
    engine = _create_engine()
    try:
        started = time.perf_counter()
        async with engine.connect() as connection:
            connection_ms = (time.perf_counter() - started) * 1000

            started = time.perf_counter()
            await connection.execute(text("SELECT 1"))
            select_ms = (time.perf_counter() - started) * 1000
            return connection_ms, select_ms
    finally:
        await engine.dispose()


async def _measure_warm_trials(trials: int) -> tuple[float, ...]:
    engine = _create_engine()
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
            timings: list[float] = []
            for _ in range(trials):
                started = time.perf_counter()
                await connection.execute(text("SELECT 1"))
                timings.append((time.perf_counter() - started) * 1000)
            return tuple(timings)
    finally:
        await engine.dispose()


async def run_benchmark(
    fresh_trials: int = DEFAULT_FRESH_TRIALS,
    warm_trials: int = DEFAULT_WARM_TRIALS,
) -> BenchmarkResult:
    """Run bounded fresh-connection and warm-connection measurements."""
    validate_trial_count(fresh_trials, "fresh_trials")
    validate_trial_count(warm_trials, "warm_trials")

    fresh_connections: list[float] = []
    fresh_selects: list[float] = []
    for _ in range(fresh_trials):
        connection_ms, select_ms = await _measure_fresh_trial()
        fresh_connections.append(connection_ms)
        fresh_selects.append(select_ms)

    return BenchmarkResult(
        fresh_connection_ms=tuple(fresh_connections),
        fresh_select_1_ms=tuple(fresh_selects),
        warm_select_1_ms=await _measure_warm_trials(warm_trials),
    )


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run a bounded, secret-free asyncpg database latency benchmark."
    )
    parser.add_argument(
        "--fresh-trials",
        type=int,
        default=DEFAULT_FRESH_TRIALS,
        help=f"Fresh connection trials, 1-{MAX_TRIALS} (default: {DEFAULT_FRESH_TRIALS})",
    )
    parser.add_argument(
        "--warm-trials",
        type=int,
        default=DEFAULT_WARM_TRIALS,
        help=f"Warm SELECT 1 trials, 1-{MAX_TRIALS} (default: {DEFAULT_WARM_TRIALS})",
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    try:
        result = asyncio.run(run_benchmark(args.fresh_trials, args.warm_trials))
    except Exception as exc:
        print(
            f"Database latency benchmark failed ({type(exc).__name__}).",
            file=sys.stderr,
        )
        return 1

    print(format_report(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
