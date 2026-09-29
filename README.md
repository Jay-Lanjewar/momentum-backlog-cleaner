# Momentum

> **The problem isn't that students don't plan. It's that their plans don't survive reality.**

Momentum is an adaptive academic planning app for students.

Instead of creating a timetable once and expecting the student to follow it perfectly, Momentum continuously turns:

**What needs to get done + when you're unavailable + what actually happened**

into a practical study plan.

---

## Android App

Momentum's primary product experience is the **Android app**.

📱 **[Download the latest Android APK](https://expo.dev/accounts/jay-lanjewar/projects/mobile/builds/be687db4-fb43-4206-9214-712c9b174b8c)**

The Android app is built with **React Native + Expo** and includes the complete student loop:

**Backlog → Prioritize → Plan → Focus → Adapt → Track**

The current app has been validated on a real Android device, including onboarding, planning, notifications, Focus, adaptive rescheduling, missed-session handling, and Progress tracking.

---

## What Momentum Does

### 🧠 Adaptive planning

Momentum generates a daily study plan from the student's actual availability and academic workload.

It considers:

- Fixed commitments and unavailable time
- Study availability
- Daily study target
- Task priority
- Task type
- Explicit workload such as questions, exercises, pages, and chapters
- Explicit durations when the student provides them
- Completed and missed work

The core planning pipeline is deterministic and explainable. AI is an enhancement layer rather than the source of truth for scheduling.

### 📝 Natural task entry

Students do not need to learn a special syntax.

They can enter ordinary text such as:

```text
Maths quadratic equations practice 20 questions
Physics motion revise notes by tomorrow
Chemistry atoms and molecules chapter
English worksheet tomorrow
```

Momentum interprets the input and lets the student review and edit what it understood before creating the plan.

### 📅 Fixed Schedule vs Momentum's Plan

Momentum separates the student's commitments from the plan it generates.

**Fixed Schedule**

Things the student says are fixed, such as school, coaching, tuition, sports, or other commitments.

**Momentum's Plan**

Study sessions generated automatically around those constraints.

Generated study sessions are **recommendations, not commitments**. Momentum can move them when reality changes.

### 🎯 Focus

Each planned session can be opened directly in Focus.

Focus supports:

- Session timer
- Pause / finish controls
- Safe exit without falsely recording progress
- Completion tracking
- Adaptive replanning after completion

### 🔄 Reality-aware adaptation

When a student finishes early or misses a session, Momentum can rebuild the remaining plan.

The goal is not to punish the student for breaking a timetable.

The goal is to keep producing the **next useful thing to do**.

### 🔔 Smart notifications

Momentum uses local Android notifications for:

- 10-minute session reminders
- Session-start notifications
- Missed-session notifications
- Plan-change notifications

Missed-session notifications are one-shot reminders rather than repeated alarms.

The app requests notification permission during the first authenticated Today experience, explains why notifications are useful, and provides a Settings path for notification access.

Notification taps can open the relevant Focus session or Today state.

### 📊 Progress

Momentum tracks actual study activity, including:

- Focused time
- Completed sessions
- Daily and weekly activity
- Subject progress
- Streak information

---

## Core Product Loop

```text
Backlog
   ↓
Prioritize
   ↓
Plan
   ↓
Focus
   ↓
Reality changes
   ↓
Adapt
   ↓
Track
```

The central idea is simple:

> **Momentum doesn't make a schedule once. It keeps rebuilding the right plan as the student's day changes.**

---

## Architecture

```text
Momentum/
│
├── mobile/                    # React Native + Expo Android app
│   ├── src/
│   │   ├── app/              # Expo Router screens
│   │   ├── components/       # Mobile UI components
│   │   ├── hooks/            # React hooks and data hooks
│   │   ├── services/         # API, notifications, auth-related services
│   │   └── lib/              # Mobile utilities and parsing
│   └── ...
│
├── backend/                   # Python + FastAPI backend
│   ├── app/
│   │   ├── api/              # API routes
│   │   ├── core/             # Config, DB, timezone, logging
│   │   ├── domain/           # Models and schemas
│   │   ├── estimation/       # Workload-aware duration estimation
│   │   ├── planning_pipeline/# Planning stages
│   │   ├── session_splitter/ # Session splitting
│   │   └── services/         # Planning, dashboard, adaptive logic
│   ├── alembic/              # Database migrations
│   └── ...
│
├── frontend/                  # React + TypeScript + Vite web client
│   ├── src/
│   │   ├── app/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── services/
│   │   ├── store/
│   │   └── lib/
│   └── ...
│
├── database/                  # SQL initialization
├── docker-compose.yml
└── README.md
```

---

## Planning Architecture

The Android app obtains its main planning state through the dashboard pipeline.

```text
Student inputs
      ↓
Backlog + fixed availability
      ↓
Estimation
      ↓
Planning score
      ↓
Session splitting
      ↓
Adaptive rescheduling
      ↓
Deterministic scheduling
      ↓
Active daily plan
      ↓
Today / Plan / Focus / Notifications
```

### Workload-aware estimation

When a student does not provide an explicit duration, Momentum can estimate workload from task text.

Examples include:

- `20 questions`
- `5 exercises`
- `12 pages`
- `3 chapters`

The estimator also recognizes task type and priority where appropriate.

Explicit durations remain authoritative.

Unknown durations are represented as `NULL` so the estimator can run instead of silently assigning a default duration.

### Session splitting

Longer estimates are divided into practical study sessions while preserving the total estimated work.

The splitter is designed to avoid pathological tiny tails such as:

```text
25 min + 5 min
```

and instead prefers balanced sessions.

---

## Adaptive Planning

Momentum maintains an active daily plan snapshot.

When reality changes, it can rebuild the remaining schedule while preserving completed work.

For example:

```text
Original plan

5:00 PM  Physics
5:40 PM  Maths
6:10 PM  English

Student finishes Physics early

↓

Adapted plan

5:25 PM  Maths
5:55 PM  English
```

The generated study sessions are not written into the student's fixed weekly schedule.

This separation is intentional:

**Fixed Schedule = constraints**

**Momentum's Plan = recommendations**

**Today = current action**

---

## Timezone-aware Planning

Planning uses the user's device timezone so that:

- "today" means the student's local calendar day
- weekday schedules resolve using local time
- the current-time planning floor uses the student's local clock
- sessions are not incorrectly generated in the past because the backend runs in UTC

The Android client sends its IANA timezone through the central API layer.

The backend validates the timezone and uses a centralized timezone helper for user-facing planning decisions.

---

## Notification Architecture

Momentum uses local Android notifications rather than a continuously running alarm system.

### Session reminders

A session reminder is scheduled 10 minutes before the planned start.

### Session start

A start notification is scheduled for the session start time and can open the exact Focus session.

### Missed sessions

A planned session that ends without being completed can generate a single missed-session notification after a short grace period.

Example:

> **Missed session**  
> Maths · quadratic equations — You didn't get to this session. Momentum will adjust your plan.

There are no repeated notification loops and no full-screen alarm takeover.

---

## Main Android Screens

### Today

The student's immediate action surface.

It answers:

> **What should I do right now?**

It shows the current or next recommended session, upcoming work, plan state, and relevant adaptation information.

### Work

The student's backlog and academic work.

Tasks can be created, edited, prioritized, scheduled, and completed.

### Plan

The Plan screen intentionally separates:

**Fixed Schedule**

from:

**Momentum's Plan**

The generated sessions are read-only recommendations here and are not converted into fixed commitments.

### Progress

Tracks what actually happened:

- Focused time
- Completed sessions
- Weekly activity
- Subject progress
- Streaks

### Me

Profile and app settings, including notification access.

---

## Authentication

Authentication is handled through **Supabase Auth**.

The Android app supports:

- Account registration
- Email confirmation
- Login
- Password reset
- Authenticated profile loading
- Recovery from temporary `/auth/me` failures

Email confirmation and password-reset links use the Android `momentum://` deep-link scheme.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Android app | React Native, Expo, Expo Router |
| Mobile language | TypeScript |
| Web | React, TypeScript, Vite |
| Backend | Python, FastAPI |
| ORM | SQLAlchemy 2 |
| Database | PostgreSQL / Supabase |
| Authentication | Supabase Auth |
| Data fetching | TanStack React Query |
| State | React state / query state |
| Planning | Deterministic planning pipeline |
| Estimation | Rule-based workload-aware estimator |
| Adaptive planning | Snapshot-based adaptive rescheduling |
| AI | Gemini enhancement layer |
| Notifications | Expo Notifications |
| API deployment | Render |
| Web deployment | Vercel |
| Android builds | Expo Application Services (EAS) |
| Migrations | Alembic |

---

## Security

Momentum's backend database access is separated from client-side access.

Supabase Row Level Security is enabled for the application tables, with ownership policies applied to protected data.

The Android client uses Supabase Auth for authentication and does not directly use unrestricted database table access.

---

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Python 3.12+
- Node.js 20+ for web development
- Node.js 22.13+ for the current Expo mobile environment
- An Android device or emulator for mobile development

### Backend development

```bash
cd backend

python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt

uvicorn app.main:app --reload
```

Backend:

```text
http://localhost:8000
```

API documentation:

```text
http://localhost:8000/docs
```

### Web development

```bash
cd frontend

npm install
npm run dev
```

### Mobile development

```bash
cd mobile

npm install
npx expo start
```

For a standalone Android preview build:

```bash
eas build --platform android --profile preview
```

The preview APK is bundled with its Expo/EAS environment configuration and can run independently of Metro.

---

## Testing

Momentum has automated coverage across the backend and Android application.

### Backend

```bash
cd backend
pytest -q
```

### Mobile

```bash
cd mobile
npm test
```

### TypeScript

```bash
cd mobile
npm run typecheck
```

The test suites cover areas including:

- Authentication and auth recovery
- First-run onboarding
- Natural-language backlog interpretation
- Workload-aware estimation
- Planning and session splitting
- Timezone-aware planning
- Adaptive completion
- Notification permissions
- Notification scheduling
- Missed-session notifications
- Notification deep links
- Focus completion recovery
- Work completion
- Progress recovery
- Plan and schedule rendering

---

## Product Principles

### 1. Planning should require less effort than studying

Students should be able to describe their work naturally rather than learn a scheduling syntax.

### 2. Fixed commitments belong to the student

School, coaching, tuition, sports, and similar commitments constrain the planner.

Momentum's generated sessions remain recommendations.

### 3. Reality is allowed to change the plan

Missing a session is not treated as a reason to throw away the whole day.

Momentum adapts the remaining work.

### 4. The next action should be obvious

The student should spend more time studying and less time deciding what to study.

### 5. Deterministic planning comes first

AI can enhance interpretation and explanations, but core scheduling behavior remains deterministic and testable.

### 6. Notifications should help, not nag

Reminders are contextual, actionable, and limited.

---

## Current Project Status

Momentum has progressed beyond the initial foundation stage and currently includes:

- [x] React Native / Expo Android application
- [x] FastAPI backend
- [x] Supabase authentication
- [x] Email verification and password reset
- [x] Course and backlog management
- [x] Natural-language onboarding task entry
- [x] Editable onboarding task review
- [x] Real availability setup
- [x] Deterministic planning pipeline
- [x] Workload-aware duration estimation
- [x] Balanced session splitting
- [x] Timezone-aware planning
- [x] Adaptive session rescheduling
- [x] Focus sessions
- [x] Safe Focus exit and completion recovery
- [x] Progress analytics
- [x] Fixed Schedule + Momentum's Plan separation
- [x] Session reminder notifications
- [x] Session-start notifications
- [x] Missed-session notifications
- [x] Notification permission UX
- [x] Notification deep links
- [x] Real-device Android validation

---

## Validation Status

The current Android product has been validated on a physical Android device across the main first-run and study loop:

```text
Fresh install
   ↓
Account creation / verification
   ↓
Natural task entry
   ↓
Editable task review
   ↓
Availability setup
   ↓
Generated plan
   ↓
Notification permission
   ↓
Session reminder
   ↓
Session-start notification
   ↓
Exact Focus session
   ↓
Complete or miss
   ↓
Adaptive rescheduling
   ↓
Progress update
   ↓
Missed-session handling
```

The current validation has specifically covered:

- Correct local-time scheduling
- Workload-aware planning for task quantities
- Notification permission on fresh Android installs
- Reminder and start notifications
- Deep-linking into the correct Focus session
- Safe Focus exit
- Completion and early-finish handling
- Adaptive plan changes
- Progress updates
- Missed-session notifications
- No duplicate missed-session notifications

---

## Product Thesis

> **The problem isn't that students don't plan. It's that their plans don't survive reality.**

Momentum is designed around that idea.

It doesn't just make a timetable.

**It keeps rebuilding the right plan as the student's day changes.**
