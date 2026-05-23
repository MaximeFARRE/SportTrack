# Plan d'exécution — Éliminer FastAPI, Vercel Cron, nettoyage repo

**Cible :** stack 100 % Next.js + Supabase, déployé sur Vercel (Root Directory = `web`). Aucun nouveau backend séparé : toute logique remplaçant FastAPI doit rester dans des Route Handlers, Server Actions ou modules server-only Next.js.
**Branche de travail :** utiliser la branche validée par le propriétaire du projet. Ne jamais créer de branche sans accord explicite. Chaque sous-phase = 1 commit minimum, à pusher au fil de l'eau.

---

## Règles transverses pour l'agent qui exécute

1. **Une sous-phase = un commit minimum** au format Conventional Commits. Exemple : A.1, A.2, B.0, B.1, etc. Si une sous-phase ne modifie aucun fichier, le noter dans le commit de la sous-phase suivante.
2. **Ne jamais commit sur `main`.** Travailler uniquement sur une branche validée par le propriétaire du projet, PR vers `pivot/v2`.
3. **Toutes les fonctions de remplacement** vont dans `web/lib/server/` (côté serveur uniquement) ou `web/lib/compute/` (pure math).
4. **Service-role Supabase client** : utiliser `createServiceClient()` depuis `web/lib/supabase/service.ts` (existe déjà) pour les opérations qui doivent bypasser RLS (crons).
5. **Vérification après chaque phase :** lancer `npm run build` dans `web/` doit réussir, et la liste de routes générée doit contenir les nouvelles routes API ajoutées.
6. **Aucune dépendance Python ne doit subsister** à la fin de la Phase H.
7. **Ne pas supprimer FastAPI avant validation production** des remplacements Strava, Terra, export IA et crons. La Phase F est un couperet final, pas une étape de développement.
8. **Migrations Supabase manuelles** : toute requête SQL à exécuter dans Supabase doit être ajoutée ou actualisée dans `docs/supabase_manual_migrations.sql` au moment de la sous-phase concernée. Objectif : à la fin du plan, ce fichier doit pouvoir être copié-collé dans l'éditeur SQL Supabase.

---

## Table de correspondance complète (référence)

| FastAPI actuel | Remplacement TypeScript | Phase |
|---|---|---|
| `POST /internal/regenerate-zones` | `lib/compute/hr-zones.ts` + appel direct depuis `onboarding/actions.ts` et `profile/actions.ts` | A |
| `POST /internal/strava/exchange` | `lib/server/strava/tokens.ts` + appel depuis `app/api/strava/callback/route.ts` | B |
| `POST /strava/sync` | `lib/server/strava/sync.ts` + appel direct depuis `connections/actions.ts` | B |
| `GET /strava/sync/history?days=N` | même fichier `lib/server/strava/sync.ts` + appel direct depuis `connections/actions.ts` | B |
| `POST /internal/strava/webhook-event` | `lib/server/strava/webhook.ts` + traitement inline dans `app/api/strava/webhook/route.ts` | B |
| `GET /terra/widget-session` | `lib/server/terra/widget.ts` + traitement inline dans `app/(app)/connections/terra/connect/route.ts` | C |
| `POST /internal/terra/process-webhook` | `lib/server/terra/webhook.ts` + traitement inline dans `app/api/terra/webhook/route.ts` | C |
| `compute_time_in_zones` (intensity_distribution) | `lib/server/strava/intensity.ts` — appelé après sync, sans promesse fire-and-forget | B |
| Agrégation activités → `daily_metrics` | `lib/server/metrics/daily.ts` appelé après import/sync Strava et par cron léger | B/D |
| `assess_and_persist` (overtraining) | `lib/server/risk/compute.ts` + cron route `app/api/cron/daily-risk/route.ts` | D |
| `get_injury_suggestions` (injury suggestions) | `lib/server/injuries/suggest.ts` + cron route `app/api/cron/daily-injury/route.ts` | D |
| `get_acwr_context` (utilisé par UI blessures) | `lib/server/injuries/acwr.ts` + appel direct depuis Server Action | D |
| `GET /export/ai-summary` | `lib/server/export/ai-summary.ts` + Server Action dans `profile/export-actions.ts` | E |
| Tests Python (`tests/`) | Vitest dans `web/__tests__/server/` pour les fonctions portées | chaque phase |

**Ne PAS porter** (non utilisés par le frontend Next.js actuel, code mort) :
- Les endpoints `metrics` FastAPI complets — pas appelés depuis Next.js
- Les fonctions avancées de `metrics_service.py` / `metrics_compute.py` — ne porter que le calcul minimal de `training_load` et l'agrégation journalière nécessaires à `daily_metrics`, au dashboard, au risque et à l'export IA
- `goal_service.py`, `gamification_service.py` — pas appelés depuis Next.js
- `activity_service.py`, `calendar_service.py` — pas appelés depuis Next.js
- Routers `goals`, `metrics`, `activities`, `me` — pas appelés

---

## Phase A — Zones FC en TypeScript (1-2h)

**Objectif :** éliminer les 2 appels `/internal/regenerate-zones`.

### A.1 — Créer `web/lib/compute/hr-zones.ts`

```typescript
// web/lib/compute/hr-zones.ts
// Pure math — Friel 5-zone model. No DB, no I/O.

export type HrZone = {
  zone_number: number
  zone_name: string
  hr_min: number
  hr_max: number | null
  pct_min: number
  pct_max: number | null
  is_custom: boolean
  color_hex: string
}

const FRIEL_ZONES = [
  { n: 1, name: "Z1 - Récupération", min: 0.00, max: 0.68, color: "#90CAF9" },
  { n: 2, name: "Z2 - Endurance",    min: 0.68, max: 0.83, color: "#4CAF50" },
  { n: 3, name: "Z3 - Tempo",        min: 0.83, max: 0.94, color: "#FFC107" },
  { n: 4, name: "Z4 - Seuil",        min: 0.94, max: 1.05, color: "#FF9800" },
  { n: 5, name: "Z5 - Anaérobie",    min: 1.05, max: null, color: "#F44336" },
] as const

export function computeZonesFromHrMax(hrMax: number): HrZone[] {
  return FRIEL_ZONES.map((z) => ({
    zone_number: z.n,
    zone_name: z.name,
    hr_min: Math.floor(hrMax * z.min),
    hr_max: z.max != null ? Math.floor(hrMax * z.max) : null,
    pct_min: z.min,
    pct_max: z.max,
    is_custom: false,
    color_hex: z.color,
  }))
}

export function classifyHr(bpm: number, hrMax: number): number {
  const pct = bpm / hrMax
  for (const z of FRIEL_ZONES) {
    if (z.max == null || pct < z.max) {
      if (pct >= z.min) return z.n
    }
  }
  return 5
}
```

### A.2 — Créer `web/lib/server/hr-zones.ts` (avec accès DB)

```typescript
// web/lib/server/hr-zones.ts
import { createServiceClient } from "@/lib/supabase/service"
import { computeZonesFromHrMax } from "@/lib/compute/hr-zones"

/**
 * Regenerate auto-computed HR zones for a user. Bypasses RLS (service role).
 * Overwrites existing rows via upsert on (user_id, zone_number).
 */
export async function regenerateHrZonesForUser(userId: string, hrMax: number): Promise<void> {
  if (hrMax < 100 || hrMax > 230) {
    throw new Error("hr_max doit être entre 100 et 230")
  }
  const supabase = createServiceClient()
  const zones = computeZonesFromHrMax(hrMax)
  const rows = zones.map((z) => ({ user_id: userId, ...z }))
  const { error } = await supabase
    .from("hr_zones")
    .upsert(rows, { onConflict: "user_id,zone_number" })
  if (error) throw error
}
```

### A.3 — Remplacer les appels FastAPI

Dans `web/app/(app)/onboarding/actions.ts` : remplacer le bloc `if (hrMax && hrMax >= 100 ...)` (lignes 28-38) par :

```typescript
if (hrMax && hrMax >= 100 && hrMax <= 230) {
  try {
    const { regenerateHrZonesForUser } = await import("@/lib/server/hr-zones")
    await regenerateHrZonesForUser(user.id, hrMax)
  } catch (e) {
    console.error("regenerate zones failed", e)
  }
}
```

Faire **exactement** la même chose dans `web/app/(app)/profile/actions.ts` (lignes 76-82 environ — cherche `regenerate-zones`).

### A.4 — Tests Vitest

Créer `web/__tests__/server/hr-zones.test.ts` :

```typescript
import { describe, it, expect } from "vitest"
import { computeZonesFromHrMax, classifyHr } from "@/lib/compute/hr-zones"

describe("computeZonesFromHrMax", () => {
  it("returns 5 zones with correct boundaries for hr_max=200", () => {
    const zones = computeZonesFromHrMax(200)
    expect(zones).toHaveLength(5)
    expect(zones[0]).toMatchObject({ zone_number: 1, hr_min: 0, hr_max: 136 })
    expect(zones[1]).toMatchObject({ zone_number: 2, hr_min: 136, hr_max: 166 })
    expect(zones[4]).toMatchObject({ zone_number: 5, hr_max: null })
  })
})

describe("classifyHr", () => {
  it.each([
    [80, 200, 1],
    [140, 200, 2],
    [170, 200, 3],
    [190, 200, 4],
    [215, 200, 5],
  ])("bpm=%i hrMax=%i → zone %i", (bpm, hrMax, expected) => {
    expect(classifyHr(bpm, hrMax)).toBe(expected)
  })
})
```

### A.5 — Vérification + commit

```bash
cd web && npm run test -- hr-zones && npm run build
git add web/lib/compute/hr-zones.ts web/lib/server/hr-zones.ts web/app/\(app\)/onboarding/actions.ts web/app/\(app\)/profile/actions.ts web/__tests__/server/hr-zones.test.ts
git commit -m "feat(zones): port HR zone compute from FastAPI to TypeScript"
git push origin "$(git branch --show-current)"
```

---

## Phase B — Strava OAuth + sync + webhook (3-5h)

### B.0 — Secret de state OAuth Strava

Le `state` OAuth Strava doit rester signé côté serveur après suppression de FastAPI. Remplacer `process.env.INTERNAL_SECRET` par `process.env.STRAVA_STATE_SECRET ?? process.env.INTERNAL_SECRET` dans :

- `web/app/(app)/connections/strava/connect/route.ts`
- `web/app/api/strava/callback/route.ts`

Ajouter `STRAVA_STATE_SECRET` dans `web/.env.example` et Vercel. Garder `INTERNAL_SECRET` le temps de la transition si la production l'utilise déjà, puis le supprimer seulement après validation du nouveau secret.

### B.1 — Module token Strava : `web/lib/server/strava/tokens.ts`

```typescript
// web/lib/server/strava/tokens.ts
import { createServiceClient } from "@/lib/supabase/service"

const TOKEN_URL = "https://www.strava.com/oauth/token"
const REFRESH_BUFFER_SEC = 10 * 60

export type StravaTokenPayload = {
  access_token: string
  refresh_token: string
  expires_at: number
  athlete?: { id: number; firstname?: string; lastname?: string; profile?: string }
  scope?: string
}

async function getStravaAppCredentials(): Promise<{ client_id: string; client_secret: string }> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("strava_config")
    .select("client_id, client_secret")
    .eq("id", 1)
    .maybeSingle()
  if (error || !data?.client_id || !data?.client_secret) {
    throw new Error("Strava config absente — la renseigner dans /settings/strava")
  }
  return { client_id: data.client_id, client_secret: data.client_secret }
}

export async function exchangeCodeForToken(code: string): Promise<StravaTokenPayload> {
  const { client_id, client_secret } = await getStravaAppCredentials()
  const body = new URLSearchParams({ client_id, client_secret, code, grant_type: "authorization_code" })
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  if (!res.ok) throw new Error(`Strava exchange failed: ${res.status}`)
  return res.json()
}

export async function refreshAccessToken(refreshToken: string): Promise<StravaTokenPayload> {
  const { client_id, client_secret } = await getStravaAppCredentials()
  const body = new URLSearchParams({ client_id, client_secret, grant_type: "refresh_token", refresh_token: refreshToken })
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  if (!res.ok) throw new Error(`Strava refresh failed: ${res.status}`)
  return res.json()
}

export async function upsertStravaConnection(userId: string, payload: StravaTokenPayload): Promise<void> {
  const supabase = createServiceClient()
  if (!payload.athlete?.id) throw new Error("Strava athlete id manquant")
  const scopes = payload.scope ? payload.scope.split(",").map((s) => s.trim()).filter(Boolean) : []
  const { error } = await supabase.from("provider_connections").upsert(
    {
      user_id: userId,
      provider: "strava",
      provider_user_id: String(payload.athlete.id),
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      token_expires_at: payload.expires_at,
      scopes,
      is_active: true,
    },
    { onConflict: "user_id,provider" },
  )
  if (error) throw error
}

export async function ensureValidStravaToken(userId: string): Promise<string> {
  const supabase = createServiceClient()
  const { data: conn, error } = await supabase
    .from("provider_connections")
    .select("access_token, refresh_token, token_expires_at")
    .eq("user_id", userId)
    .eq("provider", "strava")
    .eq("is_active", true)
    .maybeSingle()
  if (error || !conn?.access_token) throw new Error("Strava non connecté")

  const nowTs = Math.floor(Date.now() / 1000)
  if ((conn.token_expires_at ?? 0) > nowTs + REFRESH_BUFFER_SEC) return conn.access_token

  const refreshed = await refreshAccessToken(conn.refresh_token)
  await supabase
    .from("provider_connections")
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      token_expires_at: refreshed.expires_at,
    })
    .eq("user_id", userId)
    .eq("provider", "strava")
  return refreshed.access_token
}
```

### B.2 — Module sync : `web/lib/server/strava/sync.ts`

```typescript
// web/lib/server/strava/sync.ts
import { createServiceClient } from "@/lib/supabase/service"
import { ensureValidStravaToken } from "./tokens"
import { computeIntensityForActivity } from "./intensity"

const ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities"

type StravaActivity = {
  id: number
  name: string
  sport_type?: string
  type?: string
  start_date: string
  timezone?: string
  elapsed_time?: number
  moving_time?: number
  distance?: number
  total_elevation_gain?: number
  average_speed?: number
  max_speed?: number
  average_heartrate?: number
  max_heartrate?: number
  average_cadence?: number
  average_watts?: number
  calories?: number
}

async function fetchPage(token: string, page: number, perPage: number, after?: number): Promise<StravaActivity[]> {
  const params = new URLSearchParams({ per_page: String(perPage), page: String(page) })
  if (after !== undefined) params.set("after", String(after))
  const res = await fetch(`${ACTIVITIES_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Strava activities fetch failed: ${res.status}`)
  return res.json()
}

function mapActivity(userId: string, a: StravaActivity) {
  return {
    user_id: userId,
    provider: "strava" as const,
    provider_activity_id: String(a.id),
    name: a.name ?? "Activité Strava",
    sport_type: a.sport_type ?? a.type ?? "Unknown",
    start_date: a.start_date,
    timezone: a.timezone ?? null,
    duration_sec: a.elapsed_time ?? 0,
    moving_time_sec: a.moving_time ?? 0,
    distance_m: a.distance ?? 0,
    elevation_gain_m: a.total_elevation_gain ?? 0,
    average_speed: a.average_speed ?? null,
    max_speed: a.max_speed ?? null,
    average_heartrate: a.average_heartrate ?? null,
    max_heartrate: a.max_heartrate ?? null,
    average_cadence: a.average_cadence ?? null,
    average_power: a.average_watts ?? null,
    calories: a.calories ?? null,
  }
}

async function getLatestKnownEpoch(userId: string): Promise<number | undefined> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from("activities")
    .select("start_date")
    .eq("user_id", userId)
    .eq("provider", "strava")
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data?.start_date) return undefined
  return Math.max(0, Math.floor(new Date(data.start_date).getTime() / 1000) - 1)
}

export async function syncRecentStrava(userId: string, opts?: { perPage?: number; maxPages?: number }): Promise<{ imported: number; skipped: number }> {
  const perPage = opts?.perPage ?? 30
  const maxPages = opts?.maxPages ?? 3
  const token = await ensureValidStravaToken(userId)
  const after = await getLatestKnownEpoch(userId)
  return _doSync(userId, token, perPage, maxPages, after)
}

export async function importStravaHistory(userId: string, days: number = 90): Promise<{ imported: number; skipped: number }> {
  const token = await ensureValidStravaToken(userId)
  const after = Math.floor((Date.now() - days * 86_400_000) / 1000)
  return _doSync(userId, token, 100, 10, after)
}

async function _doSync(userId: string, token: string, perPage: number, maxPages: number, after?: number) {
  const supabase = createServiceClient()
  let imported = 0
  let skipped = 0
  const insertedIds: string[] = []

  for (let page = 1; page <= maxPages; page++) {
    const items = await fetchPage(token, page, perPage, after)
    if (items.length === 0) break

    for (const item of items) {
      const row = mapActivity(userId, item)
      const { data, error } = await supabase
        .from("activities")
        .upsert(row, { onConflict: "user_id,provider,provider_activity_id", ignoreDuplicates: false })
        .select("id")
        .maybeSingle()
      if (error) {
        skipped++
        continue
      }
      imported++
      if (data?.id) insertedIds.push(data.id)
    }

    if (items.length < perPage) break
  }

  // Update last_sync_at
  await supabase
    .from("provider_connections")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("provider", "strava")

  // Vercel peut interrompre les promesses non attendues après la réponse.
  // Garder ce travail borné, mais l'attendre.
  for (const actId of insertedIds.slice(0, 10)) {
    try {
      await computeIntensityForActivity(userId, actId)
    } catch (e) {
      console.warn("intensity compute failed", actId, e)
    }
  }

  const { recomputeDailyMetricsForUser } = await import("@/lib/server/metrics/daily")
  await recomputeDailyMetricsForUser(userId, { days: 120 })

  return { imported, skipped }
}
```

### B.3 — Module intensity : `web/lib/server/strava/intensity.ts`

```typescript
// web/lib/server/strava/intensity.ts
import { createServiceClient } from "@/lib/supabase/service"
import { ensureValidStravaToken } from "./tokens"

const STREAMS_URL = "https://www.strava.com/api/v3/activities/{id}/streams"

type ZoneRow = { zone_number: number; zone_name: string; hr_min: number; hr_max: number | null; color_hex: string }
type ZoneJsonEntry = { zone: number; name: string; color: string; sec: number }

export async function computeIntensityForActivity(userId: string, activityId: string): Promise<ZoneJsonEntry[] | null> {
  const supabase = createServiceClient()
  const { data: act } = await supabase
    .from("activities")
    .select("provider, provider_activity_id")
    .eq("id", activityId)
    .eq("user_id", userId)
    .maybeSingle()
  if (!act || act.provider !== "strava" || !act.provider_activity_id) return null

  let token: string
  try { token = await ensureValidStravaToken(userId) } catch { return null }

  const url = STREAMS_URL.replace("{id}", act.provider_activity_id) + "?keys=heartrate&key_by_type=true"
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return null
  const payload = await res.json() as { heartrate?: { data?: number[] } }
  const hr = payload?.heartrate?.data
  if (!Array.isArray(hr) || hr.length === 0) return null

  const { data: zones } = await supabase
    .from("hr_zones")
    .select("zone_number, zone_name, hr_min, hr_max, color_hex")
    .eq("user_id", userId)
    .order("zone_number")
  if (!zones || zones.length === 0) return null

  const sorted = (zones as ZoneRow[]).sort((a, b) => a.zone_number - b.zone_number)
  const counts: Record<number, number> = Object.fromEntries(sorted.map((z) => [z.zone_number, 0]))
  for (const bpm of hr) {
    for (const z of sorted) {
      if ((z.hr_max == null || bpm < z.hr_max) && bpm >= z.hr_min) {
        counts[z.zone_number]++
        break
      }
    }
  }

  const zonesJson: ZoneJsonEntry[] = sorted.map((z) => ({
    zone: z.zone_number,
    name: z.zone_name,
    color: z.color_hex,
    sec: counts[z.zone_number] ?? 0,
  }))

  await supabase
    .from("activities")
    .update({ time_in_zones_json: zonesJson })
    .eq("id", activityId)
    .eq("user_id", userId)

  return zonesJson
}
```

### B.4 — Remplacer le callback OAuth

Réécrire `web/app/api/strava/callback/route.ts` : remplacer le bloc `fastapiUrl` (lignes 41-54) par :

```typescript
try {
  const { exchangeCodeForToken, upsertStravaConnection } = await import("@/lib/server/strava/tokens")
  const token = await exchangeCodeForToken(code)
  await upsertStravaConnection(user_id, token)
} catch (e) {
  console.error("strava callback failed", e)
  return NextResponse.redirect(`${baseUrl}/connections?strava=error`)
}
return NextResponse.redirect(`${baseUrl}/connections?strava=connected`)
```

(Supprimer toute la partie `fetch(`${fastapiUrl}/...)`.)

### B.5 — Réécrire les actions sync

Réécrire **complètement** `web/app/(app)/connections/actions.ts` — remplacer `syncStrava` et `syncStravaHistory` par :

```typescript
"use server"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { syncRecentStrava, importStravaHistory } from "@/lib/server/strava/sync"

export async function syncStrava(): Promise<{ synced?: number; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Non authentifié" }
  try {
    const { imported } = await syncRecentStrava(user.id)
    revalidatePath("/connections")
    return { synced: imported }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Synchronisation échouée" }
  }
}

export async function syncStravaHistory(days: number = 90): Promise<{ synced?: number; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Non authentifié" }
  try {
    const { imported } = await importStravaHistory(user.id, days)
    revalidatePath("/connections")
    return { synced: imported }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Import historique échoué" }
  }
}

// disconnectTerra / disconnectStrava : ne pas toucher (déjà 100 % Supabase)
```

⚠️ **Garder les fonctions `disconnectTerra` et `disconnectStrava` telles quelles** — elles n'appelaient pas FastAPI.

### B.6 — Réécrire le webhook Strava

Lire `web/app/api/strava/webhook/route.ts` en entier puis remplacer le `forwardToFastApi` par un traitement inline qui :
- Vérifie le verify_token (GET handshake) — déjà en place
- Sur POST, parse `aspect_type` / `object_type` / `object_id` / `owner_id`
- Résout `user_id` via `provider_connections.provider_user_id = owner_id`
- Pour `create` et `update`, fetch **l'activité exacte** `/api/v3/activities/{object_id}`, upsert `activities`, calcule les zones si possible, puis recalcule `daily_metrics`
- Pour `delete`, supprimer la ligne `activities` correspondante ou la marquer inactive si un champ dédié est ajouté plus tard, puis recalcule `daily_metrics`
- Renvoyer toujours 200 rapidement. Si le traitement est attendu dans la route, il doit rester petit. Ne pas utiliser `syncRecentStrava(perPage: 5)` comme substitut au webhook exact : cela rate les mises à jour d'activités anciennes.

Créer `syncSingleStravaActivity(userId, stravaActivityId)` dans `web/lib/server/strava/sync.ts`. Cette fonction réutilise `ensureValidStravaToken`, `mapActivity`, `computeIntensityForActivity` et `recomputeDailyMetricsForUser`.

### B.7 — Agrégation daily metrics minimale

Créer `web/lib/server/metrics/daily.ts`. Objectif volontairement limité : remplacer uniquement ce que FastAPI apportait aux écrans Next actuels.

- Query `activities` sur une fenêtre bornée (`days`, défaut 120).
- Grouper par jour local UTC à partir de `start_date`.
- Upsert `daily_metrics` avec `sessions_count`, `duration_sec`, `distance_m`, `elevation_gain_m`, `training_load`.
- Garder les champs Terra existants (`hrv_rmssd`, `sleep_score`, etc.) : ne jamais les écraser avec `null`.
- Calcul `training_load` minimal repris de l'intention existante : durée en minutes, coefficient sport, coefficient intensité si FC disponible, coefficient dénivelé pour run/trail. Pas besoin de porter les dashboards avancés de `metrics_service.py`.

Appeler cette fonction après `syncRecentStrava`, `importStravaHistory`, `syncSingleStravaActivity` et après suppression webhook.

### B.8 — Tests

Créer `web/__tests__/server/strava/sync.test.ts` avec au minimum :
- mock de `fetch` qui renvoie 2 activités
- mock de `createServiceClient` via `vi.mock("@/lib/supabase/service", ...)` retournant un client Supabase fake (`from(...).upsert(...)` / `from(...).update(...)`)
- assertions : `imported === 2`, `last_sync_at` mis à jour

### B.9 — Vérification + commit

```bash
cd web && npm run test -- strava && npm run build
git add web/lib/server/strava/ web/lib/server/metrics/ web/app/api/strava/ web/app/\(app\)/connections/actions.ts web/__tests__/server/strava/
git commit -m "feat(strava): port OAuth, sync, webhook, intensity from FastAPI to TypeScript"
git push origin "$(git branch --show-current)"
```

---

## Phase C — Terra (1-2h)

### C.1 — Widget Terra : `web/lib/server/terra/widget.ts`

```typescript
// web/lib/server/terra/widget.ts
const WIDGET_URL = "https://api.tryterra.co/v2/auth/generateWidgetSession"

export async function generateTerraWidgetSession(opts: { reference_id: string; success_redirect: string; failure_redirect: string }): Promise<{ url: string; session_id: string }> {
  const devId = process.env.TERRA_DEV_ID
  const apiKey = process.env.TERRA_API_KEY
  if (!devId || !apiKey) throw new Error("Terra credentials manquantes")

  const res = await fetch(WIDGET_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "dev-id": devId,
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      reference_id: opts.reference_id,
      providers: "GARMIN,POLAR,FITBIT,COROS,SUUNTO,WAHOO,WITHINGS,OURA",
      auth_success_redirect_url: opts.success_redirect,
      auth_failure_redirect_url: opts.failure_redirect,
      language: "fr",
    }),
  })
  if (!res.ok) throw new Error(`Terra widget failed: ${res.status}`)
  const data = await res.json() as { url: string; session_id: string }
  return data
}
```

### C.2 — Réécrire `web/app/(app)/connections/terra/connect/route.ts`

Remplacer le `fetch(`${fastapiUrl}/terra/widget-session...`)` par un appel direct à `generateTerraWidgetSession()` avec `reference_id = user.id`, `success_redirect = ${baseUrl}/connections?terra=connected`, `failure_redirect = ${baseUrl}/connections?terra=error`.

### C.3 — Webhook Terra : `web/lib/server/terra/webhook.ts`

Le webhook Terra reçoit des événements `auth`, `daily`, `sleep`, `activity`, `body`. Pour supprimer FastAPI sans complexité inutile, traiter réellement le périmètre déjà utile à l'app :
- `auth` → upsert `provider_connections` (user_id depuis `reference_id`, provider="terra", provider_user_id=`user.user_id`)
- `daily` → upsert partiel `daily_metrics` (resting_hr, hrv_rmssd, body_battery_morning, training_readiness, stress, VO2max si présents)
- `sleep` → upsert partiel `daily_metrics` (sleep_score, sleep_duration/deep/rem/light/awake si présents)
- `activity` → optionnel en v1. Si le mapping Terra n'est pas certain, ne pas l'annoncer comme porté ; Strava reste la source primaire d'activités.

Ne pas laisser de TODO/no-op sur `daily` ou `sleep` : ce serait une régression directe par rapport au FastAPI actuel.

```typescript
// web/lib/server/terra/webhook.ts
import { createServiceClient } from "@/lib/supabase/service"

type TerraPayload = {
  type: "auth" | "daily" | "sleep" | "activity" | "body"
  user?: { user_id?: string; reference_id?: string; provider?: string }
  data?: unknown[]
}

export async function processTerraWebhook(payload: TerraPayload): Promise<void> {
  if (!payload?.type || !payload.user) return
  const userId = payload.user.reference_id
  const providerUserId = payload.user.user_id
  if (!userId) return

  const supabase = createServiceClient()

  if (payload.type === "auth") {
    if (!providerUserId) return
    await supabase.from("provider_connections").upsert({
      user_id: userId,
      provider: "terra",
      provider_user_id: providerUserId,
      is_active: true,
    }, { onConflict: "user_id,provider" })
    return
  }

  // Implémenter normalizeTerraDaily / normalizeTerraSleep en fonctions pures
  // et upsert uniquement les champs non-null dans daily_metrics.
}
```

### C.4 — Brancher dans `web/app/api/terra/webhook/route.ts`

Remplacer `forwardToFastApi(body)` par `processTerraWebhook(body)`.

### C.5 — Commit

```bash
git add web/lib/server/terra/ web/app/api/terra/webhook/route.ts web/app/\(app\)/connections/terra/connect/route.ts
git commit -m "feat(terra): port widget session and daily webhook handling"
git push origin "$(git branch --show-current)"
```

---

## Phase D — Crons quotidiens via Vercel Cron (2-3h)

### D.0 — Sécuriser `strava_config` avant suppression FastAPI

Ajouter cette requête dans `docs/supabase_manual_migrations.sql`, car `strava_config` contient `client_secret` :

```sql
alter table public.strava_config enable row level security;

drop policy if exists "service_role_all_strava_config" on public.strava_config;
create policy "service_role_all_strava_config" on public.strava_config
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
```

Cette migration ne crée pas de nouvelle architecture ; elle ferme seulement une surface sensible.

Commit dédié attendu après cette sous-phase :

```bash
git add MIGRATION_PLAN.md docs/supabase_manual_migrations.sql
git commit -m "docs: add Supabase migration checklist for FastAPI removal"
```

### D.1 — Algo de risque : `web/lib/server/risk/compute.ts`

Port littéral de `app/services/overtraining_detection.py` lignes 65-185 :

```typescript
// web/lib/server/risk/compute.ts
import { createServiceClient } from "@/lib/supabase/service"

export type RiskLevel = "none" | "low" | "moderate" | "high" | "critical"

export type RiskAssessment = {
  user_id: string
  assessment_date: string
  score: number
  level: RiskLevel
  reasons: string[]
}

function avg(values: (number | null | undefined)[]): number | null {
  const valid = values.filter((v): v is number => v != null)
  if (valid.length === 0) return null
  return valid.reduce((a, b) => a + b, 0) / valid.length
}

function scoreToLevel(s: number): RiskLevel {
  if (s === 0) return "none"
  if (s <= 2) return "low"
  if (s <= 4) return "moderate"
  if (s <= 7) return "high"
  return "critical"
}

export async function computeRisk(userId: string, targetDate?: Date): Promise<RiskAssessment> {
  const day = targetDate ?? new Date()
  const since = new Date(day.getTime() - 28 * 86_400_000)

  const supabase = createServiceClient()
  const { data: rows } = await supabase
    .from("daily_metrics")
    .select("metric_date, training_load, hrv_rmssd, resting_hr, sleep_score, body_battery_morning")
    .eq("user_id", userId)
    .gte("metric_date", since.toISOString().slice(0, 10))
    .lte("metric_date", day.toISOString().slice(0, 10))
    .order("metric_date")

  if (!rows || rows.length === 0) {
    return { user_id: userId, assessment_date: day.toISOString().slice(0, 10), score: 0, level: "none", reasons: [] }
  }

  const loads = rows.map((r) => r.training_load)
  const hrvs = rows.map((r) => r.hrv_rmssd)
  const rhrs = rows.map((r) => r.resting_hr)
  const baselineHrv = avg(hrvs)
  const baselineHr = avg(rhrs)
  const latest = rows[rows.length - 1]

  const chronic = avg(loads) ?? 0
  const acute = avg(loads.slice(-7)) ?? 0
  const acwr = chronic > 0 ? acute / chronic : 0
  const tsb = chronic - acute

  let raw = 0
  const reasons: string[] = []

  if (acwr > 1.5) { raw += 3; reasons.push(`ACWR à ${acwr.toFixed(2)} — charge aiguë trop élevée (seuil : 1.5)`) }
  if (tsb < -20) { raw += 2; reasons.push(`Balance charge à ${tsb.toFixed(1)} — fatigue accumulée importante`) }
  if (latest.hrv_rmssd != null && baselineHrv != null && baselineHrv > 0 && latest.hrv_rmssd < baselineHrv - 10) {
    raw += 3
    reasons.push(`HRV (${Math.round(latest.hrv_rmssd)} ms) bien en dessous de la baseline 28j (${Math.round(baselineHrv)} ms) — SNA perturbé`)
  }
  if (latest.resting_hr != null && baselineHr != null && latest.resting_hr > baselineHr + 5) {
    raw += 2
    reasons.push(`FC repos (${Math.round(latest.resting_hr)} bpm) au-dessus de la baseline 28j (${Math.round(baselineHr)} bpm)`)
  }
  if (latest.sleep_score != null && latest.sleep_score < 50) {
    raw += 2
    reasons.push(`Score sommeil faible (${Math.round(latest.sleep_score)}/100) — récupération nocturne insuffisante`)
  }
  if (latest.body_battery_morning != null && latest.body_battery_morning < 40) {
    raw += 1
    reasons.push(`Body Battery à ${Math.round(latest.body_battery_morning)} — réserves énergétiques basses`)
  }

  const score = Math.max(0, Math.min(10, Math.round((raw * 10) / 13)))
  return { user_id: userId, assessment_date: day.toISOString().slice(0, 10), score, level: scoreToLevel(score), reasons }
}

export async function persistAssessment(a: RiskAssessment): Promise<void> {
  const supabase = createServiceClient()
  await supabase.from("risk_assessments").upsert({
    user_id: a.user_id,
    assessment_date: a.assessment_date,
    score: a.score,
    level: a.level,
    reasons: a.reasons,
  }, { onConflict: "user_id,assessment_date" })
}

export async function getActiveUserIds(): Promise<string[]> {
  const supabase = createServiceClient()
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  const { data } = await supabase.from("activities").select("user_id").gte("start_date", since)
  const set = new Set<string>()
  for (const r of data ?? []) set.add(r.user_id)
  return Array.from(set)
}
```

### D.2 — Algo suggestions blessures : `web/lib/server/injuries/suggest.ts`

Port littéral de `injury_service.py` lignes 141-204 — même structure (compute + getActiveUserIds qui scanne `activities` au lieu de `daily_metrics`).

### D.3 — ACWR context : `web/lib/server/injuries/acwr.ts`

Port de `get_acwr_context` (lignes 102-136 de injury_service.py). Sera appelé directement depuis la page `/injuries` côté Server Component.

### D.4 — Routes cron Next.js

Créer `web/app/api/cron/daily-risk/route.ts` :

```typescript
import { NextRequest, NextResponse } from "next/server"
import { computeRisk, persistAssessment, getActiveUserIds } from "@/lib/server/risk/compute"

export const maxDuration = 60 // Vercel Hobby = 60s max

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET
  if (!expected || req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const errors: string[] = []
  const ids = await getActiveUserIds()
  for (const uid of ids) {
    try {
      const { recomputeDailyMetricsForUser } = await import("@/lib/server/metrics/daily")
      await recomputeDailyMetricsForUser(uid, { days: 120 })
      const result = await computeRisk(uid)
      await persistAssessment(result)
    } catch (e) {
      errors.push(`${uid}: ${e instanceof Error ? e.message : e}`)
    }
  }
  return NextResponse.json({ ok: errors.length === 0, processed: ids.length, errors })
}
```

Créer `web/app/api/cron/daily-injury/route.ts` sur le même modèle (appelle `getInjurySuggestions` pour chaque user, log les hits ≥ 3).

### D.5 — Brancher Vercel Cron

Créer `web/vercel.json` (à l'intérieur du sous-dossier, sera lu car Root Directory = web) :

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    { "path": "/api/cron/daily-risk",   "schedule": "0 6 * * *" },
    { "path": "/api/cron/daily-injury", "schedule": "15 6 * * *" }
  ]
}
```

**Important :** Vercel Hobby permet **2 crons** maximum, schedule en UTC, fréquence ≥ 1 fois par jour. Vercel injecte automatiquement `Authorization: Bearer ${CRON_SECRET}` si la variable `CRON_SECRET` est définie dans les env vars du projet. Les crons Vercel tournent sur les déploiements de production ; tester manuellement les routes en preview avec `curl` et le header Authorization.

### D.6 — Ajouter `CRON_SECRET` sur Vercel

```bash
# Génère un secret aléatoire
openssl rand -hex 32
# Puis : Vercel Dashboard → Settings → Environment Variables → Add
#   Name: CRON_SECRET
#   Value: <le secret>
#   Environments: Production
```

### D.7 — Brancher l'UI sur ACWR context

Dans `web/app/(app)/injuries/page.tsx` (ou un nouveau composant), remplacer tout appel à `${FASTAPI_URL}/injuries/acwr-context` par un appel direct à `getAcwrContext(user.id, today)`.

### D.8 — Commit

```bash
git add web/lib/server/risk/ web/lib/server/injuries/ web/app/api/cron/ web/vercel.json supabase/migrations/
git commit -m "feat(cron): port risk and injury detection to TypeScript with Vercel Cron"
git push origin "$(git branch --show-current)"
```

---

## Phase E — Export IA (30 min)

### E.1 — `web/lib/server/export/ai-summary.ts`

Port ciblé de `ai_export_service.py`, sans endpoint FastAPI. Garder la compatibilité UI actuelle : `weeks` reste un paramètre et les formats `json` et `markdown` doivent continuer à fonctionner.

```typescript
// web/lib/server/export/ai-summary.ts
import { createServiceClient } from "@/lib/supabase/service"

export async function buildAiSummary(userId: string, weeks: number = 8): Promise<Record<string, unknown>> {
  const supabase = createServiceClient()
  const since = new Date(Date.now() - weeks * 7 * 86_400_000).toISOString()
  const [{ data: profile }, { data: activities }, { data: metrics }, { data: injuries }] = await Promise.all([
    supabase.from("athlete_profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("activities").select("name, sport_type, start_date, duration_sec, distance_m, average_heartrate, time_in_zones_json").eq("user_id", userId).gte("start_date", since).order("start_date", { ascending: false }),
    supabase.from("daily_metrics").select("*").eq("user_id", userId).gte("metric_date", since.slice(0, 10)),
    supabase.from("injuries").select("*").eq("user_id", userId).is("end_date", null),
  ])
  return {
    profile,
    activities: activities ?? [],
    daily_metrics: metrics ?? [],
    active_injuries: injuries ?? [],
    generated_at: new Date().toISOString(),
  }
}

export function aiSummaryToMarkdown(data: Record<string, unknown>): string {
  // Porter la structure utile de to_markdown sans dépendance externe.
  // La sortie doit rester lisible et stable pour copier/coller dans un LLM.
  return ["# Bilan d'entraînement SportTrack", "", "```json", JSON.stringify(data, null, 2), "```"].join("\n")
}
```

### E.2 — Réécrire `web/app/(app)/profile/export-actions.ts`

Remplacer le `fetch(${FASTAPI_URL}/export/ai-summary)` par un appel direct à `buildAiSummary(user.id, weeks)`.

- `fetchExportJson(weeks)` retourne `JSON.stringify(await buildAiSummary(user.id, weeks), null, 2)`.
- `fetchExportMarkdown(weeks)` retourne `aiSummaryToMarkdown(await buildAiSummary(user.id, weeks))`.
- Le composant `ExportCard` ne doit pas changer.

### E.3 — Commit

```bash
git add web/lib/server/export/ web/app/\(app\)/profile/export-actions.ts
git commit -m "feat(export): port AI summary export from FastAPI to TypeScript"
git push origin "$(git branch --show-current)"
```

---

## Phase F — Suppression définitive du code FastAPI

⚠️ **À faire uniquement après que les Phases A à E sont déployées et testées en production.**

### F.1 — Supprimer les fichiers Python

```bash
git rm -r app/ api/ tests/ scripts/sync_recent.py scripts/recompute_metrics.py scripts/init_db.py scripts/import_strava_history.py
git rm requirements.txt run.py pytest.ini .env.example
git rm vercel.json.bak
```

### F.2 — Mettre à jour `.gitignore`

Retirer les lignes liées à Python : `__pycache__/`, `*.pyc`, `*.pyo`, `*.db`, `.venv/`, etc.

### F.3 — Vérifier qu'aucun import résiduel

```bash
grep -rn "FASTAPI_URL\|fastapiUrl" web/ 2>/dev/null
grep -rn "from app\." . 2>/dev/null
grep -rn "import app\." . 2>/dev/null
```
Ces commandes doivent retourner **vide**. Sinon, corriger avant de continuer.

### F.4 — Retirer les env vars obsolètes sur Vercel

Via le Dashboard Vercel → Settings → Environment Variables, supprimer :
- `FASTAPI_URL`
- `DATABASE_URL` (plus utilisée par Next.js, seulement par FastAPI supprimé)
- `INTERNAL_SECRET` seulement si le state Strava a été migré vers `STRAVA_STATE_SECRET` ou une autre stratégie. Sinon le garder.
- `SUPABASE_JWT_SECRET` (plus utilisé)

Garder :
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_BASE_URL`
- `WEB_BASE_URL`
- `CRON_SECRET`
- `STRAVA_STATE_SECRET` si cette variable remplace `INTERNAL_SECRET` pour signer le state OAuth Strava
- `TERRA_DEV_ID`, `TERRA_API_KEY`, `TERRA_WEBHOOK_SECRET`
- `ENCRYPTION_KEY` (si utilisée pour chiffrer tokens, sinon supprimer)

### F.5 — Commit

```bash
git commit -m "chore: remove FastAPI backend — fully replaced by Next.js + Supabase"
git push origin "$(git branch --show-current)"
```

---

## Phase G — Mise à jour de la documentation

### G.1 — Réécrire `AGENTS.md`

Nouveau contenu (le strict nécessaire) :

```markdown
# AGENTS.md — Operating Manual

SportTrack is a multi-user sports training tracker built on **Next.js 16 + Supabase**.

**Stack :**
- Frontend & backend : Next.js 16 (App Router, Server Actions, Route Handlers)
- Auth + DB + RLS : Supabase
- Hébergement : Vercel (Root Directory: `web`)
- Crons : Vercel Cron (config dans `web/vercel.json`)

---

## Commands

```bash
cd web
npm install
npm run dev     # http://localhost:3000
npm test        # Vitest
npm run build   # build production
```

No linter or formatter is enforced. Do not add one without being asked.

---

## Architecture

### File layout (under `web/`)

| Path | Purpose |
|---|---|
| `app/(auth)/` | Login, signup, forgot/reset password pages + Server Actions |
| `app/(app)/` | Authenticated app pages (dashboard, activities, etc.) |
| `app/api/` | Route Handlers (Strava callback, webhooks, cron endpoints) |
| `app/auth/callback/` | Supabase OAuth callback |
| `lib/supabase/` | Supabase clients (browser, server, service-role, middleware) |
| `lib/compute/` | Pure math helpers (HR zones, etc.) — no I/O |
| `lib/server/` | Server-only modules with DB or external API access (Strava, Terra, risk, etc.) |
| `lib/constants/` | Static data (sport catalog, templates, feedback tags) |
| `components/` | React components (UI primitives + feature components) |
| `proxy.ts` | Next.js 16 middleware (session refresh via Supabase) |
| `vercel.json` | Vercel Cron config |

### Database access rules

- **From Server Components / Server Actions** with user context: `createClient()` from `lib/supabase/server.ts` (RLS enforced)
- **From cron jobs / webhooks**: `createServiceClient()` from `lib/supabase/service.ts` (bypasses RLS)
- **From browser components**: `createClient()` from `lib/supabase/client.ts`

### Data ownership

- Every row in `activities`, `athlete_profiles`, `hr_zones`, `daily_metrics`, `risk_assessments`, `injuries`, `planned_sessions`, `provider_connections` is owned by a `user_id` (UUID from `auth.users`).
- RLS policies enforce that users only see their own rows.

---

## Engineering Rules

- Minimal targeted changes. Do not refactor adjacent code.
- Pure compute → `lib/compute/`. Database-bound → `lib/server/`.
- Server-only modules must import from `@/lib/supabase/server` or `@/lib/supabase/service`, never from `@/lib/supabase/client`.
- Match existing naming and patterns.

---

## Git Workflow

- Never commit directly to `main`.
- Branches: `feat/`, `fix/`, `chore/`, `docs/`, `test/`
- Conventional Commits: `type: short description`
- PRs target `pivot/v2`. `pivot/v2` is merged to `main` via PR for production deploys.

---

## Definition of Done

- `npm run build` passes in `web/`
- Vitest tests pass
- No `fetch(${FASTAPI_URL}/...)` calls anywhere
- Diff reviewed for unrelated changes
```

### G.2 — Réécrire `CLAUDE.md` (racine)

```markdown
# CLAUDE.md

Read AGENTS.md first. This file adds Claude-specific behavioral rules on top of it.

---

## Document reading policy

- `AGENTS.md`: always read.
- `FUNCTIONAL_AUDIT.md`, `MIGRATION_PLAN.md`: read on demand only.
- `PIVOT_PLAN.md`: read only the current phase section. Never load the full file.

---

## Behavior

- Work like a focused engineer, not a code generator.
- Smallest correct change.
- State assumptions before starting if a task is ambiguous.
- Never silently skip part of a task.

## Code changes

- Do not modify files outside the task scope.
- Do not add features, guards, or error handling that weren't asked for.
- No TODO comments in committed code.

## Commits

- Conventional Commits.
- Never to `main`.
- Never batch unrelated changes.

## When in doubt

- Read the existing code first.
- Match style and patterns already present.
- Do less and ask, rather than more and guess.
```

### G.3 — Réécrire `README.md`

Squelette minimal :

```markdown
# SportTrack

Multi-user sports training tracker. Next.js 16 + Supabase.

## Quick start

```bash
cd web
cp .env.example .env.local   # remplir avec les clés Supabase
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

## Deployment

- Hosted on Vercel (Root Directory: `web`)
- Branch deploys: `pivot/v2` → preview, `main` → production
- Env vars: see `web/.env.example`
```

### G.4 — Mettre à jour `web/.env.example`

```env
# Public — exposed to the browser
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# Server-only
SUPABASE_SERVICE_ROLE_KEY=
WEB_BASE_URL=http://localhost:3000

# Crons (Vercel injects in production)
CRON_SECRET=
STRAVA_STATE_SECRET=

# Terra (optional)
TERRA_DEV_ID=
TERRA_API_KEY=
TERRA_WEBHOOK_SECRET=

# Monitoring (optional)
NEXT_PUBLIC_SENTRY_DSN=
```

### G.5 — Mettre à jour `web/AGENTS.md`

Le contenu actuel ("This is NOT the Next.js you know") reste valide. Ne pas changer.

### G.6 — Supprimer `PIVOT_PLAN.md` et `DESIGN_NEXT.md` ?

Décision à prendre :
- Soit on les garde comme archive historique (les renommer en `docs/archive/PIVOT_PLAN.md`)
- Soit on les supprime puisque le pivot est terminé

**Recommandation :** les déplacer dans `docs/archive/` pour garder la trace.

```bash
mkdir -p docs/archive
git mv PIVOT_PLAN.md docs/archive/PIVOT_PLAN.md
git mv DESIGN_NEXT.md docs/archive/DESIGN_NEXT.md
git mv AUDIT.md docs/archive/AUDIT.md
```

### G.7 — Commit

```bash
git add AGENTS.md CLAUDE.md README.md web/.env.example docs/
git commit -m "docs: rewrite for Next.js + Supabase stack post-FastAPI removal"
git push origin "$(git branch --show-current)"
```

---

## Phase H — Vérification finale + merge

### H.1 — Checklist avant PR

- [ ] `cd web && npm run build` passe sans erreur
- [ ] `cd web && npm test` passe
- [ ] Aucun fichier Python ne reste : `find . -name "*.py" -not -path "./node_modules/*" -not -path "./.next/*"` → vide
- [ ] Aucune référence à `FASTAPI_URL` : `grep -rn "FASTAPI_URL\|fastapiUrl" . --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git` → vide
- [ ] `web/vercel.json` présent avec les 2 crons
- [ ] Variables `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` et le secret de state Strava (`INTERNAL_SECRET` ou `STRAVA_STATE_SECRET`) configurés sur Vercel

### H.2 — Tests manuels en preview Vercel

Ouvrir la preview URL de la PR, puis :

1. **Signup** : créer un nouveau compte avec un email réel → confirmer mail → login
2. **Onboarding** : remplir hr_max=180 → vérifier dans Supabase que `hr_zones` a 5 lignes pour cet user
3. **Connexion Strava** : `/connections` → "Connecter Strava" → autoriser → revenir à `/connections` avec `?strava=connected`
4. **Sync Strava** : cliquer "Synchroniser" → vérifier que `activities` se remplit
5. **Import historique** : cliquer "Importer 90j" → idem
6. **Dashboard** : vérifier que les activités semaine s'affichent + chart de charge depuis `daily_metrics`
7. **Cron risque** (test manuel) : `curl -H "Authorization: Bearer $CRON_SECRET" https://sport-track-ochre.vercel.app/api/cron/daily-risk` → `{ "ok": true, ... }`
8. **Cron blessures** : idem avec `/api/cron/daily-injury`

### H.3 — Créer la PR

```bash
gh pr create --base pivot/v2 --head <branche-validée> \
  --title "feat: eliminate FastAPI — full Next.js + Supabase stack" \
  --body "$(cat <<'EOF'
## Summary
- Port les fonctions backend encore utilisées par Next.js vers Next.js (Server Actions + Route Handlers)
- Crons quotidiens via Vercel Cron (`/api/cron/daily-risk`, `/api/cron/daily-injury`)
- Suppression complète du code Python (`app/`, `api/`, `requirements.txt`, etc.)
- Documentation mise à jour (AGENTS, CLAUDE, README, .env.example)

## Test plan
- [x] `npm run build` passe
- [x] `npm test` passe
- [ ] Signup + onboarding testés en preview
- [ ] Connexion Strava + sync testés en preview
- [ ] Crons testés manuellement en preview avec curl

🤖 Generated with Claude Code
EOF
)"
```

### H.4 — Après merge `pivot/v2` → `main`

- Vérifier que le déploiement Vercel production passe
- Refaire un signup en prod pour valider end-to-end
- Surveiller les logs Vercel les 24h suivantes (Functions logs + Cron logs)

---

## Annexes

### Annexe 1 — Ordre obligatoire des phases

```
A (zones FC)  ──┐
                ├──→ peut être fait en parallèle (indépendants)
B (Strava) ─────┤
                │
C (Terra) ──────┘
                ↓
D (crons) — dépend de Phase A (zones) pour les calculs
                ↓
E (export IA) — indépendant, peut être fait en parallèle de B/C/D
                ↓
F (suppression FastAPI) — UNIQUEMENT après A→E déployés et testés
                ↓
G (docs) — après F
                ↓
H (vérif finale + merge)
```

### Annexe 2 — Pièges à éviter

1. **Ne pas porter `metrics_compute.py`** (CTL/ATL/TSB) maintenant : le dashboard fait ses queries Supabase directement. Le code Python n'est jamais appelé depuis Next.js. À porter plus tard si on veut pré-calculer.
2. **`createServiceClient` ≠ `createClient`** : le service client bypasse RLS. À utiliser UNIQUEMENT dans `lib/server/` côté serveur, JAMAIS côté browser.
3. **Vercel Hobby = 60s timeout** : `maxDuration = 60` dans chaque route. Si import historique Strava prend plus, batcher en plusieurs appels.
4. **Vercel Cron = UTC** : `0 6 * * *` = 6h UTC = 7h Paris (hiver) ou 8h (été).
5. **`@/lib/server/...` doit être importé dynamiquement** (`await import(...)`) depuis Server Actions si la fonction utilise des secrets serveur, pour éviter qu'ils fuient dans le bundle client. En pratique pour cette migration, comme tout est marqué `"use server"` ou dans des Route Handlers, l'import statique est OK.
6. **Type Database** : `web/lib/types/database.ts` doit refléter le schéma Supabase actuel. Si tu ajoutes/modifies des champs, régénère via `supabase gen types typescript`.

### Annexe 3 — Rollback en cas d'urgence

Si une phase casse la prod après merge :

```bash
# Sur GitHub : revert le merge commit de la PR
gh pr revert <PR_NUMBER>
# ou en local
git revert -m 1 <merge-commit-sha>
git push origin pivot/v2
```

Tant que la branche validée n'est pas supprimée et que `vercel.json.bak` est en backup, on peut tout restaurer.

---

*Plan rédigé pour exécution par un agent de code autonome. Chaque sous-phase est isolée et testable indépendamment.*
