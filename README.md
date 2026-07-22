# Momentum

🚀 **Live Demo:** https://momentum-backlog-cleaner.vercel.app/

[Try Momentum](https://momentum-backlog-cleaner.vercel.app/)

AI-powered academic manager that helps students clear their academic backlog through personalized daily study plans.

> *"The student should never wonder what to study next."*

## Architecture

```
Momentum/
├── frontend/          # React + TypeScript + Vite
│   ├── src/
│   │   ├── app/       # Router, providers
│   │   ├── pages/     # Route pages
│   │   ├── components/# UI components (shadcn/ui)
│   │   ├── services/  # API client
│   │   ├── store/     # Zustand stores
│   │   └── lib/       # Utilities
│   └── ...
├── backend/           # Python + FastAPI
│   ├── app/
│   │   ├── api/       # Route handlers
│   │   ├── core/      # Config, DB, logging
│   │   └── domain/    # Models, schemas
│   ├── alembic/       # Database migrations
│   └── ...
├── database/          # SQL initialization
├── docker-compose.yml
└── README.md
```

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Python 3.12+ (for local development)
- Node.js 20+ (for local development)

### Using Docker

```bash
# Copy environment files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# Build and run
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

### Local Development

**Backend:**

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate  # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2, Alembic |
| Database | PostgreSQL 16 |
| Auth | Supabase |
| AI | LangChain (Gemini / OpenAI / Ollama) |
| State | TanStack React Query, Zustand |

## Project Status

**Current milestone:** M1 — Project Foundation

- [x] Monorepo structure
- [x] FastAPI backend with health endpoint
- [x] React frontend with routing
- [x] PostgreSQL configuration
- [x] Docker Compose setup
- [ ] Authentication (Supabase)
- [ ] Course CRUD
- [ ] Backlog management
- [ ] AI plan generation
