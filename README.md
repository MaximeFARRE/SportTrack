# SportTrack

Multi-user sports training tracker. Next.js 16 + Supabase.

## Quick Start

```bash
cd web
cp .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000.

## Stack

| Layer | Technology |
|---|---|
| Frontend & backend | Next.js 16 (App Router) |
| Auth & DB | Supabase (Postgres + Auth + RLS) |
| Crons | Vercel Cron |
| Wearables | Strava OAuth · Terra API |

## Architecture

See `AGENTS.md`.

## Database

Supabase migrations live in `supabase/migrations/`.

Manual Supabase SQL collected during the FastAPI removal plan lives in `docs/supabase_manual_migrations.sql`.

## Deployment

- Hosted on Vercel (Root Directory: `web`)
- Branch deploys: `pivot/v2` preview, `main` production
- Env vars: see `web/.env.example`
