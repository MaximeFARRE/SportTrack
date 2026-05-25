# Architecture — SportTrack

SportTrack runs as a single Next.js 16 app backed by Supabase.

## System

```text
Browser / Mobile
  |
  | HTTPS
  v
Next.js 16 on Vercel
  |-- Server Components and Server Actions
  |-- Route Handlers for Strava, Terra, Supabase callbacks, and cron jobs
  |-- Pure compute helpers in web/lib/compute
  |-- Server-only modules in web/lib/server
  |
  | Supabase JS SDK
  v
Supabase
  |-- Auth
  |-- Postgres
  |-- Row Level Security
```

## Access Rules

| Caller | Client | Access |
|---|---|---|
| Browser components | `web/lib/supabase/client.ts` | User session, RLS enforced |
| Server Components / Server Actions | `web/lib/supabase/server.ts` | User session, RLS enforced |
| Webhooks and crons | `web/lib/supabase/service.ts` | Service role, server-only |

### Row Level Security (RLS) & Multi-User Sharing

Postgres Row Level Security (RLS) is enabled on all tables holding user data to guarantee isolation and manage structured sharing:

- **Standard Isolation**: Normal user data (activities, heart-rate zones, metrics, injuries) is strictly isolated using the user's authenticated ID (`auth.uid() = user_id`).
- **Group Sharing**: Athletes in the same group share visibility of their profiles and historical activities. This is resolved via the `shares_group(user_id_1, user_id_2)` security helper.
- **Coaching Permissions**: Users holding a `coach` or `admin` role in a group share have read/write access to their athletes' planned sessions and training blocks, and read access to their goals, metrics, and active injuries. This is resolved via the `is_coach_of_athlete(coach_id, athlete_id)` security helper.

---

## Core Tables

| Table | Purpose |
|---|---|
| `profiles` | Auth-linked user profile created after signup |
| `athlete_profiles` | Physiological data and sport preferences |
| `activities` | Imported or manual training sessions |
| `daily_metrics` | Daily training load, readiness, HRV, sleep and recovery metrics |
| `hr_zones` | Personalized heart-rate zones |
| `provider_connections` | Strava and Terra connection records |
| `risk_assessments` | Daily overtraining risk snapshots |
| `injuries` | Injury tracking and active pain zones |
| `planned_sessions` | Planned training sessions |
| `training_blocks` | Periodization blocks of training sessions |
| `training_goals` | User training goals (volume, workouts, race) |
| `groups` | Training groups sharing event targets and schedules |
| `group_members` | Group membership with roles (admin, coach, athlete) |
| `group_planned_sessions` | Shared training sessions planned at group level |
| `group_training_blocks` | Shared training blocks planned at group level |

All user-owned rows use `user_id = auth.users.id`.

---

## Database Triggers & Automations

Postgres database triggers run with `SECURITY DEFINER` privileges to handle automated workflows safely:

- **Profile Auto-Creation**: Triggered `AFTER INSERT ON auth.users` (`handle_new_user`) to automatically insert a user profile row upon signup.
- **Planned Session Matching**: Triggered `AFTER INSERT ON public.activities` (`match_planned_to_actual`) to check if a completed session matches a planned session of the same day and sport, update its status to `'completed'`, and compute the completion score.
- **Group Session Propagation**: Triggered `AFTER INSERT ON public.group_planned_sessions` (`propagate_group_session`) to duplicate and propagate a group session to each athlete's calendar.
- **Group Session Sync**: Triggered `AFTER UPDATE ON public.group_planned_sessions` (`sync_group_session_updates`) to update all matching athlete sessions that are still pending.
- **Group Block Propagation & Sync**: Triggered on `group_training_blocks` to dispatch and update training blocks for all group athletes automatically.

---

## Data Flows

### Strava

```text
/connections/strava/connect
  -> Strava OAuth
  -> /api/strava/callback
  -> provider_connections

/api/strava/webhook or sync action
  -> Strava API
  -> activities
  -> daily_metrics
```

### Terra

```text
/connections/terra/connect
  -> Terra widget session
  -> /api/terra/webhook
  -> provider_connections
  -> daily_metrics
```

Terra credentials are configured in `/settings` and stored in `terra_config`, with environment variables kept as a fallback. Terra data destinations are configured in the Terra dashboard; use `/api/terra/webhook` as the webhook destination URL.

### Garmin

```text
/settings
  -> Garmin Connect credentials
  -> python-garminconnect bridge
  -> provider_connections
  -> daily_metrics
```

Garmin Connect uses the unofficial `python-garminconnect` package. It runs from a server-side Python script packaged with the Next.js server bundle.

### Daily Jobs

```text
Vercel Cron
  -> /api/cron/daily-risk
  -> risk_assessments

Vercel Cron
  -> /api/cron/daily-injury
  -> injury suggestions derived from activities and pain tags
```

### Export IA

```text
Profile export action
  -> web/lib/server/export/ai-summary.ts
  -> athlete profile, metrics, activities, injuries, plan
  -> JSON or Markdown
```

---

## Security

- RLS is enabled on Supabase tables that contain user data.
- Browser code only receives public Supabase configuration.
- `SUPABASE_SERVICE_ROLE_KEY` is used only in server-only modules, Route Handlers, and cron jobs.
- Strava OAuth state is signed with `STRAVA_STATE_SECRET`.
- Vercel cron endpoints require `CRON_SECRET`.
- Terra webhooks are verified with `TERRA_WEBHOOK_SECRET`.
