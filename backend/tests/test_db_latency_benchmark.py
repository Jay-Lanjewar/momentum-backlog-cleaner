import pytest

import app.tools.db_latency_benchmark as benchmark
from app.tools.db_latency_benchmark import (
    BenchmarkResult,
    format_report,
    validate_trial_count,
)


def test_benchmark_result_reports_medians():
    result = BenchmarkResult(
        fresh_connection_ms=(10.0, 30.0, 20.0),
        fresh_select_1_ms=(4.0, 8.0, 6.0),
        warm_select_1_ms=(1.0, 3.0, 2.0),
    )

    assert result.fresh_connection_median_ms == 20.0
    assert result.fresh_select_1_median_ms == 6.0
    assert result.warm_select_1_median_ms == 2.0


def test_format_report_contains_timings_but_no_connection_details():
    result = BenchmarkResult(
        fresh_connection_ms=(10.123,),
        fresh_select_1_ms=(2.345,),
        warm_select_1_ms=(1.234,),
    )

    report = format_report(result)

    assert "10.12" in report
    assert "2.35" in report
    assert "1.23" in report
    assert "Median fresh connection" in report
    assert "DATABASE_URL" not in report
    assert "postgres" not in report.lower()
    assert "password" not in report.lower()


@pytest.mark.parametrize("value", [0, -1, 21])
def test_trial_count_is_bounded(value):
    with pytest.raises(ValueError, match="between 1 and 20"):
        validate_trial_count(value, "fresh_trials")


def test_trial_count_accepts_benchmark_bounds():
    assert validate_trial_count(1, "warm_trials") == 1
    assert validate_trial_count(20, "warm_trials") == 20


def test_cli_failure_does_not_print_connection_details(monkeypatch, capsys):
    secret_url = "postgresql+asyncpg://benchmark-user:fake-password@db.example.test:5432/app"
    secret_message = f"connection failed for {secret_url}"

    async def fail_benchmark(*_args, **_kwargs):
        raise RuntimeError(secret_message)

    monkeypatch.setattr(benchmark, "run_benchmark", fail_benchmark)
    monkeypatch.setattr(
        "sys.argv",
        ["db_latency_benchmark", "--fresh-trials", "1", "--warm-trials", "1"],
    )

    exit_code = benchmark.main()
    output = capsys.readouterr()

    assert exit_code == 1
    assert output.out == ""
    assert "Database latency benchmark failed (RuntimeError)." in output.err
    assert secret_url not in output.err
    assert "fake-password" not in output.err
    assert secret_message not in output.err
