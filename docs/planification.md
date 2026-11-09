# Planification automatique (OR-Tools)

Code : `app/services/planification.py`. Exemple commenté : `exemple_planification.py`.

## 1. En bref

| Étape | Méthode | Modifie la base ? |
| --- | --- | --- |
| Calculer | `PlanificateurJournee(db, jour, config).planifier()` | Non |
| Relire, valider | `resultat.propositions`, `resultat.incoherences`… | Non |
| Enregistrer | `planificateur.enregistrer(resultat)` | Oui, tout ou rien |

Raccourci compatible avec la première version : `planifier_journee(db, jour)` renvoie le même
dictionnaire qu'avant (`statut`, `message`, `rdvs`, `repas`), avec en plus `incoherences`,
`ignores`, `etapes` et `enregistre`. `planifier_journee(db, jour, enregistrer=True)` enregistre
aussi, uniquement si une solution valide a été trouvée.

**Aucune modification de la base n'est nécessaire** : pas de nouvelle table, pas de migration,
pas de nouvelle dépendance (`ortools` est déjà dans `requirements.txt`).

## 2. Ce qui est enregistré, ce qui reste calculé

| Élément | Enregistré en base ? |
| --- | --- |
| `debut`, `fin` des RDV « en_attente » | Oui |
| `statut` : `en_attente` → `planifie` | Oui |
| RDV déjà « planifie » | Jamais modifiés |
| Créneaux repas (déjeuner, dîner) | Non : calculés seulement (`resultat.repas`) |
| Incohérences des RDV fixes | Non : signalées seulement |
| Configuration (capacités, déplacements…) | Non : paramètres Python |

## 3. Statuts

| Statut | Signification | Enregistrable |
| --- | --- | --- |
| `optimal` | Solution optimale démontrée | Oui |
| `faisable` | Solution valide, optimalité non démontrée dans le délai | Oui |
| `impossible` | Impossibilité démontrée, ou détectée avant le calcul (message chiffré) | Non |
| `inconnu` | Aucune solution dans le délai. **Ce n'est pas une preuve d'impossibilité.** | Non |
| `donnees_incompletes` | Exemple : soignant sans horaire connu | Non |
| `erreur` | Modèle invalide, ou solution refusée par la vérification indépendante | Non |

Chaque solution est revérifiée en Python, sans faire confiance au solveur : horaires,
chevauchements, délais, capacités, plages obligatoires, granularité.

## 4. Contraintes

### Conservées de la première version

- **Horaires** : matin 6h30-14h30, après-midi 14h-21h30, jour 8h30-16h30, kiné 9h-18h. Un RDV
  respecte les horaires de **tous** ses soignants. Soignant sans horaire connu : statut
  `donnees_incompletes` avec son nom (rien n'est deviné).
- **Patients et soignants** : `AddNoOverlap`, y compris pour les RDV à plusieurs soignants.
- **Plateau de rééducation** : `AddCumulative`, 10 places, RDV fixes compris.
- **Toilette avant rééducation**, si une toilette est prévue ce jour-là. Elle s'applique
  maintenant aussi quand l'un des deux RDV est déjà planifié.
- **Repas** : 30 min libres entre 11h et 14h, et entre 18h et 20h, dans le modèle.
- **Granularité** de 5 minutes, **délai** de 20 s, **objectif** : commencer au plus tôt.

### Nouvelles

| Contrainte | Paramètre | Fonctionnement |
| --- | --- | --- |
| Déplacement entre lieux | `temps_deplacement` | Entre deux RDV successifs d'un même soignant dans deux lieux différents. Symétrique par défaut. |
| Préparation | `temps_preparation` | Entre un type A puis un type B ; `"*"` = n'importe quel type. Additionnée au déplacement. |
| Indisponibilités | `indisponibilites` | Bloquent le soignant. Un RDV « planifie » sans patient (réunion, staff) bloque déjà ses soignants. |
| Capacité des lieux | `capacites_lieux` | `AddCumulative` par lieu, RDV fixes compris. Un lieu non configuré n'a **pas** de limite (sauf le plateau). |
| Charge maximale | `charge_max_minutes` | Minutes de RDV par soignant et par jour, fixes compris. |
| Plage obligatoire | `Preference(..., obligatoire=True)` | Contrainte stricte : sinon `impossible`. |
| Plage souhaitée | `Preference(..., obligatoire=False)` | Chaque tranche de 5 min hors plage coûte dans l'objectif ; respectée dès que c'est possible. |
| Priorités | `priorites_rdv`, `priorites_patient`, `priorites_type` | Optimisation par niveaux (voir ci-dessous). |

**Délais entre RDV.** Pour chaque paire de RDV d'un même soignant, le solveur choisit l'ordre (A
puis B, ou B puis A) et impose le délai correspondant (`OnlyEnforceIf`).

**Priorités sans poids arbitraire.** L'objectif est lexicographique :
1. On minimise d'abord les débuts des RDV les plus prioritaires, plus le coût de leurs plages
   souhaitées non respectées.
2. Cette valeur est ensuite bloquée et on passe au niveau suivant.

Un RDV prioritaire n'est donc jamais retardé pour en avancer un moins prioritaire. Les autres
restent placés au plus tôt parmi les solutions possibles, et un RDV sans lien avec les
prioritaires n'est pas pénalisé. Sans priorité configurée, l'objectif est identique à celui de la
première version.

**Plages souhaitées.** Une tranche hors plage coûte par défaut 288 (`poids_preferences`), soit
plus que tout gain d'avance. Avec un coût de 1, sortir de la plage et commencer plus tôt se
compenseraient exactement, et la préférence n'aurait plus d'effet.

**Charge maximale.** Tous les RDV en attente de la journée doivent être placés. Leur durée totale
est donc connue avant le calcul : un dépassement est signalé tout de suite, avec les minutes en
cause. Même chose si un soignant a plus de RDV à placer que de temps libre dans son service.

## 5. Corrections de la première version

| Problème | Correction |
| --- | --- |
| **Séances de groupe** : un kiné avec plusieurs patients au même créneau (un RDV par patient) était vu comme occupé plusieurs fois en même temps. C'était la cause du « impossible » sur les données de test. | Une séance (mêmes horaire, type, lieu et soignants) occupe le soignant une seule fois. Chaque patient occupe toujours une place dans le lieu. |
| RDV fixe d'un patient absent de la journée : le soignant et le lieu n'étaient plus bloqués. | Ils sont toujours bloqués. Le patient l'est s'il est présent. |
| RDV à cheval sur minuit. | Bornés à 00h00-24h00, début arrondi vers le bas, fin vers le haut. |
| RDV fixes incohérents (hors horaires, chevauchements, capacité, délais) : modèle impossible sans explication. | Signalés dans `incoherences` sans être modifiés ; le modèle reste calculable. |
| `UNKNOWN` présenté comme « impossible ». | Statut `inconnu` distinct. |
| RDV en attente inutilisable (patient absent, sans personne) : retiré sans le dire. | Listé dans `ignores` avec la raison. |
| RDV fixe de type repas : le patient devait quand même avoir 30 min libres en plus. | Le repas déjà prévu tient lieu de créneau. |
| Durée non multiple de 5 min (ex. 32 min). | Arrondie à 35 min et signalée (`duree_ajustee`). |
| `reinitialiser_agenda_test.py` donnait aussi des **visites** aux kinés (type ajouté en novembre) : journée trop chargée. | Le script exclut le type Visite. |

## 6. Enregistrement et modifications concurrentes

`enregistrer(resultat, valider=True)` :
- refuse tout résultat sans solution valide (`PlanificationNonEnregistrable`) ;
- met à jour chaque RDV **seulement s'il est toujours « en_attente » avec les horaires lus au
  calcul** (`UPDATE … WHERE statut = 'en_attente' AND debut = … AND fin = …`) ;
- vérifie que les RDV « planifie » de la journée n'ont pas changé depuis le calcul ;
- s'il y a le moindre écart : `ConflitConcurrent`, **rollback complet**, rien n'est enregistré ;
- avec `valider=False`, il fait un flush sans commit, pour grouper avec d'autres changements.
  Un rollback annule alors aussi ces autres changements.

## 7. Exemples de configuration

```python
from datetime import datetime, time
from app.services.planification import ConfigPlanification, Indisponibilite, Preference

config = ConfigPlanification(
    capacites_lieux={"Plateau kiné": 10, "Salle de psychomotricité": 2, "Unité de soins": 1},
    temps_deplacement={("Plateau kiné", "Chambre du patient"): 10},
    temps_preparation={("*", "Arthromoteur"): 10, ("Kiné", "Ergothérapie"): 5},
    indisponibilites=[Indisponibilite(270, datetime(2026, 10, 20, 9), datetime(2026, 10, 20, 11), "Formation")],
    charge_max_minutes={270: 420},
    preferences=[
        Preference(time(14), time(17), type_libelle="Psychomotricité"),             # souhaitée
        Preference(time(9), time(12), obligatoire=True, patient_id=303),            # obligatoire
    ],
    priorites_type={"IDE": 1},
    priorites_patient={303: 2},
)
```

Les lieux et les types sont désignés par leur libellé (majuscules ignorées) ; les soignants,
patients et RDV par leur identifiant. Les valeurs ci-dessus sont des **exemples** : rien n'est
inventé par défaut. Sans configuration, il n'y a ni déplacement, ni préparation, ni capacité
(sauf le plateau, 10).

Ne pas donner de capacité à « Chambre du patient » : ce libellé désigne une chambre différente
pour chaque patient.

## 8. Hypothèses (à confirmer avec l'équipe soignante)

- Les RDV en attente sont tous obligatoires : s'il est impossible de tous les placer, rien n'est
  proposé (pas de planning partiel).
- Déplacements et préparations s'appliquent aux enchaînements d'un même **soignant**, pas du
  patient.
- Dans un lieu à capacité limitée, chaque RDV occupe une place ; une séance de 5 patients en
  occupe 5.
- Les RDV en attente identiques (même horaire provisoire, type, lieu et soignants) restent
  séparés. Avec `regrouper_seances_en_attente=True`, ils forment une séance de groupe.
- La colonne `patients.autonome` n'est pas utilisée : sa règle métier n'est pas définie.

**Évolution possible si la configuration doit être modifiable sans toucher au code** : une
colonne `lieux.capacite` et une table `indisponibilites` (soignant, début, fin, motif), avec une
migration Alembic. Ce n'est pas fait ici, pour ne pas changer le schéma sans décision de l'équipe.
