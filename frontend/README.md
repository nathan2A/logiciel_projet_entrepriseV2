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

Le faux backend simule aussi les conflits que le vrai backend calculera, pour tester l'affichage :
- **bloquant** : un RDV de kiné hors de 9h-18h (ex. déplacer une séance de QUINET Marc à 8h) ;
- **avertissement** : un RDV qui chevauche une plage repas (11h-14h, 18h-20h) ou un autre RDV du même patient.

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
├── pages/            un fichier par écran : Connexion, Agenda, AgendaPatient, Profil, Unite, Annuaire
├── components/
│   ├── layout/       AppLayout (menu + déconnexion), Sidebar (menu burger), EnteteDate
│   ├── planning/     VueSemaine, PlanningSemaine (FullCalendar habillé), BlocOrange, NavigationSemaine
│   ├── rdv/          pop-ups de RDV : information, Nouveau / Modifier (RdvFormModal), avertissement de conflit
│   ├── unite/        LegendeCouleurs (rappel du code couleur)
│   └── ui/           Modal, PopupMessage (erreur / succès / déconnexion), états de chargement
├── services/api/     SEULE couche qui parle au backend
│   ├── client.ts     appel HTTP, jeton, normalisation des erreurs, choix mock / réel
│   ├── backendTypes.ts  JSON exact du backend (snake_case)
│   ├── adaptateurs.ts   conversion JSON backend ⇄ types du frontend
│   └── auth.ts, rdv.ts, referentiel.ts, plan.ts
├── mocks/            faux backend en mémoire (mêmes routes, même JSON, mêmes codes HTTP)
├── hooks/            useAuth, useNotifications, useRdv, useReferentiel,
│                     useEditionPlanning (actions, conflits, retour arrière)
├── types/            types TypeScript des entités
├── theme/            couleursRdv.ts : code couleur strict des RDV (source unique)
└── utils/            dates (formats français)
```

Pour brancher un autre backend, seuls `services/api/` (et éventuellement `mocks/`) changent.

## Endpoints utilisés (backend actuel)

| Méthode | Route | Corps / paramètres | Réponse | Utilisé pour |
|---|---|---|---|---|
| POST | `/auth/connexion` | formulaire `username`, `password` | `{ access_token, token_type }` | Connexion |
| GET | `/auth/moi` | — | `MoiOut` | Profil connecté, choix de la vue |
| GET | `/rdv` | `?du=&au=&patient_id=&soignant_id=&limite=` | `RDVOut[]` | Plannings |
| POST | `/rdv` | `RDVCreation` | `RDVOut` (201) | Nouveau RDV (un par patient) |
| PATCH | `/rdv/{id}` | `RDVModification` | `RDVOut` | Modifier / déplacer |
| POST | `/rdv/{id}/annuler` | — | `RDVOut` | « Supprimer le RDV » (le RDV est annulé, jamais effacé) |
| GET | `/patients` | — | `PatientOut[]` | Annuaire, unités, formulaire |
| GET | `/soignants` | — | `SoignantOut[]` | Formulaire |
| GET | `/types-rdv` | — | `TypeRDVOut[]` | Liste « Nom RDV », couleurs |
| GET | `/lieux` | — | `LieuOut[]` | Liste « Lieu » |
| GET | `/plan` | `?moment=` | `PlanOut` | Unités : toutes les chambres et leurs patients présents |

Les RDV au statut `annule` ne sont pas affichés.

## Ajouts attendus côté backend

Le frontend fonctionne déjà avec le backend actuel ; ces ajouts complètent l'affichage.
Le mode mock les simule tous.

1. **`GET /auth/moi`** : renvoyer aussi `profession` (soignant), `chambre`, `date_arrivee`,
   `date_depart_prevue` (patient). Sans eux, le bloc « NOM Prénom : chambre » et les fiches
   « Mon profil » restent incomplets (un patient n'a pas accès à `/patients`).
   Les champs `date_naissance`, `email`, `telephone` de la fiche identité n'existent pas encore en base :
   ils s'affichent « Non renseigné ».
2. **Préparation antérieure** : pas de colonne dans `rdv`. En attendant, le frontend la range à la fin
   de `commentaire` après la ligne `Préparation antérieure : `, et la relit (voir `adaptateurs.ts`).
   Une colonne `preparation` dédiée remplacera ce montage.
3. **Conflits** (calculés par le backend uniquement, le frontend ne fait que les afficher) :
   - avertissement : `POST /rdv` et `PATCH /rdv/{id}` renvoient le RDV avec un champ
     `conflits: [{ id, type, gravite: "avertissement", message, rdv_ids, patient_id?, soignant_id? }]` ;
   - bloquant : HTTP 409 avec `{ "detail": { "code": "CONFLIT_BLOQUANT", "message": "…", "conflits": [...] } }`.
   Types prévus : `PATIENT_DOUBLE_TACHE`, `SOIGNANT_DOUBLE_CHAMBRE`, `KINE_DOUBLE_PATIENT`, `HORS_HORAIRES`,
   `TOILETTE_AVANT_REEDUC`, `PLAGE_REPAS`, `PLATEAU_COMPLET`.
4. **Types de RDV** : la couleur affichée est celle de la charte (`theme/couleursRdv.ts`), reconnue
   à partir du libellé. L'onglet `Types_RDV` de `donnees_v1.xlsx` doit reprendre les 12 libellés de la charte
   (Repas, Prise de sang, Rdv Kiné chambre, Rdv Kiné plateau, RdV extérieur, Visite, Indisponible, ETP,
   Arthromoteur, Soins pluripro, Staff, Transmissions). Un type inconnu de la charte garde la couleur du backend.
5. **Identifiants** : l'écran de connexion invite à saisir « NOM Prénom ». Lors de la création des comptes,
   utiliser ce format comme `login` (le backend le met en minuscules et la comparaison ignore la casse).

## Choix d'interface

- **Code couleur** : couleurs exactes de la charte. Le texte des blocs est blanc ou noir selon le
  meilleur contraste (WCAG AA) ; seul le bloc « Visite » passe ainsi en texte noir par rapport à la maquette.
- **Taille du texte** : tout est en `rem` et grandit avec l'écran ; le zoom du navigateur (Ctrl +) agrandit
  toute l'interface, ce qui permet d'ajuster la taille côté patient.
- **Plages repas** (11h-14h, 18h-20h) : hachures légères dans les colonnes du planning.
- **Séances de groupe** (côté soignant) : les RDV identiques (même horaire, type, lieu et soignant) sont
  regroupés en un bloc ; le pop-up liste tous les patients.
- **RDV courts** (≤ 35 min) : une seule ligne « Titre 8h » pour ne pas chevaucher le bloc suivant.
- **Pop-up « Modifier le RDV »** : la maquette ne montre que « Supprimer le RDV » ; un lien
  « Valider les modifications » a été ajouté pour enregistrer. La suppression demande une confirmation.
- **Couleur RDV** : non modifiable, elle découle du « Nom RDV » choisi (code couleur strict).
- **Horaire** : la fin est proposée automatiquement (début + durée par défaut du type) tant qu'elle
  n'a pas été changée à la main.
- **Plusieurs patients** : un RDV est créé par patient (le backend n'en accepte qu'un par RDV).
  Modifier une séance de groupe met à jour tous ses RDV ; retirer un patient annule son RDV.
- **Glisser-déposer** (soignants) : déplace ou allonge un bloc ; une séance de groupe se déplace en entier.
- **Retour arrière** : si une étape échoue (réseau, conflit bloquant), tout ce qui avait déjà été
  enregistré pour cette action est annulé et le bloc revient à sa place.
- **Conflits** : bloquant → action refusée, pop-up d'erreur avec le message du backend ;
  avertissement → l'action est enregistrée et l'utilisateur choisit « Conserver » ou
  « Annuler le changement ». Dans les deux cas, les blocs concernés sont entourés
  (rouge plein : bloquant, orange pointillé : avertissement) et la liste des conflits s'affiche
  au-dessus du planning jusqu'à ce qu'on la masque.
- **Succès** : pop-up « Action réalisée ! » après chaque création, modification, déplacement
  ou suppression (il se ferme seul après 3 secondes).
- **Rafraîchissement** : automatique toutes les 30 s, et bouton « Actualiser » à côté du bouton de déconnexion.
  Si le backend ne répond plus, les dernières données restent affichées avec un bandeau d'alerte.
- **Mon profil** : la ligne « Profession » est ajoutée pour les soignants (demandée dans le cahier des charges,
  absente de la maquette). Mot de passe toujours masqué.
- **Unités** : Unité n = chambres de l'étage n. Une ligne par chambre, par numéro croissant ; une chambre
  vide n'affiche que son numéro. Matin = RDV qui commencent avant 13h, après-midi à partir de 13h.
  Clic sur la chambre / le patient → son agenda ; clic sur une pastille → pop-up d'information (et
  modification pour les soignants). Le titre, la légende et le bouton de déconnexion restent visibles
  pendant le défilement. La légende reprend les 12 types de la charte.
- **Annuaire** (pas de maquette) : titre comme « MON PROFIL », recherche par nom ou chambre, blocs orange
  « NOM Prénom : chambre » ; patients présents par unité, puis hôpital de jour, puis séjours terminés ou à venir.
  Clic → agenda du patient (modifiable par le soignant).
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
| Annuaire | fait |

Tous les écrans ont été testés en mode mock et avec le backend réel (`seed.py`).

Hors V1 (entrées du menu visibles mais inactives) : Activité, Menu, Signaler un bug.
Non codés (maquettes 17-19) : interface modérateur et création de profil patient.
