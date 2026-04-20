# SportTrack

SportTrack est une application de suivi d'entraînement multi-utilisateur.

L'objectif est de centraliser les activités sportives provenant principalement de Strava, de les stocker dans une base de données, puis de générer des dashboards individuels et de groupe.

Le projet est conçu pour fonctionner d'abord en local, puis être facilement déployé sur le web.

---

# Objectifs du projet

SportTrack doit permettre de :

* connecter un ou plusieurs comptes Strava
* importer automatiquement les activités sportives
* stocker toutes les données dans une base locale
* suivre l'évolution des entraînements dans le temps
* comparer plusieurs personnes dans des groupes
* détecter des tendances, des risques de surcharge ou de blessure
* afficher des dashboards et des graphiques simples
* préparer plus tard des fonctionnalités avancées de prédiction

Exemples de métriques visées :

* volume journalier et hebdomadaire
* nombre de séances
* distance totale
* durée totale
* dénivelé positif
* répartition par sport
* charge d'entraînement
* charge 7 jours / 28 jours
* progression récente
* comparaison entre plusieurs personnes

---

# Stack technique

## Backend

* Python
* FastAPI
* SQLModel
* SQLite au début
* PostgreSQL plus tard

## Frontend

* Streamlit
* Plotly

## Synchronisation

* API Strava
* OAuth2 Strava
* Synchronisation manuelle au début
* Webhooks Strava plus tard

---

# Architecture générale

```text
Frontend Streamlit
        │
        ▼
Backend FastAPI
        │
        ├── Authentification
        ├── Synchronisation Strava
        ├── Gestion des activités
        ├── Calcul des métriques
        ├── Gestion des groupes
        └── Prédictions futures
        │
        ▼
Base de données SQLite / PostgreSQL
```

---

# Structure du projet

```text
SportTrack/
│
├── app/
│   ├── main.py
│   ├── config.py
│   ├── db.py
│   ├── security.py
│   │
│   ├── models/
│   │   ├── user.py
│   │   ├── athlete.py
│   │   ├── activity.py
│   │   ├── lap.py
│   │   ├── group.py
│   │   ├── metric_daily.py
│   │   ├── metric_weekly.py
│   │   └── goal.py
│   │
│   ├── schemas/
│   │   ├── user.py
│   │   ├── athlete.py
│   │   ├── activity.py
│   │   ├── group.py
│   │   ├── metrics.py
│   │   └── goal.py
│   │
│   ├── routers/
│   │   ├── auth.py
│   │   ├── users.py
│   │   ├── athletes.py
│   │   ├── activities.py
│   │   ├── groups.py
│   │   ├── metrics.py
│   │   ├── goals.py
│   │   └── sync.py
│   │
│   ├── services/
│   │   ├── auth_service.py
│   │   ├── strava_service.py
│   │   ├── sync_service.py
│   │   ├── activity_service.py
│   │   ├── metrics_service.py
│   │   ├── risk_service.py
│   │   ├── prediction_service.py
│   │   ├── group_service.py
│   │   └── goal_service.py
│   │
│   └── utils/
│       ├── dates.py
│       ├── sports.py
│       └── conversions.py
│
├── ui/
│   ├── Home.py
│   ├── login.py
│   └── pages/
│       ├── 1_Mon_dashboard.py
│       ├── 2_Mes_activites.py
│       ├── 3_Analyse_seance.py
│       ├── 4_Progression.py
│       ├── 5_Groupes.py
│       ├── 6_Comparaison.py
│       └── 7_Objectifs.py
│
├── scripts/
│   ├── init_db.py
│   ├── import_strava_history.py
│   ├── sync_recent.py
│   └── recompute_metrics.py
│
├── tests/
├── data/
├── .env
├── requirements.txt
├── README.md
└── run.py
```

---

# Modèle de données actuel

## User

Représente un compte utilisateur dans SportTrack.

Champs principaux :

* id
* email
* password_hash
* display_name
* is_active
* created_at

## Athlete

Représente un profil sportif connecté à une source externe, principalement Strava.

Champs principaux :

* id
* user_id
* provider
* provider_athlete_id
* firstname
* lastname
* access_token
* refresh_token
* token_expires_at
* last_sync_at

## Activity

Représente une activité sportive importée.

Champs principaux :

* id
* athlete_id
* provider_activity_id
* sport_type
* start_date
* duration_sec
* distance_m
* elevation_gain_m
* average_speed
* average_heartrate
* average_power

---

# Principes importants du projet

## Multi-utilisateur

Le projet doit fonctionner pour 1 à 10 personnes ou plus.

Toutes les données sportives sont liées à un `athlete_id`.
Toutes les permissions sont liées à un `user_id`.
Toutes les comparaisons sont liées à un `group_id`.

Il ne faut jamais coder la logique comme si un seul utilisateur existait.

Bon exemple :

```python
get_activities_for_athlete(athlete_id)
get_weekly_metrics_for_group(group_id)
```

Mauvais exemple :

```python
get_my_activities()
```

---

# Vision des futures fonctionnalités

## V1

* création de compte
* connexion Strava
* import des activités
* dashboard individuel
* historique des activités
* groupes et comparaison simple

## V2

* synchronisation automatique
* calcul des charges
* objectifs sportifs
* alertes surcharge
* statistiques avancées

## V3

* prédiction de forme
* détection de risque de blessure
* estimation de temps de course
* suggestions automatiques d'entraînement

---

# Commandes utiles

## Installer les dépendances

```bash
pip install -r requirements.txt
```

## Initialiser la base de données

```bash
python -m scripts.init_db
```

## Lancer le backend FastAPI

```bash
python run.py
```

Puis ouvrir :

```text
http://127.0.0.1:8000
http://127.0.0.1:8000/docs
```

---

# Règles de développement

* toujours séparer les modèles, les services et les routes
* ne jamais mettre de logique métier directement dans Streamlit
* ne jamais appeler Strava directement depuis l'interface
* toutes les métriques doivent être calculées dans `services/metrics_service.py`
* toutes les synchronisations doivent passer par `services/sync_service.py`
* tous les accès aux données doivent passer par les modèles SQLModel

---
