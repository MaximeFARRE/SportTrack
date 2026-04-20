# Plan global du projet

## Phase 0 — Cadrage et règles du projet

* le but de la V1 est :

  * créer un compte
  * connecter Strava
  * importer les activités
  * voir un dashboard perso
  * créer un groupe
  * comparer plusieurs personnes simplement

### 0.2 Fixer les conventions techniques

À écrire une fois pour toutes :

* nommage des fichiers
* nommage des routes
* nommage des fonctions
* tous les calculs métier dans `services/`
* aucune logique métier dans `ui/`
* aucune requête Strava dans les pages Streamlit
* toute donnée sportive liée à `athlete_id`
* toute donnée de droits liée à `user_id`
* toute comparaison liée à `group_id`

### 0.3 Préparer l’environnement local

À vérifier :

* environnement Python propre
* dépendances installées
* Git initialisé
* `.env` prêt
* base SQLite fonctionnelle
* app FastAPI démarre

---

# Phase 1 — Socle technique

## 1.1 Finaliser l’architecture minimale

Objectif : avoir un projet qui démarre proprement.

À mettre en place :

* `config.py`
* `db.py`
* `main.py`
* `run.py`
* structure de dossiers stable
* scripts exécutables en module

### 1.2 Ajouter les fichiers de base utiles

Créer ou compléter :

* `README.md`
* `AGENTS.md`
* `.gitignore`
* `requirements.txt`

### 1.3 Préparer les bases de test

Même si les tests seront simples au début :

* structure `tests/`
* premier test de démarrage de l’app
* premier test de création de session DB

---

# Phase 2 — Modèle de données principal

## 2.1 Finaliser les modèles déjà commencés

À consolider :

* `User`
* `Athlete`
* `Activity`

Vérifier :

* clés primaires
* index
* unicité des champs importants
* dates de création / mise à jour
* cohérence des types

## 2.2 Ajouter les modèles manquants de la V1

Créer ensuite :

* `Group`
* `GroupMember`
* `DailyMetric`
* `WeeklyMetric`

Puis plus tard :

* `Lap`
* `Goal`

### 2.3 Définir les relations logiques

Même si tu restes simple au début, il faut clarifier :

* un `User` possède 0 ou plusieurs `Athlete`
* un `Athlete` possède 0 ou plusieurs `Activity`
* un `Group` possède plusieurs membres
* un membre est lié à un `User`
* les métriques sont recalculées par `Athlete`

### 2.4 Gérer les migrations simplement

Au début :

* recréation simple de base possible
* script `init_db`
* script `reset_db` plus tard si besoin

Puis plus tard :

* vraie stratégie de migration si tu passes à PostgreSQL

---

# Phase 3 — Schémas et validation des données

## 3.1 Créer les schémas d’entrée/sortie

Pour chaque ressource principale :

* `UserCreate`
* `UserRead`
* `AthleteRead`
* `ActivityRead`
* `GroupCreate`
* `GroupRead`
* `MetricRead`

### 3.2 Séparer clairement modèles DB et schémas API

Règle :

* `models/` = tables SQL
* `schemas/` = formats pour l’API

### 3.3 Ajouter les validations utiles

Exemples :

* email valide
* champs obligatoires
* distances non négatives
* durées non négatives
* dates bien formées

---

# Phase 4 — Authentification de l’application

## 4.1 Création de compte

Fonctions à développer :

* création d’un utilisateur
* hash du mot de passe
* vérification email déjà existant
* retour JSON propre

## 4.2 Connexion utilisateur

Mettre en place :

* login par email + mot de passe
* génération d’un token
* récupération de l’utilisateur courant

## 4.3 Sécurisation minimale des routes

À protéger au moins :

* routes user
* routes athlete
* routes activités perso
* routes groupes privés

## 4.4 Gestion simple des rôles

Pour la V1 :

* utilisateur normal
* propriétaire de groupe

Pas besoin de système complexe au départ.

---

# Phase 5 — Gestion des utilisateurs

## 5.1 Routes utilisateur

Créer :

* création de compte
* lecture du profil courant
* mise à jour du nom affiché
* désactivation éventuelle

## 5.2 Service utilisateur

Centraliser dans `auth_service.py` ou `user_service.py` :

* création
* récupération
* validation login
* hash mot de passe

---

# Phase 6 — Connexion Strava

## 6.1 Comprendre le flux OAuth

Objectif : un utilisateur connecté à l’app doit pouvoir relier son compte Strava.

À faire :

* URL d’autorisation
* callback
* échange code → tokens
* stockage access token / refresh token
* récupération du profil Strava

## 6.2 Créer les routes Strava

Par exemple :

* `/athletes/connect-strava`
* `/athletes/strava/callback`
* `/athletes/me`

## 6.3 Sauvegarder correctement les informations Strava

Dans `Athlete` :

* `provider = "strava"`
* `provider_athlete_id`
* `access_token`
* `refresh_token`
* `token_expires_at`
* infos de profil

## 6.4 Gérer le refresh token

Très important :

* si token expiré, le renouveler
* ne jamais appeler Strava avec un token mort
* centraliser ça dans `strava_service.py`

---

# Phase 7 — Import des activités

## 7.1 Import historique initial

Quand un utilisateur connecte Strava :

* récupérer ses activités passées
* les stocker
* éviter les doublons
* lier chaque activité au bon `athlete_id`

## 7.2 Synchronisation récente

Créer une logique simple :

* récupération des activités récentes
* mise à jour des activités existantes
* création des nouvelles

## 7.3 Parsing propre des champs utiles

Conserver au minimum :

* nom de séance
* type de sport
* date
* durée
* moving time
* distance
* D+
* vitesse moyenne/max
* FC moyenne/max
* cadence moyenne
* puissance moyenne
* calories si dispo

## 7.4 Gérer les cas particuliers

Prévoir :

* activité sans fréquence cardiaque
* activité sans puissance
* activité sans distance
* activité manuelle
* activité supprimée côté Strava plus tard

---

# Phase 8 — Service des activités

## 8.1 Créer le service dédié

Dans `activity_service.py` :

* créer une activité
* lire une activité
* lister les activités d’un athlète
* filtrer par date
* filtrer par sport
* vérifier les doublons

## 8.2 Créer les routes API activités

Par exemple :

* `/activities`
* `/activities/{id}`
* `/activities?athlete_id=...`
* `/activities?sport_type=Run`

## 8.3 Ajouter les filtres utiles

À prévoir :

* par date début / fin
* par sport
* par utilisateur
* par groupe plus tard

---

# Phase 9 — Calcul des métriques

## 9.1 Définir les métriques minimales

Pour la V1 :

* nombre de séances
* durée totale
* distance totale
* D+ total
* répartition par sport
* volume journalier
* volume hebdomadaire

## 9.2 Créer `metrics_service.py`

Fonctions à créer :

* calcul journalier
* calcul hebdomadaire
* agrégation par sport
* calcul sur une période

## 9.3 Créer les tables de métriques

Remplir :

* `DailyMetric`
* `WeeklyMetric`

## 9.4 Mettre en place le recalcul

Deux options :

* recalcul complet après sync
* recalcul ciblé seulement sur les dates impactées

Pour commencer :

* recalcul simple, plus facile à fiabiliser

---

# Phase 10 — Dashboard individuel

## 10.1 Construire le backend du dashboard

Créer un endpoint qui renvoie :

* stats semaine
* stats mois
* tendances récentes
* volumes par sport
* dernières activités

## 10.2 Construire la page Streamlit “Mon dashboard”

Afficher :

* total séances semaine
* temps total semaine
* distance totale
* D+ total
* graphique volume journalier
* graphique volume hebdomadaire
* répartition par sport

## 10.3 Ajouter les filtres de période

Par exemple :

* 7 jours
* 30 jours
* 12 semaines
* période personnalisée

## 10.4 Garder l’UI légère

Objectif :

* rapide à lire
* peu d’éléments
* pas de logique complexe dans la page

---

# Phase 11 — Historique et détail des séances

## 11.1 Page liste des activités

Afficher :

* date
* sport
* nom
* durée
* distance
* D+
* FC moyenne

## 11.2 Ajouter les filtres dans l’historique

Filtres utiles :

* sport
* période
* recherche texte
* tri

## 11.3 Page détail d’une activité

Afficher :

* résumé complet
* données clés
* infos Strava brutes utiles
* plus tard les laps

## 11.4 Prévoir les notes manuelles

Plus tard :

* ressenti
* fatigue
* commentaire perso
* qualité de séance

---

# Phase 12 — Groupes et comparaison multi-utilisateur

## 12.1 Créer la logique groupe

Fonctions à développer :

* créer un groupe
* ajouter un membre
* retirer un membre
* lister les groupes d’un utilisateur

## 12.2 Créer les routes groupes

Par exemple :

* `/groups`
* `/groups/{group_id}`
* `/groups/{group_id}/members`

## 12.3 Gérer les permissions

Règles simples :

* seul le propriétaire peut modifier le groupe
* un membre peut voir les comparaisons s’il appartient au groupe

## 12.4 Créer la logique de comparaison

Comparer entre membres :

* nombre de séances
* durée totale
* distance totale
* D+
* charge simple
* répartition par sport

## 12.5 Créer la page Streamlit “Comparaison”

Afficher :

* tableau des membres
* bar chart volume hebdo
* courbe 12 semaines
* classement période choisie

---

# Phase 13 — Charge d’entraînement

## 13.1 Définir une première formule simple

Ne pas viser trop compliqué tout de suite.

Exemple :

* charge = durée × coefficient sport
  ou
* charge = durée × coefficient intensité estimée

## 13.2 Calculer une charge par activité

Stocker ou recalculer :

* charge unitaire
* charge journalière
* charge hebdo

## 13.3 Afficher charge 7 jours / 28 jours

Premiers indicateurs utiles :

* charge 7j
* charge 28j
* ratio court / long terme

## 13.4 Utiliser la charge dans le dashboard

Ajouts possibles :

* charge semaine
* évolution charge
* comparaison charge entre membres

---

# Phase 14 — Laps et analyse de séance

## 14.1 Ajouter le modèle `Lap`

Si nécessaire dans la V2 :

* distance
* durée
* HR
* puissance
* cadence

## 14.2 Étendre le sync Strava

Récupérer les laps pour certaines activités.

## 14.3 Créer une vue “analyse séance”

Pour les séances intéressantes :

* découpage par laps
* allure moyenne
* FC moyenne
* puissance moyenne

---

# Phase 15 — Objectifs sportifs

## 15.1 Modèle `Goal`

Créer :

* nom objectif
* sport
* date cible
* distance cible
* D+ cible
* notes

## 15.2 Routes objectifs

Permettre :

* créer
* lire
* modifier
* archiver

## 15.3 Page objectifs

Afficher :

* objectif actif
* jours restants
* volume récent
* progression vers l’objectif

---

# Phase 16 — Automatisation de la synchronisation

## 16.1 Sync manuelle stable

Avant tout :

* bouton “synchroniser”
* logs corrects
* pas de doublons

## 16.2 Script planifié local

Créer un script exécutable :

* sync des comptes connectés
* refresh token si besoin
* import nouveautés
* recalcul métriques

## 16.3 Préparer les webhooks Strava

Pas forcément tout de suite, mais garder la place dans l’architecture.

---

# Phase 17 — Qualité, robustesse, erreurs

## 17.1 Ajouter des logs propres

À mettre surtout dans :

* auth
* sync Strava
* import activité
* calcul métriques

## 17.2 Gérer les erreurs courantes

Prévoir :

* token expiré
* utilisateur sans Strava
* activité absente
* groupe inexistant
* accès interdit
* base vide

## 17.3 Ajouter des messages propres dans l’UI

Éviter les erreurs brutes.

---

# Phase 18 — Tests

## 18.1 Tests backend de base

À couvrir :

* création utilisateur
* login
* création groupe
* ajout membre
* lecture activités
* import activité mockée

## 18.2 Tests métier

À couvrir :

* calcul métriques journalières
* calcul métriques hebdo
* agrégations par sport
* charge d’entraînement simple

## 18.3 Tests multi-utilisateur

À vérifier :

* un utilisateur ne voit pas les données privées d’un autre
* un membre voit bien le groupe auquel il appartient
* un non-membre ne voit pas les stats du groupe

---

# Phase 19 — Améliorations UX

## 19.1 Rendre l’interface plus agréable

À améliorer :

* navigation
* cohérence des pages
* titres clairs
* filtres visibles
* pages rapides

## 19.2 Ajouter une vraie page d’accueil

Avec :

* résumé
* accès rapide aux pages importantes
* état de la dernière sync

---

# Phase 20 — Déploiement web

## 20.1 Préparer le passage à PostgreSQL

À faire quand le local est stable :

* config par variable d’environnement
* compatibilité totale SQL
* zéro dépendance forte à SQLite

## 20.2 Séparer clairement backend et frontend

Pour que le déploiement soit propre :

* API autonome
* UI autonome
* DB externe

## 20.3 Déployer progressivement

Ordre conseillé :

* backend
* DB
* frontend
* sync planifiée

## 20.4 Sécuriser les secrets

Ne jamais exposer :

* tokens Strava
* client secret
* secret JWT

---

# Phase 21 — Fonctionnalités avancées

## 21.1 Détection des semaines à risque

Premières règles simples :

* hausse brutale du volume
* trop de jours consécutifs
* charge très supérieure à la moyenne récente

## 21.2 Prédiction de forme

Version simple :

* tendance du volume
* régularité
* charge récente
* constance de pratique

## 21.3 Estimation de performance

Exemples :

* estimation 10 km
* estimation semi
* estimation trail simple

## 21.4 Conseils automatiques

Plus tard :

* semaine trop chargée
* manque de récupération
* faible régularité
* peu de séances spécifiques

---

# Ordre concret recommandé

Si on simplifie tout ça en ordre opérationnel, je te conseille de développer exactement comme ça :

## Bloc 1 — Base technique

1. finaliser config / db / main
2. finaliser modèles
3. créer schémas
4. mettre auth simple

## Bloc 2 — Flux principal

5. création utilisateur
6. login
7. connexion Strava
8. import historique
9. lecture activités

## Bloc 3 — Valeur produit

10. calcul métriques
11. dashboard individuel
12. historique
13. détail séance

## Bloc 4 — Multi-utilisateur

14. groupes
15. membres
16. comparaison simple

## Bloc 5 — Fonctions utiles

17. charge d’entraînement
18. objectifs
19. sync automatique

## Bloc 6 — Fonctions avancées

20. laps
21. risque
22. prédiction
23. estimation performance

## Bloc 7 — Finalisation

24. tests
25. UI plus propre
26. déploiement web

---

# Ce qui doit être dans la vraie V1

Pour rester intelligent, la vraie V1 complète mais réaliste devrait s’arrêter ici :

* auth utilisateur
* connexion Strava
* import des activités
* historique des activités
* dashboard individuel
* groupes
* comparaison simple
* sync manuelle stable

Pas plus.

---

# Ce qui doit être en V2

* charge d’entraînement
* objectifs
* laps
* sync automatique
* pages plus propres

---

# Ce qui doit être en V3

* risque de blessure
* prédiction
* estimation de performance
* recommandations automatiques
