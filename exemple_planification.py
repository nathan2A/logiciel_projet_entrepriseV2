"""
Exemple d'utilisation du planificateur, avec validation humaine.

    python exemple_planification.py              # journée du 20/10/2026
    python exemple_planification.py 2026-10-21   # autre journée

1. Calcule le planning des RDV « en_attente » (la base n'est pas modifiée).
2. Affiche les créneaux proposés, les repas, les incohérences et les RDV ignorés.
3. Demande confirmation, puis enregistre (tout ou rien).

La configuration ci-dessous est un EXEMPLE : les valeurs (temps de
déplacement, capacités…) doivent être fournies par l'équipe soignante.
"""

import sys
from datetime import date, datetime, time

from app.database import SessionLocal
from app.services.planification import (
    ConfigPlanification,
    ConflitConcurrent,
    Indisponibilite,
    PlanificateurJournee,
    Preference,
)

JOUR = date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else date(2026, 10, 20)

CONFIG = ConfigPlanification(
    # Capacités simultanées (le plateau a 10 places par défaut ; un lieu absent n'a pas de limite)
    capacites_lieux={
        "Plateau kiné": 10,
        "Salle de psychomotricité": 2,
        "Unité de soins": 1,
    },
    # Minutes de trajet entre deux lieux, pour un même soignant (valable dans les deux sens)
    temps_deplacement={
        ("Plateau kiné", "Chambre du patient"): 10,
        ("Salle d'activité physique adaptée", "Chambre du patient"): 10,
    },
    # Minutes de préparation entre un RDV de type A et un RDV de type B ("*" = tout type)
    temps_preparation={
        ("*", "Arthromoteur"): 10,
    },
    # Absences ponctuelles (une réunion peut aussi être un RDV « planifie » sans patient)
    indisponibilites=[
        # Indisponibilite(soignant_id=270, debut=datetime(2026, 10, 20, 9), fin=datetime(2026, 10, 20, 11), motif="Formation"),
    ],
    # Minutes de RDV maximum par soignant sur la journée
    charge_max_minutes={
        # 270: 420,
    },
    # Plages horaires : obligatoire=True (strict) ou False (souhaité)
    preferences=[
        Preference(debut=time(14), fin=time(17), type_libelle="Psychomotricité"),
        # Preference(debut=time(9), fin=time(12), obligatoire=True, patient_id=303),
    ],
    # Priorités : plus grand = plus prioritaire (0 par défaut)
    priorites_type={
        # "IDE": 1,
    },
)


def main():
    db = SessionLocal()
    try:
        planificateur = PlanificateurJournee(db, JOUR, CONFIG)
        resultat = planificateur.planifier()

        print(f"Planning du {JOUR:%d/%m/%Y} : {resultat.statut}")
        if resultat.message:
            print(resultat.message)
        for e in resultat.etapes:
            print(f"  priorité {e['priorite']} : {e['statut']} en {e['duree_s']} s")

        for i in resultat.incoherences:
            print(f"[{i.gravite}] {i.message}")
        for ig in resultat.ignores:
            print(f"RDV {ig['rdv_id']} ignoré : {ig['raison']}")

        if not resultat.solution_valide:
            print("Rien à enregistrer.")
            return

        print("\nCréneaux proposés :")
        for p in sorted(resultat.propositions, key=lambda p: p.debut):
            ajuste = " (durée arrondie)" if p.duree_ajustee else ""
            print(f"  {p.debut:%H:%M}-{p.fin:%H:%M}  RDV {p.rdv_id}  patient {p.patient_id}  {p.type} | {p.lieu}{ajuste}")
        print(f"Repas calculés (non enregistrés) : {len(resultat.repas)}")

        if input("\nEnregistrer ce planning ? (oui/non) ").strip().lower() != "oui":
            print("Rien n'a été enregistré.")
            return
        try:
            n = planificateur.enregistrer(resultat)
            print(f"{n} RDV enregistrés.")
        except ConflitConcurrent as erreur:
            print(f"Rien n'a été enregistré : {erreur}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
