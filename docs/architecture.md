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

All user-owned rows use `user_id = auth.users.id`. RLS policies enforce user isolation for normal app traffic.

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

Terra credentials are configured in `/settings` and stored in `terra_config`, with
environment variables kept as a fallback. Terra data destinations are configured in
the Terra dashboard; use `/api/terra/webhook` as the webhook destination URL.

### Garmin

```text
/settings
  -> Garmin Connect credentials
  -> python-garminconnect bridge
  -> provider_connections
  -> daily_metrics
```

Garmin Connect uses the unofficial `python-garminconnect` package. It runs from a
server-side Python script packaged with the Next.js server bundle.

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

## Security

- RLS is enabled on Supabase tables that contain user data.
- Browser code only receives public Supabase configuration.
- `SUPABASE_SERVICE_ROLE_KEY` is used only in server-only modules, Route Handlers, and cron jobs.
- Strava OAuth state is signed with `STRAVA_STATE_SECRET`.
- Vercel cron endpoints require `CRON_SECRET`.
- Terra webhooks are verified with `TERRA_WEBHOOK_SECRET`.
