
from datetime import date

from app.database import SessionLocal
from app.services.planification import planifier_journee


def main():
    db = SessionLocal()

    try:
        # Exemple : planifier la journée du 20 octobre 2026.
        resultat = planifier_journee(db, date(2026, 10, 20))

        print("Statut :", resultat["statut"])

        if "message" in resultat:
            print(resultat["message"])

        print("\nRendez-vous :")
        for rdv in resultat.get("rdvs", []):
            print(
                f"Patient {rdv['patient_id']} | "
                f"{rdv['type']} | "
                f"{rdv['debut']} -> {rdv['fin']}"
            )

        print("\nRepas :")
        for repas in resultat.get("repas", []):
            print(
                f"Patient {repas['patient_id']} | "
                f"{repas['type']} | "
                f"{repas['debut']} -> {repas['fin']}"
            )

    finally:
        db.close()


if __name__ == "__main__":
    main()
