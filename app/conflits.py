"""
conflits.py — Détection des conflits de planning (avertissements).

Appelé par les routes de création et de modification des RDV (routers/rdv.py).
Les conflits ne bloquent jamais l'enregistrement : le RDV est enregistré et la
liste des conflits est renvoyée au frontend, qui demande à l'utilisateur de
continuer ou d'annuler (un avertissement à la fois : le patient d'abord,
puis chaque soignant).

Ce module applique des règles simples, avec les mêmes horaires que la
planification automatique OR-Tools (app/services/planification.py).

Règles vérifiées :
    - PATIENT_DOUBLE_TACHE  : le patient a déjà un RDV qui chevauche celui-ci ;
    - PLAGE_REPAS           : un RDV d'un patient empiète sur 11h-14h ou 18h-20h ;
    - SOIGNANT_DOUBLE_TACHE : un soignant a déjà un autre RDV qui chevauche celui-ci
                              (les séances de groupe identiques ne comptent pas) ;
    - HORS_HORAIRES         : le RDV sort des horaires habituels d'un soignant
                              (kiné 9h-18h, sinon selon soignant.equipe, sinon
                              selon la profession).
"""

import unicodedata
from datetime import time

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app import models as m
from app.services.planification import HORAIRES_EQUIPE, HORAIRES_KINE, est_kine

# --------------------------------------------------------------------------
# Paramètres (à adapter avec l'équipe soignante)
# --------------------------------------------------------------------------

# Horaires habituels : les mêmes que la planification OR-Tools
# (app/services/planification.py : HORAIRES_KINE et HORAIRES_EQUIPE selon
# soignant.equipe). Si l'équipe n'est pas renseignée, on applique ces valeurs
# par profession : (mot-clé dans la profession, début, fin). Une profession
# absente de la liste n'a pas de contrôle d'horaires.
HORAIRES_PAR_PROFESSION = [
    ("infirmi", time(6, 30), time(21, 30)),   # IDE : équipes matin, après-midi, journée
    ("soignant", time(6, 30), time(21, 30)),  # aides-soignants : idem (6h30-21h30 en tout)
]


def _heure(minutes: int) -> time:
    return time(minutes // 60, minutes % 60)

# Plages repas à garder libres pour les patients
PLAGES_REPAS = [(time(11, 0), time(14, 0)), (time(18, 0), time(20, 0))]

STATUTS_ACTIFS = (m.STATUT_PLANIFIE, m.STATUT_EN_ATTENTE)


def _normaliser(texte: str) -> str:
    sans_accents = unicodedata.normalize("NFD", texte or "")
    return "".join(c for c in sans_accents if unicodedata.category(c) != "Mn").lower()


def nom_affiche(personne) -> str:
    """« DUPONT Daniel » : NOM en majuscules, prénom avec une majuscule initiale."""
    prenom = "-".join(p.capitalize() for p in (personne.prenom or "").split("-"))
    prenom = " ".join(p[:1].upper() + p[1:] for p in prenom.split(" "))
    return f"{(personne.nom or '').upper()} {prenom}".strip()


def horaires_de(soignant: m.Soignant):
    """Horaires habituels (début, fin) d'un soignant, ou None si aucune règle."""
    if est_kine(soignant):
        return _heure(HORAIRES_KINE[0]), _heure(HORAIRES_KINE[1])
    if soignant.equipe in HORAIRES_EQUIPE:
        debut, fin = HORAIRES_EQUIPE[soignant.equipe]
        return _heure(debut), _heure(fin)
    profession = _normaliser(soignant.profession)
    for mot, debut, fin in HORAIRES_PAR_PROFESSION:
        if mot in profession:
            return debut, fin
    return None


def _chevauche(a_debut, a_fin, b_debut, b_fin) -> bool:
    return a_debut < b_fin and b_debut < a_fin


def _meme_seance(a: m.RDV, b: m.RDV) -> bool:
    """Deux RDV d'une même séance de groupe : même horaire, même type, même lieu."""
    return a.debut == b.debut and a.fin == b.fin and a.type_id == b.type_id and a.lieu_id == b.lieu_id


def detecter(db: Session, rdv: m.RDV) -> list[dict]:
    """Conflits du RDV (déjà enregistré), dans l'ordre d'affichage : patient puis soignants."""
    if rdv.statut not in STATUTS_ACTIFS:
        return []

    conflits: list[dict] = []
    jour_debut = rdv.debut.replace(hour=0, minute=0, second=0, microsecond=0)

    # RDV actifs du même jour qui chevauchent celui-ci
    voisins = db.scalars(
        select(m.RDV)
        .options(selectinload(m.RDV.soignants))
        .where(
            m.RDV.id != rdv.id,
            m.RDV.statut.in_(STATUTS_ACTIFS),
            m.RDV.debut < rdv.fin,
            m.RDV.fin > rdv.debut,
            m.RDV.debut >= jour_debut,
        )
    ).all()

    # ---------------------------- Patient ----------------------------
    if rdv.patient is not None:
        nom = nom_affiche(rdv.patient)
        autres = [v for v in voisins if v.patient_id == rdv.patient_id]
        if autres:
            conflits.append({
                "id": f"patient-{rdv.patient_id}-double-{rdv.id}",
                "type": "PATIENT_DOUBLE_TACHE",
                "gravite": "avertissement",
                "message": f"{nom} a déjà un rendez-vous sur ce créneau.",
                "rdv_ids": [rdv.id] + [v.id for v in autres],
                "patient_id": rdv.patient_id,
            })
        est_repas = "repas" in _normaliser(rdv.type.libelle if rdv.type else "")
        d, f = rdv.debut.time(), rdv.fin.time()
        if not est_repas and any(_chevauche(d, f, a, b) for a, b in PLAGES_REPAS):
            conflits.append({
                "id": f"patient-{rdv.patient_id}-repas-{rdv.id}",
                "type": "PLAGE_REPAS",
                "gravite": "avertissement",
                "message": f"Ce rendez-vous de {nom} empiète sur une plage repas (11h-14h ou 18h-20h).",
                "rdv_ids": [rdv.id],
                "patient_id": rdv.patient_id,
            })

    # ---------------------------- Soignants ----------------------------
    for soignant in sorted(rdv.soignants, key=lambda s: (s.nom, s.prenom)):
        nom = nom_affiche(soignant)
        horaires = horaires_de(soignant)
        if horaires is not None:
            debut, fin = horaires
            hors = (
                rdv.debut.time() < debut
                or rdv.fin.time() > fin
                or rdv.fin.date() != rdv.debut.date()
            )
            if hors:
                conflits.append({
                    "id": f"soignant-{soignant.id}-horaires-{rdv.id}",
                    "type": "HORS_HORAIRES",
                    "gravite": "avertissement",
                    "message": f"Ce rendez-vous n'est pas compris dans les horaires habituels de ce soignant : {nom}.",
                    "rdv_ids": [rdv.id],
                    "soignant_id": soignant.id,
                })
        autres = [
            v for v in voisins
            if any(s.id == soignant.id for s in v.soignants) and not _meme_seance(v, rdv)
        ]
        if autres:
            conflits.append({
                "id": f"soignant-{soignant.id}-double-{rdv.id}",
                "type": "SOIGNANT_DOUBLE_TACHE",
                "gravite": "avertissement",
                "message": f"{nom} a déjà un rendez-vous sur ce créneau.",
                "rdv_ids": [rdv.id] + [v.id for v in autres],
                "soignant_id": soignant.id,
            })

    return conflits
