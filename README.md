# My Life Manager

Application web personnelle (PWA) : tableau de bord, agenda, tâches, notes, alarmes, projets et formations, suivi et bilans.
Installable gratuitement sur iPhone depuis Safari, utilisable sur ordinateur, fonctionne hors connexion. Aucune dépendance, aucun abonnement.

## Fonctionnalités

| Module | Contenu |
|---|---|
| **Accueil** | date et heure, message de bienvenue, tâches du jour, tâches en retard, prochains rendez-vous, prochaines alarmes, objectifs en cours, « À ne pas oublier », ajout rapide (note, tâche, activité, alarme) |
| **Agenda** | vues jour / semaine / mois, création par clic sur un créneau, glisser-déposer (appui long sur mobile), redimensionnement, répétitions (quotidienne, semaine, hebdo, 2 semaines, mensuelle, annuelle), suppression ou déplacement d'une seule occurrence, rappels, catégories |
| **Tâches** | titre, description, date limite, heure, priorité, catégorie, projet, statut (à faire / en cours / terminé / reporté), rappel ; filtres (non terminées, aujourd'hui, en retard, semaine, terminées), recherche, vue liste ou tableau (kanban), ajout rapide, report |
| **Notes** | carnets, catégories (dont « À ne pas oublier »), épinglage, recherche globale, titres, listes, cases à cocher cliquables, enregistrement automatique |
| **Alarmes** | heure, jours de répétition, titre, description, 6 sons, activer / désactiver, reporter / arrêter, rappels de tâches et d'activités, notifications, mode réveil de nuit, envoi vers l'app Horloge (Raccourcis) ou Calendrier (.ics) |
| **Projets** | 7 espaces créés (Formation de producteur exécutif, Perform English avec Kayo, Sport et entraînement, CRAMCITY Entertainment, CRAMCITY MANAGER, Création de contenu YouTube, Recherche d'emploi) + création illimitée ; chacun avec tâches, notes, objectifs, échéances, journal d'apprentissage, chrono de temps passé et historique |
| **Suivi** | tâches réalisées (jour / semaine), objectifs atteints / non atteints, temps par projet, série de jours actifs, bilan quotidien et hebdomadaire, journal « ce que j'ai appris », historique complet |
| **Réglages** | prénom, thème clair / sombre / auto, couleur d'accent, code de verrouillage (chiffrement AES-256), sauvegarde (normale ou chiffrée), restauration avec fusion, synchronisation, export Calendrier, catégories |

## Architecture (simple, gratuite, fiable)

- HTML + CSS + JavaScript natif (modules ES), **aucune dépendance ni étape de compilation** : il suffit d'héberger les fichiers.
- Données stockées dans **IndexedDB** (base persistante de l'appareil, conservée après fermeture), avec demande de stockage durable.
- **Chiffrement optionnel** des données sur l'appareil (code de verrouillage, PBKDF2 + AES-GCM 256 bits).
- **Service worker** : fonctionnement hors connexion et mises à jour automatiques.
- **Synchronisation** ordinateur ⇄ iPhone : Supabase (offre gratuite), chiffrée de bout en bout ; ou par fichier de sauvegarde (fusion intelligente).

```
index.html, styles.css, manifest.webmanifest, sw.js
js/        app.js (démarrage, navigation) · store.js (stockage, chiffrement) · alarm-engine.js
           recur.js · ics.js · sync.js · editors.js · components.js · views/*.js
icons/     icônes et écrans de lancement iPhone (générés par tools/make-icons.mjs)
tools/     serve.mjs (serveur local) · make-icons.mjs
```

## Limites techniques (important)

- **Une application web ne peut pas garantir une alarme quand l'iPhone est verrouillé ou l'app fermée.** iOS suspend les PWA ; seules les notifications « push » envoyées par un serveur peuvent les réveiller, ce qui demanderait un serveur permanent.
- **Solution fiable et gratuite intégrée** : chaque alarme a un bouton « Horloge iPhone » qui crée une **vraie alarme native** via l'app Raccourcis, et tout (alarmes, tâches, activités) peut être exporté vers **Apple Calendrier** avec alertes. Voir le guide dans l'app (menu *Guide iPhone*).
- Dans l'app ouverte, les alarmes sonnent normalement ; le **mode réveil de nuit** garde l'écran allumé.
- Les notifications web sur iPhone nécessitent iOS 16.4+ et l'app installée sur l'écran d'accueil.
- Sans synchronisation, les données restent sur chaque appareil : faites des sauvegardes (rappel automatique sur l'accueil).

## Publier gratuitement (GitHub Pages)

L'application doit être servie en **HTTPS** pour être installable sur iPhone. GitHub Pages est gratuit et sans abonnement.

1. Créez un compte gratuit sur <https://github.com> (ou connectez-vous).
2. **New repository** → nom `my-life-manager` → **Public** → *Create repository*.
   (GitHub Pages gratuit exige un dépôt public : le **code** est visible, mais **vos données ne le sont jamais**, elles restent sur vos appareils.)
3. Envoyez les fichiers, au choix :
   - **Sans ligne de commande** : sur la page du dépôt, *uploading an existing file* → glissez **tout le contenu** du dossier `my-life-manager` (sauf `.git` et `.claude`) → *Commit changes*.
   - **Avec Git** (le dépôt local est déjà prêt et commité) :
     ```
     git remote add origin https://github.com/VOTRE-NOM/my-life-manager.git
     git push -u origin main
     ```
4. Dépôt → **Settings › Pages** → *Source* : **Deploy from a branch** → Branch **main** / **(root)** → *Save*.
5. Après 1 à 2 minutes, l'app est en ligne à `https://VOTRE-NOM.github.io/my-life-manager/`.
6. Sur l'iPhone, ouvrez cette adresse dans **Safari** → **Partager** → **Sur l'écran d'accueil**.

Alternatives gratuites équivalentes : **Cloudflare Pages** (accepte les dépôts privés, ou import direct d'un dossier) ou **Netlify** (glisser-déposer du dossier sur app.netlify.com/drop, puis création d'un compte gratuit pour conserver le site).

**Mettre à jour l'app** : renvoyez les fichiers modifiés sur GitHub ; l'app installée se met à jour toute seule à l'ouverture suivante.

## Synchronisation Supabase (facultative, gratuite)

Pas à pas complet dans l'app : *Guide iPhone › 5. Synchronisation*. En résumé : créer un projet gratuit sur supabase.com, exécuter le script SQL fourni (bouton « Copier le script SQL » dans Réglages), désactiver « Confirm email », puis saisir l'URL et la clé publique dans *Réglages › Synchronisation* sur chaque appareil avec **la même phrase secrète**.

## Développement local

```
node tools/serve.mjs        # http://localhost:5178
node tools/make-icons.mjs   # régénère icônes et écrans de lancement
```

Raccourcis clavier sur ordinateur : **N** nouvelle note · **T** nouvelle tâche · **A** nouvelle activité.
