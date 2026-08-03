# Phase 8: Planning Pipeline

Architectural refactor that extracts orchestration from
`app/services/deterministic_planner.py` into a new `app/planning_pipeline/`
package. Planner behaviour is unchanged: every test passes, output is
byte-identical to the pre-refactor snapshot, and the benchmark shows no
regression beyond measurement noise.

## What it does

The old planner was a single 291-line function that interleaved estimation,
scoring, session splitting, rescheduling, ranking, and scheduling. Phase 8
splits those concerns into five stages, each with exactly one responsibility,
joined by an immutable `PlanningContext`. `generate_deterministic_plan` is now
a thin wrapper over `PlanningPipeline().execute(...)`.

Pipeline order:

```
EstimationStage → PlanningScoreStage → SessionSplitterStage
                → AdaptiveReschedulerStage → DeterministicSchedulerStage
                → output contract (same dict as before)
```

## Architecture

```
backend/app/planning_pipeline/
  contract.py   37 lines  PlanningContext (frozen dataclass) + annotation keys
  stage.py     379 lines  Stage ABC + the five stages + shared helpers/caches
  pipeline.py   74 lines  PlanningPipeline, build_planning_context(),
                          _assemble_final_plan()
  __init__.py   22 lines  public exports
```

Stages communicate only through `PlanningContext`; no stage knows how any other
stage is implemented. `Stage.execute(context) -> context` returns either the
same context (in-place payload annotation on the owned copies) or a new context
via `dataclasses.replace`. The context is immutable at the top level; stages
own the item copies they annotate.

### PlanningContext

| field | meaning |
| --- | --- |
| `backlog` | tuple of backlog item dicts (owned copies after Estimation) |
| `planning_date` | target date (today when `target_date` is None) |
| `scheduling_windows` | tuple of available windows |
| `completed_sessions` | completion records or None |
| `previous_plan` | previous day's plan or None |
| `daily_capacity_minutes` | capacity override or None |
| `generated_sessions` | produced by the scheduler stage |
| `overflow` | produced by the scheduler stage |
| `final_plan` | assembled output contract |

Annotation keys (`_id_str`, `_resolved_minutes`, `_planning_score`,
`_priority_boost`, `_session_durations`) live in `contract.py`. They are
underscore-prefixed so they can never collide with a backlog item's own fields.

### Stage responsibilities

| Stage | Responsibility |
| --- | --- |
| `EstimationStage` | copies each backlog item, resolves `estimated_minutes` (fast path when the field is already a positive int, else `estimate(item)`) |
| `PlanningScoreStage` | computes the planning score per item and writes `_planning_score` |
| `SessionSplitterStage` | materializes `(estimated_minutes, session_type) -> durations` via `split()` (bounded memo cache) and writes `_session_durations` on every item |
| `AdaptiveReschedulerStage` | builds rescheduling adjustments from `previous_plan` + `completed_sessions`, applies `_priority_boost` / overridden durations, drops zero-remaining items, and produces the final priority order |
| `DeterministicSchedulerStage` | places sessions into windows (same `_find_best_slot` math), emits `generated_sessions` + `overflow` |

The scheduler keeps a `_split_durations` fallback for unannotated items, so a
future stage may drop the annotation without breaking scheduling.

## Integration point

`backend/app/services/deterministic_planner.py` is now a 11-line wrapper:

```python
def generate_deterministic_plan(
    planning_data, daily_capacity_minutes=None, target_date=None,
    previous_plan=None, completions=None,
) -> dict:
    return PlanningPipeline(estimate_fn=estimate).execute(
        build_planning_context(planning_data, daily_capacity_minutes=..., ...)
    )
```

`estimate` is captured as the module-global so existing tests that monkeypatch
`app.services.deterministic_planner.estimate` keep working. The API signature
and the returned `{"sessions", "daily_message", "overflow"}` contract are
unchanged; no route, schema, auth, or frontend code was touched.

## Perf optimizations preserved

All Phase-7 optimizations survive the refactor verbatim:

- `_RESOLVED_MINUTES_KEY`, `_PLANNING_SCORE_KEY`, `_PRIORITY_BOOST_KEY`,
  `_SESSION_DURATIONS_KEY`, `_ID_STR_KEY` (no repeated `str(item["id"])`).
- `_TIME_CACHE` for time-string parsing.
- `_SPLIT_DURATIONS_CACHE` (bounded at 128) so `split()` runs once per unique
  `(estimated_minutes, session_type)`; the `SessionSplitterStage` inlines the
  cache lookup to keep eager annotation near-free.
- Merged completed-filter in ranking; COMPLETED sessions skipped when building
  rescheduling input.

## Byte-identity verification

`generate_deterministic_plan` before vs after the refactor was compared on a
randomized harness (`pre_refactor_planner.py` snapshot vs the pipeline):

- 175 cases: backlog sizes 5 / 40 / 200, windows 1-3, previous-plan session
  counts 0 / 1 / 3 / 8 / 10 / 30, seeds 0-24.
- Cases include `estimated_minutes=None/0/-5/45.0`, missing due dates, empty
  titles, and mixed completed/partial/skipped completions.
- Result: **0 mismatches** — the full output dict (`sessions`,
  `daily_message`, `overflow`) is equal in every case.

## Tests & coverage

- Full suite: **811 passed** (unchanged from Phase 7).
- Coverage with the new package measured:
  - `app.planning_pipeline` **93%** (misses are defensive branches: cache
    miss path, non-dict previous plan, non-string backlog ids, zero-duration
    items, unannotated-item fallback).
  - `app.services.deterministic_planner` **100%** (thin wrapper).
  - `app.rescheduler` **100%**, `app.session_splitter` **100%**,
    `app.scoring` **100%**.
  - **TOTAL 96%**.
- The wrapper keeps the module-global `estimate` so the monkeypatch-based
  estimation tests still pass.

## Benchmark

Methodology note discovered during Phase 8: naive "run planner A 100x, then
planner B 100x" comparisons drift because repeated in-process calls accumulate
allocation/GC pressure that makes later cases look slower (a +95% "regression"
in a first-pass run was entirely this artifact). All numbers below use the
Phase-7 methodology — interleaved best-of-N with fresh data — which cancels
machine drift.

Direct old-vs-new (5000-item backlog, fresh data each round, interleaved
best-of-60):

| Run | pre-refactor | pipeline | delta |
| --- | --- | --- | --- |
| 1 | 26.9 ms | 26.6 ms | −1.2% |
| 2 | 26.9 ms | 27.9 ms | +3.6% |
| 3 | 27.2 ms | 27.0 ms | −0.6% |

Mean delta ≈ 0% (± measurement noise); the pipeline is at parity.

Phase-7 overhead metric (rescheduling input vs same planner, no input), 3 runs
each, old vs new — bands overlap, so the refactor adds no measurable overhead:

| Case | pre-refactor (3 runs) | pipeline (3 runs) |
| --- | --- | --- |
| + 100 sessions | −2.1% / +10.3% / +8.0% | −5.5% / −0.9% / +4.5% |
| + 1000 sessions | +6.4% / +17.5% / +1.9% | +1.0% / +7.7% / +9.2% |
| + 5000 sessions | +45.2% / +48.7% / +20.5% | +59.6% / +35.5% / +44.7% |

Run-to-run variance is ±5-15pp, so the Phase-7 documented numbers
(100 → −1.1/+3.1, 1000 → +6.8/+9.3, 5000 → +33.8/+36.4) and the pipeline
numbers are statistically indistinguishable. The 5000-session structural
limitation documented in Phase 7 is unchanged.

## Files

| Path | Change |
| --- | --- |
| `backend/app/planning_pipeline/__init__.py` | new (public exports) |
| `backend/app/planning_pipeline/contract.py` | new (PlanningContext, annotation keys) |
| `backend/app/planning_pipeline/pipeline.py` | new (PlanningPipeline + context builder) |
| `backend/app/planning_pipeline/stage.py` | new (Stage ABC + 5 stages + shared helpers) |
| `backend/app/services/deterministic_planner.py` | rewritten as thin wrapper |
| `docs/PHASE8_PIPELINE.md` | this report |

## Future extension points

- New stages slot into `PlanningPipeline(stages=[...])` without touching the
  scheduler or the output contract (e.g. a task-quota or gap-filling stage).
- `PlanningContext.previous_plan` / `completed_sessions` are already routed
  through the pipeline; the API layer can enable adaptive rescheduling by
  passing them to `generate_deterministic_plan`.
- A stage can be unit-tested in isolation via `Stage.execute(PlanningContext(...))`.
