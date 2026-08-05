# Phase 12: Product Experience (Momentum as an AI Study Coach)

Frontend-only UX pass that turns Momentum from a task manager into an **AI study
coach**: the dashboard becomes "Today's Mission", the backlog becomes
"Pending Work", and Focus Mode becomes a guided, coached session. Every screen
now opens with a clear next action, explains *why* a task is recommended, and
educates the student when there is nothing to do.

**Scope guardrail: zero backend changes.** The planning pipeline, planner,
estimation, scoring, session splitter, rescheduler, personalization, database
schema, auth, and every API contract are untouched. No planner behaviour
changed. Existing backend tests remain intact.

---

## 1. What changed

### 1.1 Today's Mission (dashboard, `frontend/src/pages/TodayMissionPage.tsx`)

The dashboard was rewritten from "statistics cards" to an action-first coach:

- **Greeting** — time-aware "Good morning, Alex" (from `getGreeting`).
- **Today's Mission hero** — the single most important session of the day,
  rendered as a `RecommendedNextCard` (see 1.4) with a prominent **"Start Focus
  Session"** primary button. The recommendation includes *Focus Time*,
  *Best Time*, *Est. Finish*, *Time Saved* and *Schedule Confidence* tiles.
- **Coaching line** — a `CoachMessage` explains the task in one plain sentence:
  "This task is overdue. Finishing it now puts you back on schedule." — and a
  second line coaches the next step ("Starting now puts you back on schedule —
  1 hour of work is overdue.").
- **Progress Overview** — "Today's Progress" replaces bare stat cards with four
  meaningful numbers: **Tasks** done/total, **Study Time** vs daily target,
  **Streak**, and **Next Deadline**, plus a daily-target progress bar and an
  animated timeline of today's study blocks.
- **Up Next Today** — the remaining sessions as tappable rows with an explicit
  **"Start Maths Practice"** action each.
- **No more Mark Complete on the dashboard.** Completing work is a natural part
  of finishing a Focus Session, so the raw checkbox shortcut was removed to
  avoid encouraging "tap-to-complete" without studying.

### 1.2 Pending Work (backlog, `frontend/src/pages/BacklogPage.tsx`)

The task form was redesigned around how students actually think:

- Fields are now **Task name**, **Subject**, **Difficulty (Easy / Medium /
  Hard)**, and **Due** (Today / Tomorrow / This Week / Custom chips).
- **Manual minutes are hidden** behind an "Advanced" disclosure. Students no
  longer need to estimate — the hint reads *"Momentum estimates the time for
  you"* and the planner auto-estimates when minutes are absent.
- **Difficulty is client-side only.** UX difficulty maps to the existing 1–4
  priority (Easy→4, Medium→3, Hard→1) so no backend change was needed; there is
  no "difficulty" field on the API.
- **Subject dropdown** with inline "Add Subject" + color picker, replacing the
  separate add-subject modal.
- **Three-dot card menus** and a **delete confirmation** modal replace inline
  edit/delete actions.
- Per-tab educated empty states (see 1.5).

### 1.3 Focus Mode (`frontend/src/pages/FocusModePage.tsx`)

The stopwatch was replaced with a calm, coached session:

- Large animated **ring timer** with the remaining time in the center
  (`tabular-nums`), showing the session as a countdown ("remaining" / "Paused")
  rather than a running clock.
- Session title + personal line ("Let's finish this one, Alex.").
- A **`CoachMessage` that coaches progress** through the session: "Settle in.
  The first few minutes are the hardest." → "You're building momentum. Keep
  going." → "More than halfway. Stay with it." → "Final stretch — finish
  strong." (from `focusCoachMessage`).
- Circular **Pause / Resume** control (with `AnimatePresence`), **Finish Early**
  (with a "one less thing to worry about" placeholder when time was saved), and
  a subtle **Restart timer**.
- **Calm completion screen** (deliberately no confetti): a check, the finished
  session summary, and an automatic **"Start Next Session"** recommendation
  built by `nextSessionAfter` — the next task with its time slot — or a
  reassuring "You're all caught up for today" when the plan is finished.
- Completing a session marks the backlog item done and invalidates
  `dashboard` / `planning` / `plans` queries so the next visit is fresh.

### 1.4 Reusable coach components

- `frontend/src/lib/coaching.ts` — pure, unit-tested helpers: greetings, minute
  math, `formatMinutes` / `formatTimeDisplay`, difficulty↔priority mapping,
  timezone-stable due chips (`dateKeyFromString`), recommendation reason
  builder, coaching lines, `focusCoachMessage`, schedule confidence, time
  saved, and `nextSessionAfter`.
- `frontend/src/components/coach/coach-message.tsx` — `CoachMessage`
  (default/success/warning/destructive tones, `role="status"`,
  `aria-label="AI Coach"`).
- `frontend/src/components/coach/recommended-next.tsx` — `RecommendedNextCard`
  (eyebrow, task, subject, color, durationLabel, reason, stat tiles, optional
  Start CTA).
- `frontend/src/components/progress-overview.tsx` — `ProgressOverview` (see 1.1).

### 1.5 Educated empty states

Empty states now teach instead of blankly saying "No tasks":

| Screen | Before | After |
| ------ | ------ | ----- |
| Dashboard | empty stat cards | "No work yet." — *"Add your homework and Momentum will automatically build today's study plan."* + **Add Work** action |
| Dashboard (finished) | nothing | "All done for today." + next-mission hint |
| Focus Mode (no session) | blank page | "No study block found" + *"Go back to Today's Mission to start a study session."* + **Back to Today** |
| Backlog | "No tasks" | "No work yet." + *"Add your homework and Momentum will automatically build today's study plan."* |

### 1.6 Layout fix (pre-existing bug from Phase 11)

The sidebar in `frontend/src/components/layout.tsx` used `md:fixed
md:inset-y-0` without `md:left-0`, so it was statically positioned at
`left: 224px` and overlapped the content column in a real browser. **Fixed with
`md:left-0`.** This was flagged as a known issue in the Phase 11 doc.

---

## 2. Tests

### New helper tests

| File | Tests | What it guards |
| ---- | ----- | -------------- |
| `src/lib/coaching.test.ts` | 22 | Greeting/time math, formatting, difficulty↔priority mapping, timezone-stable due chips, recommendation reasons, coaching lines, `focusCoachMessage` thresholds, schedule confidence, time saved, next-session selection |

### New component/page tests (UI)

| File | Tests | What it guards |
| ---- | ----- | -------------- |
| `src/components/coach/coach.test.tsx` | 6 | `CoachMessage` renders as a labelled status region with tones; `RecommendedNextCard` renders all AI meta tiles, custom eyebrow, optional chips, and fires `onStart` |
| `src/pages/TodayMissionPage.test.tsx` | 6 | Greeting + mission hero as primary action; *why*-reason + coaching line; no "Mark Complete" shortcut; meaningful progress values; Up Next rows with Start actions; educated no-work empty state |
| `src/pages/BacklogPage.test.tsx` | 5 | Educated empty state; form opens with difficulty + due chips and manual minutes hidden behind Advanced; difficulty maps to priority (Hard→1) with no manual minutes sent; Advanced override sends minutes; difficulty badges on existing tasks |
| `src/pages/FocusModePage.test.tsx` | 6 | Calm countdown timer; in-session coaching; pause/resume; Finish Early marks the session complete; next-task recommendation with Start Next Session; no-session empty state |

Pages are rendered with `MemoryRouter` + `QueryClientProvider`; hooks are
mocked with seeded state so no network is hit. **`npm test` → 7 files, 50
tests passing.** `npm run build` (`tsc -b && vite build`) passes with only the
pre-existing chunk-size warning.

---

## 3. Screenshots

Not captured for this phase — the app requires an authenticated Supabase session
and a running backend, neither of which was available during the work. The
Phase 11 approach (faithful static renderings styled with the app's real
compiled CSS) can be reused later if screenshots are wanted.

---

## 4. Non-goals & notes

- **No backend / planner / API change** — verified the full backend test suite
  still passes unchanged.
- **Difficulty is a client-only concept** — it maps onto the existing
  `priority` (1–4) field; no schema change.
- **`npm run lint` is broken pre-existing**: ESLint 9 expects a flat
  `eslint.config.js`, but the repo ships a legacy `.eslintrc.cjs`. Not caused
  by this phase; `tsc -b` is the typecheck gate.
- **`estimated_minutes` stays optional** — when blank, the planner auto-estimates
  (fallback 60 min for totals, `_resolve_estimated_minutes`), so hiding the
  field is safe.
- **Focus Mode receives its session via router state** — a hard refresh on
  `/focus` shows the educated "No study block found" empty state instead of
  crashing. Starting from Today's Mission / Up Next always works.
- **No live AI generation** — all coaching copy is deterministic from
  real planning data (overdue, priority, schedule confidence); no new API
  calls were introduced.
- `npm audit` reports 8 pre-existing vulnerabilities; untouched.

---

## 5. Success criteria

- A student can go from opening the app to studying in one tap (mission hero →
  Start Focus Session).
- Every task is recommended with *why* (reason) and *when* (best time /
  finish time) information.
- No screen dead-ends: empty states always offer the next action.
- Focus Mode finishes with momentum (next-task recommendation) instead of a
  cheer and a dead end.
- No backend, auth, scheduling, or test regressions.
