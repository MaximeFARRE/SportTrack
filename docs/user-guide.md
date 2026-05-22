# Guide utilisateur SportTrack

## Sommaire

1. [Premiers pas](#premiers-pas)
2. [Connecter Strava](#connecter-strava)
3. [Connecter Garmin / wearables](#connecter-garmin--wearables)
4. [Tableau de bord](#tableau-de-bord)
5. [Activités](#activités)
6. [Zones d'intensité](#zones-dintensité)
7. [Suivi des blessures](#suivi-des-blessures)
8. [Export pour coach IA](#export-pour-coach-ia)
9. [FAQ](#faq)

---

## Premiers pas

1. Créez un compte sur la page **/signup**.
2. Le wizard d'onboarding s'affiche automatiquement à la première connexion — renseignez votre prénom, votre sport principal et votre FC max.
3. Connectez Strava pour importer vos activités passées (jusqu'à 200 activités récentes).

---

## Connecter Strava

1. Accédez à **Profil → Connexions** (ou cliquez *Connecter Strava* dans le wizard).
2. Cliquez **Autoriser avec Strava** — vous êtes redirigé vers la page d'autorisation Strava.
3. Acceptez. Vos activités récentes sont importées automatiquement.
4. Les nouvelles activités Strava sont synchronisées chaque nuit via webhook (ou manuellement depuis la page Connexions).

> **Remarque :** SportTrack importe les données de fréquence cardiaque et les streams HR pour calculer le temps passé en zones. Assurez-vous que vos activités Strava contiennent des données cardiofréquentielles.

---

## Connecter Garmin / wearables

SportTrack utilise **Terra API** pour se connecter aux montres Garmin, Polar, Fitbit et Apple Health.

1. Accédez à **Profil → Connexions**.
2. Cliquez **Connecter Garmin** (ou votre appareil).
3. Suivez le flux d'authentification Terra.
4. Vos données HRV, sommeil et récupération sont importées quotidiennement.

Ces données alimentent la section **Forme du jour** du tableau de bord.

---

## Tableau de bord

Le tableau de bord affiche une synthèse de votre état de forme :

| Bloc | Description |
|---|---|
| **Forme du jour** | Score 0-10 calculé à partir du TSB (Training Stress Balance) et des données HRV / sommeil. |
| **Cette semaine** | Nombre de séances, durée totale et charge d'entraînement de la semaine courante. |
| **Charge 30j** | Évolution de la CTL (Chronic Training Load = fitness) sur 90 jours. |
| **TSB** | Training Stress Balance = CTL − ATL. Positif = frais, négatif = fatigue accumulée. |
| **Distribution zones** | Répartition du temps en zones Z1–Z5 pour toutes les activités de la semaine. |

---

## Activités

### Importer manuellement

1. Cliquez **+ Nouvelle activité** sur la page Activités.
2. Renseignez sport, durée, distance et les métriques optionnelles (RPE, FC moyenne, ressenti).
3. Utilisez les **tags** pour décrire votre ressenti (jambes lourdes, douleur genou, etc.).

### Ressenti post-séance

Après chaque activité, vous pouvez noter :
- **RPE** (effort perçu, 1-10)
- **Feel score** (ressenti général, 1-5)
- **Motivation** (1-5)
- **Tags** : contextes, qualité de séance, douleurs localisées

Les douleurs répétées sur une même zone sont détectées automatiquement et suggèrent la création d'une blessure.

---

## Zones d'intensité

SportTrack utilise le **modèle Friel à 5 zones** calculées à partir de votre FC max.

| Zone | % FC max | Description |
|---|---|---|
| Z1 | 50–60 % | Récupération active |
| Z2 | 60–70 % | Endurance fondamentale |
| Z3 | 70–80 % | Tempo / seuil aérobie |
| Z4 | 80–90 % | Seuil lactique |
| Z5 | 90–100 % | VO2max / sprint |

### Calculer les zones d'une activité

1. Ouvrez le détail d'une activité importée depuis Strava.
2. Cliquez **Calculer les zones** (le flux HR est récupéré depuis Strava).
3. Les barres de zones s'affichent immédiatement.

### Tendance de polarisation

La page **Progression** affiche sur 12 semaines la répartition :
- **Bas** (Z1+Z2) · **Tempo** (Z3) · **Haut** (Z4+Z5)

Un entraînement polarisé (80 % bas / 20 % haut) est recommandé pour les sports d'endurance.

---

## Suivi des blessures

1. Accédez à **Blessures** dans la navigation.
2. Cliquez **Signaler une blessure** pour ouvrir le formulaire.
3. Renseignez la zone corporelle, le type (musculaire, tendineux…), la sévérité et la date de début.
4. Pour marquer une blessure comme guérie, cliquez ⋯ → **Marquer guérie**.

### Suggestions automatiques

Si vous avez noté des douleurs répétées sur une même zone dans vos ressentis d'activités (≥ 3 occurrences), SportTrack affiche une suggestion de créer une blessure correspondante.

---

## Export pour coach IA

La section **Export pour coach IA** (page Profil) génère un résumé structuré de votre entraînement prêt à être collé dans ChatGPT, Claude ou tout autre LLM.

### Contenu de l'export

- Profil athlète (sport, FC max, âge)
- Forme actuelle (CTL / ATL / TSB / ACWR)
- Récupération 7 derniers jours (HRV, sommeil)
- Semaine en cours (sessions, volume)
- Ressenti récent
- Alertes actives
- Blessures actives
- Plan semaine prochaine

### Utilisation

1. Choisissez la période analysée (4, 8 ou 12 semaines).
2. Cliquez **Copier JSON** ou **Copier Markdown** pour copier dans le presse-papier.
3. Collez dans votre LLM préféré avec une invite du type :
   > *"Voici mes données d'entraînement. Analyse ma forme, identifie les risques et suggère un plan pour la semaine prochaine."*

---

## FAQ

**Q : Mes activités Strava n'apparaissent pas.**  
R : Vérifiez que la connexion Strava est active dans Profil → Connexions. Si elle l'est, cliquez *Synchroniser* pour forcer un import.

**Q : Mon score de forme est à 0.**  
R : Le score de forme nécessite des données de `daily_metrics` (charge d'entraînement calculée). Importez au moins quelques activités et attendez le calcul nocturne (ou déclenchez manuellement).

**Q : Les zones ne s'affichent pas sur mes activités.**  
R : Seules les activités Strava avec données HR peuvent être analysées. Cliquez *Calculer les zones* depuis le détail de l'activité.

**Q : Comment modifier ma FC max ?**  
R : Accédez à **Profil → Modifier le profil** et mettez à jour le champ *FC max*. Les zones sont recalculées automatiquement.

**Q : Je vois une alerte "ACWR élevé".**  
R : L'ACWR (Acute:Chronic Workload Ratio) dépasse 1.3 — votre charge récente est disproportionnée par rapport à votre forme de fond. Privilégiez une séance légère ou du repos.
