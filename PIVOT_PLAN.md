# Plan de pivot SportTrack — Application professionnelle multi-tenant

*Plan complet et exécutable par un agent IA. Référence : AUDIT.md et DESIGN_NEXT.md.*
*Version 2.0 — 2026-05-20 — Stack Next.js + Supabase + FastAPI*

---

## Vision

Application multi-utilisateurs où chaque sportif :
- Crée son compte (email/password ou OAuth Google/Apple)
- Connecte ses propres comptes Strava et Garmin (via Terra)
- Saisit ses propres données physiologiques (FC max, VMA, FTP, poids)
- Voit uniquement ses propres données (isolation stricte via Row Level Security)
- Bénéficie d'une UI moderne, responsive, professionnelle

---

## Architecture cible

```
┌─────────────────────────────────────────────────────────────┐
│                       Utilisateur                            │
│                  (Web + Mobile responsive)                   │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Next.js 15 (App Router)                    │
│  ┌────────────────────────────────────────────────────┐    │
│  │  • Pages React Server Components                    │    │
│  │  • Tailwind CSS + shadcn/ui                         │    │
│  │  • Server Actions pour mutations légères            │    │
│  │  • Auth client Supabase (cookies)                   │    │
│  └────────────────────────────────────────────────────┘    │
│                  Déployé sur Vercel                          │
└────────┬───────────────────────────────┬────────────────────┘
         │                               │
         │ Requêtes DB                   │ Calculs lourds
         │ (RLS automatique)             │ (CTL/ATL, AI, Terra)
         ▼                               ▼
┌──────────────────────┐      ┌─────────────────────────────┐
│  Supabase            │      │  FastAPI (Python)            │
│  ┌────────────────┐  │      │  • CTL/ATL/TSB compute       │
│  │ Postgres + RLS │  │      │  • Coach IA (Anthropic)      │
│  │ Auth           │  │◄────►│  • Webhooks Terra/Strava     │
│  │ Storage        │  │ JWT  │  • Sync background jobs      │
│  │ Realtime       │  │      │  • Export IA                 │
│  └────────────────┘  │      │  Déployé sur Railway/Fly     │
└──────────────────────┘      └─────────────────────────────┘
         ▲                               ▲
         │                               │
         │ Postgres direct               │ HTTP webhooks
         │                               │
         └───────────┬───────────────────┘
                     │
            ┌────────┴────────┐
            │                 │
            ▼                 ▼
        ┌────────┐       ┌────────┐
        │ Strava │       │ Terra  │
        │  API   │       │  API   │
        └────────┘       └────────┘
                              │
                              ▼
                         ┌────────┐
                         │ Garmin │
                         │ Polar  │
                         │ Fitbit │
                         └────────┘
```

### Justification des choix

| Composant | Choix | Pourquoi |
|---|---|---|
| **Auth** | Supabase Auth | Gratuit, gère email/password + OAuth Google/Apple, JWT, reset password, email verification — tout en clé en main |
| **Database** | Supabase Postgres | Gratuit jusqu'à 500MB, RLS native pour multi-tenant, types TS auto-générés, dashboard inclus |
| **Frontend** | Next.js 15 + Tailwind + shadcn/ui | Stack moderne, mobile responsive natif, SSR/SSG, écosystème massif |
| **Backend lourd** | FastAPI (conservé) | Les calculs CTL/ATL/TSB existants sont solides et bien testés — pas de raison de les réécrire en TS |
| **Hébergement frontend** | Vercel | Free tier généreux, déploiement auto, optimisé pour Next.js |
| **Hébergement backend** | Railway ou Fly.io | Free tier, déploiement Docker simple |

### Multi-tenancy via Row Level Security (RLS)

Chaque table contient une colonne `user_id` (UUID Supabase Auth). Des **policies SQL** garantissent qu'un utilisateur ne peut lire/écrire que ses propres lignes :

```sql
CREATE POLICY "users_select_own_activities" ON activities
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_activities" ON activities
  FOR INSERT WITH CHECK (auth.uid() = user_id);
```

**Effet :** impossible pour un utilisateur de voir les données d'un autre, même en cas de bug applicatif. La sécurité est au niveau base de données.

---

## Règles transverses (à respecter à chaque phase)

### Frontend (Next.js)
- **App Router** uniquement (pas de Pages Router)
- **React Server Components par défaut**, `"use client"` uniquement quand nécessaire
- **Server Actions** pour les mutations légères (forms)
- **Route Handlers** (`app/api/.../route.ts`) pour les endpoints publics (webhooks)
- TypeScript strict (`strict: true` dans `tsconfig.json`)
- Tailwind CSS pour le styling (pas de CSS modules, pas de styled-components)
- Composants UI : **shadcn/ui** (à copier-coller, pas une lib npm)
- Charts : **Recharts** ou **Tremor** (intégration shadcn)
- Forms : **react-hook-form + zod** pour validation
- Data fetching : **Server Components** pour le SSR, **TanStack Query** pour le client si nécessaire
- Mobile-first : tester chaque page sur 375px de large

### Backend (FastAPI conservé)
- Vérification du JWT Supabase à chaque endpoint protégé (middleware)
- Pas de stockage de session côté FastAPI — stateless
- Pas de duplication de logique métier déjà dans Supabase (les RLS suffisent pour les CRUD simples)
- FastAPI sert uniquement les **calculs lourds** : metrics compute, AI coach, webhook processing, exports

### Base de données (Supabase)
- Migrations SQL versionnées dans `supabase/migrations/`
- RLS activée sur **toutes** les tables contenant des données utilisateur
- Indexes sur les colonnes filtrées (`user_id`, `start_date`, `metric_date`)
- Types TypeScript auto-générés via `supabase gen types typescript`
- Pour les opérations service-side : utiliser la `service_role_key` côté FastAPI uniquement

### Commits
- Conventional Commits : `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`
- Granularité maximale (3-4 fichiers max par commit)
- Commit après chaque : migration SQL, composant UI, route API, service métier, jeu de tests
- Branches séparées par phase, merge dans `pivot/v2`, merge final dans `main`

### Tests
- **Backend FastAPI** : `pytest` pour les services métier
- **Frontend** : `Vitest` pour les utilitaires, `Playwright` pour E2E sur les flows critiques
- **DB** : tests des policies RLS via Supabase CLI

### Sécurité
- Tokens OAuth (Strava, Terra) **chiffrés** dans la DB via `pgcrypto` ou stockés via Supabase Vault
- Aucun token côté client — uniquement côté FastAPI service_role
- HMAC signature vérifiée sur tous les webhooks
- Rate limiting via Vercel Edge Middleware sur les endpoints sensibles

---

## Vue d'ensemble des phases

| Phase | Nom | Durée | Stack |
|---|---|---|---|
| 0 | Infrastructure : Supabase + Next.js + auth | 2 jours | Setup |
| 1 | Profil athlète + zones FC + RLS | 1 jour | Next + Supabase |
| 2 | Migration des données depuis SQLite existant | 1 jour | Script Python |
| 3 | Intégration Strava (multi-tenant) | 1.5 jour | Next + FastAPI |
| 4 | Intégration Terra API (Garmin/Polar/Fitbit) | 2 jours | Next + FastAPI |
| 5 | Ressenti et notes post-séance | 1 jour | Next |
| 6 | Saisie manuelle d'activité multi-sport | 1 jour | Next |
| 7 | Dashboard moderne et responsive | 2 jours | Next |
| 8 | Vue calendrier mensuelle | 1 jour | Next |
| 9 | Planification d'entraînement | 2 jours | Next + FastAPI |
| 10 | Détection multivariée surentraînement | 1 jour | FastAPI |
| 11 | Suivi des blessures | 1 jour | Next + FastAPI |
| 12 | Zones d'intensité par activité | 1 jour | FastAPI |
| 13 | Export IA structuré | 1 jour | FastAPI |
| 14 | Coach IA Claude intégré | 2 jours | Next + FastAPI |
| 15 | Polish UX, accessibilité, perf | 2 jours | Next |
| 16 | Tests, doc, déploiement production | 2 jours | Tous |

**Total estimé : 4 semaines de travail effectif** pour une app production-ready.

---

## Phase 0 — Infrastructure : Supabase + Next.js + auth

**Objectif :** Mettre en place toute l'infrastructure cible, prête à recevoir les fonctionnalités.

### 0.1 Création du projet Supabase
- Créer un compte sur https://supabase.com
- Créer un projet `sporttrack` (région : Frankfurt ou Paris pour la latence FR)
- Noter :
  - `SUPABASE_URL` (ex: `https://xxxxx.supabase.co`)
  - `SUPABASE_ANON_KEY` (publique, frontend)
  - `SUPABASE_SERVICE_ROLE_KEY` (secrète, backend uniquement)
  - `DATABASE_URL` (connexion Postgres directe, pour FastAPI)
- Installer la CLI : `npm install -g supabase`
- Initialiser le dossier de migrations : `supabase init` dans le repo

### 0.2 Inscription Terra API
- Créer un compte sur https://tryterra.co
- Récupérer `TERRA_DEV_ID`, `TERRA_API_KEY`, `TERRA_WEBHOOK_SECRET`
- Activer les providers : Garmin, Polar, Fitbit, Apple Health

### 0.3 Création du projet Next.js

À la racine du repo, créer un dossier `web/` :

```bash
npx create-next-app@latest web --typescript --tailwind --app --no-src-dir --import-alias "@/*"
cd web
npx shadcn@latest init
npx shadcn@latest add button card input label select dialog toast badge tabs avatar dropdown-menu form sheet calendar
npm install @supabase/supabase-js @supabase/ssr
npm install zod react-hook-form @hookform/resolvers
npm install recharts date-fns lucide-react
npm install -D @types/node
```

Structure cible :
```
web/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   ├── forgot-password/page.tsx
│   │   └── layout.tsx
│   ├── (app)/
│   │   ├── dashboard/page.tsx
│   │   ├── calendar/page.tsx
│   │   ├── activities/page.tsx
│   │   ├── planning/page.tsx
│   │   ├── progression/page.tsx
│   │   ├── coach/page.tsx
│   │   ├── connections/page.tsx
│   │   ├── profile/page.tsx
│   │   └── layout.tsx
│   ├── api/
│   │   └── (route handlers pour webhooks et endpoints publics)
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ui/                 (shadcn components)
│   ├── activity/
│   ├── dashboard/
│   ├── nav/
│   └── shared/
├── lib/
│   ├── supabase/
│   │   ├── client.ts       (browser client)
│   │   ├── server.ts       (server client + service role)
│   │   └── middleware.ts   (session refresh)
│   ├── api/                (wrapper FastAPI client)
│   ├── types/              (types DB auto-générés + métier)
│   └── utils.ts
├── middleware.ts
├── .env.local
└── package.json
```

### 0.4 Configuration Supabase clients

**`web/lib/supabase/client.ts`** (browser) :
```typescript
import { createBrowserClient } from "@supabase/ssr"
import type { Database } from "@/lib/types/database"

export const createClient = () =>
  createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
```

**`web/lib/supabase/server.ts`** (Server Components) :
```typescript
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export const createClient = async () => {
  const cookieStore = await cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookies) => cookies.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options))
      }
    }
  )
}
```

**`web/middleware.ts`** : refresh automatique de la session sur chaque requête.

### 0.5 Pages Auth (Supabase Auth UI)

Créer les pages :
- `/login` — email + password + bouton Google OAuth
- `/signup` — création de compte avec email verification
- `/forgot-password` — reset par email
- `/auth/callback` — handler OAuth callback

Configurer dans Supabase Dashboard :
- Email templates (français)
- Providers OAuth : Google (obligatoire), Apple (optionnel)
- URL de redirection : `https://sporttrack.app/auth/callback`

### 0.6 Schéma DB initial (migration 1)

Créer `supabase/migrations/20260520000000_initial_schema.sql` :

```sql
-- Profile lié à auth.users
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text unique not null,
  display_name text,
  avatar_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- RLS
alter table public.profiles enable row level security;

create policy "users_select_own_profile" on profiles
  for select using (auth.uid() = id);

create policy "users_update_own_profile" on profiles
  for update using (auth.uid() = id);

-- Trigger : créer un profile automatiquement à la création d'un user
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Trigger updated_at générique
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
```

Appliquer : `supabase db push`.

### 0.7 Refactor FastAPI : auth via JWT Supabase

Modifier `app/main.py` et créer `app/auth/supabase_auth.py` :
- Middleware qui valide le JWT Supabase à chaque requête protégée
- Utilise la `JWT_SECRET` du projet Supabase pour vérifier la signature
- Injecte `current_user_id: UUID` dans les routes via Dependency Injection

```python
from fastapi import Depends, HTTPException
from jose import jwt
from uuid import UUID

async def get_current_user_id(authorization: str = Header(...)) -> UUID:
    token = authorization.replace("Bearer ", "")
    try:
        payload = jwt.decode(token, settings.SUPABASE_JWT_SECRET, algorithms=["HS256"], audience="authenticated")
        return UUID(payload["sub"])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
```

Toutes les routes deviennent :
```python
@router.get("/activities")
async def list_activities(user_id: UUID = Depends(get_current_user_id)):
    ...
```

### 0.8 Configuration FastAPI pour Supabase Postgres
- `app/db.py` : pointer vers `DATABASE_URL` Supabase (utilise la connection pooling avec port 6543)
- Supprimer le système d'auth bcrypt local (remplacé par Supabase)
- Supprimer les routes `/auth/register` et `/auth/login` (Supabase gère)

### 0.9 Layout principal et navigation

Créer `web/app/(app)/layout.tsx` :

```typescript
// Sidebar gauche desktop, drawer mobile
// Nav: Dashboard, Calendar, Activities, Planning, Progression, Coach IA, Connections, Profile
// Avatar + déconnexion en haut à droite
```

Utiliser `Sheet` (shadcn) pour le menu mobile, `Sidebar` pour desktop.

### 0.10 Page d'accueil publique

`web/app/page.tsx` — landing page basique :
- Hero avec proposition de valeur
- 3 features clés (multi-source, coach IA, prévention blessure)
- CTA "Se connecter" / "Créer un compte"

**Critères d'acceptation Phase 0 :**
- [ ] Projet Supabase fonctionnel avec auth
- [ ] Compte Terra API actif
- [ ] Projet Next.js initialisé avec shadcn/ui
- [ ] Inscription + connexion + reset password fonctionnels
- [ ] OAuth Google fonctionnel
- [ ] Profile auto-créé à l'inscription via trigger
- [ ] FastAPI accepte les JWT Supabase
- [ ] Layout principal + nav responsive
- [ ] Variables d'env documentées dans `.env.example`

**Commits attendus :**
- `chore: initialize supabase project and migrations`
- `chore: scaffold next.js 15 app with tailwind and shadcn`
- `feat(auth): supabase auth pages (login, signup, forgot)`
- `feat(db): initial schema with profiles table and RLS`
- `refactor(api): replace bcrypt auth with supabase jwt validation`
- `feat(ui): main app layout with responsive navigation`

---

## Phase 1 — Profil athlète + zones FC + RLS

**Objectif :** Profil sportif complet avec valeurs physiologiques, zones FC auto-calculées, isolation multi-tenant.

### 1.1 Migration SQL

`supabase/migrations/20260521000000_athlete_profile.sql` :

```sql
create table public.athlete_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references auth.users on delete cascade,
  first_name text,
  last_name text,
  birth_date date,
  gender text check (gender in ('male', 'female', 'other', 'prefer_not_to_say')),
  height_cm numeric(5,1),
  weight_kg numeric(5,1),
  hr_max int check (hr_max between 100 and 230),
  hr_rest int check (hr_rest between 30 and 100),
  vma_kmh numeric(4,1),
  ftp_watts int,
  css_pace_per_100m text,
  primary_sport text,
  practiced_sports jsonb default '[]'::jsonb,
  training_years int,
  weekly_target_hours numeric(4,1),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.athlete_profiles enable row level security;

create policy "users_select_own_athlete_profile" on athlete_profiles
  for select using (auth.uid() = user_id);
create policy "users_insert_own_athlete_profile" on athlete_profiles
  for insert with check (auth.uid() = user_id);
create policy "users_update_own_athlete_profile" on athlete_profiles
  for update using (auth.uid() = user_id);
create policy "users_delete_own_athlete_profile" on athlete_profiles
  for delete using (auth.uid() = user_id);

create trigger athlete_profiles_set_updated_at
  before update on athlete_profiles
  for each row execute function public.set_updated_at();

-- Zones FC
create table public.hr_zones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  zone_number int not null check (zone_number between 1 and 5),
  zone_name text not null,
  hr_min int not null,
  hr_max int,
  pct_min numeric(3,2) not null,
  pct_max numeric(3,2),
  is_custom boolean default false not null,
  color_hex text not null,
  updated_at timestamptz default now() not null,
  unique (user_id, zone_number)
);

alter table public.hr_zones enable row level security;

create policy "users_all_own_hr_zones" on hr_zones
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger hr_zones_set_updated_at
  before update on hr_zones
  for each row execute function public.set_updated_at();
```

### 1.2 Types TypeScript auto-générés
```bash
supabase gen types typescript --project-id <project-id> > web/lib/types/database.ts
```

### 1.3 Server Action : upsert profil

`web/app/(app)/profile/actions.ts` :
```typescript
"use server"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"

const profileSchema = z.object({
  first_name: z.string().min(1).max(50),
  last_name: z.string().min(1).max(50),
  birth_date: z.string().optional(),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
  height_cm: z.coerce.number().min(100).max(250).optional(),
  weight_kg: z.coerce.number().min(30).max(200).optional(),
  hr_max: z.coerce.number().min(120).max(220).optional(),
  hr_rest: z.coerce.number().min(30).max(90).optional(),
  vma_kmh: z.coerce.number().min(5).max(25).optional(),
  ftp_watts: z.coerce.number().min(50).max(600).optional(),
  primary_sport: z.string().optional(),
  practiced_sports: z.array(z.string()).default([]),
  training_years: z.coerce.number().min(0).max(80).optional(),
  weekly_target_hours: z.coerce.number().min(0).max(50).optional(),
})

export async function upsertProfile(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Non authentifié" }
  
  const parsed = profileSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.message }
  
  const { error } = await supabase
    .from("athlete_profiles")
    .upsert({ user_id: user.id, ...parsed.data })
  
  if (error) return { error: error.message }
  
  // Trigger côté FastAPI pour régénérer les zones
  await fetch(`${process.env.FASTAPI_URL}/internal/regenerate-zones`, {
    method: "POST",
    headers: { Authorization: `Bearer ${user.id}` },
    body: JSON.stringify({ hr_max: parsed.data.hr_max })
  })
  
  return { success: true }
}
```

### 1.4 Service FastAPI : zones FC

`app/services/hr_zones_service.py` :
- `compute_zones_from_hr_max(hr_max: int) -> list[ZoneCompute]` — pure
- `regenerate_zones_for_user(user_id: UUID, hr_max: int)` — upsert via supabase-py (utilise service_role)
- Route interne `/internal/regenerate-zones` (authentifiée par secret partagé entre Next et FastAPI)

Constantes :
```python
FRIEL_ZONES = [
    (1, "Z1 - Récupération", 0.00, 0.68, "#90CAF9"),
    (2, "Z2 - Endurance",    0.68, 0.83, "#4CAF50"),
    (3, "Z3 - Tempo",        0.83, 0.94, "#FFC107"),
    (4, "Z4 - Seuil",        0.94, 1.05, "#FF9800"),
    (5, "Z5 - Anaérobie",    1.05, None, "#F44336"),
]
```

### 1.5 Page Profil (Next.js)

`web/app/(app)/profile/page.tsx` (Server Component qui fetch les data) + `profile-form.tsx` (Client Component).

**Layout responsive :**

```
Desktop (≥768px) : 2 colonnes
Mobile : 1 colonne empilée

┌─────────────────────────────────────────────────┐
│  👤 Mon profil sportif                           │
├─────────────────────────────────────────────────┤
│                                                  │
│  ┌─── Informations ───┐  ┌─── Physiologie ───┐ │
│  │ Prénom             │  │ FC max     [187]  │ │
│  │ Nom                │  │ FC repos   [52]   │ │
│  │ Date naissance     │  │ VMA km/h   [16.5] │ │
│  │ Genre              │  │ FTP watts  [285]  │ │
│  │ Taille / Poids     │  │                    │ │
│  └────────────────────┘  └────────────────────┘ │
│                                                  │
│  ┌─── Pratique sportive ──────────────────────┐ │
│  │ Sport principal  [Course à pied ▼]          │ │
│  │ Autres sports   [Vélo✓] [Natation✓]         │ │
│  │ Années d'expérience  [5]                    │ │
│  │ Volume hebdo cible   [6h]                   │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│  ┌─── Mes zones FC ───────────────────────────┐ │
│  │ Calculées depuis votre FC max : 187 bpm     │ │
│  │                                              │ │
│  │ ▓ Z1 Récupération    < 127 bpm    [auto]  ✏️│ │
│  │ ▓ Z2 Endurance     127-155 bpm    [auto]  ✏️│ │
│  │ ▓ Z3 Tempo         155-176 bpm    [auto]  ✏️│ │
│  │ ▓ Z4 Seuil         176-196 bpm    [auto]  ✏️│ │
│  │ ▓ Z5 Anaérobie       > 196 bpm    [auto]  ✏️│ │
│  │                                              │ │
│  │ [ 🔄 Réinitialiser depuis la FC max ]       │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│           [ Annuler ]    [ Enregistrer ]         │
└─────────────────────────────────────────────────┘
```

**Composants shadcn utilisés :** `Card`, `Input`, `Label`, `Select`, `Button`, `Badge`, `Form`.

### 1.6 Tests
- `web/__tests__/profile.test.tsx` : validation Zod, render form
- `tests/test_hr_zones.py` : calcul Friel, régénération, classification bpm
- Test RLS : créer 2 users, vérifier qu'un user ne voit pas le profil de l'autre

**Critères d'acceptation Phase 1 :**
- [ ] Table `athlete_profiles` et `hr_zones` créées avec RLS
- [ ] Page Profil responsive (testée 375px)
- [ ] Zones FC régénérées automatiquement à chaque update du FC max
- [ ] Modification manuelle des zones fonctionnelle
- [ ] Test RLS validé : isolation parfaite entre utilisateurs

---

## Phase 2 — Migration des données depuis SQLite existant

**Objectif :** Récupérer les données existantes (si pertinentes) et les importer dans Supabase.

### 2.1 Script de migration

`scripts/migrate_to_supabase.py` :
- Lit l'ancienne DB SQLite locale
- Pour chaque ancien user :
  - Demande un email pour créer l'auth.users via Supabase Admin API
  - Mappe `user.id` → `auth.user.id`
- Migre les `athletes`, `activities`, `daily_metrics`, `weekly_metrics`, `goals`, `groups`
- Logs détaillés et idempotent (skip si déjà migré)

### 2.2 Si pas d'utilisateurs réels en prod
Si l'app n'a pas encore d'utilisateurs réels (ce qui est probable étant donné le statut "prototype"), **skip cette phase** et nettoyer.

### 2.3 Suppression de l'ancien code obsolète
- Supprimer `app/auth/` (remplacé par Supabase)
- Supprimer `ui/` (remplacé par `web/`)
- Supprimer les modèles `User`, `Group`, `GroupMember` (à reconstruire dans Supabase si besoin)
- Garder les services `metrics_compute`, `strava_service`, `sync_service`, `goal_service`

**Critères d'acceptation Phase 2 :**
- [ ] Décision migration vs reset documentée
- [ ] Si migration : script exécutable et testé
- [ ] Si reset : code obsolète supprimé, repo propre

---

## Phase 3 — Intégration Strava multi-tenant

**Objectif :** Chaque utilisateur connecte SON propre compte Strava.

### 3.1 Migration SQL

```sql
create table public.provider_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  provider text not null check (provider in ('strava', 'terra')),
  provider_user_id text not null,
  access_token_encrypted bytea, -- chiffré
  refresh_token_encrypted bytea,
  token_expires_at timestamptz,
  scopes text[],
  is_active boolean default true not null,
  last_sync_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (user_id, provider)
);

alter table public.provider_connections enable row level security;

-- L'utilisateur peut voir ses connexions mais PAS lire les tokens
create policy "users_select_own_connections" on provider_connections
  for select using (auth.uid() = user_id);
create policy "users_delete_own_connections" on provider_connections
  for delete using (auth.uid() = user_id);

-- Seul le service_role peut lire/écrire les tokens
-- Le frontend ne touche jamais aux colonnes encrypted
```

### 3.2 Vault pour les tokens (optionnel mais recommandé)

Utiliser Supabase Vault ou pgcrypto :
```sql
-- Fonction de chiffrement
create or replace function encrypt_token(token text)
returns bytea as $$
  select pgp_sym_encrypt(token, current_setting('app.encryption_key'));
$$ language sql security definer;

create or replace function decrypt_token(encrypted bytea)
returns text as $$
  select pgp_sym_decrypt(encrypted, current_setting('app.encryption_key'));
$$ language sql security definer;
```

La clé est définie au niveau du projet Supabase via le dashboard (env var).

### 3.3 Flow OAuth Strava (Next.js)

**Étape 1 — Initialisation :** `web/app/(app)/connections/strava/connect/route.ts`

```typescript
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect("/login")
  
  // State = user.id signé (HMAC) pour la sécurité
  const state = await signState({ user_id: user.id, nonce: crypto.randomUUID() })
  
  const url = new URL("https://www.strava.com/oauth/authorize")
  url.searchParams.set("client_id", process.env.STRAVA_CLIENT_ID!)
  url.searchParams.set("redirect_uri", `${process.env.NEXT_PUBLIC_BASE_URL}/api/strava/callback`)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", "read,activity:read_all")
  url.searchParams.set("state", state)
  
  return NextResponse.redirect(url)
}
```

**Étape 2 — Callback :** `web/app/api/strava/callback/route.ts`

```typescript
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")
  const state = request.nextUrl.searchParams.get("state")
  
  const { user_id } = await verifyState(state) // throw if invalid
  
  // Échange du code contre les tokens (via FastAPI pour garder le secret)
  const tokens = await fetch(`${process.env.FASTAPI_URL}/internal/strava/exchange`, {
    method: "POST",
    headers: { Authorization: `Bearer ${INTERNAL_SECRET}` },
    body: JSON.stringify({ code, user_id })
  }).then(r => r.json())
  
  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/connections?provider=strava&status=connected`)
}
```

**Étape 3 — Backend FastAPI** garde le `STRAVA_CLIENT_SECRET` (jamais côté Next).

### 3.4 Migration SQL : activities multi-tenant

```sql
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  provider text not null,
  provider_activity_id text not null,
  name text,
  sport_type text not null,
  start_date timestamptz not null,
  timezone text,
  duration_sec int,
  moving_time_sec int,
  distance_m numeric,
  elevation_gain_m numeric,
  average_speed numeric,
  max_speed numeric,
  average_heartrate int,
  max_heartrate int,
  average_cadence int,
  average_power int,
  calories int,
  raw_data_json jsonb,
  source text not null default 'strava',
  -- Feedback (phase 5)
  rpe int check (rpe between 1 and 10),
  feel_score int check (feel_score between 1 and 5),
  motivation_score int check (motivation_score between 1 and 5),
  perceived_recovery int check (perceived_recovery between 1 and 5),
  post_session_notes text,
  body_feeling_tags jsonb default '[]'::jsonb,
  context_tags jsonb default '[]'::jsonb,
  session_quality_tags jsonb default '[]'::jsonb,
  temperature_c numeric,
  weather_condition text,
  -- Phase 12
  time_in_zones_json jsonb,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (user_id, provider, provider_activity_id)
);

create index activities_user_start on activities (user_id, start_date desc);
create index activities_user_sport on activities (user_id, sport_type);

alter table public.activities enable row level security;
create policy "users_select_own_activities" on activities
  for select using (auth.uid() = user_id);
create policy "users_insert_own_activities" on activities
  for insert with check (auth.uid() = user_id);
create policy "users_update_own_activities" on activities
  for update using (auth.uid() = user_id);
create policy "users_delete_own_activities" on activities
  for delete using (auth.uid() = user_id);
```

### 3.5 Sync Strava (FastAPI)

Routes :
- `POST /strava/sync/recent?user_id=X` (auth : JWT Supabase)
- `POST /strava/sync/history?user_id=X&days=90`
- Internal : `POST /internal/strava/exchange` (auth : secret partagé)

Service `strava_service.py` adapté pour utiliser `provider_connections` au lieu d'`Athlete`.

### 3.6 Webhook Strava
- Endpoint `app/api/strava/webhook/route.ts` (Next) qui reçoit l'event et le forward à FastAPI
- FastAPI traite l'event (sync immédiat de l'activité créée/modifiée)
- Configurer le webhook côté Strava : URL `https://sporttrack.app/api/strava/webhook`

### 3.7 Page Connexions

`web/app/(app)/connections/page.tsx` :

```
┌──────────────────────────────────────────────────────┐
│  🔗 Mes connexions                                    │
├──────────────────────────────────────────────────────┤
│                                                       │
│  ┌─────────────────────────────────────────────┐    │
│  │ 🟠 Strava                                    │    │
│  │                                              │    │
│  │ ✅ Connecté                                  │    │
│  │ Compte Strava ID : 12345678                  │    │
│  │ Dernière synchro : il y a 3h                 │    │
│  │ 187 activités importées                      │    │
│  │                                              │    │
│  │ [ 🔄 Synchroniser ]  [ ✕ Déconnecter ]       │    │
│  └─────────────────────────────────────────────┘    │
│                                                       │
│  ┌─────────────────────────────────────────────┐    │
│  │ ⚪ Garmin (via Terra)                         │    │
│  │                                              │    │
│  │ ❌ Non connecté                              │    │
│  │                                              │    │
│  │ Récupérez automatiquement :                  │    │
│  │  • HRV nocturne                              │    │
│  │  • Score de sommeil                          │    │
│  │  • FC repos                                  │    │
│  │  • Body Battery                              │    │
│  │  • Training Readiness                        │    │
│  │                                              │    │
│  │ [ + Connecter Garmin ]                       │    │
│  └─────────────────────────────────────────────┘    │
│                                                       │
└──────────────────────────────────────────────────────┘
```

**Critères d'acceptation Phase 3 :**
- [ ] OAuth Strava fonctionnel pour multi-utilisateurs
- [ ] Tokens chiffrés en DB
- [ ] Sync des activités fonctionnel
- [ ] Webhook Strava reçu et traité
- [ ] Page Connexions affiche le statut réel
- [ ] Test RLS : un user ne voit pas les activités d'un autre

---

## Phase 4 — Intégration Terra API (Garmin + autres)

**Objectif :** Récupération auto des données de récupération via Terra.

### 4.1 Migration SQL

```sql
create table public.daily_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  metric_date date not null,
  -- Activités du jour (calculé)
  sessions_count int default 0,
  duration_sec int default 0,
  distance_m numeric default 0,
  elevation_gain_m numeric default 0,
  training_load numeric default 0,
  -- Données Terra/Garmin
  resting_hr int,
  hrv_rmssd numeric,
  hrv_status text check (hrv_status in ('balanced', 'low', 'unbalanced', 'poor', 'no_status')),
  sleep_score int check (sleep_score between 0 and 100),
  sleep_duration_min int,
  sleep_deep_min int,
  sleep_rem_min int,
  sleep_light_min int,
  sleep_awake_min int,
  body_battery_morning int check (body_battery_morning between 0 and 100),
  body_battery_evening int check (body_battery_evening between 0 and 100),
  training_readiness int check (training_readiness between 0 and 100),
  stress_score_avg int check (stress_score_avg between 0 and 100),
  spo2_avg numeric,
  respiration_avg numeric,
  vo2max_estimated numeric,
  updated_at timestamptz default now() not null,
  unique (user_id, metric_date)
);

create index daily_metrics_user_date on daily_metrics (user_id, metric_date desc);

alter table public.daily_metrics enable row level security;
create policy "users_select_own_daily" on daily_metrics
  for select using (auth.uid() = user_id);
create policy "service_role_all_daily" on daily_metrics
  for all using (auth.role() = 'service_role');
```

### 4.2 Service Terra (FastAPI)

`app/services/terra_service.py` :
- `generate_widget_session(user_id, redirect_url) -> str` — appelle Terra Auth API
- `verify_webhook_signature(payload, signature) -> bool` — HMAC SHA256
- `normalize_daily_payload(payload) -> dict`
- `normalize_sleep_payload(payload) -> dict`
- `normalize_activity_payload(payload) -> dict`

### 4.3 Webhook Terra

`web/app/api/terra/webhook/route.ts` :
- Vérifie la signature
- Forward vers FastAPI `/internal/terra/process-webhook`
- Réponse immédiate 200 OK
- FastAPI traite en arrière-plan

### 4.4 Bouton de connexion Garmin

`web/app/(app)/connections/garmin/connect/route.ts` :
- Appelle FastAPI `/terra/widget-session?user_id=X`
- Retourne l'URL du widget Terra
- Redirige l'utilisateur vers le widget
- Le widget gère l'auth Garmin
- À la fin, Terra envoie un webhook `auth` → on crée la `provider_connection` (provider=terra, provider_user_id=terra_user_id)

### 4.5 Dédoublonnage Strava ↔ Terra

Service `app/services/activity_dedupe.py` :
- Clé : `(user_id, start_date ± 5min, duration ± 30s, sport_type)`
- Priorité : **Terra (Garmin source)** > Strava
- Si activité existe déjà depuis Strava et arrive depuis Terra : update les champs Garmin-spécifiques (HRV pendant l'effort, training effect, etc.)
- Stocker `merged_from_provider_id` pour traçabilité

### 4.6 Backfill historique

Bouton "Importer historique 90 jours" sur la page Connexions :
- Appelle Terra `requestHistoricalData` pour `activity`, `daily`, `sleep`
- Terra envoie les données via webhooks au fur et à mesure
- UI affiche un toast "Import en cours, les données arrivent..."

### 4.7 Tests
- Fixtures `tests/fixtures/terra/daily.json`, `sleep.json`, `activity.json`
- Test des normalizers
- Test du dédoublonnage avec activités Strava existantes

**Critères d'acceptation Phase 4 :**
- [ ] Widget Terra fonctionnel
- [ ] Webhook reçoit et stocke HRV, sommeil, FC repos, Body Battery
- [ ] Dédoublonnage Strava ↔ Garmin opérationnel
- [ ] Backfill historique fonctionnel
- [ ] Daily metrics consultables via Supabase

---

## Phase 5 — Ressenti et notes post-séance

**Objectif :** Enrichir chaque activité avec ressenti, tags douleur, contexte, météo.

### 5.1 Catalogue de tags (frontend)

`web/lib/constants/feedback-tags.ts` :
```typescript
export const BODY_FEELING_TAGS = {
  jambes_legeres: "Jambes légères",
  jambes_lourdes: "Jambes lourdes",
  // ... voir DESIGN_NEXT.md
} as const

export const CONTEXT_TAGS = { ... }
export const SESSION_QUALITY_TAGS = { ... }
```

### 5.2 Service météo (FastAPI)

`app/services/weather_service.py` — OpenMeteo Archive API (gratuit, pas de clé).

Hook : à l'import d'une activité avec lat/lon → enrichir avec météo.

### 5.3 Modale post-séance (Next.js)

Composant `web/components/activity/feedback-modal.tsx` :

```tsx
"use client"
// Utilise <Dialog> de shadcn
// Slider RPE 1-10
// Étoiles cliquables pour les 3 scores
// Multi-select pour les tags (Badge cliquables)
// Textarea pour les notes
// Server Action pour save
```

**UX :**
- Auto-save en draft local (localStorage) toutes les 5s
- Indicateur visuel sur l'activité : 📝 (rempli) vs ⚪ (vide)
- Accessible : `Tab` navigue les sliders, `Enter` valide

### 5.4 Server Action

`web/app/(app)/activities/actions.ts` :
```typescript
"use server"
export async function updateActivityFeedback(activityId: string, data: FeedbackData) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("activities")
    .update({ rpe: data.rpe, feel_score: data.feel_score, ... })
    .eq("id", activityId)
  // RLS garantit que seul le propriétaire peut update
}
```

**Critères d'acceptation Phase 5 :**
- [ ] Modale ressenti accessible depuis liste activités
- [ ] Tous les champs feedback persistés
- [ ] Météo enrichie auto à l'import
- [ ] Indicateur visuel sur les activités

---

## Phase 6 — Saisie manuelle d'activité

**Objectif :** Créer une activité sans dépendre de Strava/Garmin (muscu, yoga, sports collectifs).

### 6.1 Catalogue sports

`web/lib/constants/sports.ts` :
```typescript
export const SPORTS = {
  running: { label: "Course à pied", icon: "🏃", trackDistance: true, trackElevation: true },
  trail: { label: "Trail", icon: "⛰️", trackDistance: true, trackElevation: true },
  cycling: { label: "Vélo route", icon: "🚴", trackDistance: true, trackElevation: true },
  mtb: { label: "VTT", icon: "🚵", trackDistance: true, trackElevation: true },
  swimming: { label: "Natation", icon: "🏊", trackDistance: true, trackElevation: false },
  strength: { label: "Musculation", icon: "🏋️", trackDistance: false, trackVolume: true },
  yoga: { label: "Yoga", icon: "🧘", isRecovery: true },
  crossfit: { label: "CrossFit", icon: "💪" },
  football: { label: "Football", icon: "⚽", trackDistance: true },
  tennis: { label: "Tennis", icon: "🎾" },
  climbing: { label: "Escalade", icon: "🧗", trackElevation: true },
  rowing: { label: "Aviron", icon: "🚣", trackDistance: true },
  hiking: { label: "Randonnée", icon: "🥾", trackDistance: true, trackElevation: true },
  skiing: { label: "Ski", icon: "⛷️", trackDistance: true, trackElevation: true },
  other: { label: "Autre", icon: "🏃" },
} as const
```

### 6.2 Page Nouvelle activité

`web/app/(app)/activities/new/page.tsx` (Client Component avec react-hook-form) :

**Layout :**
```
Sport (gros boutons icônés) → Date/Heure → Durée → Champs spécifiques (selon sport) → Ressenti optionnel → Notes
```

**Comportements :**
- Champs affichés s'adaptent au sport sélectionné
- Pour la muscu : table d'exercices `[Nom, Sets, Reps, Poids]` avec calcul auto du tonnage
- Estimation training load affichée en temps réel
- Validation Zod

### 6.3 Service FastAPI : calcul charge manuelle

`app/services/manual_load_service.py` :
- Si RPE saisi mais pas de FC → utilise RPE comme proxy d'intensité
- Pour la muscu → charge basée sur tonnage et durée
- Pour le yoga → charge faible (multiplicateur 0.3)

**Critères d'acceptation Phase 6 :**
- [ ] Saisie possible pour 15+ sports
- [ ] Calcul tonnage muscu auto
- [ ] Estimation charge en temps réel
- [ ] Activité visible dans dashboard au même titre que Strava/Garmin

---

## Phase 7 — Dashboard moderne et responsive

**Objectif :** Tableau de bord principal, point d'entrée quotidien de l'utilisateur.

### 7.1 Layout du dashboard

`web/app/(app)/dashboard/page.tsx` (Server Component pour fetch SSR + Client Components pour interactivité) :

**Layout responsive :**

**Desktop (≥1024px) :**
```
┌─────────────────────────────────────────────────────────────┐
│  Bonjour Jean 👋                            Mer 20 mai 2026  │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────┐ ┌────────────────────────┐   │
│  │ 🎯 Forme du jour          │ │ 📅 Prochaine séance     │   │
│  │ ▓▓▓▓▓▓░░░░ 6/10           │ │ Mer 22 mai · Seuil      │   │
│  │ Risque modéré             │ │ 60min · 3x10min Z4      │   │
│  │ 💡 Séance facile          │ │                         │   │
│  └──────────────────────────┘ └────────────────────────┘   │
│                                                              │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │ Semaine │ │ CTL     │ │ HRV     │ │ Sommeil │           │
│  │ 4/5     │ │ 58.3    │ │ -18%    │ │ 68/100  │           │
│  │ 312 pts │ │ ↑+2.1   │ │ 5j bas  │ │ 7h12    │           │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘           │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 📊 Évolution charge (90 jours)                        │  │
│  │ [Graphique Recharts : CTL bleu, ATL rose, TSB gris]   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─────────────────────────┐ ┌──────────────────────────┐  │
│  │ 🏃 Activités récentes    │ │ 📈 Distribution zones    │  │
│  │ • Sortie longue · 18/05  │ │ Z1+Z2 ▓▓▓▓▓▓▓▓ 78% ✅   │  │
│  │ • Récup · 19/05          │ │ Z3-Z5 ▓▓░░░░░░ 22% ✅   │  │
│  │ • Seuil · 21/05          │ │ Cible 80/20 atteinte    │  │
│  └─────────────────────────┘ └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Mobile (<768px) :**
- Tout empilé en une colonne
- Cards plus compactes
- Bottom navigation au lieu de sidebar

### 7.2 Composants Recharts

`web/components/dashboard/ctl-atl-chart.tsx` :
```tsx
"use client"
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"

export function CtlAtlChart({ data }: { data: DailyMetric[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey="ctl" stroke="#3b82f6" name="CTL (forme)" />
        <Line type="monotone" dataKey="atl" stroke="#ec4899" name="ATL (fatigue)" />
        <Line type="monotone" dataKey="tsb" stroke="#6b7280" name="TSB" />
      </LineChart>
    </ResponsiveContainer>
  )
}
```

### 7.3 Bottom navigation mobile

`web/components/nav/bottom-nav.tsx` (visible uniquement <768px) :
- 5 icônes : Dashboard, Calendrier, ➕ (nouvelle activité, central proéminent), Planning, Profil
- Active state visible

### 7.4 Données SSR

`web/app/(app)/dashboard/page.tsx` :
```typescript
export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  // Fetch en parallèle
  const [profile, todayMetrics, weekActivities, recentMetrics] = await Promise.all([
    supabase.from("athlete_profiles").select("*").eq("user_id", user.id).single(),
    fetchRiskScore(user.id), // appel FastAPI
    supabase.from("activities").select("*").eq("user_id", user.id).gte("start_date", weekStart()).order("start_date", { ascending: false }),
    supabase.from("daily_metrics").select("*").eq("user_id", user.id).gte("metric_date", ninetyDaysAgo()).order("metric_date"),
  ])
  
  return <DashboardClient {...} />
}
```

**Critères d'acceptation Phase 7 :**
- [ ] Dashboard responsive testé 375px / 768px / 1280px
- [ ] Score de forme affiché
- [ ] Graphique CTL/ATL/TSB interactif
- [ ] Bottom nav mobile fonctionnel
- [ ] Temps de chargement initial < 1.5s

---

## Phase 8 — Vue calendrier mensuelle

**Objectif :** Vue calendrier mois, indicateurs visuels par jour.

### 8.1 Service FastAPI : agrégation mois

`app/services/calendar_service.py` :
- `get_month_data(user_id, year, month) -> dict` — agrégation jour par jour

### 8.2 Composant calendrier

`web/app/(app)/calendar/page.tsx` :

Utiliser un grid CSS pour le calendrier. Chaque cellule :
- Numéro du jour
- Icônes des sports pratiqués
- Couleur de fond selon charge (gradient : vert clair → rouge intense)
- Badge si plan non exécuté ⚠️

**Click jour** → ouvre une `Sheet` (shadcn) avec détail :
- Activités réalisées (cards cliquables)
- Séance planifiée (si existe)
- Données récupération du jour (HRV, sommeil)
- Bouton "Ajouter activité" si vide

### 8.3 Filtres
- Par sport (chips multi-select)
- Par métrique affichée (charge / durée / distance)
- Vue : mois / semaine

**Critères d'acceptation Phase 8 :**
- [ ] Calendrier navigable mois par mois
- [ ] Heatmap d'intensité fonctionnelle
- [ ] Drill-down par jour
- [ ] Filtres opérationnels

---

## Phase 9 — Planification d'entraînement

**Objectif :** Planifier les semaines, comparer planifié/réalisé.

### 9.1 Migration SQL

```sql
create table public.planned_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  planned_date date not null,
  planned_time time,
  sport_type text not null,
  session_type text not null,
  planned_duration_min int,
  planned_distance_km numeric,
  planned_load int,
  description text,
  target_zones int[],
  status text default 'planned' check (status in ('planned', 'completed', 'skipped', 'modified')),
  actual_activity_id uuid references activities(id) on delete set null,
  completion_score numeric,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index planned_sessions_user_date on planned_sessions (user_id, planned_date);

alter table public.planned_sessions enable row level security;
create policy "users_all_own_planned" on planned_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

### 9.2 Templates de séances

`web/lib/constants/session-templates.ts` — voir DESIGN_NEXT.md §6.3.

### 9.3 Vue Planning

`web/app/(app)/planning/page.tsx` :
- Vue semaine 7 jours (responsive : tableau desktop / accordion mobile)
- Drag & drop pour réorganiser (utiliser `dnd-kit`)
- Bouton "+" sur chaque jour ouvre modale création
- Modale avec sélection de template → champs pré-remplis

### 9.4 Auto-matching planifié ↔ réalisé

Trigger SQL ou cron job qui :
- Pour chaque activité créée
- Cherche un `planned_sessions` du même jour, même sport, status='planned'
- Lie automatiquement, calcule `completion_score`

```sql
create or replace function match_planned_to_actual()
returns trigger as $$
begin
  update planned_sessions
  set actual_activity_id = new.id,
      status = 'completed',
      completion_score = least(100, (new.duration_sec / 60.0) / nullif(planned_duration_min, 0) * 100)
  where user_id = new.user_id
    and planned_date = new.start_date::date
    and sport_type = new.sport_type
    and actual_activity_id is null
    and status = 'planned';
  return new;
end;
$$ language plpgsql;

create trigger activities_match_planned
  after insert on activities
  for each row execute function match_planned_to_actual();
```

**Critères d'acceptation Phase 9 :**
- [ ] CRUD séances planifiées
- [ ] Vue semaine responsive
- [ ] Templates utilisables
- [ ] Auto-matching opérationnel
- [ ] Score d'exécution affiché

---

## Phase 10 — Détection multivariée du surentraînement

**Objectif :** Score de risque combinant ACWR, TSB, HRV, FC repos, sommeil, RPE.

### 10.1 Service FastAPI

`app/services/overtraining_detection.py` — algorithme détaillé dans DESIGN_NEXT.md §7.2 (PIVOT_PLAN v1) :
- Baseline personnelle 28j par métrique
- Score 0-10
- Liste de raisons textuelles

### 10.2 Job quotidien

APScheduler à 8h chaque matin :
- Pour chaque user actif → calcul du score → upsert dans `risk_assessments`

### 10.3 Migration SQL

```sql
create table public.risk_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  assessment_date date not null,
  score int not null check (score between 0 and 10),
  level text not null check (level in ('none', 'low', 'moderate', 'high', 'critical')),
  reasons jsonb not null default '[]'::jsonb,
  created_at timestamptz default now() not null,
  unique (user_id, assessment_date)
);

alter table public.risk_assessments enable row level security;
create policy "users_select_own_risk" on risk_assessments
  for select using (auth.uid() = user_id);
create policy "service_role_all_risk" on risk_assessments
  for all using (auth.role() = 'service_role');
```

### 10.4 Affichage dashboard

Card "Forme du jour" sur le dashboard (voir Phase 7) :
- Score visuel (barre ou gauge)
- Niveau coloré
- Liste des raisons (top 3)
- Recommandation textuelle

### 10.5 Notifications

Si `level = high` ou `critical` → notification email (Supabase Email) avec :
- Message d'alerte
- Recommandations
- Lien vers le dashboard

**Critères d'acceptation Phase 10 :**
- [ ] Score quotidien calculé pour tous les users actifs
- [ ] Baseline personnelle 28j fonctionnelle
- [ ] Affichage dashboard cohérent
- [ ] Notifications email envoyées si critique

---

## Phase 11 — Suivi des blessures

### 11.1 Migration SQL

```sql
create table public.injuries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  body_zone text not null,
  injury_type text check (injury_type in ('muscular', 'tendinous', 'bone', 'ligament', 'other')),
  severity int check (severity between 1 and 3),
  start_date date not null,
  end_date date,
  description text,
  treatment text,
  related_activity_id uuid references activities(id) on delete set null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.injuries enable row level security;
create policy "users_all_own_injuries" on injuries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

### 11.2 UI

`web/app/(app)/injuries/page.tsx` — voir DESIGN_NEXT.md §8 / PIVOT_PLAN v1 Phase 8.

### 11.3 Suggestion proactive

Server-side cron : si 3 activités consécutives ont un tag `douleur_*` sur la même zone → créer une notification "Voulez-vous déclarer une blessure ?".

**Critères d'acceptation Phase 11 :**
- [ ] CRUD blessures
- [ ] Corrélation ACWR 14j avant
- [ ] Suggestion automatique
- [ ] Affichage historique

---

## Phase 12 — Zones d'intensité par activité

### 12.1 Service FastAPI

`app/services/intensity_distribution_service.py` :
- `compute_time_in_zones(activity_id) -> dict` — parse les streams FC
- Persiste dans `activities.time_in_zones_json`

### 12.2 UI

Composant `web/components/activity/zone-bars.tsx` (réutilisable) :
- Barres horizontales colorées Z1-Z5
- Tooltip avec pourcentage et durée

Affiché sur :
- Page détail activité
- Dashboard : agrégat hebdo
- Page Progression : tendance polarisation

**Critères d'acceptation Phase 12 :**
- [ ] Time-in-zones calculé pour activités avec FC stream
- [ ] Visualisation cohérente
- [ ] Ratio polarisé 80/20 affiché

---

## Phase 13 — Export IA structuré

### 13.1 Endpoint FastAPI

`GET /export/ai-summary?weeks=8&format=json|markdown` — voir PIVOT_PLAN v1 Phase 11.

### 13.2 UI

Card "Export pour Coach IA externe" sur la page Profil ou Dashboard :
- Sélecteur période
- Boutons "Copier JSON" / "Copier Markdown" / "Télécharger .md"
- Toast de confirmation au copier

**Critères d'acceptation Phase 13 :**
- [ ] Export JSON et Markdown
- [ ] Données toutes présentes
- [ ] Pas de champs null inutiles

---

## Phase 14 — Coach IA Claude intégré

### 14.1 Migration SQL

```sql
create table public.coach_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null default 'Nouvelle conversation',
  created_at timestamptz default now() not null,
  last_message_at timestamptz default now() not null
);

create table public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references coach_conversations(id) on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  tokens_used int,
  created_at timestamptz default now() not null
);

alter table public.coach_conversations enable row level security;
alter table public.coach_messages enable row level security;

create policy "users_all_own_conv" on coach_conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users_all_own_msg" on coach_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

### 14.2 Endpoint FastAPI avec streaming SSE

`POST /ai/chat?conversation_id=X` — body `{question}` — réponse SSE streaming.

Utilise le skill `claude-api` côté code (prompt caching activé).

**Prompt système :** voir PIVOT_PLAN v1 Phase 12.

### 14.3 UI Chat

`web/app/(app)/coach/page.tsx` (Client Component) :

```
┌──────────────────────────────────────────────────────┐
│  🤖 Coach IA                          [≡ Conversations]│
├──────────────────────────────────────────────────────┤
│                                                       │
│  Analyses rapides                                     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐    │
│  │📊 Bilan │ │📅 Conseils│ │⚠️ Risque │ │💤 Récup │   │
│  │ semaine │ │  semaine │ │surentraî │ │ analyse │    │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘    │
│                                                       │
│  ────── Discussion ──────                             │
│                                                       │
│  💬 Vous : Mon HRV baisse depuis 5 jours...           │
│                                                       │
│  🤖 Coach : Votre HRV est effectivement 18% sous     │
│       votre baseline. Combinée à votre ACWR de 1.34  │
│       et à vos 3 séances RPE ≥ 8 cette semaine,      │
│       cela suggère une fatigue accumulée.            │
│       Je vous recommande...                          │
│                                                       │
│  ┌──────────────────────────────────────────┐  ┌──┐ │
│  │ Tapez votre question...                  │  │➤ │ │
│  └──────────────────────────────────────────┘  └──┘ │
│                                                       │
│  ⚠️ Conseils IA — ne remplacent pas un avis médical  │
└──────────────────────────────────────────────────────┘
```

- Streaming SSE pour effet "temps réel"
- Historique conversations dans Sheet (mobile) ou Sidebar (desktop)
- Limite : 50 messages/conversation, 20 conversations/user

**Critères d'acceptation Phase 14 :**
- [ ] Chat fonctionnel avec streaming
- [ ] Prompt caching activé (réduction tokens confirmée)
- [ ] Analyses préréglées opérationnelles
- [ ] Historique persistant et navigable
- [ ] Disclaimer présent

---

## Phase 15 — Polish UX, accessibilité, perf

### 15.1 Accessibilité (WCAG 2.1 AA)
- Contrastes vérifiés (Lighthouse)
- Navigation au clavier sur toutes les pages
- ARIA labels sur boutons icônes
- Focus visible
- Skip-to-content link

### 15.2 Performance
- Lighthouse score ≥ 90 (perf, a11y, best practices, SEO)
- Lazy loading images
- Code splitting automatique (Next.js)
- Cache headers configurés
- Optimisation requêtes DB (EXPLAIN ANALYZE)

### 15.3 Empty states et erreurs
- Toutes les pages avec liste : empty state illustré + CTA
- Toast d'erreur cohérent (shadcn `Toaster`)
- Error boundaries React sur chaque section

### 15.4 Onboarding nouvel utilisateur
- À l'inscription : wizard 3 étapes (profil basique, FC max, connexion Strava/Garmin)
- Tooltip "premier coup d'œil" sur les nouvelles features

### 15.5 PWA
- `manifest.json` + icônes
- Service worker pour offline read (activités cachées)
- Installable sur mobile (Add to Home Screen)

**Critères d'acceptation Phase 15 :**
- [ ] Lighthouse ≥ 90 sur toutes les pages principales
- [ ] WCAG AA respecté
- [ ] Onboarding fluide
- [ ] PWA installable

---

## Phase 16 — Tests, doc, déploiement production

### 16.1 Tests
- Backend : `pytest` ≥ 70% coverage sur services métier
- Frontend : tests unitaires `vitest` sur les utilitaires
- E2E : `playwright` sur 5 flows critiques (signup, connect Strava, create activity, view dashboard, ask coach)

### 16.2 CI/CD
- `.github/workflows/ci.yml` :
  - Lint (`eslint`, `ruff`)
  - Type check (`tsc`, `mypy`)
  - Tests (backend + frontend)
- `.github/workflows/deploy.yml` :
  - Sur push `main` : déploy Vercel auto (Next.js) + Railway (FastAPI) + push migrations Supabase

### 16.3 Documentation

`README.md` complet :
- Quick start dev (3 commandes)
- Variables d'env
- Architecture
- Commandes utiles (migrations, types gen, tests)

`docs/user-guide.md` :
- Comment connecter Strava / Garmin
- Comment utiliser le Coach IA
- FAQ

`docs/architecture.md` :
- Diagramme système
- Modèle de données (schéma exporté)
- Flows de données

### 16.4 Monitoring
- **Sentry** pour erreurs frontend et backend
- **Vercel Analytics** pour les perfs
- **Supabase Dashboard** pour DB metrics
- Endpoint `/health` sur FastAPI

### 16.5 Configuration domaines
- Domaine custom : `sporttrack.app` (acheter via Vercel ou Cloudflare)
- DNS configuré
- SSL automatique (Vercel)
- Email transactionnel (Resend, intégré à Supabase Auth)

### 16.6 Beta privée
- Inviter 5-10 sportifs amis
- Récolter feedback structuré
- Itérer une semaine
- Ouverture publique

**Critères d'acceptation Phase 16 :**
- [ ] App déployée en production
- [ ] CI/CD vert
- [ ] Couverture tests ≥ 70%
- [ ] Documentation complète
- [ ] Monitoring opérationnel
- [ ] 5+ beta-testeurs actifs

---

## Variables d'environnement complètes

### Frontend (`web/.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_BASE_URL=https://sporttrack.app
FASTAPI_URL=https://api.sporttrack.app
INTERNAL_SECRET=                # partagé avec FastAPI
STRAVA_CLIENT_ID=               # public ok (OAuth)
```

### Backend FastAPI (`.env`)
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=
DATABASE_URL=                   # connexion Postgres directe via pooler
INTERNAL_SECRET=
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
STRAVA_WEBHOOK_VERIFY_TOKEN=
TERRA_DEV_ID=
TERRA_API_KEY=
TERRA_WEBHOOK_SECRET=
ANTHROPIC_API_KEY=
ENCRYPTION_KEY=                 # pour chiffrement des tokens en DB
SENTRY_DSN=
```

---

## Workflow d'exécution pour un agent IA

1. **Lire AGENTS.md, CLAUDE.md, AUDIT.md, DESIGN_NEXT.md** avant chaque phase
2. **Créer une branche** `phase-X/feature-name`
3. **Suivre l'ordre strict** des sous-tâches
4. **Commiter granulairement** :
   - 1 migration SQL = 1 commit
   - 1 composant Next.js = 1 commit
   - 1 service FastAPI = 1 commit
   - 1 Server Action = 1 commit
   - Tests d'une feature = 1 commit
5. **Tester à chaque palier** :
   - Migration : `supabase db push` puis `supabase db reset` pour vérifier idempotence
   - Frontend : `npm run lint && npm run build` doit passer
   - Backend : `pytest` doit passer
6. **Vérifier RLS** systématiquement : créer un 2e user, vérifier l'isolation
7. **Mettre à jour `CHANGELOG.md`** à la fin de chaque phase
8. **Demander validation utilisateur** en fin de phase
9. **Merger** dans `pivot/v2` puis dans `main` à la fin

---

## Référence rapide : dépendances entre phases

```
Phase 0 (infra)
    │
    ▼
Phase 1 (profil + zones FC)
    │
    ├─► Phase 3 (Strava) ─────────► Phase 5 (ressenti)
    │                            ├─► Phase 6 (saisie manuelle)
    │                            └─► Phase 12 (zones par activité)
    │
    └─► Phase 4 (Terra) ──────────► Phase 10 (surentraînement)
    
Phase 7 (dashboard) ◄── après 3+4
Phase 8 (calendrier) ◄── après 5+6
Phase 9 (planning) ◄── après 1
Phase 11 (blessures) ◄── après 5

Phase 13 (export IA) ◄── après TOUTES les data phases
Phase 14 (coach IA) ◄── après 13

Phase 15 (polish) ◄── après features
Phase 16 (deploy) ◄── dernière
```

---

## Métriques de succès du pivot

À la fin du plan :

- ✅ Plusieurs utilisateurs peuvent créer leur compte indépendamment
- ✅ Chaque utilisateur connecte SES propres comptes Strava/Garmin
- ✅ Isolation stricte des données vérifiée (RLS testée)
- ✅ Application responsive testée sur smartphone, tablette, desktop
- ✅ Score Lighthouse ≥ 90
- ✅ Coach IA opérationnel avec prompt caching
- ✅ Données HRV/sommeil/FC repos récupérées automatiquement
- ✅ Détection multivariée du surentraînement fonctionnelle
- ✅ Saisie manuelle pour 15+ sports
- ✅ Export IA exploitable par tout LLM
- ✅ Beta privée lancée avec 5+ utilisateurs réels

---

*Plan de pivot v2.0 — Stack Supabase + Next.js + FastAPI — 2026-05-20*
*Document de référence à conserver jusqu'à la fin de l'implémentation.*
