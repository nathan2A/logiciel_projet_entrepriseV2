# Changements du 12/11/2026 : profils, annuaire, unités

À lire par toute l'équipe. **Une migration est à appliquer** (voir « À faire après le pull »).

## À faire après le pull

```bash
docker compose up -d          # PostgreSQL
alembic upgrade head          # nouvelle migration 5b2e8f4c1a37
python seed.py                # facultatif : repartir des données de test (efface tout)
python remplir_equipes.py     # si vous avez relancé seed.py
```

Puis relancer le backend (`uvicorn app.main:app --reload`) et le frontend (`cd frontend && npm run dev`).

## Backend

### Base de données (migration `5b2e8f4c1a37_profils_coordonnees_archivage`)
- Table `utilisateurs` : 4 nouvelles colonnes
  - `date_naissance` (date, facultative)
  - `email` (texte, facultatif)
  - `telephone` (texte, facultatif)
  - `actif` (booléen, vrai par défaut) : **faux = profil supprimé (archivé)**
- Données : type de RDV « RDV extérieur » (#c1ff72, 120 min) et lieu « Extérieur », ajoutés s'ils
  n'existent pas. Ils sont aussi dans `data/donnees_v1.xlsx` (onglets Types_RDV et Lieux).
- `alembic downgrade` retire les colonnes, et le type et le lieu seulement s'ils ne sont pas utilisés.

### Gestion des comptes : `app/routers/comptes.py` (préfixe `/utilisateurs`)
- **Ouverte à tous les soignants** (avant : administrateurs seulement). Tous les soignants sont administrateurs.
  Les patients n'y ont pas accès (403).
- `POST /utilisateurs` et `PATCH /utilisateurs/{id}` acceptent `date_naissance`, `email`, `telephone`
  (email vérifié, téléphone 30 caractères max).
- **Doublon refusé** : deux profils actifs ne peuvent pas avoir les mêmes nom, prénom et date de naissance
  (casse et espaces ignorés) → 409 `{"detail": {"code": "PROFIL_EXISTANT", "message": "…"}}`.
  Identifiant déjà pris → 409 (inchangé ; un identifiant reste réservé après archivage).
- `GET /utilisateurs` : seulement les profils actifs ; `?archives=true` pour voir aussi les supprimés.
- `GET` / `PATCH` / `DELETE` sur un profil archivé → 404.
- **`DELETE /utilisateurs/{id}` archive au lieu d'effacer** et renvoie un bilan (`SuppressionOut`) :
  - patient : ses RDV à venir (planifiés ou en attente) sont annulés ; tous ses RDV disparaissent de
    l'affichage (`GET /rdv`), mais restent en base (historique) ;
  - soignant : ses RDV passés restent à son nom ; ses RDV à venir sont transférés (voir ci-dessous) ;
    refusé (409) s'il s'agit du dernier soignant actif. On peut supprimer son propre profil.

### Transfert des RDV d'un soignant supprimé : `app/services/transfert.py` (nouveau)
Pour chaque RDV à venir (une séance de groupe est traitée en bloc), parmi les collègues **actifs de même
profession** :
1. un collègue libre au même horaire (et dans ses horaires de travail) le reprend → `meme_heure` ;
2. sinon le collègue le moins chargé le reprend, le RDV passe en attente et le solveur OR-Tools lui
   cherche un horaire **le même jour** (seuls ces RDV sont replanifiés) → `replanifie`,
   ou `en_attente` si le solveur ne trouve pas (il apparaît alors dans « À planifier » / « Synchroniser ») ;
3. aucun collègue de même profession → le RDV garde son horaire sans ce soignant (`sans_remplacant`,
   à réattribuer à la main) ; un RDV sans patient dont il était le seul participant est annulé (`annule`).

Tout se fait dans une seule transaction (rien n'est enregistré en cas d'erreur).

### Solveur : `app/services/planification.py`
- `ConfigPlanification` : 2 options nouvelles, sans effet si on ne les donne pas
  - `rdv_ids` : ne replanifier que ces RDV en attente ;
  - `pas_avant` : aucun RDV placé avant cette heure (pas de RDV dans le passé).
- Les patients archivés sont ignorés.
- `app/routers/synchronisation.py` : « Synchroniser » utilise `pas_avant=maintenant`.

### Autres routes
- `app/routers/auth.py` et `app/deps.py` : un compte archivé ne peut plus se connecter (401), et son jeton
  en cours n'est plus accepté.
- `app/routers/referentiel.py` : `GET /patients` et `GET /soignants` ne renvoient que les profils actifs ;
  **nouvelle route `GET /chambres`** (soignants) pour la liste des chambres du formulaire patient.
- `app/routers/plan.py` : patients archivés exclus des unités.
- `app/routers/rdv.py` :
  - un patient peut ajouter (et modifier / annuler) ses **visites et ses RDV extérieurs**
    (libellé commençant par « visite » ou contenant « extérieur ») ;
  - `GET /rdv` n'affiche plus les RDV des patients archivés ;
  - lier un RDV à un patient ou un soignant archivé → 404.
- `app/schemas.py` : coordonnées dans `MoiOut`, `PatientOut`, `SoignantOut`, `UtilisateurOut` (+ `actif`),
  `CompteCreation`, `CompteModification` ; nouveaux schémas `RdvTransfereOut` et `SuppressionOut`.

## Frontend

- **Création de profil** : menu burger « + Ajouter un compte » (soignants) ou bouton vert « Ajouter profil »
  de l'Annuaire → choix patient / soignant → formulaire (maquettes 24 et 19). Identifiant proposé
  « NOM Prénom » ; profession choisie dans la liste ou saisie (« Autre ») ; « retour » sur chaque écran ;
  message de confirmation ; pop-up « Profil déjà existant » en cas de doublon.
- **Modifier / Supprimer le profil** : en bas de la fiche patient, de la fiche soignant et de « Mon profil »
  (soignant). Confirmation avant suppression ; l'Annuaire affiche ensuite le bilan des RDV.
- **Annuaire** : section « Soignants » (clic → agenda du soignant, puis sa fiche via son nom).
- **Unités** : clic sur la date pour en choisir une ; pastilles de longueur proportionnelle à la durée,
  qui se superposent si besoin.
- **Pop-up RDV** : l'heure s'écrit au clavier.
- **Patient** : « Nom RDV » au choix « Visite » ou « RDV extérieur » (lieu « Extérieur » proposé).
- **Barres de défilement** toujours visibles.
- Le mode mock (`VITE_USE_MOCK=true`) gère aussi tout cela (transfert simplifié, sans solveur).
