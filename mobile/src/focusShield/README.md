# Adaptive Knowledge Challenge Engine

The engine runs locally. Catalog items are original authored questions with an ID, version, grade list, board, subject, topic, skill, difficulty, answer type, answer key, optional hint, and worked explanation. Generation selects from compatible authored items; it does not call a model or evaluate generated code.

## MVP curriculum matrix

| Profile | Supported subject area | Topic coverage | Alignment |
| --- | --- | --- | --- |
| Grades 6–8, any/unknown board | Mathematics | Integers; fractions | Board-neutral foundations; not a syllabus-complete claim |
| Grades 7–9, any/unknown board | Mathematics | One-variable linear equations; ratios and percentages | Board-neutral foundations; not a syllabus-complete claim |
| Grades 6–10, any/unknown board | English | Subject–verb agreement; parts of speech | Board-neutral grammar practice |
| Class 9, CBSE | Science: Physics strand | Motion; force and laws of motion | Topic names and core concepts follow CBSE 2026–27 Science |
| Class 9, CBSE | Science: Chemistry strand | Atoms and molecules; simple formulae; molecular mass | Topic names and core concepts follow CBSE 2026–27 Science |
| Class 9, CBSE | Science: Biology strand | Cells and selected organelles | Topic names and core concepts follow CBSE 2026–27 Science |

The profile stores only a board label, not an academic year. CBSE class 9 Science entries use the current 2026–27 concepts as a small topic subset. The app keeps Physics/Chemistry/Biology as selectable strands to match course naming, although CBSE's class 9 curriculum presents these within integrated Science. Board-neutral questions remain visibly described as foundations in this matrix; they are not represented as board-approved or syllabus-complete.

Not currently catalogued: History, Geography, Civics, Economics, Computer Science, additional languages, other CBSE grades, and non-CBSE board-specific curricula. Other boards can still receive only the explicitly board-neutral foundations. Unsupported grades with no such content receive an unavailable state, with no unrelated question substituted.

Curriculum references:

- [CBSE Class IX Mathematics, 2026–27](https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart1/Maths_SecP1IX_2026-27.pdf)
- [CBSE Class IX Science, 2026–27](https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart1/ScienceSt_SecP1_2026-27.pdf)
- [CBSE Curriculum 2026–27 index](https://cbseacademic.nic.in/curriculum_2027.html)

The MVP questions are authored for MOMENTUM and do not reproduce textbook items.

### Audited question inventory

All current items are single-choice. “Unique” counts IDs applicable to the stated grade range, not copied copies; the catalog has 30 unique IDs total. D1/D2/D3 counts are authored item counts per skill and grade. Automated catalog tests check unique IDs, applicability, and that each exact answer is one of the offered choices. This is a correctness check, not a substitute for curriculum-editor review.

| Grade | Board | Subject | Topic | Skill | Unique | D1 | D2 | D3 | Format / validation |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| 6 | General foundations | Mathematics | Integers | Integer addition | 1 | 1 | 0 | 0 | Single-choice; automated key/choice check |
| 7–8 | General foundations | Mathematics | Integers | Integer addition | 2 | 1 | 1 | 0 | Single-choice; automated key/choice check |
| 6–8 | General foundations | Mathematics | Integers | Integer subtraction | 1 | 1 | 0 | 0 | Single-choice; automated key/choice check |
| 6–8 | General foundations | Mathematics | Fractions | Fraction equivalence | 1 | 1 | 0 | 0 | Single-choice; automated key/choice check |
| 6 | General foundations | Mathematics | Fractions | Fraction addition | 1 | 1 | 0 | 0 | Single-choice; automated key/choice check |
| 7–8 | General foundations | Mathematics | Fractions | Fraction addition | 2 | 1 | 1 | 0 | Single-choice; automated key/choice check |
| 7–9 | General foundations | Mathematics | Linear equations | One-step equations | 1 | 1 | 0 | 0 | Single-choice; automated key/choice check |
| 7 | General foundations | Mathematics | Linear equations | Two-step equations | 1 | 0 | 1 | 0 | Single-choice; automated key/choice check |
| 8–9 | General foundations | Mathematics | Linear equations | Two-step equations | 2 | 0 | 1 | 1 | Single-choice; automated key/choice check |
| 7–9 | General foundations | Mathematics | Ratios and percentages | Ratios | 1 | 1 | 0 | 0 | Single-choice; automated key/choice check |
| 7 | General foundations | Mathematics | Ratios and percentages | Percentages | 1 | 0 | 1 | 0 | Single-choice; automated key/choice check |
| 8–9 | General foundations | Mathematics | Ratios and percentages | Percentages | 2 | 0 | 1 | 1 | Single-choice; automated key/choice check |
| 9 | CBSE | Physics | Motion | Speed | 2 | 1 | 0 | 1 | Single-choice; automated key/choice check |
| 9 | CBSE | Physics | Motion | Distance and time | 1 | 0 | 1 | 0 | Single-choice; automated key/choice check |
| 9 | CBSE | Physics | Force and motion | Force, mass, acceleration | 3 | 1 | 1 | 1 | Single-choice; automated key/choice check |
| 9 | CBSE | Chemistry | Atoms and molecules | Chemical formulae | 2 | 1 | 1 | 0 | Single-choice; automated key/choice check |
| 9 | CBSE | Chemistry | Atoms and molecules | Molecular mass | 1 | 0 | 0 | 1 | Single-choice; automated key/choice check |
| 9 | CBSE | Biology | Cells | Cell structures | 3 | 1 | 1 | 1 | Single-choice; automated key/choice check |
| 6 | General foundations | English | Subject–verb agreement | Verb agreement | 2 | 1 | 1 | 0 | Single-choice; automated key/choice check |
| 7–10 | General foundations | English | Subject–verb agreement | Verb agreement | 3 | 1 | 1 | 1 | Single-choice; automated key/choice check |
| 6 | General foundations | English | Parts of speech | Parts of speech | 2 | 1 | 1 | 0 | Single-choice; automated key/choice check |
| 7–10 | General foundations | English | Parts of speech | Parts of speech | 3 | 1 | 1 | 1 | Single-choice; automated key/choice check |

Several skills cannot reliably demonstrate three difficulty levels yet: integer subtraction, fraction equivalence, one-step equations, and ratios have only D1; distance/time has only D2; molecular mass has only D3. Grade 6 addition and fraction addition, grade 7 two-step equations, grade 7 percentages, and CBSE chemical formulae also lack one or more levels. The adaptation value can move independently from the available item level; question selection uses the nearest authored difficulty, so the displayed challenge may not get harder for these skills. One-question skills have high memorisation risk across repeated check-ins. No questions are currently authored for Physics, Chemistry, or Biology outside Class 9 CBSE, nor for the other listed subjects.

## Context matching

The Focus route supplies the active backlog item and course name, plus the profile's existing `class_name` and `board`. The challenge screen loads the authenticated backlog item for its description. Exact course and title tokens may suggest a supported subject/topic; the student confirms the subject and topic before starting. Ambiguous course names and vague task titles leave the relevant choice empty. No unrelated subject is selected silently.

## Answer checking

- Choice and text answers use exact normalized strings, case-insensitive for text.
- Multiple-choice answers compare sorted exact sets.
- Numeric answers parse signed integers, decimals, and fractions as reduced rational numbers using `BigInt`; basic `+`, `-`, `*`, `/`, parentheses, and bounded integer exponents are parsed by a small recursive-descent parser. Inputs and intermediate integer sizes are capped; division by zero, unsupported syntax, and oversized powers are rejected. No `eval` or generated code execution is used.
- Static catalog answers are verified against their own questions in automated tests.

## Adaptation

Mastery is separate for every subject/topic/skill tuple. Each skill starts at difficulty 1.

- Three consecutive correct answers without opening a hint raise difficulty by one level, capped at 3.
- Two consecutive incorrect answers lower difficulty by one level, floored at 1.
- A single answer cannot change difficulty. A hinted correct answer is worth 0.5 mastery credit and breaks the promotion streak. An incorrect answer is worth 0, even when a hint was opened.
- Mastery is `round(100 × (unhinted correct + 0.5 × hinted correct) / attempts)`; hinted incorrect attempts remain zero credit.
- Confidence is `round(min(attempts / 8, 1) × max(0, 1 − sqrt(variance(last up to 8 weighted outcomes))))`, with weighted outcomes 1, 0.5, or 0. Confidence therefore remains low for small or inconsistent samples, while consistent evidence can support confidence in low mastery too.
- The initial three-question check-in uses the least-attempted skill first. Ties follow the catalog's declared skill order. It is untimed and does not penalize incorrect answers.

Question choice is deterministic: choose the least-attempted eligible skill, then a fresh authored question at the requested level, then a deterministic generated variation at that level, then the nearest available authored question. `requestedDifficulty` records the mastery level sought; `difficulty` is the level actually delivered. The UI discloses when a catalog fallback differs, and mastery never describes the fallback as a harder delivered challenge. Generated variants use bounded integer/rational arithmetic and stable versioned IDs. Finite authored parameter pools stop instead of cycling identical prompts behind new IDs. Questions are not repeated within a check-in. A new check-in starts a new sequence.

The selector first prefers eligible static or generated questions absent from the user's last 30 question IDs, and falls back to eligible authored content if generated alternatives are exhausted. It also prevents repeats within the current check-in. Some generated pools are intentionally finite; the small MVP catalog can still repeat after available alternatives are seen, and static fallback may deliver a different level with a disclosure. Content expansion is required for sustained novelty.

## Offline storage and recovery

The Zustand store holds the active view of mastery and persists a versioned JSON record under the authenticated user's local key through the app's existing `localStorage` adapter (Expo SQLite on native). Stored values are per-skill attempt counts, mastery/confidence, adaptive level, recent outcome weights, and up to 30 question IDs. Version 2 added separate hinted-correct counts and validates all fields and collection bounds before accepting stored data; older schema records are ignored and start fresh because the earlier format cannot reliably recover hinted-correct credit. No free-text answer history, app inventory, browsing history, or backend sync is stored. Corrupt or unavailable storage falls back to an empty profile; write failures are shown as recoverable status in the interface. No database migration or network service was added.

When an authenticated user changes, the new user's profile is loaded by their own key; another user's mastery is not shown. This MVP keeps data local and has no cross-device synchronization. Future premium entitlement checks can wrap the entry point without changing the offline engine contract; billing is out of scope.

## Focus lifecycle

Opening a challenge from a running session checkpoints elapsed time as `challenge_active` and pauses the existing server lease. Challenge time is excluded. A local, account/session/snapshot/generation-scoped record checkpoints running time every 15 seconds and synchronously records pause, challenge, recovery-pending, and completion-pending transitions. It uses the existing Expo SQLite-backed local storage adapter; no schema migration or new package is required. On reopening, running, paused, and challenge records become `recovery_pending`; downtime is never counted. The student explicitly recovers, then resumes. The authenticated recovery endpoint validates the owner, active plan snapshot, session membership, and generation. It changes a matching running/paused lease to paused; it refuses cancelled/completed or mismatched leases. If the lease row is absent, explicit recovery can recreate a paused lease for the same authenticated active plan session and generation, never create a different plan session. Recovery and resume are separate transitions. Pending completion stores the exact minute payload so the existing idempotent completion endpoint can safely be retried. Navigating away preserves the local journal; only explicit discard clears it.

The server lease is 90 seconds, renewed every 25 seconds while Focus is active and foregrounded. A matching session can be explicitly recovered after lease expiry, but only while the same session remains in the current active plan snapshot and has not been completed/cancelled. The transition pauses it before a separate resume renews the 90-second lease. A 10-second or 30-second interruption normally leaves a live lease; recovery still returns the local record to an explicit user-confirmed resume. After two or ten minutes, the lease has expired, and recovery pauses then resumes the same valid session. A much longer interruption is recoverable only while that exact session remains active in today's plan; a retired snapshot or changed generation is refused and the local historical minutes remain for review rather than being silently revived or discarded. Completion retries send the persisted exact minute value to the idempotent completion endpoint.

This is an automated recovery design, not yet device-validated process-death recovery. Abrupt termination between 15-second checkpoints can undercount by up to one checkpoint interval. It never counts process downtime or challenge time. Device clock changes do not affect elapsed time because the running interval uses monotonic time; persisted timestamps are diagnostic only. Offline question generation, answer validation, and mastery updates work locally. Offline session recovery cannot be authorized against the backend; the journal remains locally recoverable and the UI offers retry/return, with recovery/synchronization after reconnection only if the same active plan session remains valid. No local completion is fabricated. Android process kill, reboot, and offline recovery need physical-device validation before enforcement is considered.
