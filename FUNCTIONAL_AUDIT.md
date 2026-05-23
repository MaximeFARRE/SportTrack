# Audit fonctionnel — SportTrack (pivot/v2)

**Date :** 2026-05-23
**Branche :** `pivot/v2`
**Méthode :** inventaire des routes Next.js, endpoints FastAPI, migrations Supabase, et croisement avec PIVOT_PLAN.md (phases 0 → 16).

---

## 1. Vue d'ensemble

| Couche | État | Commentaire |
|---|---|---|
| **Auth (Supabase)** | ✅ Fonctionnel | Email/password + Google OAuth, callback, forgot/reset password |
| **Frontend Next.js** | 🟡 Structurellement complet | 16 pages implémentées, dépend du backend Python pour les calculs lourds |
| **Backend FastAPI** | 🟡 Code présent | **Non déployé actuellement** (vercel.json renommé en .bak suite au pivot Vercel Root Directory) |
| **DB Supabase** | ✅ 10 migrations appliquées | Schéma multi-tenant avec RLS sur toutes les tables utilisateur |
| **Intégrations** | 🟡 Strava câblé / Terra partiel | Strava OAuth + webhook OK ; Terra a un webhook et un service mais pas de flow de connexion finalisé |

---

## 2. Phases du pivot — état détaillé

### ✅ Phase 0 — Infrastructure : Supabase + Next.js + auth
**État : terminée**

- Projet Supabase créé (`ejaquzdenmfdqgxigbvo`)
- Next.js 16.2.6 (Turbopack) déployé sur Vercel (`sport-track-ochre.vercel.app`)
- Auth Supabase : signup, login, forgot/reset password, Google OAuth, callback `/auth/callback`
- Layout app (`(app)/layout.tsx`) avec vérification session
- Page d'accueil publique (`app/page.tsx`)

**À vérifier :** confirmation email Supabase active et URL de redirect configurée dans Supabase Dashboard (voir « Risques » plus bas).

---

### ✅ Phase 1 — Profil athlète + zones FC + RLS
**État : terminée**

- Migration `20260521000000_athlete_profile.sql` : tables `athlete_profiles` + `hr_zones` avec RLS user-scoped
- Page `/profile` avec formulaire (`profile-form.tsx`) et export
- Page `/onboarding` avec wizard
- Server Action `profile/actions.ts` qui upsert le profil et appelle FastAPI `/internal/zones/compute` pour générer les 5 zones Friel
- Endpoint FastAPI `zones_router` : GET / PATCH / POST recompute / POST reset

---

### ✅ Phase 2 — Migration depuis SQLite
**État : terminée** (pas d'utilisateurs réels en prod selon le plan, donc skip migration de données)

- Ancien code V1 (bcrypt auth, user/group tables) supprimé (commits `adb1645`, `0ac86ff`)
- Nouveau modèle SQLModel : `Athlete`, `Activity`, `Goal`, `DailyMetric`, `WeeklyMetric`

---

### ✅ Phase 3 — Intégration Strava
**État : code complet, dépendant du backend Python**

- Migration `20260521100000_provider_connections.sql` : table générique provider_connections (Strava + Terra)
- Migration `20260521200000_activities.sql` : table activities multi-tenant avec time_in_zones_json
- Migration `20260521300000_strava_config.sql` : config Strava admin (table)
- Page `/settings/strava` : formulaire pour saisir client_id, client_secret, webhook_verify_token (page admin)
- Page `/connections` : card Strava avec OAuth, last_sync_at, count d'activités
- Route OAuth : `connections/strava/connect/route.ts` → redirige vers Strava
- Callback OAuth : `app/api/strava/callback/route.ts` → appelle FastAPI pour échange token
- Webhook Strava : `app/api/strava/webhook/route.ts` → forward FastAPI
- Backend : `strava_router`, `sync_router`, `strava_service.py`, `sync_service.py`

**🟠 Bloquant : le backend FastAPI n'est plus déployé sur Vercel.** Toutes les actions Strava (`sync`, `import historique`, `callback`) appellent `process.env.FASTAPI_URL` qui pointait vers `/api/index` sur Vercel, désormais inaccessible.

---

### 🟡 Phase 4 — Intégration Terra (Garmin/Polar/Fitbit)
**État : partiel**

- Webhook Terra : `app/api/terra/webhook/route.ts` ✅ (signature HMAC vérifiée, forward FastAPI)
- Route de connexion : `connections/terra/connect/route.ts` ✅
- Card Terra dans `/connections` ✅
- Endpoint FastAPI : `terra_router` avec `/widget-session` (génère URL Terra Connect)
- Service : `terra_service.py`

**À faire / vérifier :**
- Le widget Terra (popup de sélection d'appareil) est-il intégré côté UI ? La route `connections/terra/connect` génère un session token via FastAPI — à valider end-to-end.
- Dédoublonnage Strava ↔ Terra (Phase 4.5 du plan) : pas vu d'implémentation explicite.
- Backfill historique Terra (Phase 4.6) : pas vu.

---

### ❓ Phase 5 — Ressenti et notes post-séance
**État : à vérifier**

Aucune table `session_feedback` ou modale post-séance trouvée. Les `activities` ont `rpe` mais pas de vues UI pour saisir RPE/ressenti après une séance.

**À faire :** modale post-séance + Server Action + service météo.

---

### ✅ Phase 6 — Saisie manuelle d'activité
**État : implémentée**

- Page `/activities/new` avec formulaire
- Server Action `activities/new/actions.ts`
- Catalogue sports dans `lib/constants/sports.ts`

---

### ✅ Phase 7 — Dashboard moderne et responsive
**État : implémenté**

- Page `/dashboard` (353 lignes) : risque du jour (RiskAssessment), activités semaine, métriques 90j (CTL/ATL/TSB chart), zones d'intensité agrégées
- Composants : `ctl-atl-chart`, `zone-bars`
- Bottom nav mobile (`components/nav/bottom-nav.tsx`)
- Sidebar desktop (`components/nav/sidebar.tsx`)
- Topbar avec email + display_name (`components/nav/top-bar.tsx`)

---

### ✅ Phase 8 — Vue calendrier mensuelle
**État : implémentée**

- Page `/calendar` avec `calendar-client.tsx`
- Données : activities + daily_metrics + planned_sessions par mois
- Navigation par mois via `?month=YYYY-MM`

---

### ✅ Phase 9 — Planification d'entraînement
**État : implémentée**

- Migration `20260521500000_planned_sessions.sql`
- Page `/planning` avec vue semaine
- Server Actions pour CRUD séances planifiées
- Templates : `lib/constants/session-templates.ts`
- Champs `actual_activity_id` et `completion_score` présents → auto-matching prévu mais à vérifier côté backend

---

### ✅ Phase 10 — Détection multivariée du surentraînement
**État : implémentée**

- Migration `20260521600000_risk_assessments.sql`
- Service FastAPI : `overtraining_detection.py`
- Router : `risk_router` (`GET /risk/me/latest`, `POST /risk/me/assess`)
- Cron quotidien : `api/cron/daily-risk.py` ← **désactivé** avec le vercel.json renommé
- Affichage dashboard : `RiskAssessment` card (level + reasons)

---

### ✅ Phase 11 — Suivi des blessures
**État : implémentée**

- Migration `20260522000000_injuries.sql`
- Page `/injuries` (158 lignes) avec formulaire et liste
- Router FastAPI : `injuries_router` (CRUD + `/acwr-context` + `/suggestions`)
- Service : `injury_service.py`
- Cron : `api/cron/daily-injury.py` ← **désactivé**

---

### ✅ Phase 12 — Zones d'intensité par activité
**État : implémentée**

- Endpoint FastAPI : `POST /zones/activities/{activity_id}/compute`
- Service : `intensity_distribution_service.py`
- Composant UI : `ZoneBars` utilisé dans dashboard, activities, progression

---

### ✅ Phase 13 — Export IA structuré
**État : implémentée (côté API)**

- Router : `export_router` (`GET /export/ai-summary`)
- Service : `ai_export_service.py`
- UI : `ExportCard` dans `/profile` + `export-actions.ts`

---

### ❌ Phase 14 — Coach IA Claude intégré
**État : non démarrée**

Aucun fichier `chat/`, `coach/`, ni service Anthropic. Le `.env.example` mentionne `ANTHROPIC_API_KEY` comme "non utilisé actuellement — prévu pour une version future". Migration SQL pour `chat_messages` absente.

---

### 🟡 Phase 15 — Polish UX, accessibilité, perf
**État : partiel**

- `EmptyState` component présent
- Toaster (sonner) configuré
- Sidebar/Bottom nav responsive
- **À faire** : audit a11y (alt text, ARIA, contraste), PWA manifest, optimisations perf (lazy-loading, font swap, etc.)

---

### 🟡 Phase 16 — Tests, doc, déploiement production
**État : partiel**

- Tests Python : pytest présent, 67 tests passants (README)
- Tests Next.js : Vitest configuré (`__tests__/utils.test.ts`, `zone-bars.test.ts`) — couverture minimale
- E2E Playwright : `e2e/auth.spec.ts` (signup + login flows)
- CI/CD : à vérifier via GitHub Actions
- Domaines : `sport-track-ochre.vercel.app` en production (pas de domaine custom)
- Monitoring : Sentry configuré (`sentry.client.config.ts`, `sentry.server.config.ts`) — DSN à renseigner

---

## 3. Bloquants critiques pour terminer le pivot

### 🔴 1. Backend FastAPI non déployé
Le `vercel.json` à la racine a été renommé `.bak` pour résoudre le conflit Root Directory. Conséquences :
- `/api/index` (FastAPI) inaccessible
- Cron jobs (`daily-risk`, `daily-injury`) ne tournent plus
- Toute action qui appelle `process.env.FASTAPI_URL` retourne une erreur réseau

**Pages/actions impactées :**
- `/connections` → boutons "Synchroniser Strava" et "Importer 90j" cassés
- `/onboarding` → appel `/internal/zones/compute` cassé → zones FC pas générées
- `/profile` → recalcul zones cassé + export IA cassé
- `/dashboard` → carte risque vide (cron qui le calcule ne tourne plus)
- `/injuries` → suggestions IA cassées
- `/activities/new` → calcul charge manuelle cassé
- Webhooks Strava et Terra → réception OK mais forward FastAPI échoue

**Options pour fixer :**
- **A.** Créer un second projet Vercel pour FastAPI uniquement (Root Directory = `api`)
- **B.** Déployer FastAPI sur Railway/Fly.io et pointer `FASTAPI_URL` vers cette URL
- **C.** Restaurer un `vercel.json` minimal qui ne builde que Python (en laissant le projet Vercel actuel gérer le Next.js)

### 🟠 2. Sync Strava initial
Pour que l'app ait des données à afficher après connexion Strava, il faut appeler `/strava/sync/history`. Sans backend → table `activities` reste vide → dashboard, calendrier, progression vides.

### 🟠 3. Cron quotidien
- `daily-risk` : remplit `risk_assessments` chaque matin → dashboard affiche la carte risque
- `daily-injury` : suggère blessures à partir d'ACWR
Sans ces crons, ces features ne se déclenchent jamais automatiquement.

---

## 4. À faire pour finir le pivot (par priorité)

### P0 — Débloquer le backend Python
- [ ] Choisir la stratégie de redéploiement FastAPI (Vercel séparé / Railway / autre)
- [ ] Pointer `FASTAPI_URL` (env Vercel + local) vers la nouvelle URL
- [ ] Re-tester end-to-end : onboarding → zones FC, connexion Strava → sync, calcul risque

### P1 — Combler les phases manquantes
- [ ] **Phase 5** : modale post-séance (RPE, ressenti, fatigue, sommeil) — DB column ou nouvelle table
- [ ] **Phase 4.5** : déduplication Strava ↔ Terra (clé : start_date + sport_type ± Δtolérance)
- [ ] **Phase 4.6** : backfill historique Terra à la connexion
- [ ] **Phase 14** : Coach IA Claude (table chat_messages + endpoint streaming SSE + UI chat)

### P2 — Polish et production-ready
- [ ] Audit a11y WCAG 2.1 AA (page par page)
- [ ] PWA manifest + service worker
- [ ] Optimisation perf : LCP, lazy-load des charts Recharts
- [ ] Empty states sur toutes les pages (onboarding sans activités, etc.)
- [ ] Sentry DSN configurée en prod (frontend + backend)
- [ ] Domaine custom (sporttrack.fr ou autre)
- [ ] CI GitHub Actions : lint, tests Python, tests Vitest, build Next, Playwright e2e

### P3 — Vérifications fines
- [ ] Confirmer dans Supabase : "Confirm email" activé ou désactivé selon préférence
- [ ] Confirmer redirect URL Supabase contient `https://sport-track-ochre.vercel.app/**`
- [ ] Vérifier que la table `profiles` existe (référencée par dashboard ligne 57) — créée par trigger `handle_new_user` au signup
- [ ] Auto-matching planning ↔ activités réelles (`actual_activity_id` rempli ?) côté backend

---

## 5. Architecture actuelle (résumé)

```
┌─────────────────────────────────────────────────────────────────┐
│ Vercel — sport-track-ochre.vercel.app (Root Directory: web/)    │
│                                                                  │
│   Next.js 16 (App Router, Turbopack)                            │
│   ├─ (auth)/    login, signup, forgot/reset-password            │
│   ├─ (app)/     dashboard, activities, calendar, planning,      │
│   │             profile, onboarding, injuries, progression,     │
│   │             connections, settings/strava                    │
│   ├─ auth/callback                                              │
│   └─ api/       strava/callback, strava/webhook, terra/webhook  │
│                                                                  │
│   proxy.ts (middleware Next.js 16) → updateSession Supabase     │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                                │
              ▼                                ▼
┌─────────────────────────┐      ┌──────────────────────────────┐
│ Supabase                │      │ FastAPI (Python)             │
│ ejaquzdenmfdqgxigbvo    │      │ ❌ Non déployé actuellement   │
│                         │      │                              │
│ • Auth                  │      │ Routers:                     │
│ • Postgres + 10 tables  │      │ • me, export, injuries, risk │
│   avec RLS              │      │ • strava, sync, terra        │
│ • Service role pour     │      │ • zones, metrics, goals      │
│   crons (désactivés)    │      │ • activities                 │
└─────────────────────────┘      └──────────────────────────────┘
```

---

## 6. Décisions à prendre rapidement

1. **Où redéployer FastAPI ?** (Vercel séparé / Railway / Fly.io / Render)
2. **Crons** : Vercel Cron, Supabase Edge Functions, ou cron externe (GitHub Actions schedule) ?
3. **Phase 14 Coach IA** : à inclure dans le MVP du pivot ou repousser après ?
4. **Sentry** : on garde et on renseigne le DSN, ou on retire pour alléger ?

---

*Audit généré automatiquement — pour mise à jour, relancer l'analyse depuis `pivot/v2`.*
