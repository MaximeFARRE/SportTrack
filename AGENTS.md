# AGENTS.md

## Project

SportTrack is a multi-user sports training tracker.

The app imports activities from Strava, stores them in a local database, computes metrics, and displays personal and group dashboards.

Current stack:

* FastAPI
* SQLModel
* SQLite
* Streamlit
* Plotly

The project is designed to run locally first, then later be deployable as a web app.

---

## Main Architecture Rules

Always keep the project separated into 4 layers:

1. Models / database
2. Services / business logic
3. Routers / API
4. UI / Streamlit pages

Never mix those responsibilities.

Examples:

* database tables -> `app/models/`
* calculations -> `app/services/metrics_service.py`
* Strava sync -> `app/services/strava_service.py`
* API endpoints -> `app/routers/`
* visual interface -> `ui/`

---

## Important Rules

* Never put business logic directly inside Streamlit pages.
* Never call the Strava API directly from the UI.
* Always use services as an intermediate layer.
* Every sports-related entity must be linked to an `athlete_id`.
* Every permission/authentication feature must be linked to a `user_id`.
* Every comparison between multiple users must be linked to a `group_id`.

Good:

```python
get_activities_for_athlete(athlete_id)
compute_weekly_metrics_for_group(group_id)
```

Bad:

```python
get_my_activities()
compute_dashboard()
```

---

## Existing Core Models

Current main models:

* `User`
* `Athlete`
* `Activity`

Future models:

* `Lap`
* `Group`
* `DailyMetric`
* `WeeklyMetric`
* `Goal`

---

## Coding Style

* Keep the code simple and readable.
* Prefer explicit functions over complex abstractions.
* Use small files and clear names.
* Add comments only when useful.
* Avoid unnecessary optimization.
* Write code that is easy to extend later.

Prefer:

```python
def compute_training_load(activity):
    ...
```

Instead of large classes or overly generic patterns.

---

## Development Order

Always build features in this order:

1. Model
2. Service
3. Router
4. UI

Example:

1. create `Activity` model
2. add `activity_service.py`
3. expose `/activities` route
4. display activities in Streamlit

---

## Current Priority

Current development priorities:

1. User creation and authentication
2. Strava OAuth connection
3. Activity import
4. Dashboard metrics
5. Group comparison

Do not implement advanced prediction or AI features before the base flow works correctly.
