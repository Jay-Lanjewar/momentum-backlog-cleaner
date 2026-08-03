# Phase 11: UX & Onboarding Redesign (Say It in Plain Language)

Frontend-only usability pass for Momentum. The Schedule page and onboarding flow
were rewritten to speak in plain, student-friendly language ("fixed
commitments" instead of "schedule blocks"), empty states now teach with
examples, and helper cards explain what should — and should not — be added,
without requiring anyone to read documentation.

**Scope guardrail: zero backend changes.** The planning pipeline, planner,
estimation, scoring, session splitter, rescheduler, personalization, database
schema, auth, and every API contract are untouched. No planner behaviour
changed. All 879 existing backend tests still pass.

---

## 1. What changed

### 1.1 Terminology: "Schedule" → "Fixed Commitments"

| Before (developer-speak)              | After (plain language)              |
| ------------------------------------- | ----------------------------------- |
| Weekly Schedule                       | Fixed Commitments                   |
| Schedule Block                        | Fixed Commitment / Busy Time        |
| "No schedule yet" / "+ Add Block"     | "No fixed commitments" / "+ Add commitment" |
| "Add block" / "Edit block" (modal)    | "Add fixed commitment" / "Edit fixed commitment" |
| Save Schedule                         | Save Changes                        |

### 1.2 Schedule page (`frontend/src/pages/SchedulePage.tsx`)

- **Header** — now reads **"Fixed Commitments"** with the explanatory line:
  > Add only the parts of your week that are fixed. Momentum will automatically schedule study sessions around them.
- **Count line** — `0 commitments across 0 days` (singular/plural aware), shown
  in muted text under the header.
- **Helper cards** (always visible, no docs needed):
  - Green (emerald) **"What should I add?"** — School, Coaching, Meals, Sports,
    Work, Sleep. Caption: *"Anything that happens at the same time every week."*
  - Red **"What should I NOT add?"** — Study time, Homework, Flexible free
    time. Caption: *"Momentum plans study sessions for you — you just mark when
    you're busy."*
- **Day cards** — empty state now says **"No fixed commitments"** with the hint
  *"Add busy times like school or coaching."* and a **"+ Add commitment"**
  action. The inline **Add** button remains in the day header.
- **Modal** — "Add fixed commitment" / "Edit fixed commitment", category label
  (with a 4-across type picker), "Name (optional)", Start/End time inputs, and
  "Add Commitment" / "Save Changes" buttons.
- **Delete flow** — "Delete this commitment?" confirmation.
- **Save bar** — disabled "Save Changes" button; shows an amber
  "Unsaved changes" chip once edits are pending; toasts on success/failure.

### 1.3 Onboarding (`frontend/src/pages/OnboardingPage.tsx`)

- Weekday step is now framed as **"What's fixed on a normal weekday?"** with
  helper text: *"Tell us about your busy times — school, coaching, sports.
  Momentum schedules your study sessions around them."*
- Loading message changed from "Planning your study blocks..." to
  **"Planning your study time..."**
- Internal variable names (`blocks`, `schedule`) were intentionally left alone —
  no logic changes.

---

## 2. Frontend test harness (new)

The repo had **no frontend test runner** before this phase. Added:

- devDependencies: `vitest@^2.1.9`, `jsdom@^25.0.1`,
  `@testing-library/react@^16.3.2`, `@testing-library/jest-dom@^6.9.1`,
  `@testing-library/user-event@^14.6.1`, `@testing-library/dom@^10.4.1`
- `package.json`: `"test": "vitest run"`
- `vite.config.ts`: `test: { environment: "jsdom", setupFiles: "./src/test/setup.ts", css: false }`
- `src/test/setup.ts`: jest-dom matchers, `MotionGlobalConfig.skipAnimations = true`
  (keeps AnimatePresence synchronous in jsdom), `matchMedia` polyfill, and
  explicit `afterEach(() => cleanup())` — needed because vitest runs without
  globals and the DOM would otherwise accumulate between tests.

### Tests (5 total, all passing)

| File | Tests | What it guards |
| ---- | ----- | -------------- |
| `src/pages/SchedulePage.test.tsx` | 4 | "Fixed Commitments" title + explanation copy; helper cards with all 6 add / 3 don't-add examples; 7× plain-language empty states and absence of old copy ("No schedule yet", "Weekly Schedule", "Save Schedule"); add-commitment modal opens |
| `src/pages/OnboardingPage.test.tsx` | 1 | Drives onboarding name → backlog ("What's waiting to be studied?", "Build My Plan", "Looks correct") → weekday step asserting "What's fixed on a normal weekday?" and the busy-times copy |

Both suites render real components inside `MemoryRouter` + `QueryClientProvider`
(`SchedulePage.test.tsx` seeds `["schedule"]` with `{ schedule: {} }`).

**Result:** `npm test` → 5 passed. `npm run build` (`tsc -b && vite build`) →
passes, only the pre-existing chunk-size warning.

---

## 3. Screenshots (static before/after renderings)

The Schedule page requires an authenticated Supabase session and the backend
(port 8000) was not running, so live screenshots were not feasible. Per an
explicit decision, faithful static renderings were produced instead: the exact
Tailwind markup mirrored from `SchedulePage.tsx`, styled with the app's real
compiled CSS (`frontend/dist/assets/index-iY3kQswx.css`), and captured with
headless Chrome.

- `docs/screenshots/phase11-schedule-before.png` — the previous "Weekly Schedule" page.
- `docs/screenshots/phase11-schedule-after.png` — the new "Fixed Commitments" page.

Both are labeled as **UI renderings** (not live captures). Layout was verified
programmatically (sidebar 224px, content column, helper-card tint pixels,
save-bar position).

---

## 4. Non-goals & notes

- **No planner/backend change** — verified the 879-test backend suite still passes.
- **`npm run lint` is broken pre-existing**: ESLint 9.39.5 expects a flat
  `eslint.config.js`, but the repo ships a legacy `.eslintrc.cjs`
  ("ESLint couldn't find an eslint.config.(js|mjs|cjs) file"). Not caused by
  this phase.
- **Latent layout bug spotted (not introduced here)**: `layout.tsx`'s sidebar
  uses `md:fixed md:inset-y-0` without `left-0`, so in a real browser it is
  statically positioned at `left: 224px` and overlaps the content column's left
  edge. Worth fixing in a future pass (`md:left-0`).
- `npm audit` reports 8 pre-existing vulnerabilities; untouched.
