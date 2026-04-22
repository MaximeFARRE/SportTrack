# AGENTS.md — Operating Manual

SportTrack is a multi-user sports training tracker. It imports Strava activities, computes training metrics, and serves individual and group dashboards through a FastAPI backend and a Streamlit frontend.

---

## Commands

```bash
# Install dependencies
pip install -r requirements.txt

# Initialize the database (first run only)
python -m scripts.init_db

# Start the API (http://127.0.0.1:8000 — docs at /docs)
python run.py

# Start the UI (http://localhost:18501)
python -m streamlit run ui/Home.py --server.port 18501

# Run tests
pytest

# Sync recent Strava activities for one athlete
python -m scripts.sync_recent --athlete-id <id> [--per-page 30]

# Recompute all metrics for one athlete
python -m scripts.recompute_metrics --athlete-id <id> [--start-date YYYY-MM-DD]
```

No linter or formatter is configured. Do not add one without being asked.

---

## Architecture

The project has four strict layers. Never cross them.

| Layer | Location | Responsibility |
|---|---|---|
| Models | `app/models/` | SQLModel table definitions only |
| Services | `app/services/` | All business logic and DB queries |
| Routers | `app/routers/` | HTTP interface, input validation, error codes |
| UI | `ui/` | Presentation and user interaction only |

**Critical rule:** `ui/` must never import from `app.*`. The UI talks to the backend exclusively via `ui/api_client.py` (HTTP).

### Services layout

| File | Purpose |
|---|---|
| `metrics_compute.py` | Pure functions — no `Session`, no DB calls |
| `metrics_service.py` | DB-bound metric queries — imports from `metrics_compute` |
| `_sport_helpers.py` | Shared sport-type utilities used across services |
| `strava_service.py` | Strava OAuth and API calls |
| `sync_service.py` | Orchestrates activity import |
| `auth_service.py` | User creation, login, password hashing |

### Database access

- In routers: use `get_session` (plain generator, compatible with `Depends`)
- In scripts: use `get_db()` (context manager)
- Never call `engine` directly from outside `app/db.py`

### Data ownership rules

- Every activity or metric is owned by an `athlete_id`
- Every permission check is based on a `user_id`
- Every cross-user comparison is scoped to a `group_id`

---

## Models

All models are implemented and active:

`User` · `Athlete` · `Activity` · `Group` · `GroupMember` · `DailyMetric` · `WeeklyMetric` · `Goal`

---

## Engineering Rules

- Make minimal, targeted changes. Do not refactor adjacent code.
- Do not add abstraction layers unless explicitly requested.
- Do not create new files unless the task clearly requires it.
- Do not duplicate logic that already exists in a service.
- Keep pure computation functions (no DB) in `metrics_compute.py`.
- Keep shared sport-type helpers in `_sport_helpers.py`.
- Follow existing naming conventions exactly.
- Do not add comments that restate what the code already says.

---

## Git Workflow

- Never commit directly to `main`.
- Use branches: `feat/`, `fix/`, `chore/`, `docs/`, `test/`
- Commit format: `type: short description` (Conventional Commits)
- One concern per branch. Do not mix unrelated changes.
- Before committing: review the diff, check for unintended changes.

---

## Definition of Done

Before marking a task complete:

- [ ] `pytest` passes with no failures
- [ ] No import errors on `python -m app.main` or the affected module
- [ ] No untracked files accidentally left behind
- [ ] No `__pycache__` or `.db` files staged
- [ ] Diff reviewed — no unrelated changes included
- [ ] If behavior or setup changed: README or relevant doc updated
