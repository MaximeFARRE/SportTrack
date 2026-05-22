# SportTrack

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100%2B-009688?logo=fastapi&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth-3ECF8E?logo=supabase&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)
![Tests](https://img.shields.io/badge/Tests-67%20passing-brightgreen?logo=pytest)

Multi-sport training tracker with overtraining detection, intensity zone analysis, injury tracking, and structured AI export.

---

## Quick start (3 commands)

```bash
# 1. Backend
cp .env.example .env && pip install -r requirements.txt && python run.py

# 2. Frontend
cd web && cp .env.example .env.local && npm install && npm run dev

# 3. Database (Supabase CLI required)
supabase link --project-ref <your-ref> && supabase db push
```

The app is then available at **http://localhost:3000**. Sign up — the `handle_new_user` trigger auto-creates your `profiles` row and the onboarding wizard guides you through first setup.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router) · Tailwind 4 · shadcn/ui (Base UI) |
| Auth & Database | Supabase (Postgres + Auth + Row Level Security) |
| Backend | FastAPI · Python 3.11 |
| Wearables | Strava OAuth2 · Terra API (Garmin, Polar, Apple Health) |
| Compute | CTL / ATL / TSB · ACWR · HR intensity zones (Friel 5-zone) |

---

## Environment variables

### Backend (`/.env`)

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string (Supabase pooler, port 6543) |
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — server-side only, never expose |
| `SUPABASE_JWT_SECRET` | JWT secret from Supabase Dashboard → Settings → API |
| `WEB_BASE_URL` | `http://localhost:3000` in dev, your domain in prod |
| `INTERNAL_SECRET` | Shared secret for Next.js → FastAPI internal calls |
| `ENCRYPTION_KEY` | Fernet key for OAuth tokens at rest |
| `STRAVA_CLIENT_ID` | Strava application client ID |
| `STRAVA_CLIENT_SECRET` | Strava application client secret |
| `TERRA_API_KEY` | Terra API key for wearable integrations |
| `TERRA_DEV_ID` | Terra developer ID |

### Frontend (`/web/.env.local`)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Same as backend `SUPABASE_URL` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `NEXT_PUBLIC_BASE_URL` | `http://localhost:3000` in dev |
| `FASTAPI_URL` | `http://localhost:8000` in dev — server-side only |
| `INTERNAL_SECRET` | Same value as backend — server-side only |
| `STRAVA_CLIENT_ID` | Same Strava client ID |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Browser / Mobile                    │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTPS
┌─────────────────────▼───────────────────────────────────┐
│             Next.js 15 (Vercel)                         │
│  Server Components ──► Supabase (direct, RLS enforced)  │
│  Server Actions     ──► FastAPI (internal secret)       │
│  Client Components  ──► Supabase (anon key, RLS)        │
└──────────────┬──────────────────────────────────────────┘
               │ REST + JWT
┌──────────────▼──────────────────────────────────────────┐
│             FastAPI (Railway)                           │
│  /metrics, /risk, /export, /zones, /injuries            │
│  Scheduler: CTL/ATL/TSB + ACWR + injury suggestions     │
└──────────────┬──────────────────────────────────────────┘
               │ service_role
┌──────────────▼──────────────────────────────────────────┐
│             Supabase (Postgres + Auth)                  │
│  profiles · athlete_profiles · activities               │
│  daily_metrics · hr_zones · injuries · planned_sessions │
└─────────────────────────────────────────────────────────┘
```

See [`docs/architecture.md`](./docs/architecture.md) for the full data model.

---

## Useful commands

```bash
# Backend
python run.py                            # start FastAPI at http://localhost:8000
python -m pytest                         # run all 67 tests
python -m ruff check app/                # lint
python -m mypy app/ --ignore-missing-imports  # type check

# Frontend
cd web
npm run dev                              # start Next.js at http://localhost:3000
npx tsc --noEmit                         # type check
npm run build                            # production build

# Database
supabase db push                         # apply pending migrations
supabase gen types typescript --linked > web/lib/types/database.ts

# Scripts
python -m scripts.sync_recent --athlete-id <id>   # manual Strava sync
python -m scripts.recompute_metrics --athlete-id <id>
```

---

## Project structure

```
SportTrack/
├── app/                    # FastAPI backend
│   ├── main.py             # app entry point, CORS, lifespan
│   ├── config.py           # pydantic settings from .env
│   ├── db.py               # SQLModel engine + session
│   ├── auth/               # Supabase JWT verification
│   ├── models/             # SQLModel table definitions (legacy SQLite models)
│   ├── schemas/            # Pydantic request/response schemas
│   ├── routers/            # HTTP interface (export, injuries, zones, risk…)
│   ├── services/           # Business logic (metrics, overtraining, AI export…)
│   └── scheduler.py        # APScheduler cron jobs (08:00 / 08:15 Paris)
│
├── web/                    # Next.js 15 frontend
│   ├── app/
│   │   ├── (app)/          # authenticated routes (layout with sidebar)
│   │   │   ├── dashboard/
│   │   │   ├── activities/
│   │   │   ├── calendar/
│   │   │   ├── planning/
│   │   │   ├── progression/
│   │   │   ├── injuries/
│   │   │   ├── profile/
│   │   │   ├── connections/
│   │   │   └── onboarding/
│   │   └── (auth)/         # login / signup
│   ├── components/         # shared UI components
│   ├── lib/                # supabase client, types, utils
│   └── public/             # static assets, manifest.json
│
├── supabase/
│   └── migrations/         # SQL migration files (applied via supabase db push)
│
├── tests/                  # pytest test suite (67 tests)
├── scripts/                # one-off CLI scripts
├── .github/workflows/      # CI (ci.yml) + deploy (deploy.yml)
├── requirements.txt
├── ruff.toml
└── pytest.ini
```

---

## CI / CD

| Workflow | Trigger | Jobs |
|---|---|---|
| `ci.yml` | push / PR on `pivot/v2`, `main` | ruff · mypy · pytest · tsc · build |
| `deploy.yml` | push on `main` | Vercel (frontend) · Railway (backend) · Supabase migrations |

Required GitHub secrets for deployment:

| Secret | Used by |
|---|---|
| `VERCEL_TOKEN` | Vercel deploy |
| `RAILWAY_TOKEN` | Railway deploy |
| `RAILWAY_SERVICE_ID` | Railway service identifier |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI auth |
| `SUPABASE_PROJECT_REF` | Supabase project reference |

---

## Contributors

| Name | GitHub |
|---|---|
| Maxime Farré | [@MaximeFARRE](https://github.com/MaximeFARRE) |

---

## License

MIT — see [LICENSE](LICENSE).
