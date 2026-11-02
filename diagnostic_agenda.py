
from datetime import date

from app.database import SessionLocal
from app.models import Patient, Soignant, RDV, TypeRDV, Lieu
from app.services.planification import planifier_journee

jour = date(2026, 10, 20)

with SessionLocal() as db:
    print("=== ÉTAT DE LA BASE ===")
    print("Patients :", db.query(Patient).count())
    print("Soignants :", db.query(Soignant).count())
    print("Types de RDV :", db.query(TypeRDV).count())
    print("Lieux :", db.query(Lieu).count())
    print("Tous les RDV :", db.query(RDV).count())

    print("\n=== STATUTS DES RDV ===")
    for statut, nombre in (
        db.query(RDV.statut, __import__("sqlalchemy").func.count(RDV.id))
        .group_by(RDV.statut)
        .all()
    ):
        print(f"{statut} : {nombre}")

    print(f"\n=== PLANIFICATION DU {jour} ===")
    resultat = planifier_journee(db, jour)

    print("Statut :", resultat["statut"])
    print("Message :", resultat.get("message", "Aucun message"))
    print("RDV proposés :", len(resultat.get("rdvs", [])))
    print("Repas proposés :", len(resultat.get("repas", [])))

    for rdv in resultat.get("rdvs", []):
        print(rdv)
