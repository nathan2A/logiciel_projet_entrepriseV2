"""
Planification automatique d'une journée avec OR-Tools (solveur CP-SAT).

Principe :
    1. On lit la journée dans la base : patients présents, soignants, lieux,
       types, RDV « planifie » (fixes) et RDV « en_attente » (à placer).
    2. On construit un modèle CP-SAT : une variable de début par RDV en attente,
       des intervalles fixes pour tout ce qui est déjà occupé.
    3. On résout (20 s au maximum), puis on vérifie la solution en Python,
       indépendamment du solveur.
    4. L'enregistrement est une étape SÉPARÉE (`enregistrer`), pour permettre
       une validation humaine entre le calcul et la sauvegarde.

Ce qui est enregistré dans la base : uniquement `debut`, `fin` et `statut`
(en_attente -> planifie) des RDV en attente. Les repas, les incohérences et
les indisponibilités de la configuration restent des résultats de calcul.

Utilisation la plus simple (compatible avec les scripts existants) :

    resultat = planifier_journee(db, date(2026, 10, 20))          # calcul seul
    resultat = planifier_journee(db, jour, enregistrer=True)       # calcul + sauvegarde

Utilisation avec validation humaine :

    planificateur = PlanificateurJournee(db, jour, config)
    resultat = planificateur.planifier()       # ne modifie rien
    ... affichage, validation ...
    planificateur.enregistrer(resultat)        # transaction : tout ou rien

Voir docs/planification.md pour les explications détaillées et des exemples
de configuration.
"""

from __future__ import annotations

import math
import time as chrono
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Optional

from ortools.sat.python import cp_model
from sqlalchemy import select, update
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models import (
    Lieu,
    Patient,
    RDV,
    Soignant,
    STATUT_EN_ATTENTE,
    STATUT_PLANIFIE,
    TypeRDV,
    rdv_soignants,
)


# --------------------------------------------------------------------------
# Constantes métier (également utilisées par app/conflits.py)
# --------------------------------------------------------------------------

# Horaires exprimés en minutes après minuit.
HORAIRES_EQUIPE = {
    "matin": (6 * 60 + 30, 14 * 60 + 30),
    "apres_midi": (14 * 60, 21 * 60 + 30),
    "jour": (8 * 60 + 30, 16 * 60 + 30),
}

HORAIRES_KINE = (9 * 60, 18 * 60)

DEBUT_DEJEUNER = 11 * 60
FIN_DEJEUNER = 14 * 60
DEBUT_DINER = 18 * 60
FIN_DINER = 20 * 60
DUREE_REPAS = 30  # minutes

CAPACITE_PLATEAU = 10
GRANULARITE = 5  # résolution de planification en minutes
TEMPS_LIMITE_SECONDES = 20.0

MINUTES_PAR_JOUR = 24 * 60
HORIZON = MINUTES_PAR_JOUR // GRANULARITE  # nombre de tranches dans la journée


# --------------------------------------------------------------------------
# Fonctions utilitaires (conservées de la première version)
# --------------------------------------------------------------------------

def minutes_depuis_minuit(dt: datetime) -> int:
    return dt.hour * 60 + dt.minute


def est_type(libelle: str, *mots: str) -> bool:
    texte = (libelle or "").casefold()
    return any(mot.casefold() in texte for mot in mots)


def est_toilette(rdv: RDV) -> bool:
    return est_type(rdv.type.libelle, "toilette", "toilettes", "toilette au lit")


def est_reeducation(rdv: RDV) -> bool:
    return est_type(
        rdv.type.libelle,
        "rééducation",
        "reeducation",
        "kiné",
        "kine",
        "kinésithérapie",
        "kinesitherapie",
    )


def est_repas(rdv: RDV) -> bool:
    return est_type(rdv.type.libelle, "repas", "déjeuner", "dejeuner", "dîner", "diner")


def est_kine(soignant: Soignant) -> bool:
    return est_type(soignant.profession, "kiné", "kine", "kinésithérapeute")


def est_aide_soignant(soignant: Soignant) -> bool:
    return est_type(
        soignant.profession,
        "aide-soignante",
        "aide-soignant",
        "as",
    )


def est_plateau(lieu: Lieu) -> bool:
    return "plateau" in lieu.libelle.casefold() and (
        "rééduc" in lieu.libelle.casefold()
        or "reeduc" in lieu.libelle.casefold()
        or "kiné" in lieu.libelle.casefold()
        or "kine" in lieu.libelle.casefold()
    )


def date_heure(jour: date, minute: int) -> datetime:
    return datetime.combine(jour, time()) + timedelta(minutes=minute)


def horaires_soignant(soignant: Soignant) -> Optional[tuple[int, int]]:
    """Horaires (début, fin) en minutes, ou None si aucun horaire n'est connu."""
    if est_kine(soignant):
        return HORAIRES_KINE
    if soignant.equipe in HORAIRES_EQUIPE:
        return HORAIRES_EQUIPE[soignant.equipe]
    return None


def _cle(texte: str) -> str:
    """Libellé comparable : minuscules, espaces superflus retirés."""
    return " ".join((texte or "").casefold().split())


def _tranches_bas(minutes: float) -> int:
    """Minutes -> tranches de GRANULARITE minutes, arrondi inférieur."""
    return math.floor(minutes / GRANULARITE)


def _tranches_haut(minutes: float) -> int:
    """Minutes -> tranches de GRANULARITE minutes, arrondi supérieur."""
    return math.ceil(minutes / GRANULARITE)


def _hhmm(tranche: int) -> str:
    minutes = tranche * GRANULARITE
    return f"{minutes // 60:02d}h{minutes % 60:02d}"


# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------

@dataclass
class Indisponibilite:
    """Période où un soignant ne peut pas recevoir de RDV (congé, réunion, formation…)."""
    soignant_id: int
    debut: datetime
    fin: datetime
    motif: str = "Indisponibilité"


@dataclass
class Preference:
    """
    Plage horaire pour certains RDV en attente.

    Cible (au moins une) : rdv_id, patient_id ou type_libelle. Si plusieurs
    préférences visent le même RDV, elles s'appliquent toutes.

    obligatoire=True  : contrainte stricte, le RDV doit tenir dans la plage.
    obligatoire=False : préférence souple, chaque tranche de 5 minutes hors de
                        la plage coûte `poids` dans l'objectif.
    """
    debut: time
    fin: time
    obligatoire: bool = False
    poids: int = 1
    rdv_id: Optional[int] = None
    patient_id: Optional[int] = None
    type_libelle: Optional[str] = None

    def concerne(self, rdv: RDV) -> bool:
        if self.rdv_id is not None and self.rdv_id != rdv.id:
            return False
        if self.patient_id is not None and self.patient_id != rdv.patient_id:
            return False
        if self.type_libelle is not None and _cle(self.type_libelle) != _cle(rdv.type.libelle):
            return False
        return any(v is not None for v in (self.rdv_id, self.patient_id, self.type_libelle))


@dataclass
class ConfigPlanification:
    """
    Paramètres de la planification. Tout est facultatif : une configuration
    vide reproduit exactement le comportement de la première version
    (plus les corrections).

    Les lieux et les types sont désignés par leur libellé (insensible à la
    casse) ; les soignants, patients et RDV par leur identifiant.
    """
    # Capacité simultanée par lieu, ex. {"Plateau kiné": 10, "Unité de soins": 1}.
    # Un lieu absent n'a pas de limite, sauf le plateau de rééducation (10 par défaut).
    capacites_lieux: dict[str, int] = field(default_factory=dict)

    # Temps de déplacement en minutes entre deux lieux, pour un même soignant,
    # ex. {("Plateau kiné", "Chambre du patient"): 10}.
    temps_deplacement: dict[tuple[str, str], int] = field(default_factory=dict)
    deplacement_symetrique: bool = True  # (A, B) vaut aussi pour (B, A)

    # Temps de préparation en minutes entre un RDV de type A suivi d'un RDV de
    # type B, pour un même soignant. "*" désigne n'importe quel type,
    # ex. {("*", "Arthromoteur"): 10}.
    temps_preparation: dict[tuple[str, str], int] = field(default_factory=dict)

    # Absences, congés, réunions… (en plus des RDV « planifie » sans patient,
    # qui bloquent déjà leurs soignants).
    indisponibilites: list[Indisponibilite] = field(default_factory=list)

    # Charge maximale de RDV par soignant et par jour, en minutes, ex. {271: 420}.
    charge_max_minutes: dict[int, int] = field(default_factory=dict)

    # Plages horaires obligatoires ou souhaitées.
    preferences: list[Preference] = field(default_factory=list)
    # Coût d'une tranche de 5 min hors d'une plage souhaitée (multiplié par
    # Preference.poids). Par défaut HORIZON (288) : sortir de la plage coûte
    # toujours plus que ce que rapporte le fait de commencer plus tôt, donc la
    # plage est respectée dès que c'est possible. Avec 1, les deux se
    # compensent exactement et la préférence n'a plus d'effet.
    poids_preferences: int = HORIZON

    # Priorités (entier, plus grand = plus prioritaire, 0 par défaut).
    # La priorité d'un RDV est la plus élevée des trois.
    priorites_rdv: dict[int, int] = field(default_factory=dict)
    priorites_patient: dict[int, int] = field(default_factory=dict)
    priorites_type: dict[str, int] = field(default_factory=dict)

    # RDV en attente identiques (même horaire provisoire, type, lieu et
    # soignants) traités comme une séance de groupe : même créneau pour tous.
    regrouper_seances_en_attente: bool = False

    # RDV en attente dont un soignant n'a pas d'horaire connu :
    #   False (défaut) : statut « donnees_incompletes », rien n'est planifié ;
    #   True : ces RDV sont écartés (listés dans `ignores`), les autres sont planifiés.
    ignorer_rdv_sans_horaire: bool = False

    # Ne planifier que ces RDV en attente (None : tous ceux de la journée).
    # Les autres RDV en attente sont laissés tels quels et ne bloquent rien.
    rdv_ids: Optional[set[int]] = None

    # Aucun RDV placé avant cet instant (ex. maintenant, pour ne rien placer
    # dans le passé de la journée en cours). None : pas de limite.
    pas_avant: Optional[datetime] = None

    temps_limite_secondes: float = TEMPS_LIMITE_SECONDES
    nb_workers: int = 8


# --------------------------------------------------------------------------
# Résultats
# --------------------------------------------------------------------------

@dataclass
class Incoherence:
    """Problème détecté dans les données (jamais corrigé automatiquement)."""
    code: str
    message: str
    gravite: str = "avertissement"  # "avertissement", "bloquant" ou "info"
    rdv_ids: list[int] = field(default_factory=list)

    def vers_dict(self) -> dict:
        return {"code": self.code, "gravite": self.gravite, "message": self.message, "rdv_ids": self.rdv_ids}


@dataclass
class PropositionRDV:
    rdv_id: int
    patient_id: Optional[int]
    soignant_ids: list[int]
    type: str
    lieu: str
    debut: datetime
    fin: datetime
    priorite: int
    # État lu au moment du calcul (protection contre les modifications concurrentes)
    debut_lu: datetime
    fin_lu: datetime
    duree_ajustee: bool  # durée arrondie à la tranche de 5 minutes supérieure

    def vers_dict(self) -> dict:
        return {
            "rdv_id": self.rdv_id,
            "patient_id": self.patient_id,
            "soignant_ids": self.soignant_ids,
            "type": self.type,
            "lieu": self.lieu,
            "debut": self.debut.isoformat(),
            "fin": self.fin.isoformat(),
            "priorite": self.priorite,
            "duree_ajustee": self.duree_ajustee,
        }


@dataclass
class ResultatPlanification:
    """
    statut :
        "optimal"              solution optimale démontrée
        "faisable"             solution valide, optimalité non démontrée (délai atteint)
        "impossible"           impossibilité démontrée (INFEASIBLE) ou détectée avant le calcul
        "inconnu"              aucune solution dans le délai, SANS preuve d'impossibilité
        "donnees_incompletes"  données insuffisantes (ex. soignant sans horaire connu)
        "erreur"               modèle invalide ou solution qui ne passe pas la vérification
    """
    statut: str
    message: str = ""
    propositions: list[PropositionRDV] = field(default_factory=list)
    repas: list[dict] = field(default_factory=list)
    incoherences: list[Incoherence] = field(default_factory=list)
    ignores: list[dict] = field(default_factory=list)
    etapes: list[dict] = field(default_factory=list)
    erreurs_verification: list[str] = field(default_factory=list)
    empreinte_fixes: tuple = ()
    enregistre: bool = False

    @property
    def solution_valide(self) -> bool:
        return self.statut in ("optimal", "faisable") and not self.erreurs_verification

    def vers_dict(self) -> dict:
        """Format de la première version (statut, message, rdvs, repas) + nouveautés."""
        resultat = {
            "statut": self.statut,
            "rdvs": [p.vers_dict() for p in self.propositions],
            "repas": self.repas,
            "incoherences": [i.vers_dict() for i in self.incoherences],
            "ignores": self.ignores,
            "etapes": self.etapes,
            "enregistre": self.enregistre,
        }
        if self.message:  # comme la première version : message seulement s'il y a quelque chose à dire
            resultat["message"] = self.message
        return resultat


class PlanificationNonEnregistrable(Exception):
    """Le résultat ne peut pas être enregistré (pas de solution valide)."""


class ConflitConcurrent(Exception):
    """La base a changé entre le calcul et l'enregistrement : rien n'a été enregistré."""


# --------------------------------------------------------------------------
# Structures internes
# --------------------------------------------------------------------------

@dataclass
class _Occupation:
    """Période fixe (en tranches) : RDV planifié ou indisponibilité."""
    debut: int
    fin: int
    rdv_ids: list[int]
    lieu: Optional[str] = None   # libellé normalisé, pour les déplacements
    type: Optional[str] = None   # libellé normalisé, pour les préparations
    libelle: str = ""


@dataclass
class _Tache:
    """RDV en attente dans le modèle."""
    rdv: RDV
    duree: int                   # en tranches
    debut: cp_model.IntVar
    fin: cp_model.IntVar
    intervalle: cp_model.IntervalVar
    priorite: int
    groupe: int                  # identifiant de séance
    representant: bool           # premier RDV de sa séance (porte les soignants)
    duree_ajustee: bool
    ecarts: list = field(default_factory=list)  # (variable, poids) des préférences souples


def _fusionner(occupations: list[_Occupation]) -> list[tuple[int, int]]:
    """Union des périodes : les chevauchements sont fusionnés (pour AddNoOverlap)."""
    blocs: list[list[int]] = []
    for o in sorted(occupations, key=lambda o: (o.debut, o.fin)):
        if blocs and o.debut < blocs[-1][1]:
            blocs[-1][1] = max(blocs[-1][1], o.fin)
        else:
            blocs.append([o.debut, o.fin])
    return [(d, f) for d, f in blocs]


def _chevauchements(occupations: list[_Occupation]) -> list[tuple[_Occupation, _Occupation]]:
    paires = []
    triees = sorted(occupations, key=lambda o: (o.debut, o.fin))
    for i, a in enumerate(triees):
        for b in triees[i + 1:]:
            if b.debut >= a.fin:
                break
            paires.append((a, b))
    return paires


# --------------------------------------------------------------------------
# Planificateur
# --------------------------------------------------------------------------

class PlanificateurJournee:
    """Planifie les RDV « en_attente » d'une journée. Voir le docstring du module."""

    def __init__(self, db: Session, jour: date, config: Optional[ConfigPlanification] = None):
        self.db = db
        self.jour = jour
        self.config = config or ConfigPlanification()
        self.debut_jour = datetime.combine(jour, time.min)
        self.fin_jour = self.debut_jour + timedelta(days=1)

        # Configuration normalisée (libellés comparables)
        self._capacites = {_cle(k): v for k, v in self.config.capacites_lieux.items()}
        self._deplacements: dict[tuple[str, str], int] = {}
        for (a, b), minutes in self.config.temps_deplacement.items():
            self._deplacements[(_cle(a), _cle(b))] = minutes
            if self.config.deplacement_symetrique:
                self._deplacements.setdefault((_cle(b), _cle(a)), minutes)
        self._preparations = {(_cle(a), _cle(b)): m for (a, b), m in self.config.temps_preparation.items()}
        self._priorites_type = {_cle(k): v for k, v in self.config.priorites_type.items()}

        self._reinitialiser()

    def _reinitialiser(self):
        self.incoherences: list[Incoherence] = []
        self.ignores: list[dict] = []
        self.model = cp_model.CpModel()
        self.taches: dict[int, _Tache] = {}
        self.repas_vars: dict[tuple[int, str], tuple] = {}
        self.occupations_soignant: dict[int, list[_Occupation]] = {}   # séances dédoublonnées
        self.indispos_soignant: dict[int, list[_Occupation]] = {}
        self.occupations_patient: dict[int, list[_Occupation]] = {}
        self.occupations_lieu: dict[int, list[_Occupation]] = {}       # un élément par RDV (= une personne)
        self.repas_existants: set[tuple[int, str]] = set()

    # ------------------------------------------------------------------
    # 1. Lecture des données
    # ------------------------------------------------------------------

    def charger_donnees(self):
        """Patients présents, soignants, lieux, types et RDV de la journée."""
        db, jour = self.db, self.jour
        self.patients = (
            db.query(Patient)
            .filter(Patient.actif.is_(True))  # profils archivés exclus
            .filter(Patient.date_arrivee <= jour)
            .filter((Patient.date_depart_prevue.is_(None)) | (Patient.date_depart_prevue >= jour))
            .all()
        )
        self.patients_par_id = {p.id: p for p in self.patients}
        self.soignants_par_id = {s.id: s for s in db.query(Soignant).all()}
        self.lieux_par_id = {l.id: l for l in db.query(Lieu).all()}
        self.types_par_id = {t.id: t for t in db.query(TypeRDV).all()}

        self.rdvs = (
            db.query(RDV)
            .options(
                joinedload(RDV.patient),
                selectinload(RDV.soignants),
                joinedload(RDV.type),
                joinedload(RDV.lieu),
            )
            .filter(RDV.debut < self.fin_jour, RDV.fin > self.debut_jour)
            .filter(RDV.statut.in_([STATUT_PLANIFIE, STATUT_EN_ATTENTE]))
            .order_by(RDV.debut, RDV.id)
            .all()
        )
        self.empreinte_fixes = self._empreinte_fixes()

    def _empreinte_fixes(self) -> tuple:
        """
        Photo des RDV planifiés de la journée, lue directement en base (pas
        dans le cache de la session) : si elle change avant l'enregistrement,
        le planning calculé n'est plus valable.
        """
        lignes = self.db.execute(
            select(RDV.id, RDV.debut, RDV.fin, RDV.statut, RDV.lieu_id, RDV.patient_id, RDV.type_id)
            .where(RDV.debut < self.fin_jour, RDV.fin > self.debut_jour, RDV.statut == STATUT_PLANIFIE)
            .order_by(RDV.id)
        ).all()
        ids = [l.id for l in lignes]
        soignants: dict[int, list[int]] = {}
        if ids:
            for rdv_id, soignant_id in self.db.execute(
                select(rdv_soignants.c.rdv_id, rdv_soignants.c.soignant_id).where(rdv_soignants.c.rdv_id.in_(ids))
            ).all():
                soignants.setdefault(rdv_id, []).append(soignant_id)
        return tuple((*tuple(l), tuple(sorted(soignants.get(l.id, [])))) for l in lignes)

    # ------------------------------------------------------------------
    # 2. RDV fixes / RDV à planifier
    # ------------------------------------------------------------------

    def classer_rdv(self):
        """Sépare les RDV fixes et ceux à planifier ; écarte (avec raison) les RDV inutilisables."""
        self.fixes = [r for r in self.rdvs if r.statut == STATUT_PLANIFIE]
        self.a_planifier = []
        for r in self.rdvs:
            if r.statut != STATUT_EN_ATTENTE:
                continue
            if self.config.rdv_ids is not None and r.id not in self.config.rdv_ids:
                continue  # hors du périmètre demandé : ni planifié, ni bloquant
            raison = None
            if r.patient_id is None and not r.soignants:
                raison = "RDV sans patient ni soignant."
            elif r.patient_id is not None and r.patient_id not in self.patients_par_id:
                raison = f"Le patient {r.patient_id} n'est pas présent le {self.jour:%d/%m/%Y}."
            elif _tranches_haut((r.fin - r.debut).total_seconds() / 60) > HORIZON:
                raison = "Durée supérieure à 24 heures."
            elif self.config.ignorer_rdv_sans_horaire and any(horaires_soignant(s) is None for s in r.soignants):
                noms = ", ".join(
                    f"{s.prenom} {s.nom} ({s.profession})" for s in r.soignants if horaires_soignant(s) is None
                )
                raison = f"Horaire inconnu pour {noms} : renseigner son équipe (matin, apres_midi, jour)."
            if raison:
                self.ignores.append({"rdv_id": r.id, "raison": raison})
            else:
                self.a_planifier.append(r)

    def _bornes_fixes(self, debut: datetime, fin: datetime) -> tuple[int, int]:
        """
        Période fixe ramenée à la journée (00h00-24h00) et arrondie prudemment :
        début arrondi vers le bas, fin vers le haut (on ne sous-estime jamais
        l'occupation).
        """
        debut = max(debut, self.debut_jour)
        fin = min(fin, self.fin_jour)
        d = _tranches_bas((debut - self.debut_jour).total_seconds() / 60)
        f = _tranches_haut((fin - self.debut_jour).total_seconds() / 60)
        return max(0, d), min(HORIZON, max(f, d + 1))

    def priorite(self, rdv: RDV) -> int:
        return max(
            self.config.priorites_rdv.get(rdv.id, 0),
            self.config.priorites_patient.get(rdv.patient_id, 0) if rdv.patient_id else 0,
            self._priorites_type.get(_cle(rdv.type.libelle), 0),
        )

    def capacite(self, lieu: Lieu) -> Optional[int]:
        if _cle(lieu.libelle) in self._capacites:
            return self._capacites[_cle(lieu.libelle)]
        if est_plateau(lieu):
            return CAPACITE_PLATEAU
        return None

    # ------------------------------------------------------------------
    # 3. Construction du modèle
    # ------------------------------------------------------------------

    def construire_modele(self) -> Optional[ResultatPlanification]:
        """
        Construit le modèle complet. Renvoie un résultat d'échec si les données
        empêchent de planifier (le solveur n'est alors pas lancé).
        """
        self._enregistrer_occupations_fixes()
        echec = self._verifier_donnees_a_planifier()
        if echec:
            return echec
        self._creer_variables()
        self.verifier_conformite_fixes()
        echec = self._verifier_charges()
        if echec:
            return echec
        self.ajouter_contraintes_metier()
        self.ajouter_contraintes_repas()
        echec = self._verifier_repas_possibles()
        if echec:
            return echec
        self.ajouter_contraintes_ressources()
        self.ajouter_contraintes_enchainement()
        return None

    def _enregistrer_occupations_fixes(self):
        """RDV planifiés et indisponibilités : périodes fixes par soignant, patient et lieu."""
        seances_vues: dict[int, set] = {}
        for rdv in self.fixes:
            d, f = self._bornes_fixes(rdv.debut, rdv.fin)
            occ = _Occupation(d, f, [rdv.id], _cle(rdv.lieu.libelle), _cle(rdv.type.libelle), rdv.type.libelle)
            # Le patient n'est bloqué que s'il fait partie des patients présents ;
            # le soignant et le lieu sont TOUJOURS bloqués (correction 6.A).
            if rdv.patient_id in self.patients_par_id:
                self.occupations_patient.setdefault(rdv.patient_id, []).append(occ)
                if est_repas(rdv):
                    for nom, debut_f, fin_f in (("dejeuner", DEBUT_DEJEUNER, FIN_DEJEUNER), ("diner", DEBUT_DINER, FIN_DINER)):
                        if d < _tranches_haut(fin_f) and f > _tranches_bas(debut_f):
                            self.repas_existants.add((rdv.patient_id, nom))
            self.occupations_lieu.setdefault(rdv.lieu_id, []).append(occ)
            # Séance de groupe (un RDV par patient, mêmes horaire, type, lieu,
            # soignants) : le soignant n'est occupé qu'une fois.
            cle_seance = (rdv.debut, rdv.fin, rdv.type_id, rdv.lieu_id, tuple(sorted(s.id for s in rdv.soignants)))
            for s in rdv.soignants:
                vues = seances_vues.setdefault(s.id, set())
                if cle_seance in vues:
                    existante = next(o for o in self.occupations_soignant[s.id] if o.debut == d and o.fin == f and o.lieu == occ.lieu and o.type == occ.type)
                    existante.rdv_ids.append(rdv.id)
                    continue
                vues.add(cle_seance)
                self.occupations_soignant.setdefault(s.id, []).append(
                    _Occupation(d, f, [rdv.id], occ.lieu, occ.type, rdv.type.libelle)
                )

        for ind in self.config.indisponibilites:
            if ind.fin <= self.debut_jour or ind.debut >= self.fin_jour:
                continue
            if ind.soignant_id not in self.soignants_par_id:
                self.incoherences.append(Incoherence(
                    "INDISPONIBILITE_SOIGNANT_INCONNU",
                    f"Indisponibilité « {ind.motif} » pour un soignant inconnu ({ind.soignant_id}) : ignorée.",
                    "info",
                ))
                continue
            d, f = self._bornes_fixes(ind.debut, ind.fin)
            self.indispos_soignant.setdefault(ind.soignant_id, []).append(_Occupation(d, f, [], libelle=ind.motif))

    def _verifier_donnees_a_planifier(self) -> Optional[ResultatPlanification]:
        """Un soignant sans horaire connu : erreur explicite, on ne devine pas son service."""
        manquants = {}
        for rdv in self.a_planifier:
            for s in rdv.soignants:
                if horaires_soignant(s) is None:
                    manquants.setdefault(s.id, (s, []))[1].append(rdv.id)
        if not manquants:
            return None
        lignes = [
            f"{s.prenom} {s.nom} ({s.profession}, équipe : {s.equipe or 'non renseignée'}) — RDV {', '.join(map(str, ids))}"
            for s, ids in manquants.values()
        ]
        return self._echec(
            "donnees_incompletes",
            "Horaire inconnu pour ces soignants : renseigner leur équipe (matin, apres_midi, jour) "
            "ou leur profession. " + " ; ".join(lignes),
        )

    def _creer_variables(self):
        """Une variable de début, une de fin et un intervalle par RDV en attente."""
        groupes: dict[tuple, int] = {}
        for rdv in self.a_planifier:
            minutes = (rdv.fin - rdv.debut).total_seconds() / 60
            duree = max(1, _tranches_haut(minutes))
            debut = self.model.NewIntVar(0, HORIZON - duree, f"debut_{rdv.id}")
            fin = self.model.NewIntVar(duree, HORIZON, f"fin_{rdv.id}")
            self.model.Add(fin == debut + duree)
            intervalle = self.model.NewIntervalVar(debut, duree, fin, f"intervalle_{rdv.id}")

            if self.config.regrouper_seances_en_attente:
                cle = (rdv.debut, rdv.fin, rdv.type_id, rdv.lieu_id, tuple(sorted(s.id for s in rdv.soignants)))
            else:
                cle = ("seul", rdv.id)
            representant = cle not in groupes
            groupe = groupes.setdefault(cle, rdv.id)
            if not representant:
                self.model.Add(debut == self.taches[groupe].debut)

            self.taches[rdv.id] = _Tache(
                rdv=rdv, duree=duree, debut=debut, fin=fin, intervalle=intervalle,
                priorite=self.priorite(rdv), groupe=groupe, representant=representant,
                duree_ajustee=abs(minutes - duree * GRANULARITE) > 1e-9,
            )

    def _representants(self) -> list[_Tache]:
        return [t for t in self.taches.values() if t.representant]

    # ------------------------------------------------------------------
    # 4. Contraintes métier
    # ------------------------------------------------------------------

    def ajouter_contraintes_metier(self):
        """Horaires des soignants, plages obligatoires/souhaitées, ordre toilette -> rééducation."""
        pas_avant = None
        if self.config.pas_avant is not None and self.config.pas_avant > self.debut_jour:
            pas_avant = min(HORIZON, _tranches_haut((self.config.pas_avant - self.debut_jour).total_seconds() / 60))
        for t in self.taches.values():
            if pas_avant is not None:
                self.model.Add(t.debut >= pas_avant)
            # A. Le créneau respecte les horaires de CHAQUE soignant du RDV.
            for s in t.rdv.soignants:
                debut_service, fin_service = horaires_soignant(s)
                self.model.Add(t.debut >= _tranches_haut(debut_service))
                self.model.Add(t.fin <= _tranches_bas(fin_service))

            # F. Préférences horaires.
            for pref in self.config.preferences:
                if not pref.concerne(t.rdv):
                    continue
                p_debut = _tranches_haut(pref.debut.hour * 60 + pref.debut.minute)
                p_fin = _tranches_bas(pref.fin.hour * 60 + pref.fin.minute)
                if pref.obligatoire:
                    self.model.Add(t.debut >= p_debut)
                    self.model.Add(t.fin <= p_fin)
                else:
                    avance = self.model.NewIntVar(0, HORIZON, f"avance_{t.rdv.id}_{id(pref)}")
                    retard = self.model.NewIntVar(0, HORIZON, f"retard_{t.rdv.id}_{id(pref)}")
                    self.model.Add(avance >= p_debut - t.debut)
                    self.model.Add(retard >= t.fin - p_fin)
                    t.ecarts.append((avance, pref.poids))
                    t.ecarts.append((retard, pref.poids))

        # E. Une rééducation est précédée d'au moins une toilette du même patient,
        # si une toilette est prévue ce jour-là (RDV fixes ou en attente).
        par_patient: dict[int, dict[str, list]] = {}
        for rdv in self.fixes + self.a_planifier:
            if rdv.patient_id not in self.patients_par_id:
                continue
            groupe = par_patient.setdefault(rdv.patient_id, {"toilettes": [], "reeducations": []})
            if est_toilette(rdv):
                groupe["toilettes"].append(rdv)
            elif est_reeducation(rdv):
                groupe["reeducations"].append(rdv)

        for patient_id, groupe in par_patient.items():
            if not groupe["toilettes"]:
                continue
            for reeduc in groupe["reeducations"]:
                debut_r = self._debut(reeduc)
                choix = []
                for toilette in groupe["toilettes"]:
                    fin_t = self._fin(toilette)
                    if isinstance(debut_r, int) and isinstance(fin_t, int):
                        if fin_t <= debut_r:
                            choix = None  # déjà respecté par deux RDV fixes
                            break
                        continue
                    avant = self.model.NewBoolVar(f"toilette_{toilette.id}_avant_{reeduc.id}")
                    self.model.Add(fin_t <= debut_r).OnlyEnforceIf(avant)
                    choix.append(avant)
                if choix is None:
                    continue
                if choix:
                    self.model.AddBoolOr(choix)
                else:
                    self.incoherences.append(Incoherence(
                        "TOILETTE_APRES_REEDUCATION",
                        f"Patient {patient_id} : la rééducation fixe {reeduc.id} n'est précédée d'aucune toilette fixe.",
                        "avertissement", [reeduc.id] + [x.id for x in groupe["toilettes"]],
                    ))

    def _debut(self, rdv: RDV):
        if rdv.id in self.taches:
            return self.taches[rdv.id].debut
        return self._bornes_fixes(rdv.debut, rdv.fin)[0]

    def _fin(self, rdv: RDV):
        if rdv.id in self.taches:
            return self.taches[rdv.id].fin
        return self._bornes_fixes(rdv.debut, rdv.fin)[1]

    def _minutes_a_placer(self, soignant_id: int) -> int:
        return sum(
            t.duree for t in self._representants() if any(s.id == soignant_id for s in t.rdv.soignants)
        ) * GRANULARITE

    def _verifier_charges(self) -> Optional[ResultatPlanification]:
        """
        Tous les RDV en attente de la journée doivent être placés : la charge de
        chaque soignant est donc connue avant le calcul. Deux vérifications,
        signalées tout de suite avec les chiffres (sinon le solveur dirait
        seulement « impossible ») :
          - charge maximale configurée (E) ;
          - temps de service disponible (horaires moins RDV fixes et indisponibilités).
        """
        depassements = []
        for soignant_id, maximum in self.config.charge_max_minutes.items():
            fixes = sum((f - d) for d, f in _fusionner(self.occupations_soignant.get(soignant_id, []))) * GRANULARITE
            nouveaux = self._minutes_a_placer(soignant_id)
            if fixes + nouveaux > maximum:
                s = self.soignants_par_id.get(soignant_id)
                nom = f"{s.prenom} {s.nom}" if s else f"soignant {soignant_id}"
                depassements.append(f"{nom} : {fixes} min déjà planifiées + {nouveaux} min à placer > {maximum} min autorisées")
        if depassements:
            return self._echec("impossible", "Charge maximale dépassée. " + " ; ".join(depassements))

        saturations = []
        for soignant_id in {s.id for t in self._representants() for s in t.rdv.soignants}:
            s = self.soignants_par_id[soignant_id]
            debut_service, fin_service = horaires_soignant(s)
            d_s, f_s = _tranches_haut(debut_service), _tranches_bas(fin_service)
            occupe = sum(
                max(0, min(f, f_s) - max(d, d_s))
                for d, f in _fusionner(self.occupations_soignant.get(soignant_id, []) + self.indispos_soignant.get(soignant_id, []))
            ) * GRANULARITE
            disponible = (f_s - d_s) * GRANULARITE - occupe
            nouveaux = self._minutes_a_placer(soignant_id)
            if nouveaux > disponible:
                saturations.append(
                    f"{s.prenom} {s.nom} : {nouveaux} min à placer pour {disponible} min libres "
                    f"dans son service ({_hhmm(d_s)}-{_hhmm(f_s)})"
                )
        if saturations:
            return self._echec("impossible", "Temps de service insuffisant. " + " ; ".join(saturations))
        return None

    # ------------------------------------------------------------------
    # 5. Repas
    # ------------------------------------------------------------------

    def ajouter_contraintes_repas(self):
        """
        Un créneau libre de 30 minutes par patient présent, entre 11h et 14h
        et entre 18h et 20h. Ce sont des variables du modèle, jamais
        enregistrées comme RDV. Un RDV fixe de type repas sur la fenêtre
        tient lieu de créneau.
        """
        duree = _tranches_haut(DUREE_REPAS)
        for patient in self.patients:
            for nom, debut_f, fin_f in (("dejeuner", DEBUT_DEJEUNER, FIN_DEJEUNER), ("diner", DEBUT_DINER, FIN_DINER)):
                if (patient.id, nom) in self.repas_existants:
                    continue
                debut = self.model.NewIntVar(_tranches_haut(debut_f), _tranches_bas(fin_f) - duree, f"{nom}_{patient.id}")
                fin = self.model.NewIntVar(_tranches_haut(debut_f) + duree, _tranches_bas(fin_f), f"{nom}_fin_{patient.id}")
                self.model.Add(fin == debut + duree)
                intervalle = self.model.NewIntervalVar(debut, duree, fin, f"{nom}_intervalle_{patient.id}")
                self.repas_vars[(patient.id, nom)] = (debut, fin, intervalle)

    def _verifier_repas_possibles(self) -> Optional[ResultatPlanification]:
        """Si les RDV fixes ne laissent pas 30 minutes libres, le dire avant le calcul."""
        duree = _tranches_haut(DUREE_REPAS)
        bloquants = []
        for (patient_id, nom), (debut_var, _, _) in self.repas_vars.items():
            debut_f, fin_f = (DEBUT_DEJEUNER, FIN_DEJEUNER) if nom == "dejeuner" else (DEBUT_DINER, FIN_DINER)
            blocs = _fusionner(self.occupations_patient.get(patient_id, []))
            libre = any(
                all(not (d < t + duree and t < f) for d, f in blocs)
                for t in range(_tranches_haut(debut_f), _tranches_bas(fin_f) - duree + 1)
            )
            if not libre:
                bloquants.append(f"patient {patient_id} ({nom})")
        if bloquants:
            for b in bloquants:
                self.incoherences.append(Incoherence("REPAS_IMPOSSIBLE", f"Pas de créneau repas libre de 30 min : {b}.", "bloquant"))
            return self._echec("impossible", "Les RDV fixes ne laissent pas de créneau repas libre : " + ", ".join(bloquants) + ".")
        return None

    # ------------------------------------------------------------------
    # 6. Ressources : patients, soignants, lieux
    # ------------------------------------------------------------------

    def ajouter_contraintes_ressources(self):
        """
        B. Un patient : un seul RDV ou repas à la fois.
        C. Un soignant : une seule séance à la fois (indisponibilités comprises).
        D. Capacité des lieux (plateau : 10 par défaut ; autres lieux configurables).

        Les périodes fixes qui se chevauchent déjà sont fusionnées dans le
        modèle (elles ont été signalées comme incohérences) : sinon le modèle
        serait impossible alors qu'on ne peut rien y changer.
        """
        # Patients
        for patient in self.patients:
            intervalles = [
                self.model.NewFixedSizeIntervalVar(d, f - d, f"patient_{patient.id}_fixe_{i}")
                for i, (d, f) in enumerate(_fusionner(self.occupations_patient.get(patient.id, [])))
            ]
            intervalles += [t.intervalle for t in self.taches.values() if t.rdv.patient_id == patient.id]
            intervalles += [v[2] for (pid, _), v in self.repas_vars.items() if pid == patient.id]
            if len(intervalles) > 1:
                self.model.AddNoOverlap(intervalles)

        # Soignants (une séance de groupe = un seul intervalle, celui du représentant)
        concernes = set(self.occupations_soignant) | set(self.indispos_soignant)
        concernes |= {s.id for t in self._representants() for s in t.rdv.soignants}
        for soignant_id in concernes:
            fixes = self.occupations_soignant.get(soignant_id, []) + self.indispos_soignant.get(soignant_id, [])
            intervalles = [
                self.model.NewFixedSizeIntervalVar(d, f - d, f"soignant_{soignant_id}_fixe_{i}")
                for i, (d, f) in enumerate(_fusionner(fixes))
            ]
            intervalles += [
                t.intervalle for t in self._representants() if any(s.id == soignant_id for s in t.rdv.soignants)
            ]
            if len(intervalles) > 1:
                self.model.AddNoOverlap(intervalles)

        # Lieux à capacité limitée : chaque RDV occupe une place
        # (une séance de groupe de 5 patients occupe 5 places).
        for lieu_id, lieu in self.lieux_par_id.items():
            capacite = self.capacite(lieu)
            if capacite is None:
                continue
            taches = [t for t in self.taches.values() if t.rdv.lieu_id == lieu_id]
            fixes = self.occupations_lieu.get(lieu_id, [])
            if not taches and not fixes:
                continue
            profil = [0] * HORIZON
            for o in fixes:
                for u in range(o.debut, o.fin):
                    profil[u] += 1
            intervalles, demandes = [], []
            u = 0
            while u < HORIZON:
                v = u
                while v < HORIZON and profil[v] == profil[u]:
                    v += 1
                if profil[u] > 0:
                    intervalles.append(self.model.NewFixedSizeIntervalVar(u, v - u, f"lieu_{lieu_id}_fixe_{u}"))
                    demandes.append(min(profil[u], capacite))
                u = v
            intervalles += [t.intervalle for t in taches]
            demandes += [1] * len(taches)
            if intervalles:
                self.model.AddCumulative(intervalles, demandes, capacite)

    # ------------------------------------------------------------------
    # 7. Déplacements et préparations
    # ------------------------------------------------------------------

    def ecart_minutes(self, lieu_a: Optional[str], type_a: Optional[str], lieu_b: Optional[str], type_b: Optional[str]) -> int:
        """Délai minimal (minutes) entre la fin d'un RDV A et le début d'un RDV B du même soignant."""
        deplacement = 0
        if lieu_a and lieu_b and lieu_a != lieu_b:
            deplacement = self._deplacements.get((lieu_a, lieu_b), 0)
        preparation = 0
        if type_a and type_b:
            preparation = max(
                self._preparations.get((type_a, type_b), 0),
                self._preparations.get(("*", type_b), 0),
                self._preparations.get((type_a, "*"), 0),
                self._preparations.get(("*", "*"), 0),
            )
        return deplacement + preparation

    def ajouter_contraintes_enchainement(self):
        """
        Entre deux RDV successifs d'un même soignant : temps de déplacement
        (lieux différents) + temps de préparation (selon les types).
        Pour chaque paire concernée, le solveur choisit l'ordre (A puis B, ou
        B puis A) et impose le délai correspondant.
        """
        if not self._deplacements and not self._preparations:
            return
        representants = self._representants()
        for t in representants:
            lieu_t, type_t = _cle(t.rdv.lieu.libelle), _cle(t.rdv.type.libelle)
            for s in t.rdv.soignants:
                # avec les autres RDV en attente du même soignant (chaque paire une fois)
                for u in representants:
                    if u.rdv.id <= t.rdv.id or not any(x.id == s.id for x in u.rdv.soignants):
                        continue
                    lieu_u, type_u = _cle(u.rdv.lieu.libelle), _cle(u.rdv.type.libelle)
                    self._ordonner(
                        f"{t.rdv.id}_{u.rdv.id}_{s.id}", t.debut, t.fin, u.debut, u.fin,
                        _tranches_haut(self.ecart_minutes(lieu_t, type_t, lieu_u, type_u)),
                        _tranches_haut(self.ecart_minutes(lieu_u, type_u, lieu_t, type_t)),
                    )
                # avec ses RDV fixes
                for o in self.occupations_soignant.get(s.id, []):
                    self._ordonner(
                        f"{t.rdv.id}_fixe{o.rdv_ids[0]}_{s.id}", t.debut, t.fin, o.debut, o.fin,
                        _tranches_haut(self.ecart_minutes(lieu_t, type_t, o.lieu, o.type)),
                        _tranches_haut(self.ecart_minutes(o.lieu, o.type, lieu_t, type_t)),
                    )

    def _ordonner(self, nom, debut_a, fin_a, debut_b, fin_b, ecart_ab: int, ecart_ba: int):
        if ecart_ab == 0 and ecart_ba == 0:
            return  # AddNoOverlap suffit
        a_avant_b = self.model.NewBoolVar(f"ordre_{nom}")
        self.model.Add(debut_b >= fin_a + ecart_ab).OnlyEnforceIf(a_avant_b)
        self.model.Add(debut_a >= fin_b + ecart_ba).OnlyEnforceIf(a_avant_b.Not())

    # ------------------------------------------------------------------
    # Conformité des RDV fixes (signalée, jamais corrigée)
    # ------------------------------------------------------------------

    def verifier_conformite_fixes(self):
        """C. Horaires de travail, chevauchements, déplacements, capacités, patients en double."""
        sans_horaire = {}
        for soignant_id, occupations in self.occupations_soignant.items():
            s = self.soignants_par_id[soignant_id]
            horaires = horaires_soignant(s)
            nom = f"{s.prenom} {s.nom}"
            if horaires is None:
                sans_horaire[soignant_id] = nom
            else:
                debut_service, fin_service = _tranches_bas(horaires[0]), _tranches_haut(horaires[1])
                for o in occupations:
                    if o.debut < debut_service or o.fin > fin_service:
                        self.incoherences.append(Incoherence(
                            "FIXE_HORS_HORAIRES",
                            f"{nom} : RDV {o.libelle} {_hhmm(o.debut)}-{_hhmm(o.fin)} hors de ses horaires "
                            f"({_hhmm(debut_service)}-{_hhmm(fin_service)}).",
                            "avertissement", o.rdv_ids,
                        ))
            for a, b in _chevauchements(occupations + self.indispos_soignant.get(soignant_id, [])):
                self.incoherences.append(Incoherence(
                    "FIXES_CHEVAUCHEMENT_SOIGNANT",
                    f"{nom} : {a.libelle} {_hhmm(a.debut)}-{_hhmm(a.fin)} et {b.libelle} {_hhmm(b.debut)}-{_hhmm(b.fin)} se chevauchent.",
                    "avertissement", a.rdv_ids + b.rdv_ids,
                ))
            triees = sorted(occupations, key=lambda o: o.debut)
            for a, b in zip(triees, triees[1:]):
                besoin = _tranches_haut(self.ecart_minutes(a.lieu, a.type, b.lieu, b.type))
                if b.debut >= a.fin and b.debut - a.fin < besoin:
                    self.incoherences.append(Incoherence(
                        "FIXES_DELAI_INSUFFISANT",
                        f"{nom} : {besoin * GRANULARITE} min nécessaires entre {a.libelle} (fin {_hhmm(a.fin)}) "
                        f"et {b.libelle} (début {_hhmm(b.debut)}).",
                        "avertissement", a.rdv_ids + b.rdv_ids,
                    ))
        for soignant_id, nom in sans_horaire.items():
            self.incoherences.append(Incoherence(
                "HORAIRES_INCONNUS",
                f"{nom} : horaires inconnus (équipe non renseignée), conformité de ses RDV fixes non vérifiée.",
                "info",
            ))

        for patient_id, occupations in self.occupations_patient.items():
            for a, b in _chevauchements(occupations):
                self.incoherences.append(Incoherence(
                    "FIXES_CHEVAUCHEMENT_PATIENT",
                    f"Patient {patient_id} : {a.libelle} {_hhmm(a.debut)}-{_hhmm(a.fin)} et {b.libelle} "
                    f"{_hhmm(b.debut)}-{_hhmm(b.fin)} se chevauchent.",
                    "avertissement", a.rdv_ids + b.rdv_ids,
                ))

        for lieu_id, occupations in self.occupations_lieu.items():
            capacite = self.capacite(self.lieux_par_id[lieu_id])
            if capacite is None:
                continue
            profil = [0] * HORIZON
            for o in occupations:
                for u in range(o.debut, o.fin):
                    profil[u] += 1
            depasse = [u for u in range(HORIZON) if profil[u] > capacite]
            if depasse:
                self.incoherences.append(Incoherence(
                    "FIXES_CAPACITE_DEPASSEE",
                    f"{self.lieux_par_id[lieu_id].libelle} : jusqu'à {max(profil)} personnes pour {capacite} places "
                    f"(à partir de {_hhmm(depasse[0])}).",
                    "avertissement",
                ))

    # ------------------------------------------------------------------
    # 8. Objectif
    # ------------------------------------------------------------------

    def definir_objectif(self) -> list[tuple[int, object]]:
        """
        Objectif lexicographique par niveau de priorité (du plus prioritaire
        au moins prioritaire). À chaque niveau : minimiser la somme des débuts
        des RDV de ce niveau + le coût des préférences souples non respectées.

        Le niveau 1 est d'abord optimisé ; sa valeur est ensuite bloquée et le
        niveau 2 est optimisé avec ce qui reste, etc. Un RDV prioritaire n'est
        donc jamais retardé pour avancer un RDV moins prioritaire, et les RDV
        moins prioritaires restent placés au plus tôt parmi les solutions qui
        respectent ce choix (pas de poids arbitraire qui les écraserait).

        Sans priorité configurée : un seul niveau, identique à l'objectif de la
        première version (somme des débuts).
        """
        niveaux: dict[int, list] = {}
        for t in self.taches.values():
            termes = niveaux.setdefault(t.priorite, [])
            termes.append(t.debut)
            for variable, poids in t.ecarts:
                termes.append(variable * (poids * self.config.poids_preferences))
        return [(p, sum(termes)) for p, termes in sorted(niveaux.items(), key=lambda x: -x[0])]

    # ------------------------------------------------------------------
    # 9. Résolution
    # ------------------------------------------------------------------

    def resoudre(self) -> tuple[str, Optional[dict], list[dict]]:
        """
        Lance CP-SAT (temps total limité). Renvoie (statut, valeurs, étapes).
        valeurs = {nom de variable: valeur} de la meilleure solution trouvée.
        """
        niveaux = self.definir_objectif() or [(0, None)]
        limite = self.config.temps_limite_secondes
        depart = chrono.monotonic()
        valeurs = None
        etapes = []
        tout_optimal = True
        suivies = [t.debut for t in self.taches.values()] + [v[0] for v in self.repas_vars.values()]

        for i, (priorite, objectif) in enumerate(niveaux):
            restant = limite - (chrono.monotonic() - depart)
            if restant <= 0.05:
                tout_optimal = False
                break
            if objectif is not None:
                self.model.Minimize(objectif)
            solver = cp_model.CpSolver()
            # Le temps restant est partagé entre les niveaux qui restent.
            solver.parameters.max_time_in_seconds = restant / (len(niveaux) - i)
            solver.parameters.num_workers = self.config.nb_workers
            statut = solver.Solve(self.model)
            etapes.append({
                "priorite": priorite,
                "statut": solver.StatusName(statut),
                "objectif": solver.ObjectiveValue() if objectif is not None and statut in (cp_model.OPTIMAL, cp_model.FEASIBLE) else None,
                "duree_s": round(solver.WallTime(), 2),
            })

            if statut in (cp_model.OPTIMAL, cp_model.FEASIBLE):
                valeurs = {v.Name(): solver.Value(v) for v in suivies}
                valeurs.update({t.fin.Name(): solver.Value(t.fin) for t in self.taches.values()})
                valeurs.update({v[1].Name(): solver.Value(v[1]) for v in self.repas_vars.values()})
                if statut != cp_model.OPTIMAL:
                    tout_optimal = False
                if objectif is not None and i + 1 < len(niveaux):
                    # On garde l'acquis de ce niveau et on part de cette solution.
                    self.model.Add(objectif <= round(solver.ObjectiveValue()))
                    self.model.ClearHints()
                    for v in suivies:
                        self.model.AddHint(v, valeurs[v.Name()])
                continue

            if valeurs is None:
                # Aucune solution au premier niveau.
                if statut == cp_model.INFEASIBLE:
                    return "impossible", None, etapes
                if statut == cp_model.MODEL_INVALID:
                    return "erreur", None, etapes
                return "inconnu", None, etapes
            tout_optimal = False  # niveau suivant non amélioré : on garde la solution précédente
            break

        if valeurs is None:
            return "inconnu", None, etapes  # délai épuisé avant toute solution
        return ("optimal" if tout_optimal else "faisable"), valeurs, etapes

    # ------------------------------------------------------------------
    # 10. Vérification indépendante
    # ------------------------------------------------------------------

    def verifier_resultat(self, valeurs: dict) -> list[str]:
        """
        Revérifie la solution en Python, sans faire confiance au solveur :
        granularité, horaires, chevauchements, délais, capacités, repas, toilette.
        """
        erreurs = []
        debut = {rid: valeurs[t.debut.Name()] for rid, t in self.taches.items()}
        fin = {rid: valeurs[t.fin.Name()] for rid, t in self.taches.items()}
        for rid, t in self.taches.items():
            if fin[rid] - debut[rid] != t.duree or debut[rid] < 0 or fin[rid] > HORIZON:
                erreurs.append(f"RDV {rid} : durée ou bornes incorrectes.")
            for s in t.rdv.soignants:
                h = horaires_soignant(s)
                if debut[rid] < _tranches_haut(h[0]) or fin[rid] > _tranches_bas(h[1]):
                    erreurs.append(f"RDV {rid} hors des horaires du soignant {s.id}.")

        def chevauche(a, b):
            return a[0] < b[1] and b[0] < a[1]

        # Patients
        for patient in self.patients:
            periodes = [(d, f, "fixe") for d, f in _fusionner(self.occupations_patient.get(patient.id, []))]
            periodes += [(debut[r], fin[r], f"RDV {r}") for r, t in self.taches.items() if t.rdv.patient_id == patient.id]
            periodes += [
                (valeurs[v[0].Name()], valeurs[v[1].Name()], nom)
                for (pid, nom), v in self.repas_vars.items() if pid == patient.id
            ]
            for i, a in enumerate(periodes):
                for b in periodes[i + 1:]:
                    if chevauche(a, b):
                        erreurs.append(f"Patient {patient.id} : {a[2]} et {b[2]} se chevauchent.")

        # Soignants (avec délais d'enchaînement)
        for t in self._representants():
            for s in t.rdv.soignants:
                autres = [
                    (debut[u.rdv.id], fin[u.rdv.id], _cle(u.rdv.lieu.libelle), _cle(u.rdv.type.libelle), f"RDV {u.rdv.id}")
                    for u in self._representants()
                    if u.rdv.id != t.rdv.id and any(x.id == s.id for x in u.rdv.soignants)
                ]
                autres += [(o.debut, o.fin, o.lieu, o.type, f"fixe {o.rdv_ids[0]}") for o in self.occupations_soignant.get(s.id, [])]
                autres += [(o.debut, o.fin, None, None, o.libelle) for o in self.indispos_soignant.get(s.id, [])]
                a = (debut[t.rdv.id], fin[t.rdv.id], _cle(t.rdv.lieu.libelle), _cle(t.rdv.type.libelle))
                for b in autres:
                    if chevauche(a, b):
                        erreurs.append(f"Soignant {s.id} : RDV {t.rdv.id} et {b[4]} se chevauchent.")
                    elif b[0] >= a[1] and b[0] - a[1] < _tranches_haut(self.ecart_minutes(a[2], a[3], b[2], b[3])):
                        erreurs.append(f"Soignant {s.id} : délai insuffisant entre RDV {t.rdv.id} et {b[4]}.")
                    elif a[0] >= b[1] and a[0] - b[1] < _tranches_haut(self.ecart_minutes(b[2], b[3], a[2], a[3])):
                        erreurs.append(f"Soignant {s.id} : délai insuffisant entre {b[4]} et RDV {t.rdv.id}.")

        # Capacités (seuls les RDV en attente peuvent créer un dépassement nouveau)
        for lieu_id, lieu in self.lieux_par_id.items():
            capacite = self.capacite(lieu)
            taches = [r for r, t in self.taches.items() if t.rdv.lieu_id == lieu_id]
            if capacite is None or not taches:
                continue
            profil = [0] * HORIZON
            for o in self.occupations_lieu.get(lieu_id, []):
                for u in range(o.debut, o.fin):
                    profil[u] += 1
            profil = [min(x, capacite) for x in profil]
            for r in taches:
                for u in range(debut[r], fin[r]):
                    profil[u] += 1
            if max(profil) > capacite:
                erreurs.append(f"{lieu.libelle} : capacité {capacite} dépassée.")

        # Préférences obligatoires
        for rid, t in self.taches.items():
            for pref in self.config.preferences:
                if pref.obligatoire and pref.concerne(t.rdv):
                    if debut[rid] < _tranches_haut(pref.debut.hour * 60 + pref.debut.minute) or fin[rid] > _tranches_bas(pref.fin.hour * 60 + pref.fin.minute):
                        erreurs.append(f"RDV {rid} hors de sa plage obligatoire.")
        return erreurs

    # ------------------------------------------------------------------
    # Méthode principale (calcul seul)
    # ------------------------------------------------------------------

    def planifier(self) -> ResultatPlanification:
        """Calcule le planning. Ne modifie JAMAIS la base de données."""
        self._reinitialiser()
        self.charger_donnees()
        self.classer_rdv()
        echec = self.construire_modele()
        if echec:
            return echec

        statut, valeurs, etapes = self.resoudre()
        if valeurs is None:
            messages = {
                "impossible": "Aucun planning ne respecte toutes les contraintes (impossibilité démontrée par le solveur). "
                              "Vérifier les durées, les horaires, les RDV fixes, les repas et la configuration.",
                "inconnu": f"Aucune solution trouvée en {self.config.temps_limite_secondes:g} s. "
                           "Ce n'est PAS une preuve d'impossibilité : relancer avec plus de temps.",
                "erreur": "Le modèle OR-Tools est invalide (erreur de programmation ou de configuration).",
            }
            return self._echec(statut, messages[statut], etapes)

        erreurs = self.verifier_resultat(valeurs)
        resultat = ResultatPlanification(
            statut="erreur" if erreurs else statut,
            message=("La solution ne passe pas la vérification : " + " ; ".join(erreurs[:5])) if erreurs else "",
            incoherences=self.incoherences,
            ignores=self.ignores,
            etapes=etapes,
            erreurs_verification=erreurs,
            empreinte_fixes=self.empreinte_fixes,
        )
        if erreurs:
            return resultat

        for rid, t in self.taches.items():
            resultat.propositions.append(PropositionRDV(
                rdv_id=rid,
                patient_id=t.rdv.patient_id,
                soignant_ids=[s.id for s in t.rdv.soignants],
                type=t.rdv.type.libelle,
                lieu=t.rdv.lieu.libelle,
                debut=date_heure(self.jour, valeurs[t.debut.Name()] * GRANULARITE),
                fin=date_heure(self.jour, valeurs[t.fin.Name()] * GRANULARITE),
                priorite=t.priorite,
                debut_lu=t.rdv.debut,
                fin_lu=t.rdv.fin,
                duree_ajustee=t.duree_ajustee,
            ))
        for (patient_id, nom), (debut_var, fin_var, _) in self.repas_vars.items():
            resultat.repas.append({
                "patient_id": patient_id,
                "type": nom,
                "debut": date_heure(self.jour, valeurs[debut_var.Name()] * GRANULARITE).isoformat(),
                "fin": date_heure(self.jour, valeurs[fin_var.Name()] * GRANULARITE).isoformat(),
            })
        return resultat

    def _echec(self, statut: str, message: str, etapes: Optional[list] = None) -> ResultatPlanification:
        return ResultatPlanification(
            statut=statut, message=message, incoherences=self.incoherences, ignores=self.ignores,
            etapes=etapes or [], empreinte_fixes=getattr(self, "empreinte_fixes", ()),
        )

    # ------------------------------------------------------------------
    # 11-12. Enregistrement transactionnel
    # ------------------------------------------------------------------

    def enregistrer(self, resultat: ResultatPlanification, valider: bool = True) -> int:
        """
        Enregistre les créneaux calculés : debut, fin, statut en_attente -> planifie.

        - Refuse tout résultat sans solution valide.
        - Tout ou rien : à la moindre erreur, rollback complet de la transaction.
        - Protection contre les modifications concurrentes : chaque RDV n'est
          mis à jour que s'il est toujours « en_attente » avec les horaires lus
          au moment du calcul, et les RDV planifiés de la journée ne doivent
          pas avoir changé. Sinon : ConflitConcurrent, rien n'est enregistré.
        - valider=True : commit ; valider=False : flush seulement (l'appelant
          fait le commit, par exemple pour grouper avec d'autres changements).

        Renvoie le nombre de RDV mis à jour.
        """
        if not resultat.solution_valide:
            raise PlanificationNonEnregistrable(
                f"Statut « {resultat.statut} » : aucun planning valide à enregistrer. {resultat.message}"
            )
        try:
            self.db.flush()
            if self._empreinte_fixes() != resultat.empreinte_fixes:
                raise ConflitConcurrent(
                    "Les RDV planifiés de la journée ont changé depuis le calcul : relancer la planification."
                )
            for p in resultat.propositions:
                reponse = self.db.execute(
                    update(RDV)
                    .where(
                        RDV.id == p.rdv_id,
                        RDV.statut == STATUT_EN_ATTENTE,
                        RDV.debut == p.debut_lu,
                        RDV.fin == p.fin_lu,
                    )
                    .values(debut=p.debut, fin=p.fin, statut=STATUT_PLANIFIE)
                    .execution_options(synchronize_session=False)
                )
                if reponse.rowcount != 1:
                    raise ConflitConcurrent(
                        f"Le RDV {p.rdv_id} a été modifié, supprimé ou n'est plus en attente depuis le calcul : "
                        "rien n'a été enregistré, relancer la planification."
                    )
            if valider:
                self.db.commit()
            else:
                self.db.flush()
        except Exception:
            self.db.rollback()
            raise

        # Les objets RDV en mémoire doivent relire les nouvelles valeurs.
        ids = {p.rdv_id for p in resultat.propositions}
        for objet in list(self.db.identity_map.values()):
            if isinstance(objet, RDV) and objet.id in ids:
                self.db.expire(objet)
        resultat.enregistre = True
        return len(resultat.propositions)


# --------------------------------------------------------------------------
# Point d'entrée simple (compatible avec la première version)
# --------------------------------------------------------------------------

def planifier_journee(
    db: Session,
    jour: date,
    config: Optional[ConfigPlanification] = None,
    enregistrer: bool = False,
) -> dict:
    """
    Planifie les RDV en_attente d'une journée et renvoie un dictionnaire :
        statut, message, rdvs, repas (comme la première version)
        + incoherences, ignores, etapes, enregistre.

    enregistrer=False (défaut) : calcul seul, la base n'est pas modifiée.
    enregistrer=True           : enregistre aussi, si et seulement si une
                                 solution valide a été trouvée.
    """
    planificateur = PlanificateurJournee(db, jour, config)
    resultat = planificateur.planifier()
    if enregistrer and resultat.solution_valide:
        planificateur.enregistrer(resultat)
    return resultat.vers_dict()
