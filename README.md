# SportTrack

![Python](https://img.shields.io/badge/Python-3.11%2B-blue?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100%2B-009688?logo=fastapi&logoColor=white)
![Streamlit](https://img.shields.io/badge/Streamlit-1.30%2B-FF4B4B?logo=streamlit&logoColor=white)
![SQLite](https://img.shields.io/badge/Database-SQLite%20%2F%20PostgreSQL-003B57?logo=sqlite&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)
![Tests](https://img.shields.io/badge/Tests-pytest-yellow?logo=pytest&logoColor=white)

A multi-user sports training tracker that imports activities from Strava, computes performance metrics, and displays individual and group dashboards.

---

## 🚧 Pivot V2 in progress (branch `pivot/v2`)

The project is being rebuilt around a modern multi-tenant stack:

| Layer | Stack |
|---|---|
| Frontend | **Next.js 16** (App Router) + Tailwind 4 + shadcn/ui (Base UI) |
| Auth & DB | **Supabase** (Postgres + Auth + Row Level Security) |
| Backend | **FastAPI** (calculs CTL/ATL/TSB, webhooks Terra, coach IA Claude) |
| Wearables | **Terra API** (Garmin, Polar, Fitbit, Apple Health) + Strava |

See [`PIVOT_PLAN.md`](./PIVOT_PLAN.md), [`AUDIT.md`](./AUDIT.md) and
[`DESIGN_NEXT.md`](./DESIGN_NEXT.md) for the full roadmap.

### Setup V2 (development)

**Prerequisites:** Python 3.11+, Node.js 20+, a Supabase project, a Terra API
account, and a Strava API application.

1. **Backend (FastAPI)**

   ```bash
   python -m venv .venv && source .venv/bin/activate    # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   cp .env.example .env                                  # fill in SUPABASE_* and friends
   python run.py                                         # http://localhost:8000
   ```

2. **Frontend (Next.js)**

   ```bash
   cd web
   npm install
   cp .env.example .env.local                            # fill in NEXT_PUBLIC_SUPABASE_*
   npm run dev                                           # http://localhost:3000
   ```

3. **Database (Supabase)**

   ```bash
   npm i -g supabase
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push                                      # applies migrations
   supabase gen types typescript --linked > web/lib/types/database.ts
   ```

Once running, sign up on http://localhost:3000/signup — the
`handle_new_user` trigger auto-creates your row in `public.profiles`.

---

## Legacy (V1, Streamlit) — being phased out

The original Streamlit UI and bcrypt-based auth still live in `ui/` and
`app/routers/auth.py` while the new stack is being built. They will be
removed in Phase 2 of the pivot.

---

## Features

- **Strava integration** — OAuth2 login, activity import, automatic token refresh
- **Individual dashboard** — daily and weekly training load, volume, distance, elevation
- **Training load metrics** — ATL / CTL computation with sport-specific intensity coefficients
- **Progression tracking** — week-over-week comparison and trend visualization
- **Group comparison** — create groups, compare athletes side by side
- **Goal tracking** — define and monitor personal goals per sport type
- **Gamification** — badges and milestones based on activity history
- **REST API** — full FastAPI backend with Swagger UI at `/docs`

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend API | FastAPI, SQLModel, Pydantic |
| Database | SQLite (local) / PostgreSQL (production) |
| Frontend | Streamlit, Plotly |
| Auth | bcrypt, Strava OAuth2 |
| Testing | pytest, FastAPI TestClient |

---

## Installation

**Prerequisites:** Python 3.11+, a [Strava API application](https://www.strava.com/settings/api)

```bash
# Clone the repository
git clone https://github.com/MaximeFARRE/SportTrack.git
cd SportTrack

# Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Edit .env with your Strava credentials and database URL

# Initialize the database
python -m scripts.init_db
```

---

## Usage

**Start the backend API**

```bash
python run.py
```

API available at `http://127.0.0.1:8000`
Interactive docs at `http://127.0.0.1:8000/docs`

**Start the Streamlit frontend** (in a separate terminal)

```bash
streamlit run ui/Home.py
```

UI available at `http://localhost:8501`

**Sync Strava activities manually**

```bash
python -m scripts.sync_recent --athlete-id <id> --per-page 50
```

**Recompute all metrics**

```bash
python -m scripts.recompute_metrics --athlete-id <id>
```

**Run tests**

```bash
pytest
```

---

## Repository structure

```
SportTrack/
├── app/
│   ├── main.py              # FastAPI app entry point
│   ├── config.py            # Settings loaded from .env / Streamlit secrets
│   ├── db.py                # Database engine and session management
│   ├── models/              # SQLModel table definitions
│   │   ├── user.py
│   │   ├── athlete.py
│   │   ├── activity.py
│   │   ├── group.py
│   │   ├── metric_daily.py
│   │   ├── metric_weekly.py
│   │   └── goal.py
│   ├── schemas/             # Pydantic request/response schemas
│   ├── routers/             # FastAPI route handlers
│   │   ├── auth.py
│   │   ├── users.py
│   │   ├── athletes.py
│   │   ├── activities.py
│   │   ├── sync.py
│   │   ├── metrics.py
│   │   ├── groups.py
│   │   └── goals.py
│   └── services/            # Business logic
│       ├── auth_service.py
│       ├── strava_service.py
│       ├── sync_service.py
│       ├── activity_service.py
│       ├── metrics_service.py   # DB-bound metric queries
│       ├── metrics_compute.py   # Pure computation functions
│       ├── _sport_helpers.py    # Shared sport-type utilities
│       ├── group_service.py
│       ├── goal_service.py
│       └── gamification_service.py
│
├── ui/
│   ├── Home.py              # Streamlit app entry point
│   ├── login.py             # Login/register page
│   ├── api_client.py        # HTTP client wrapping the FastAPI backend
│   ├── session.py           # Session state helpers
│   └── pages/
│       ├── 0_Login.py
│       ├── 1_Dashboard.py
│       ├── 4_Progression.py
│       ├── 6_Comparison.py
│       └── 7_Goals.py
│
├── scripts/
│   ├── init_db.py               # Create tables
│   ├── import_strava_history.py # Bulk import past activities
│   ├── sync_recent.py           # Sync recent activities for one athlete
│   └── recompute_metrics.py     # Recompute all metrics from scratch
│
├── tests/                   # pytest test suite
├── data/                    # Local database files (gitignored)
├── .env.example             # Environment variable template
├── .streamlit/
│   └── secrets.example.toml # Streamlit secrets template
├── requirements.txt
├── run.py                   # Start uvicorn server
└── pytest.ini
```

---

## Configuration

Copy `.env.example` to `.env` and fill in your values:

```env
DATABASE_URL=sqlite:///./sporttrack.db
STRAVA_CLIENT_ID=your_client_id
STRAVA_CLIENT_SECRET=your_client_secret
STRAVA_REDIRECT_URI=http://localhost:18501
```

For Streamlit Cloud deployment, use `.streamlit/secrets.example.toml` as a reference.

---

## Limitations

- Strava sync is manual only (no webhooks yet)
- No built-in user invitation flow — users must be created via the registration endpoint
- Designed for small groups (1–20 athletes); not optimized for large-scale deployments
- PostgreSQL support is configured but not production-tested

---

## Screenshots

*Coming soon.*

---

## Contributors

| Name | GitHub |
|---|---|
| Maxime Farré | [@MaximeFARRE](https://github.com/MaximeFARRE) |

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
