# Agenda partagé – SMR de Carhaix (frontend)

Interface web de l'agenda partagé entre soignants et patients du SMR de Carhaix (CHU de Brest).
React 18 + TypeScript + Vite, Tailwind CSS, FullCalendar, React Router, TanStack Query.
Cible : ordinateur (écran ≥ 1280 px, jusqu'à l'écran mural).

> **Pour juste lancer le site : voir [`TUTO_DEMARRAGE.md`](TUTO_DEMARRAGE.md).**
>
> Le **Guide frontend – Agenda SMR Carhaix** (document partagé du groupe) détaille pas à pas
> l'installation, le mode démo, le branchement au backend, Git et le dépannage. Ce README en est le résumé.

## Installation (une seule fois)

Prérequis : **Node.js 18.18 ou plus récent** (LTS 20 ou 22 conseillée, https://nodejs.org) et Git.
Python, Docker et PostgreSQL ne sont pas nécessaires pour le frontend seul.

Depuis la racine du dépôt `logiciel_projet_entreprise` :

```powershell
cd frontend
npm install                  # 1 à 3 min, crée node_modules/ (jamais versionné)
copy .env.example .env       # Mac / Linux : cp .env.example .env
```

## Lancement

### Sans backend (mode mock, données fictives)

`.env` contient par défaut `VITE_USE_MOCK=true`. Puis :

```powershell
npm run dev                  # ouvrir http://localhost:5173 ; Ctrl + C pour arrêter
```

Une modification de `.env` n'est prise en compte qu'en relançant `npm run dev`.
Après un `git pull` qui modifie `package.json`, relancer `npm install`.

Aucun compte n'est nécessaire : **n'importe quel mot de passe est accepté**. L'identifiant est
« NOM Prénom » d'une personne des données fictives, par exemple :

| Identifiant | Profil |
|---|---|
| `DUPONT Daniel` | patient (chambre 101) |
| `QUINET Marc` | soignant (kinésithérapeute) |
| `MADEC Claire` | soignant (aide-soignante) |

Un identifiant inconnu affiche le pop-up d'erreur. Les créations et modifications sont gardées en mémoire
jusqu'au rechargement de la page.

Le faux backend calcule les conflits avec les mêmes règles que le vrai backend (`app/conflits.py`).
Ce sont tous des avertissements : un RDV d'un patient sur une plage repas (11h-14h, 18h-20h) ou sur un
autre de ses RDV, un soignant déjà pris sur ce créneau, ou un RDV hors des horaires habituels d'un soignant
(kinés 9h-18h ; infirmiers et aides-soignants 6h30-21h30). Exemple : déplacer une séance de QUINET Marc à 8h.

### Avec le backend FastAPI

1. Lancer le backend (PostgreSQL, `alembic upgrade head`, `python seed.py`, `uvicorn app.main:app`).
2. Dans `.env` : `VITE_USE_MOCK=false`.
3. `npm run dev`.

Les comptes de `seed.py` fonctionnent (ex. `a05` patient, `kine1` soignant, mot de passe `test1234`).

Le backend n'active pas CORS : en développement, Vite relaie `/api/...` vers le backend
(`VITE_PROXY_TARGET`) en retirant le préfixe `/api`. Rien à modifier côté backend.

### Production

```bash
npm run build        # fichiers statiques dans dist/
```

Servir `dist/` derrière le même serveur que l'API (ou avec un relais `/api` équivalent).
Penser à rediriger toutes les routes vers `index.html` (application monopage).

## Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `VITE_USE_MOCK` | `true` | `true` : faux backend en mémoire ; `false` : backend réel |
| `VITE_API_URL` | `/api` | URL de l'API vue par le navigateur |
| `VITE_PROXY_TARGET` | `http://localhost:8000` | Adresse du backend, utilisée par le relais de Vite |
| `VITE_POLLING_MS` | `30000` | Rafraîchissement automatique des données (ms) |

## Structure

```
src/
├── app/              App.tsx (fournisseurs), router.tsx (routes et protections par rôle)
├── pages/            un fichier par écran : Connexion, Agenda, AgendaPatient, FichePatient, Profil, Unite, Annuaire,
│                     AgendaSoignant, FicheSoignant, CreationProfil, ModifierProfil
├── components/
│   ├── layout/       AppLayout (menu + déconnexion), JaugeZoom, Sidebar (menu burger), EnteteDate
│   ├── planning/     VueSemaine, PlanningSemaine (FullCalendar habillé), BlocOrange, NavigationSemaine
│   ├── rdv/          pop-ups de RDV : information, Nouveau / Modifier (RdvFormModal, SelectPersonnes),
│   │                 avertissements de conflit (un à la fois)
│   ├── profils/      FormulaireProfil (création / modification), ActionsProfil (Modifier / Supprimer),
│   │                 BilanSuppression (message après suppression)
│   ├── unite/        LegendeCouleurs (rappel du code couleur)
│   └── ui/           Modal, PopupMessage (erreur / succès / déconnexion), états de chargement
├── services/api/     SEULE couche qui parle au backend
│   ├── client.ts     appel HTTP, jeton, normalisation des erreurs, choix mock / réel
│   ├── backendTypes.ts  JSON exact du backend (snake_case)
│   ├── adaptateurs.ts   conversion JSON backend ⇄ types du frontend
│   └── auth.ts, rdv.ts, referentiel.ts, plan.ts, comptes.ts
├── mocks/            faux backend en mémoire (mêmes routes, même JSON, mêmes codes HTTP)
├── hooks/            useAuth, useNotifications, useRdv, useReferentiel, useProfils,
│                     useEditionPlanning (actions, conflits, retour arrière)
├── types/            types TypeScript des entités
├── theme/            couleursRdv.ts : code couleur strict des RDV (source unique)
└── utils/            dates (formats français), noms (« DUPONT Daniel »)
```

Pour brancher un autre backend, seuls `services/api/` (et éventuellement `mocks/`) changent.

## Endpoints utilisés (backend actuel)

| Méthode | Route | Corps / paramètres | Réponse | Utilisé pour |
|---|---|---|---|---|
| POST | `/auth/connexion` | formulaire `username`, `password` | `{ access_token, token_type }` | Connexion |
| GET | `/auth/moi` | — | `MoiOut` | Profil connecté, choix de la vue |
| GET | `/rdv` | `?du=&au=&patient_id=&soignant_id=&limite=` | `RDVOut[]` | Plannings |
| POST | `/rdv` | `RDVCreation` | `RDVOut` + `conflits` (201) | Nouveau RDV (un par patient) |
| PATCH | `/rdv/{id}` | `RDVModification` | `RDVOut` + `conflits` | Modifier / déplacer |
| POST | `/rdv/{id}/annuler` | — | `RDVOut` | « Supprimer le RDV » (le RDV est annulé, jamais effacé) |
| GET | `/patients` | — | `PatientOut[]` | Annuaire, unités, formulaire |
| GET | `/soignants` | — | `SoignantOut[]` | Formulaire |
| GET | `/types-rdv` | — | `TypeRDVOut[]` | Liste « Nom RDV », couleurs |
| GET | `/lieux` | — | `LieuOut[]` | Liste « Lieu » |
| GET | `/plan` | `?moment=` | `PlanOut` | Unités : toutes les chambres et leurs patients présents |
| POST | `/planification/synchroniser` | `{ du, jours }` | `SynchronisationOut` | Bouton « Synchroniser » : solveur OR-Tools sur 7 jours |
| GET | `/chambres` | — | `ChambreOut[]` | Liste « Chambre » du formulaire patient |
| POST | `/utilisateurs` | `CompteCreation` | `UtilisateurOut` (201) ; 409 `PROFIL_EXISTANT` si doublon | « Créer le profil » |
| PATCH | `/utilisateurs/{id}` | `CompteModification` | `UtilisateurOut` | « Modifier le profil » |
| DELETE | `/utilisateurs/{id}` | — | `SuppressionOut` (bilan des RDV) | « Supprimer le profil » (archivage) |

Les RDV au statut `annule` ne sont pas affichés. Les RDV `en_attente` (sans heure choisie) ne sont pas
dans la grille : ils sont listés dans le bandeau « À planifier » au-dessus du planning.

Format d'un RDV (novembre 2026) : un RDV a **zéro, un ou plusieurs soignants** (`soignants: [...]`,
`soignant_ids: [...]` à la création) et **zéro ou un patient** (`patient` / `patient_id` peut valoir `null`),
jamais aucun des deux (erreur 422 « Choisissez au moins un patient ou un soignant. »).
Un patient peut créer un RDV « Visite » ou « RDV extérieur » pour lui-même, sans soignant, et modifier ou annuler
ceux qu'il a créés. `GET /auth/moi` renvoie aussi `profession`, `chambre`, `date_arrivee`, `date_depart_prevue`,
`date_naissance`, `email`, `telephone`.

### Gestion des profils (novembre 2026)

Tous les soignants sont administrateurs : ils créent, modifient et suppriment les profils (patients et soignants).
- **Créer** : menu burger « Ajouter un compte » ou bouton « Ajouter profil » de l'Annuaire → choix du type
  (patient / soignant) → formulaire. L'identifiant est proposé (« NOM Prénom »). Deux profils actifs ne peuvent pas
  avoir les mêmes nom, prénom et date de naissance (pop-up « Profil déjà existant »).
- **Modifier / Supprimer** : boutons en bas des fiches (fiche patient, fiche soignant, « Mon profil » d'un soignant).
- **Supprimer = archiver** : le profil ne peut plus se connecter et disparaît des listes ; l'historique reste en base.
  Patient : ses RDV à venir sont annulés et ses RDV ne sont plus affichés. Soignant : ses RDV à venir sont
  confiés à des collègues de même profession (même horaire si possible, sinon nouvel horaire le même jour par
  le solveur, sinon « en attente »). L'Annuaire affiche le bilan.
- L'Annuaire liste aussi les soignants ; un clic ouvre leur agenda (`/soignants/:id/agenda`), puis leur fiche.

## Points encore ouverts côté backend

1. **Fiche identité** : `date_naissance`, `email`, `telephone` existent depuis la migration `5b2e8f4c1a37`
   (novembre 2026) ; vides pour les comptes existants, ils s'affichent « Non renseigné ».
2. **Préparation antérieure** : pas de colonne dans `rdv`. En attendant, le frontend la range à la fin
   de `commentaire` après la ligne `Préparation antérieure : `, et la relit (voir `adaptateurs.ts`).
   Une colonne `preparation` dédiée remplacera ce montage.
3. **Conflits** (calculés par le backend uniquement, dans `app/conflits.py` ; le frontend ne fait que les afficher) :
   `POST /rdv` et `PATCH /rdv/{id}` renvoient le RDV avec un champ
   `conflits: [{ id, type, gravite, message, rdv_ids, patient_id?, soignant_id? }]`, dans l'ordre
   patient puis soignants. Types actuels, tous en avertissement : `PATIENT_DOUBLE_TACHE`, `PLAGE_REPAS`,
   `SOIGNANT_DOUBLE_TACHE`, `HORS_HORAIRES`. Le frontend sait encore afficher un refus
   (HTTP 409 `{ "detail": { "code": "CONFLIT_BLOQUANT", "message": "…", "conflits": [...] } }`)
   si une règle bloquante est ajoutée plus tard (OR-Tools).
4. **Types de RDV** : la couleur affichée est celle de la charte (`theme/couleursRdv.ts`), reconnue
   à partir du libellé. L'onglet `Types_RDV` de `donnees_v1.xlsx` doit reprendre les 12 libellés de la charte
   (Repas, Prise de sang, Rdv Kiné chambre, Rdv Kiné plateau, RdV extérieur, Visite, Indisponible, ETP,
   Arthromoteur, Soins pluripro, Staff, Transmissions). Un type inconnu de la charte garde la couleur du backend.
5. **Identifiants** : l'écran de connexion invite à saisir « NOM Prénom ». Lors de la création des comptes,
   utiliser ce format comme `login` (le backend le met en minuscules et la comparaison ignore la casse).

## Choix d'interface

- **Code couleur** : couleurs exactes de la charte. Le texte des blocs est blanc ou noir selon le
  meilleur contraste (WCAG AA) ; seul le bloc « Visite » passe ainsi en texte noir par rapport à la maquette.
- **Taille du texte** : tout est en `rem` et grandit avec l'écran. La **jauge de zoom** (en haut à droite,
  75 % à 150 %) agrandit la zone de travail sans changer le menu ni les boutons du haut ; le niveau
  est mémorisé dans le navigateur.
- **Noms** : partout « NOM Prénom » (NOM en majuscules, prénom avec majuscule initiale), voir `utils/noms.ts`.
- **Bloc du nom** (en haut de l'agenda) : cliquable. Il ouvre « Mon profil », ou la fiche du patient
  (consultation seule) quand un soignant regarde l'agenda d'un patient.
- **Séances de groupe** (côté soignant) : les RDV identiques (même horaire, type, lieu et soignants) sont
  regroupés en un bloc ; le pop-up liste tous les patients.
- **Plusieurs soignants** : un RDV peut avoir plusieurs soignants ; il apparaît dans l'agenda de chacun,
  et toute modification est visible dans tous ces agendas.
- **Visites ajoutées par le patient** : le bouton « Ajouter un RDV » du patient ouvre le formulaire
  avec Nom RDV = Visite, Soignant(s) = Aucun et Patient = lui-même (non modifiables) ; le lieu est
  « Chambre du patient » par défaut. Il peut modifier ou supprimer ses visites, pas les autres RDV.
- **RDV courts** (≤ 35 min) : une seule ligne « Titre 8h » pour ne pas chevaucher le bloc suivant.
- **Pop-up « Modifier le RDV »** : la maquette ne montre que « Supprimer le RDV » ; un lien
  « Valider les modifications » a été ajouté pour enregistrer. La suppression demande une confirmation.
- **Couleur RDV** : non modifiable, elle découle du « Nom RDV » choisi (code couleur strict).
- **Horaire** : champ où l'on écrit l'heure au clavier (les flèches avancent de 5 min). La fin est proposée automatiquement
  (début + durée par défaut du type) tant qu'elle n'a pas été changée à la main.
- **Soignant(s) / Patients(s)** : listes à cases à cocher avec recherche ; « Aucun » est coché tant
  que personne n'est choisi. Il faut au moins un patient ou un soignant.
- **Plusieurs patients** : un RDV est créé par patient (le backend n'en accepte qu'un par RDV).
  Modifier une séance de groupe met à jour tous ses RDV ; retirer un patient annule son RDV.
- **Glisser-déposer** (soignants) : déplace ou allonge un bloc, par pas de 5 minutes ; une séance de groupe se déplace en entier.
- **Retour arrière** : si une étape échoue (réseau, conflit bloquant), tout ce qui avait déjà été
  enregistré pour cette action est annulé et le bloc revient à sa place.
- **Conflits** : l'action est enregistrée, puis chaque conflit s'affiche dans sa propre fenêtre
  « Attention » (le patient d'abord, puis chaque soignant concerné), par exemple « Ce rendez-vous n'est
  pas compris dans les horaires habituels de ce soignant : QUINET Marc, souhaitez-vous continuer ? ».
  « Continuer » passe au suivant ; « Annuler le changement » annule toute l'action.
  Les blocs concernés sont entourés en orange pointillé et la liste des conflits s'affiche au-dessus
  du planning jusqu'à ce qu'on la masque. (Un refus bloquant, s'il en existe un jour, s'afficherait
  en pop-up d'erreur, blocs entourés en rouge.)
- **Succès** : pop-up « Action réalisée ! » après chaque création, modification, déplacement
  ou suppression (il se ferme seul après 3 secondes).
- **Rafraîchissement** : automatique toutes les 30 s.
- **Bouton « Synchroniser »** (rond, à côté du bouton de déconnexion) :
  - pour un soignant, il relance le solveur OR-Tools côté backend pour aujourd'hui et les 6 jours suivants.
    Les RDV « à planifier » reçoivent une heure et sont enregistrés ; les RDV déjà planifiés ne bougent pas.
    Ensuite tout est relu depuis la base, et un bilan s'affiche (nombre de RDV planifiés, RDV écartés et
    pourquoi, jours impossibles). Pendant le calcul : « Planification en cours… » et bouton désactivé ;
    un double clic ne lance qu'un calcul, et le backend refuse un second calcul simultané (409) ;
  - pour un patient, il recharge seulement les données.
- **« À planifier automatiquement »** (case du formulaire, soignants) : le RDV est créé « en attente »
  avec un jour et une durée ; le solveur choisit l'heure au prochain « Synchroniser ». Décocher la case
  lui redonne un horaire fixe. En mode mock, le placement est simulé (au plus tôt, sans OR-Tools).
  Si le backend ne répond plus, les dernières données restent affichées avec un bandeau d'alerte.
- **Mon profil** : la ligne « Profession » est ajoutée pour les soignants (demandée dans le cahier des charges,
  absente de la maquette). Mot de passe toujours masqué.
- **Unités** : Unité n = chambres de l'étage n. Une ligne par chambre, par numéro croissant ; une chambre
  vide n'affiche que son numéro. Les flèches autour de la date changent de jour ; cliquer sur la date ouvre
  un calendrier (on peut aussi l'écrire). La date est surlignée
  en vert quand c'est aujourd'hui, et un lien « Aujourd'hui » ramène au jour actuel. Le bouton
  « Ajouter un RDV » (au-dessus de la légende) ouvre « Nouveau RDV » à la date affichée. Colonne matin
  jusqu'à 13h, après-midi ensuite : les pastilles sont placées sur une échelle de temps (8h-19h par défaut,
  élargie si besoin), leur longueur est proportionnelle à la durée, un RDV long passe d'une colonne à l'autre
  et des RDV simultanés se superposent (le plus court au-dessus ; survol = horaire complet).
  Clic sur la chambre / le patient → son agenda ; clic sur une pastille → pop-up d'information (et
  modification pour les soignants). Seul le tableau défile : sa barre de défilement est entre le tableau
  et la légende ; le titre et la légende restent visibles. La légende reprend les 12 types de la charte.
- **Annuaire** (maquette 26) : recherche par nom, chambre ou profession, blocs orange
  « NOM Prénom : chambre » ; patients présents par unité, puis hôpital de jour, puis séjours terminés ou à venir,
  puis les soignants (avec leur profession). Clic → agenda (modifiable par le soignant). Bouton « Ajouter profil ».
- **Barres de défilement** : grises et toujours visibles (sur Mac, elles n'apparaissaient qu'au survol).
- **Écran < 1280 px** : bandeau « Cette version est prévue pour ordinateur » et défilement horizontal.

## État d'avancement

| Écran | État |
|---|---|
| Connexion + pop-up erreur | fait |
| Planning patient + menu burger | fait |
| Planning soignant | fait |
| Pop-up information RDV, pop-up déconnexion | fait |
| Ajouter / modifier / supprimer un RDV, glisser-déposer, conflits, pop-up « Action réalisée » | fait (testé en mock et avec le backend réel) |
| Mon profil (patient, soignant) | fait |
| Unité 0 / Unité 1 | fait |
| Annuaire (patients et soignants) | fait |
| Création / modification / suppression de profils | fait |

Tous les écrans ont été testés en mode mock et avec le backend réel (`seed.py`).

Hors V1 (entrées du menu visibles mais inactives) : Activité, Menu, Signaler un bug.
Non codé (maquettes 17-18) : interface modérateur.
