# SportTrack 🏃‍♂️🚴‍♂️🏊‍♂️

[![Next.js](https://img.shields.io/badge/Next.js-16.2-black?style=for-the-badge&logo=next.design&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.0-blue?style=for-the-badge&logo=react&logoColor=white)](https://react.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-Database-emerald?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![Vercel](https://img.shields.io/badge/Vercel-Hosted-black?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

SportTrack est une plateforme web moderne et multi-utilisateur conçue pour le suivi d'entraînement d'endurance, l'analyse physiologique de la forme et la détection précoce des risques de blessures ou de surentraînement. Elle intègre également des fonctionnalités collaboratives avancées permettant à des **coachs** de gérer la périodisation et le calendrier d'entraînement de leurs **athlètes** au sein de groupes ciblés.

---

## Sommaire

1. [Fonctionnalités Clés](#1-fonctionnalités-clés)
2. [Architecture & Choix Techniques](#2-architecture--choix-techniques)
3. [Structure du Repository](#3-structure-du-repository)
4. [Installation & Configuration Locale](#4-installation--configuration-locale)
5. [Guide d'Utilisation](#5-guide-dutilisation)
6. [Déploiement en Production](#6-déploiement-en-production)
7. [Workflow de Contribution & Tests](#7-workflow-de-contribution--tests)

---

## 1. Fonctionnalités Clés

* **Synchronisation Wearables & Activités** : Connexion native à Strava via OAuth 2.0 pour l'import des activités historiques et récentes. Intégration de Garmin Connect et d'autres capteurs (Polar, Fitbit, Suunto) via l'API Terra.
* **Calcul Physiologique de la Forme** : Évaluation automatique de la fatigue (ATL - Acute Training Load), de la condition physique générale (CTL - Chronic Training Load) et de l'état de fraîcheur (TSB - Training Stress Balance).
* **Détection du Risque de Blessure (ACWR)** : Algorithme calculant le rapport de charge aigu/chronique (Acute:Chronic Workload Ratio). Des alertes se déclenchent en cas d'augmentation trop rapide du volume ou de signes de récupération nocturne insuffisante (Variabilité Cardiaque - HRV, Score Sommeil, Stress).
* **Périodisation & Objectifs** : Structuration de la saison en blocs d'entraînement thématiques (Foncier, Spécifique, Affûtage) et définition d'objectifs hebdomadaires (volume horaire cravaché, nombre de séances hebdomadaires) ou d'objectifs de compétition (Races).
* **Groupes & Coaching** : Création de collectifs d'entraînement à l'aide de codes d'invitation uniques. Les coachs accèdent au tableau de bord physiologique de leurs athlètes et peuvent planifier des séances collectives ou individuelles qui se propagent et se synchronisent en temps réel sur l'agenda des membres.
* **Journalisation Qualitative Post-Séance** : Renseignement subjectif de l'effort perçu (échelle de Borg RPE 1-10), ressenti (1-5), motivation, et déclaration de douleurs localisées (tags corporels).
* **Bilan IA** : Module d'export optimisé (Markdown/JSON) synthétisant l'état de forme et l'historique récent pour servir de prompt à des modèles de langage (LLM - ChatGPT, Claude) agissant comme coachs virtuels.

---

## 2. Architecture & Choix Techniques

### Stack Technique
- **Frontend & Backend** : **Next.js 16 (App Router)** et React 19. Utilisation intensive des Server Actions pour l'accès aux données sécurisées et des Route Handlers pour les webhooks et endpoints cron.
- **Base de données & Sécurité** : **Supabase (PostgreSQL 17)**. L'authentification est déléguée à Supabase Auth. Les politiques de sécurité **RLS (Row Level Security)** filtrent et protègent les données de manière étanche.
- **Wearables Sync** : Strava API (OAuth + Webhook), Terra API (Widget + Webhook) et intégration de Garmin Connect via une fonction serverless Python utilisant la bibliothèque `python-garminconnect`.
- **Planification des Tâches** : Deux routes cron `/api/cron/daily-risk` et `/api/cron/daily-injury` sont déclenchées quotidiennement via **Vercel Cron** pour recalculer les indicateurs physiologiques et analyser les risques.

### Pourquoi avoir retiré le backend FastAPI ?
Dans une version précédente, SportTrack s'appuyait sur un serveur auxiliaire FastAPI écrit en Python pour exécuter les calculs de charge et servir d'intermédiaire. Pour simplifier l'architecture, ce backend a été entièrement supprimé au profit d'une **architecture unifiée Next.js + Supabase** :
1. **Performance** : Suppression de la latence réseau due aux appels inter-serveurs entre Next.js et FastAPI.
2. **Maintenance simplifiée** : Centralisation du code et des typages TypeScript de bout en bout.
3. **Sécurité native** : Utilisation directe des règles RLS de Supabase, évitant de devoir reproduire les filtres d'utilisateurs en couche applicative.
4. **Triggers Database** : La logique de propagation complexe (sessions de groupe vers calendriers individuels) et de réconciliation de séances est exécutée avec une vitesse maximale directement dans des triggers PostgreSQL.

---

## 3. Structure du Repository

```text
SportTrack/
├── .claude/               # Configuration locale Claude Code
├── .devcontainer/         # Environnement de conteneur de développement VS Code
├── docs/                  # Dossier de documentation technique
│   ├── archive/           # Fichiers d'historique (plans de migration, audits passés)
│   ├── architecture.md    # Schéma d'architecture système et flux de données
│   ├── supabase-schema.md # Spécification détaillée des tables, RLS et déclencheurs
│   └── user-guide.md      # Guide utilisateur complet (comprenant périodisation & coaching)
├── supabase/              # Configuration Supabase locale
│   ├── migrations/        # Migrations SQL versionnées constituant le schéma de la base
│   └── config.toml        # Fichier de configuration pour le CLI local Supabase
├── web/                   # Application Next.js 16
│   ├── app/               # Pages de l'application (Router App) & actions serveur
│   ├── components/        # Composants d'interface React (Shadcn + Tailwind)
│   ├── lib/               # Bibliothèques (clients Supabase, helpers de calculs)
│   └── package.json       # Dépendances Node.js et scripts npm
```

---

## 4. Installation & Configuration Locale

### Pré-requis
* **Node.js** (v20 ou supérieur recommandé)
* **Supabase CLI** (pour appliquer le schéma de base de données localement)

### 1. Cloner le projet et installer les dépendances
```bash
git clone https://github.com/votre-compte/SportTrack.git
cd SportTrack/web
npm install
```

### 2. Configurer les variables d'environnement
Copiez le fichier exemple dans `web/` et remplissez vos clés Supabase :
```bash
cp .env.example .env.local
```
Éditez ensuite le fichier `web/.env.local` :
```env
NEXT_PUBLIC_SUPABASE_URL=https://votre-projet.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=votre_cle_publique_anon
SUPABASE_SERVICE_ROLE_KEY=votre_cle_secrete_service_role
NEXT_PUBLIC_BASE_URL=http://localhost:3000
WEB_BASE_URL=http://localhost:3000
CRON_SECRET=votre_secret_de_securite_cron
```

### 3. Appliquer les migrations de base de données
Si vous possédez un projet distant Supabase, liez-le et appliquez les migrations SQL :
```bash
npx supabase login
npx supabase link --project-ref VOTRE_PROJECT_REF
npx supabase db push
```

### 4. Lancer le serveur de développement
```bash
npm run dev
```
Ouvrez [http://localhost:3000](http://localhost:3000) dans votre navigateur.

---

## 5. Guide d'Utilisation

1. **Création de Compte** : Inscrivez-vous sur `/signup`. Un e-mail de confirmation vous sera envoyé par Supabase.
2. **Onboarding** : Renseignez vos métriques de base (FC Max, FC Repos). Ces données sont indispensables pour initialiser vos 5 zones d'intensité selon la méthode Friel.
3. **Connexions** : Rendez-vous sur votre profil pour lier votre compte Strava ou Garmin Connect.
4. **Planifier sa Périodisation** : Utilisez l'onglet **Planification** pour créer un bloc de travail (ex : "Foncier 1" sur 4 semaines) et fixer des objectifs de volume hebdomadaire.
5. **Créer/Rejoindre un Groupe** : 
   - Créez un groupe pour préparer un événement cible collectif (ex : "Semi-marathon de Paris").
   - Transmettez le **code d'invitation** généré à vos athlètes ou amis pour qu'ils rejoignent l'aventure et partagent leur préparation.

---

## 6. Déploiement en Production

### Application Web (Vercel)
SportTrack est optimisé pour être hébergé sur Vercel :
* Le répertoire racine de déploiement à renseigner dans la console Vercel est le sous-dossier `web`.
* Configurez les variables d'environnement listées dans `web/.env.example` en production.
* Les tâches planifiées sont déclarées dans `web/vercel.json` et s'appuient sur Vercel Cron.

### Base de données (Supabase)
Les règles RLS et le schéma physique doivent être poussés sur l'instance de production Supabase à l'aide du CLI :
```bash
npx supabase db push
```

---

## 7. Workflow de Contribution & Tests

### Lancer les Tests
Avant toute proposition de modification, vérifiez que le code compile correctement et que la suite de tests est au vert :
```bash
cd web
# Lancer les tests unitaires (Vitest)
npm test
# Lancer la compilation de production pour valider les types
npm run build
```

### Règles de Contribution (Opérationnelles)
* **Pas de commit sur `main`** : Toutes les contributions doivent être poussées sur des branches de travail et faire l'objet de Pull Requests.
* **Convention de branches** : Utilisez les préfixes de branches standard :
  - `feat/` (nouvelle fonctionnalité)
  - `fix/` (résolution de bug)
  - `chore/` (tâches de maintenance, dépendances)
  - `docs/` (documentation)
  - `test/` (écriture de tests)
* **Message de commits** : Respectez le format des **Conventional Commits** (ex: `feat(coaching): add group session propagation trigger`).
