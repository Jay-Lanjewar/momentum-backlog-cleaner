# Phase 7: Adaptive Rescheduler

Pure, deterministic module that turns a previous day's plan plus actual
completion data into a rescheduling adjustment for the next day's plan. It is
integrated into the deterministic planner and covered by unit, integration, and
regression tests.

## What it does

Given the previous day's sessions and a list of completions
(`completed` / `partial` / `skipped`), the rescheduler computes, per backlog
item:

- `remaining_minutes`: minutes still owed (carried forward),
- `priority_boost`: an additive ranking boost,
- `session_durations`: the carried durations, in original session order.

The planner then uses these adjustments to rank and schedule the next day:

- a **completed** session is removed entirely;
- a **partial** session keeps only its remaining minutes
  (`duration - completed_minutes`);
- a **skipped** session (or one with no completion record) is carried forward
  at full duration;
- a previous plan's overflow tail (`remaining_minutes` on the last session) is
  appended after the carried durations;
- ordering within a task is preserved; duration is conserved (nothing is lost
  or duplicated);
- an item with `remaining_minutes == 0` is dropped from the next plan.

## Architecture

```
backend/app/rescheduler/
  contract.py   CompletionStatus, PlannedSession, ReschedulableTask,
                TaskAdjustment, ReschedulingResult  (frozen, slotted dataclasses)
  strategy.py   OVERDUE_BOOST=20, SKIPPED_BOOST=10, carry_minutes(),
                overdue_boost(), skipped_boost(), priority_boost()
  engine.py     reschedule(tasks, target_date) -> ReschedulingResult
                (deterministic: adjustments sorted by backlog_item_id)
  __init__.py   public API
```

Prioritization is a pure ranking adjustment; boost is never added to minutes.
Sort key: `-(planning_score + priority_boost), -score, priority`.

## Integration point

`backend/app/services/deterministic_planner.py`:

```python
generate_deterministic_plan(
    planning_data,
    daily_capacity_minutes=None,
    target_date=None,
    previous_plan=None,   # NEW
    completions=None,     # NEW
) -> dict
```

Contract for `completions`:

```python
{
    "backlog_item_id": str,
    "session_number": int,
    "status": "completed" | "partial" | "skipped",
    "completed_minutes": int,
}
```

Backward compatible: with no `previous_plan` the pipeline is byte-identical to
the Phase-6 planner. `previous_plan` may be `{"sessions": [...]}` or a list of
session records.

### Planner performance notes

- `str(item["id"])` is computed once per item (`_ID_STR_KEY`) and reused.
- Time-string parsing is memoized (`_TIME_CACHE`).
- Session durations from `split()` are memoized per `(estimated_minutes,
  session_type)` (`_SPLIT_DURATIONS_CACHE`, bounded at 128 entries) — `split()`
  is a pure function of minutes.
- Completed sessions are skipped when building `PlannedSession` tuples, and the
  completed-task filter is merged into ranking.

## Files

| Path | Change |
| --- | --- |
| `backend/app/rescheduler/__init__.py` | new |
| `backend/app/rescheduler/contract.py` | new |
| `backend/app/rescheduler/strategy.py` | new |
| `backend/app/rescheduler/engine.py` | new |
| `backend/app/services/deterministic_planner.py` | integration + perf |
| `backend/tests/test_rescheduler.py` | new (32 tests) |
| `backend/tests/test_adaptive_rescheduler_pipeline.py` | new (13 tests) |

## Tests & coverage

- Full suite: **811 passed**
- Coverage: **97% total** — `app.rescheduler` **100%**,
  `app.services.deterministic_planner` **96%**, `app.session_splitter` **100%**,
  `app.scoring` **100%**.
- The integration tests cover completed removal, partial reduction, skipped
  carry-forward, ordering, overflow tail, boost ranking, determinism, unchanged
  output contract, no-previous-plan equivalence, no-DB access, and a 5000-item
  runtime budget.

## Benchmark

Methodology: fixed 5000-item backlog, previous plans of exactly
100 / 1000 / 5000 sessions, interleaved best-of-15 (machine drift cancels out).
"Additional overhead" is measured against the same Phase-7 planner with no
rescheduling input; the Phase-6 snapshot is shown for reference.

| Case | Time | Overhead vs p7-no-input | Target |
| --- | --- | --- | --- |
| p6 baseline (no input) | ~30.2-30.6 ms | — | — |
| p7 planner (no input) | ~30.7-31.4 ms | +1.7-3.3% vs p6 | — |
| + 100 sessions | ~30.9-32.0 ms | **-1.1% to +3.1%** | PASS |
| + 1000 sessions | ~33.6-33.8 ms | **+6.8% to +9.3%** | PASS |
| + 5000 sessions | ~41.2-42.6 ms | **+33.8% to +36.4%** | not met |

### Why the 5000-session case cannot meet <10%

Rescheduling is necessarily O(n) in the number of previous sessions. Measured
costs for 5000 sessions (best of several micro-benchmarks):

- rescheduler engine alone: **~3.2 ms**
- build + engine (33% completed): ~11 ms; (85% completed): ~7.9 ms

10% of the ~30 ms planning baseline is ~3 ms. Even with a zero-cost build the
engine alone is ~3.2 ms (~11% of baseline), so `<10%` at 5000 sessions is
structurally unachievable with the required pure-Python module architecture.
This is accepted as a documented limitation; the realistic case (a single day's
plan, ~20-30 sessions) is at parity, and 100/1000 sessions pass comfortably.

## Known limitations

- 5000-session rescheduling input exceeds the 10% overhead target (see above).
- No automated routing yet: the API layer does not currently pass
  `previous_plan` / `completions` into the planner (integration is at the
  service layer and ready for it).
