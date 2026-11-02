
from datetime import date, datetime, time, timedelta

from ortools.sat.python import cp_model
from sqlalchemy.orm import Session, joinedload

from app.models import (
    Patient,
    Soignant,
    RDV,
    TypeRDV,
    Lieu,
    STATUT_EN_ATTENTE,
    STATUT_PLANIFIE,
)


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

CAPACITE_PLATEAU = 10
GRANULARITE = 5  # résolution de planification en minutes


def minutes_depuis_minuit(dt: datetime) -> int:
    return dt.hour * 60 + dt.minute


def est_type(libelle: str, *mots: str) -> bool:
    texte = libelle.casefold()
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


def planifier_journee(db: Session, jour: date) -> dict:
    """
    Planifie les RDV en_attente pour une journée.

    Les RDV planifie existants sont conservés comme contraintes fixes.
    Cette fonction ne modifie pas la base de données : elle renvoie
    les propositions de créneaux à valider puis à enregistrer.
    """

    debut_jour = datetime.combine(jour, time.min)
    fin_jour = debut_jour + timedelta(days=1)

    patients = (
        db.query(Patient)
        .filter(Patient.date_arrivee <= jour)
        .filter(
            (Patient.date_depart_prevue.is_(None))
            | (Patient.date_depart_prevue >= jour)
        )
        .all()
    )
    patients_par_id = {p.id: p for p in patients}

    soignants = db.query(Soignant).all()
    soignants_par_id = {s.id: s for s in soignants}

    lieux = db.query(Lieu).all()
    lieux_par_id = {l.id: l for l in lieux}

    types = db.query(TypeRDV).all()
    types_par_id = {t.id: t for t in types}

    rdvs = (
        db.query(RDV)
        .options(
            joinedload(RDV.patient),
            joinedload(RDV.soignant),
            joinedload(RDV.type),
            joinedload(RDV.lieu),
        )
        .filter(RDV.debut < fin_jour, RDV.fin > debut_jour)
        .filter(RDV.statut.in_([STATUT_PLANIFIE, STATUT_EN_ATTENTE]))
        .all()
    )

    fixes = [r for r in rdvs if r.statut == STATUT_PLANIFIE]
    a_planifier = [r for r in rdvs if r.statut == STATUT_EN_ATTENTE]

    # Le solveur ne doit pas planifier les RDV d'un patient absent
    # de la liste des patients présents sur la journée.
    a_planifier = [
        r for r in a_planifier
        if r.patient_id in patients_par_id
        and r.soignant_id in soignants_par_id
    ]

    model = cp_model.CpModel()
    horizon = 24 * 60 // GRANULARITE

    def vers_unites(minute: int) -> int:
        return minute // GRANULARITE

    def duree_unites(rdv: RDV) -> int:
        minutes = int((rdv.fin - rdv.debut).total_seconds() // 60)
        return max(1, (minutes + GRANULARITE - 1) // GRANULARITE)

    variables = {}
    intervalles_patient = {p.id: [] for p in patients}
    intervalles_soignant = {s.id: [] for s in soignants}
    intervalles_plateau = []
    interventions_toilette = {}
    interventions_reeducation = {}

    # Les rendez-vous déjà planifiés bloquent leurs ressources.
    for rdv in fixes:
        if rdv.patient_id not in intervalles_patient:
            continue

        debut = minutes_depuis_minuit(rdv.debut)
        fin = minutes_depuis_minuit(rdv.fin)
        if rdv.fin.date() != jour:
            fin = 24 * 60

        debut_u = vers_unites(debut)
        fin_u = vers_unites(fin)
        duree = max(1, fin_u - debut_u)

        intervalle = model.NewFixedSizeIntervalVar(
            debut_u, duree, f"fixe_{rdv.id}"
        )

        intervalles_patient[rdv.patient_id].append(intervalle)
        intervalles_soignant.setdefault(rdv.soignant_id, []).append(intervalle)

        if est_plateau(rdv.lieu):
            intervalles_plateau.append(intervalle)

    # Variables de début et intervalles des RDV en attente.
    for rdv in a_planifier:
        duree = duree_unites(rdv)
        debut_min = 0
        debut_max = horizon - duree

        debut = model.NewIntVar(
            debut_min, debut_max, f"debut_{rdv.id}"
        )
        fin = model.NewIntVar(
            debut_min + duree, horizon, f"fin_{rdv.id}"
        )
        model.Add(fin == debut + duree)

        intervalle = model.NewIntervalVar(
            debut, duree, fin, f"intervalle_{rdv.id}"
        )

        variables[rdv.id] = {
            "debut": debut,
            "fin": fin,
            "intervalle": intervalle,
            "rdv": rdv,
            "duree": duree,
        }

        intervalles_patient[rdv.patient_id].append(intervalle)
        intervalles_soignant.setdefault(rdv.soignant_id, []).append(intervalle)

        if est_plateau(rdv.lieu):
            intervalles_plateau.append(intervalle)

        if est_toilette(rdv):
            interventions_toilette.setdefault(rdv.patient_id, []).append(rdv.id)

        if est_reeducation(rdv):
            interventions_reeducation.setdefault(rdv.patient_id, []).append(rdv.id)

        # Le créneau doit respecter les horaires du professionnel.
        soignant = rdv.soignant
        if est_kine(soignant):
            debut_service, fin_service = HORAIRES_KINE
        elif soignant.equipe in HORAIRES_EQUIPE:
            debut_service, fin_service = HORAIRES_EQUIPE[soignant.equipe]
        else:
            # Pas d'horaire connu : on refuse de deviner le service.
            raise ValueError(
                f"Horaire inconnu pour le soignant {soignant.id} "
                f"({soignant.prenom} {soignant.nom}, {soignant.profession})."
            )

        model.Add(debut >= vers_unites(debut_service))
        model.Add(fin <= vers_unites(fin_service))

    # Un patient ne peut pas avoir deux rendez-vous simultanément.
    for intervalles in intervalles_patient.values():
        if len(intervalles) > 1:
            model.AddNoOverlap(intervalles)

    # Un soignant ne peut pas être à deux endroits en même temps.
    for intervalles in intervalles_soignant.values():
        if len(intervalles) > 1:
            model.AddNoOverlap(intervalles)

    # Capacité du plateau de rééducation : 10 patients simultanément.
    if intervalles_plateau:
        model.AddCumulative(
            intervalles_plateau,
            [1] * len(intervalles_plateau),
            CAPACITE_PLATEAU,
        )

    # Chaque rééducation doit être précédée d'au moins une toilette
    # du même patient, si une toilette est prévue ce jour-là.
    for patient_id, ids_reeducation in interventions_reeducation.items():
        ids_toilette = interventions_toilette.get(patient_id, [])

        for id_reeducation in ids_reeducation:
            if not ids_toilette:
                continue

            choix = []
            rehab = variables[id_reeducation]

            for id_toilette in ids_toilette:
                toilette = variables[id_toilette]
                avant = model.NewBoolVar(
                    f"toilette_{id_toilette}_avant_reeducation_{id_reeducation}"
                )
                model.Add(toilette["fin"] <= rehab["debut"]).OnlyEnforceIf(avant)
                choix.append(avant)

            model.Add(sum(choix) >= 1)

    # Repas : chaque patient doit disposer d'un créneau libre de 30 minutes
    # dans les fenêtres du déjeuner et du dîner.
    # Les créneaux sont des variables et sont soumis aux conflits du patient.
    variables_repas = {}

    for patient in patients:
        for nom, debut_fenetre, fin_fenetre in [
            ("dejeuner", DEBUT_DEJEUNER, FIN_DEJEUNER),
            ("diner", DEBUT_DINER, FIN_DINER),
        ]:
            duree_repas = 30 // GRANULARITE
            debut_repas = model.NewIntVar(
                vers_unites(debut_fenetre),
                vers_unites(fin_fenetre) - duree_repas,
                f"{nom}_{patient.id}",
            )
            fin_repas = model.NewIntVar(
                vers_unites(debut_fenetre) + duree_repas,
                vers_unites(fin_fenetre),
                f"{nom}_fin_{patient.id}",
            )
            model.Add(fin_repas == debut_repas + duree_repas)

            intervalle_repas = model.NewIntervalVar(
                debut_repas,
                duree_repas,
                fin_repas,
                f"{nom}_intervalle_{patient.id}",
            )

            intervalles_patient[patient.id].append(intervalle_repas)
            variables_repas[(patient.id, nom)] = (debut_repas, fin_repas)

    # Les repas ont été ajoutés après les contraintes NoOverlap :
    # on réapplique donc cette contrainte pour chaque patient.
    for patient_id, intervalles in intervalles_patient.items():
        if len(intervalles) > 1:
            model.AddNoOverlap(intervalles)

    # Objectif simple : minimiser les heures de début des RDV en attente.
    # Cela favorise une planification tôt dans la journée.
    if variables:
        model.Minimize(sum(v["debut"] for v in variables.values()))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 20
    statut = solver.Solve(model)

    if statut not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {
            "statut": "impossible",
            "message": (
                "Aucun planning ne respecte toutes les contraintes. "
                "Vérifie les durées, les horaires, les RDV fixes et les repas."
            ),
            "rdvs": [],
            "repas": [],
        }

    resultat_rdvs = []
    for rdv_id, v in variables.items():
        debut_minute = solver.Value(v["debut"]) * GRANULARITE
        fin_minute = solver.Value(v["fin"]) * GRANULARITE

        resultat_rdvs.append({
            "rdv_id": rdv_id,
            "patient_id": v["rdv"].patient_id,
            "soignant_id": v["rdv"].soignant_id,
            "type": v["rdv"].type.libelle,
            "lieu": v["rdv"].lieu.libelle,
            "debut": date_heure(jour, debut_minute).isoformat(),
            "fin": date_heure(jour, fin_minute).isoformat(),
        })

    resultat_repas = []
    for (patient_id, nom), (debut_var, fin_var) in variables_repas.items():
        debut_minute = solver.Value(debut_var) * GRANULARITE
        fin_minute = solver.Value(fin_var) * GRANULARITE
        resultat_repas.append({
            "patient_id": patient_id,
            "type": nom,
            "debut": date_heure(jour, debut_minute).isoformat(),
            "fin": date_heure(jour, fin_minute).isoformat(),
        })

    return {
        "statut": "optimal" if statut == cp_model.OPTIMAL else "faisable",
        "rdvs": resultat_rdvs,
        "repas": resultat_repas,
    }
