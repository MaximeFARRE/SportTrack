# Audit SportTrack — Mai 2026

## Contexte du pivot

L'objectif déclaré est de faire de SportTrack une plateforme de **gestion de l'entraînement sportif multi-sport**, capable de :

- Suivre les performances et volumes d'entraînement (tous sports)
- Détecter le sous-entraînement et le surentraînement pour prévenir les blessures
- Planifier les semaines d'entraînement
- Exporter les données dans un format lisible par l'IA
- À terme, intégrer un coach IA directement dans l'application

---

## 1. État actuel de l'application

### Stack technique

| Couche | Technologie |
|---|---|
| Backend | FastAPI + SQLModel (SQLAlchemy) |
| Base de données | SQLite (dev) / PostgreSQL (prod) |
| Frontend | Streamlit + Plotly |
| Auth | bcrypt + OAuth2 Strava |
| Tests | pytest + FastAPI TestClient |

### Ce qui est déjà implémenté

**Intégration données**
- OAuth2 Strava complet avec refresh de token automatique
- Import manuel des activités récentes ou de l'historique complet Strava
- Stockage du payload brut Strava dans `raw_data_json` (bonne décision)

**Métriques calculées**
- Training Load (durée × coefficient sport × intensité HR × bonus dénivelé)
- CTL (Chronic Training Load) — EMA 42 jours
- ATL (Acute Training Load) — EMA 7 jours
- TSB (Training Stress Balance) — CTL − ATL
- ACWR (Acute:Chronic Workload Ratio) — 7j / 28j
- Score de consistance (jours actifs + semaines avec 3+ séances)

**Interfaces utilisateur**
- Dashboard individuel (snapshot période, timeline CTL/ATL/TSB, alertes)
- Progression (comparaison semaine par semaine sur 12 semaines)
- Comparaison de groupe (multi-athlètes)
- Suivi d'objectifs (distance, dénivelé, fréquence)
- Gamification (XP, niveaux, badges, leaderboard)

**Infrastructure**
- Architecture en couches propre (models → services → routers → UI)
- Couverture de tests raisonnables sur tous les domaines métier
- Support multi-sports via coefficients (run, trail, vélo, natation, workout)

---

## 2. Analyse des forces et faiblesses

### Forces

- **Le modèle de données `Activity` est solide** : il capture durée, distance, FC, puissance, cadence, dénivelé, et conserve le JSON brut Strava. Bonne base pour un pivot.
- **Le calcul CTL/ATL/TSB suit la science du sport** : c'est le modèle de Performance Manager Chart utilisé par les coaches pros.
- **L'architecture est propre** : ajouter une source de données ou un nouveau sport ne casse rien.
- **La granularité des coefficients par sport** est déjà en place dans `_sport_helpers.py`.

### Faiblesses majeures vis-à-vis du pivot

| # | Problème | Impact |
|---|---|---|
| 1 | **Source unique : Strava seulement** | Bloquant pour les sports non couverts par Strava (salle, yoga, sports collectifs) |
| 2 | **Pas de saisie manuelle de séance** | Un sportif sans Strava ou en salle ne peut rien enregistrer |
| 3 | **Pas de planification d'entraînement** | L'objectif pivot le demande explicitement — absent à 100% |
| 4 | **Pas de données de récupération** | FC repos, HRV, qualité du sommeil : essentiels pour le sur/sous-entraînement |
| 5 | **Métriques d'intensité limitées** | RPE manuel absent, TSS vélo (power-based) absent, pace zones absent |
| 6 | **Export IA : inexistant** | Aucun endpoint ou format conçu pour être lu par un LLM |
| 7 | **Sync manuel uniquement** | Pas de webhook Strava, pas de sync automatique en arrière-plan |
| 8 | **Pas de profil athlète complet** | Pas de FC max, FTP, VMA, seuils de puissance — impossible de personnaliser les zones |
| 9 | **Pas de suivi de blessures** | Pourtant directement lié à l'objectif anti-blessure |
| 10 | **ACWR calculé mais non contextualisé** | La zone de danger (>1.5) est calculée mais jamais expliquée à l'utilisateur |

---

## 3. Pistes d'amélioration pour le pivot

### 3.1 Saisie manuelle de séance (priorité haute)

Actuellement l'application est 100% dépendante de Strava. Il faut :

- Un formulaire de saisie manuelle : sport, durée, distance optionnelle, RPE (1–10), notes libres, dénivelé optionnel
- Permettre de corriger une activité importée (ex : Strava a mal classé le sport)
- Champ `source` sur `Activity` : `"strava"`, `"manual"`, `"garmin"`, `"polar"`, etc.

### 3.2 Profil athlète et zones personnalisées (priorité haute)

Sans ce fondement, toutes les métriques d'intensité sont approximatives :

- **FC max** et **FC repos** (pour les zones FC 1–5)
- **FTP** (Functional Threshold Power) pour les cyclistes
- **VMA** (Vitesse Maximale Aérobie) pour les coureurs
- **Seuils de nage** pour les nageurs
- **Poids corporel** (utile pour le calcul puissance/poids, watts/kg)
- Ces données permettent de remplacer les coefficients génériques par des calculs personnalisés (ex : TSS réel = IF² × durée_heures × 100)

### 3.3 Données de récupération (priorité haute)

C'est le point le plus critique pour la détection du surentraînement :

- **HRV (Heart Rate Variability)** : indicateur n°1 de récupération du système nerveux. À saisir manuellement ou via import (HRV4Training, Garmin, Polar)
- **FC au repos** au réveil : simple à saisir, très corrélé à la fatigue
- **Score de sommeil** : durée et qualité (import Garmin Connect, Oura, ou saisie manuelle)
- **Score de fatigue subjective** : échelle de 1–7 (questionnaire Daily Wellness)
- **Douleurs / zones douloureuses** : voir section suivi des blessures

Sans HRV ni FC repos, le TSB seul ne suffit pas à distinguer la fatigue neuronale de la fatigue musculaire.

### 3.4 Planification d'entraînement (priorité haute)

Complètement absent aujourd'hui :

- **Semaine planifiée** : interface pour placer des séances planifiées sur un calendrier (type, durée prévue, intensité cible)
- **Plan d'entraînement** : séquence de semaines avec progression de charge définie (base → build → peak → taper)
- **Comparaison planifié vs réalisé** : pourcentage d'exécution du plan (compliance score)
- **Charge planifiée projetée** : courbe CTL future si le plan est respecté
- Modèle de données : `PlannedSession` avec `planned_date`, `sport_type`, `planned_duration_min`, `planned_load`, `actual_activity_id` (nullable, lié quand réalisé)

### 3.5 Export IA (priorité haute pour le pivot)

L'objectif est d'avoir des données exploitables par un LLM. Il faut un endpoint dédié :

```
GET /export/athletes/{athlete_id}/ai-summary?weeks=8
```

Retournant un JSON structuré (ou Markdown) contenant :
- Profil athlète (âge, poids, sports pratiqués, objectifs actuels)
- Charges des 8 dernières semaines par sport (volume, intensité, sessions)
- CTL/ATL/TSB actuels + tendance
- ACWR et zone de risque
- HRV / FC repos des 7 derniers jours (si disponible)
- Séances planifiées de la semaine à venir
- Historique de blessures récentes
- Badges et alertes déclenchées
- Top 5 séances par charge de la période

Ce format permet à n'importe quel LLM (Claude, GPT-4, Gemini) de produire une analyse personnalisée sans context engineering complexe.

### 3.6 Suivi des blessures et douleurs (indispensable, souvent oublié)

Un sportif qui se blesse perd toutes ses données de contexte si l'app ne le sait pas :

- Modèle `Injury` : zone corporelle, type (musculaire, tendineux, osseux), sévérité (1–3), date début, date fin (nullable si en cours)
- Champ `is_injured` sur `Athlete` (flag rapide)
- Les activités réalisées avec une blessure active devraient être marquées
- Corrélation automatique : comparer les pics d'ACWR avec les dates de blessures déclarées (feedback loop pour améliorer la détection)
- Alerte proactive : si ACWR > 1.5 ET TSB < -20 → notification de risque blessure élevé

### 3.7 Multi-sport enrichi (priorité moyenne)

L'application reconnaît déjà plusieurs sports mais les traite presque tous pareil :

- **Sports de force** (musculation) : métriques spécifiques (volume = séries × répétitions × charge en kg, tonnage hebdomadaire)
- **Natation** : allure aux 100m comme métrique principale (plus pertinente que la vitesse)
- **Sports collectifs** (foot, basket, rugby) : FC et GPS pertinents, distance parcourue, sprints
- **Triathlon** : vue multi-sport unifiée dans une même séance, avec transition
- **Yoga / récupération active** : ne pas compter comme charge — plutôt comme récupération

### 3.8 Notifications et alertes intelligentes (priorité moyenne)

Le système d'alertes existe mais reste passif (affiché dans le dashboard) :

- Push notifications ou email quand l'ACWR dépasse 1.3 / 1.5
- Rappel si aucune séance depuis N jours (risque de déconditionning)
- Alerte si TSB descend sous -30 (fatigue accumulée critique)
- Confirmation de récupération : TSB positif → "bonne fenêtre de charge"
- Rappel de saisir HRV le matin (habitude à ancrer)

### 3.9 Synchronisation automatique (priorité moyenne)

La sync manuelle est acceptable pour un MVP mais freine l'adoption :

- **Webhook Strava** : Strava envoie un event HTTP dès qu'une activité est créée/modifiée. L'endpoint existe déjà, il manque le handler
- **Sync programmée** : job toutes les 4h via APScheduler ou Celery (ou simplement un cron système)
- Pour les autres sources futures (Garmin, Polar, Apple Health) : même pattern

### 3.10 Connecteurs de données supplémentaires (priorité basse à moyen terme)

Pour ne pas rester dépendant de Strava :

| Source | Intérêt |
|---|---|
| Garmin Connect | GPS + HRV + sommeil natif |
| Polar Flow | HRV très précis, zones HR automatiques |
| Apple Health / HealthKit | Smartphones iOS, large adoption |
| Google Fit | Smartphones Android |
| Fitbit | Sommeil, HRV, saisie manuelle facilitée |
| GPX/FIT upload | Import de fichiers pour les appareils non connectés |

---

## 4. Ce qu'un sportif attend et qui n'est pas mentionné

### 4.1 Calendrier d'entraînement visuel

Une vue calendrier mensuelle (pas juste une liste) est quasi-universelle dans toutes les apps de sport (Garmin, TrainingPeaks, Final Surge). Chaque jour affiche un indicateur de charge coloré. C'est la vue que les sportifs consultent le plus souvent.

### 4.2 Vue "semaine en cours" avec progression vers les objectifs

Un encadré simple en haut du dashboard : "Cette semaine : 3/5 séances · 42/60 km · CTL +2.1". Les sportifs pensent en semaines.

### 4.3 Test de condition physique (fitness tests)

- Test 6 minutes de course (estimation VO2max)
- Test Cooper, test de 1RM (force max), test de FTP en vélo
- Ces tests, saisis à intervalles réguliers, permettent de tracer la progression réelle de la condition physique, indépendamment du volume

### 4.4 Périodisation de la charge

La science de l'entraînement structure l'année en phases : General Preparation → Specific Preparation → Competition → Transition. L'app devrait permettre de définir ces phases et d'adapter les alertes en conséquence (une charge ATL élevée en phase de préparation est normale ; la même en phase de compétition est un problème).

### 4.5 Ratio intensité / volume par zone

Avoir simplement "45 min de course" ne suffit pas. Il faut savoir combien de temps en Zone 2 (endurance fondamentale), Zone 3 (tempo), Zone 4/5 (seuil/VO2max). La plupart des plans modernes recommandent 80% en Z1/Z2 et 20% en Z3+. Sans cette donnée, impossible de dire si l'athlète s'entraîne correctement.

### 4.6 Suivi de la nutrition (optionnel mais fort ROI)

Même minimal : calories dépensées vs apports estimés, poids corporel, niveau d'hydratation. La nutrition est l'un des premiers facteurs de récupération et de performance.

### 4.7 Notes post-séance et journal d'entraînement

Un champ texte libre après chaque séance ("jambes lourdes", "super sensations", "douleur genou droit") est extrêmement précieux. C'est le matériau brut le plus riche pour l'IA — bien plus que les chiffres seuls. Strava a ce champ mais l'application ne l'utilise pas vraiment.

### 4.8 Partage et rapport PDF / exportable

Un sportif veut pouvoir envoyer son bilan mensuel à son coach. Un PDF ou un rapport Markdown auto-généré (charge totale, sessions, CTL/ATL, points forts, points faibles) est une fonctionnalité très demandée.

### 4.9 Météo contextuelle

Pour les sports outdoor (running, vélo, trail), la météo du jour de la séance est un contexte précieux. Une chaleur extrême explique un rythme plus lent. Une rafale de vent justifie une puissance élevée avec une vitesse faible. Corréler les performances avec les conditions météo améliore l'analyse.

---

## 5. Recommandations pour le pivot

### Ordre de priorité suggéré

| Priorité | Action | Valeur |
|---|---|---|
| 1 | Saisie manuelle de séance | Supprime la dépendance Strava-only |
| 2 | Profil athlète avec zones personnalisées | Personnalise toutes les métriques |
| 3 | Données de récupération (HRV, FC repos, fatigue) | Core de la détection sur/sous-entraînement |
| 4 | Endpoint export IA structuré | Permet l'intégration LLM immédiate |
| 5 | Planification de séances (semaine) | Répond à l'objectif pivot explicite |
| 6 | Suivi des blessures | Indispensable pour la prévention |
| 7 | Vue calendrier mensuelle | UX attendue par tout sportif |
| 8 | Zones d'intensité (Z1–Z5) par activité | Qualité de l'entraînement vs quantité |
| 9 | Webhook Strava + sync auto | Confort d'usage |
| 10 | Intégration IA (Claude / GPT-4) | Phase 2 — requiert les 9 points précédents |

### Prérequis pour l'IA en phase 2

L'IA ne peut donner des conseils pertinents que si elle dispose de :
- Profil athlète complet (âge, poids, FC max, VMA, objectifs, sport principal)
- Données de récupération (HRV, sommeil, fatigue subjective)
- Historique de blessures
- Plan d'entraînement vs réalisé
- Notes post-séance

Sans ces données, l'IA ne peut que reformuler ce que l'app affiche déjà. Avec elles, elle peut détecter des patterns invisibles à l'oeil nu et produire des recommandations vraiment personnalisées.

---

## 6. Ce qu'il ne faut pas toucher

- Le modèle de calcul CTL/ATL/TSB est correct et bien implémenté — ne pas le refactorer
- L'architecture en couches (models → services → routers → UI) est saine — la garder
- Le stockage du `raw_data_json` Strava est une excellente décision — ne pas supprimer
- Les tests existants couvrent les cas critiques — continuer dans cette direction
- Les coefficients multi-sport dans `_sport_helpers.py` — les enrichir plutôt que les remplacer

---

*Audit rédigé le 2026-05-20. Basé sur l'analyse statique complète du code source.*
