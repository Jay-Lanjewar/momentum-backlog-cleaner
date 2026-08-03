# Phase 9: AI Study Coach (Explain, Never Decide)

A pure AI explanation layer that sits AFTER the planning pipeline. It explains
planner decisions and generates helpful coaching; it never makes planning
decisions (no task order, planning score, estimated duration, session
splitting, or rescheduling) and never modifies the planner output.

## Design principles

- The planner remains the single source of truth.
- The coach reads only public data. `build_coach_context` sanitizes backlog
  items to a whitelist of public fields, so planner-internal annotations
  (`_planning_score`, `_resolved_minutes`, `_session_durations`, ...) can never
  reach a coach provider.
- No API keys, no external calls, no DB changes. `TemplateCoachProvider` is the
  only provider; `CoachProvider` is the seam for future Gemini/OpenAI providers.

## Updated architecture

```
PlanningPipeline (unchanged, single source of truth)
        │
        │  plan dict {sessions, daily_message, overflow}
        ▼
AI Study Coach (new) ── build_coach_context → CoachContext
        │                  │
        │                  ▼
        │         StudyCoach(provider)
        │                  │
        │                  ▼
        │         CoachProvider.generate(context) → CoachingResult
        │            TemplateCoachProvider (deterministic templates)
        │            [future] GeminiCoachProvider / OpenAICoachProvider
        │                  │
        ▼                  ▼
Frontend          explanations (per session) + summary (per day)
```

The planner output dict is untouched: `generate_deterministic_plan` still
returns exactly `{"sessions", "daily_message", "overflow"}`. Coaching is
produced by a separate call, so the existing API contract is unchanged and the
frontend can attach it later as additive metadata.

## New file tree

```
backend/app/ai_coach/
  __init__.py      51 lines  public exports + generate_coaching() convenience
  contract.py      78 lines  CoachContext, CoachExplanation, CoachSummary,
                             CoachingResult (frozen/slotted), sanitize_item()
  fallback.py     222 lines  deterministic template reason + summary engines
  coach.py         92 lines  CoachProvider ABC, TemplateCoachProvider,
                             StudyCoach, build_coach_context()
  prompt_builder.py 76 lines build_prompt(): LLM prompt seam
```

## Explanation pipeline

1. `generate_coaching(plan, planning_data, previous_plan, completions,
   provider)` builds a `CoachContext` via `build_coach_context` (sanitizes
   backlog items to public fields).
2. `StudyCoach.coach(context)` delegates to the configured `CoachProvider`.
3. `TemplateCoachProvider.generate` runs the deterministic engines in
   `fallback.py`.
4. Output is a `CoachingResult`: one `CoachExplanation(backlog_item_id,
   start_time, end_time, short_reason)` per planned session, plus one
   `CoachSummary(sentences, total_minutes, session_count)`.

### Deterministic reasons (first match wins, per session)

| Rule | Reason |
| --- | --- |
| previous sessions for the item were not fully completed | "Carried from yesterday because it was unfinished." |
| item is overdue | "Scheduled early because it is overdue." |
| due within 3 days | "Moved earlier because the deadline is close." |
| item has ≥ 2 sessions today | "Split into shorter sessions to improve focus." |
| estimated ≥ 90 min and scheduled first | "Long task scheduled first while your energy is highest." |
| otherwise | "Working on {title}." |

### Summary sentences (deterministic)

- Headline: "Today's plan focuses on your highest-impact work."
- If the first scheduled item is overdue: "History appears first because it is
  overdue." (uses course name, falls back to title).
- If any item was split: "Large tasks have been split into manageable sessions."
- If any item was carried: "Unfinished work from yesterday is carried into today."
- Always: "You have approximately {hours} hours of focused work today."
- If overflow: "Some tasks were left unscheduled for today."

## Example outputs

Input: 3 backlog items (overdue History, due-tomorrow Physics, partially
completed Math carried from yesterday). Planner output unchanged; coaching:

```
06:00-06:25  3b9f69be: Scheduled early because it is overdue.
06:25-06:30  3b9f69be: Scheduled early because it is overdue.
06:30-07:00  9a14c4e2: Moved earlier because the deadline is close.
07:00-07:30  9a14c4e2: Moved earlier because the deadline is close.
07:30-08:00  9a14c4e2: Moved earlier because the deadline is close.
17:00-17:30  9a14c4e2: Moved earlier because the deadline is close.
17:30-17:55  e6b5ac96: Carried from yesterday because it was unfinished.
17:55-18:20  e6b5ac96: Carried from yesterday because it was unfinished.

=== summary ===
Today's plan focuses on your highest-impact work.
History appears first because it is overdue.
Large tasks have been split into manageable sessions.
Unfinished work from yesterday is carried into today.
You have approximately 3.3 hours of focused work today.
(200 minutes, 8 sessions)
```

Every reason category and every summary rule is exercised in the test suite and
produces identical output across runs (determinism is asserted).

## Fallback

`TemplateCoachProvider` IS the fallback: deterministic templates, always
available, no network. The API contract of `generate()` is identical to what a
future LLM provider must return — a `CoachingResult`. If a future LLM provider
fails or times out, it simply returns `TemplateCoachProvider().generate(context)`,
so the frontend contract never breaks.

## Tests

`backend/tests/test_ai_coach.py` (33 tests) covers:

- explanation generation (carried / completed-excluded / overdue /
  close-deadline / split / long-first / generic / missing backlog item)
- fallback generation (fallback ≡ TemplateCoachProvider, direct helpers)
- deterministic output (with and without rescheduling input)
- summary generation (headline, duration, overdue-first, split, carried,
  overflow, fractional hours, empty plan)
- no planner mutation (plan + backlog deep-equal after coaching; sanitize
  strips `_` keys; coach never writes to inputs)
- provider abstraction (abstract base, default = template, custom provider used)
- immutability (all contracts frozen)
- prompt builder (public facts only, no internals, overflow + completions,
  overdue status)

## Regression

- Full suite: **844 passed** (811 from prior phases + 33 new).
- No planner files were touched: `generate_deterministic_plan` and the pipeline
  are byte-identical to Phase 8; the coach is a separate layer.
- No DB, scheduling, or API changes.
- Coverage of `app.ai_coach`: **99%** (only miss is the unreachable abstract
  `raise NotImplementedError` in `CoachProvider`). `contract.py`,
  `fallback.py`, `prompt_builder.py`: 100%; `coach.py`: 96%.

## Files

| Path | Change |
| --- | --- |
| `backend/app/ai_coach/__init__.py` | new (exports + convenience entry) |
| `backend/app/ai_coach/contract.py` | new (immutable contracts, sanitize) |
| `backend/app/ai_coach/fallback.py` | new (deterministic templates) |
| `backend/app/ai_coach/coach.py` | new (provider seam + orchestrator) |
| `backend/app/ai_coach/prompt_builder.py` | new (LLM prompt seam) |
| `backend/tests/test_ai_coach.py` | new (33 tests) |
| `docs/PHASE9_AI_COACH.md` | this report |

## Future Gemini/OpenAI integration points

- Implement `CoachProvider` (e.g. `GeminiCoachProvider`) in a new file; its
  `generate(context)` should:
  1. render `prompt_builder.build_prompt(context)` into an LLM prompt,
  2. call the model (no API keys live in this repo),
  3. parse the response into a `CoachingResult`,
  4. return `TemplateCoachProvider().generate(context)` on any parse/network
     failure so the contract never breaks.
- Wire it via `StudyCoach(provider=...)` or `generate_coaching(provider=...)`.
- Optionally cache per-`(plan)` results so repeated frontend loads stay
  deterministic and cheap.
- When the API layer is ready, a future phase can attach
  `result.explanations` / `result.summary` to the plan response as additive
  fields (planner output stays the source of truth).
