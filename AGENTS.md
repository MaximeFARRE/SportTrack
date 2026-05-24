# AGENTS.md — Operating Manual

SportTrack is a multi-user sports training tracker built on **Next.js 16 + Supabase**.

**Stack:**
- Frontend & backend: Next.js 16 (App Router, Server Actions, Route Handlers)
- Auth + DB + RLS: Supabase
- Hosting: Vercel (Root Directory: `web`)
- Crons: Vercel Cron (`web/vercel.json`)

---

## Commands

```bash
cd web
npm install
npm run dev     # http://localhost:3000
npm test        # Vitest
npm run build   # production build
```

No linter or formatter is enforced. Do not add one without being asked.

---

## Architecture

### File layout under `web/`

| Path | Purpose |
|---|---|
| `app/(auth)/` | Login, signup, forgot/reset password pages + Server Actions |
| `app/(app)/` | Authenticated app pages |
| `app/api/` | Route Handlers (Strava callback, webhooks, cron endpoints) |
| `app/auth/callback/` | Supabase OAuth callback |
| `lib/supabase/` | Supabase clients (browser, server, service-role, middleware) |
| `lib/compute/` | Pure math helpers (HR zones, etc.) — no I/O |
| `lib/server/` | Server-only modules with DB or external API access |
| `lib/constants/` | Static data |
| `components/` | React components |
| `proxy.ts` | Next.js 16 middleware/session refresh via Supabase |
| `vercel.json` | Vercel Cron config |

### Database access rules

- Server Components / Server Actions with user context: `createClient()` from `lib/supabase/server.ts` (RLS enforced)
- Cron jobs / webhooks: `createServiceClient()` from `lib/supabase/service.ts` (bypasses RLS)
- Browser components: `createClient()` from `lib/supabase/client.ts`

### Data ownership

Every row in `activities`, `athlete_profiles`, `hr_zones`, `daily_metrics`, `risk_assessments`, `injuries`, `planned_sessions`, and `provider_connections` is owned by a `user_id` (UUID from `auth.users`). RLS policies enforce that users only see their own rows.

---

## Engineering Rules

- Make minimal, targeted changes. Do not refactor adjacent code.
- Do not add abstraction layers unless explicitly requested.
- Pure compute belongs in `lib/compute/`.
- Database-bound or external API logic belongs in `lib/server/`.
- Server-only modules must import from `@/lib/supabase/server` or `@/lib/supabase/service`, never from `@/lib/supabase/client`.
- Follow existing naming conventions exactly.
- Do not add comments that restate what the code already says.

---

## Git Workflow

- Never commit directly to `main`.
- Never create a branch without explicit user approval or request.
- Use branches: `feat/`, `fix/`, `chore/`, `docs/`, `test/`.
- Commit format: `type: short description` (Conventional Commits).
- Make frequent granular commits, with at least one commit per migration-plan sub-phase.
- One concern per commit. Do not mix unrelated changes.
- Before committing: review the diff, check for unintended changes.

---

## Definition of Done

Before marking a task complete:

- [ ] `npm test` passes in `web/`
- [ ] `npm run build` passes in `web/`
- [ ] No `fetch(${FASTAPI_URL}/...)` calls anywhere
- [ ] No untracked files accidentally left behind
- [ ] Diff reviewed — no unrelated changes included
- [ ] If behavior or setup changed: README or relevant doc updated
