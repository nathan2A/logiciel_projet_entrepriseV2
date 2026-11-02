
from datetime import date, datetime, time, timedelta

from sqlalchemy import or_

from app.database import SessionLocal
from app.models import (
    Utilisateur,
    Patient,
    Soignant,
    RDV,
    TypeRDV,
    Lieu,
    STATUT_EN_ATTENTE,
    STATUT_PLANIFIE,
)
from app.services.planification import planifier_journee


# Date utilisée pour les données de test
JOUR = date(2026, 10, 20)


def contient(texte, *mots):
    texte = texte.casefold()
    return any(mot.casefold() in texte for mot in mots)


def est_kine(soignant):
    return contient(
        soignant.profession,
        "kiné",
        "kine",
        "kinésithérapeute",
    )


def est_aide_soignant(soignant):
    return contient(
        soignant.profession,
        "aide-soignant",
        "aide soignant",
        "as",
    )


def est_reeducation(type_rdv):
    return contient(
        type_rdv.libelle,
        "rééducation",
        "reeducation",
        "kiné",
        "kine",
        "kinésithérapie",
        "kinesitherapie",
    )


def est_toilette(type_rdv):
    return contient(
        type_rdv.libelle,
        "toilette",
        "toilettes",
    )


def est_plateau(lieu):
    return contient(
        lieu.libelle,
        "plateau",
    ) and contient(
        lieu.libelle,
        "rééduc",
        "reeduc",
        "kiné",
        "kine",
    )


def main():
    db = SessionLocal()

    try:
        debut_jour = datetime.combine(JOUR, time.min)
        debut_provisoire = datetime.combine(JOUR, time(8, 0))

        print(f"Préparation du planning du {JOUR}...")

        # 1. Charger les données nécessaires.
        patients = (
            db.query(Patient)
            .filter(Patient.date_arrivee <= JOUR)
            .filter(
                or_(
                    Patient.date_depart_prevue.is_(None),
                    Patient.date_depart_prevue >= JOUR,
                )
            )
            .all()
        )

        soignants = db.query(Soignant).all()
        types = db.query(TypeRDV).order_by(TypeRDV.id).all()
        lieux = db.query(Lieu).order_by(Lieu.id).all()
        createur = db.query(Utilisateur).first()

        # Le planificateur exige des horaires connus.
        soignants_eligibles = [
            s for s in soignants
            if est_kine(s)
            or s.equipe in ("matin", "apres_midi", "jour")
        ]

        kines = [s for s in soignants_eligibles if est_kine(s)]
        aides = [
            s for s in soignants_eligibles
            if est_aide_soignant(s)
        ]

        if not patients:
            raise RuntimeError(
                f"Aucun patient présent le {JOUR}."
            )

        if not soignants_eligibles:
            raise RuntimeError(
                "Aucun soignant avec un horaire reconnu. "
                "Vérifie profession et equipe dans la base."
            )

        if not types or not lieux or createur is None:
            raise RuntimeError(
                "Il manque un type de RDV, un lieu ou un utilisateur "
                "pour créer les demandes."
            )

        # 2. Préparer les demandes en mémoire avant de supprimer.
        demandes = []

        for index, patient in enumerate(patients):
            type_rdv = types[index % len(types)]

            if est_reeducation(type_rdv) and kines:
                pool = kines
            elif est_toilette(type_rdv) and aides:
                pool = aides
            else:
                pool = soignants_eligibles

            soignant = pool[index % len(pool)]

            if est_reeducation(type_rdv):
                plateaux = [l for l in lieux if est_plateau(l)]
                lieu = plateaux[0] if plateaux else lieux[0]
            else:
                lieu = lieux[0]

            duree = max(5, int(type_rdv.duree_par_defaut or 30))

            demandes.append({
                "patient": patient,
                "soignant": soignant,
                "type": type_rdv,
                "lieu": lieu,
                "duree": duree,
            })

        print("Patients actifs :", len(patients))
        print("Demandes à créer :", len(demandes))

        # 3. Supprimer les anciens rendez-vous fictifs.
        # La suppression reste annulable tant que l'on ne commit pas.
        anciens = db.query(RDV).count()
        db.query(RDV).delete(synchronize_session=False)
        db.flush()

        print("Anciens rendez-vous supprimés dans la transaction.")

        # 4. Créer des demandes provisoires en attente.
        nouveaux = []

        for demande in demandes:
            fin_provisoire = debut_provisoire + timedelta(
                minutes=demande["duree"]
            )

            rdv = RDV(
                debut=debut_provisoire,
                fin=fin_provisoire,
                statut=STATUT_EN_ATTENTE,
                commentaire="Demande de test générée automatiquement",
                createur_id=createur.id,
                soignant_id=demande["soignant"].id,
                patient_id=demande["patient"].id,
                type_id=demande["type"].id,
                lieu_id=demande["lieu"].id,
            )

            db.add(rdv)
            nouveaux.append(rdv)

        db.flush()

        print(f"{len(nouveaux)} demandes créées.")
        print("Lancement d'OR-Tools...")

        # 5. Calculer le planning.
        resultat = planifier_journee(db, JOUR)

        print("Statut OR-Tools :", resultat["statut"])

        if resultat["statut"] not in ("optimal", "faisable"):
            raise RuntimeError(
                resultat.get(
                    "message",
                    "Le solveur n'a trouvé aucune solution.",
                )
            )

        propositions = {
            item["rdv_id"]: item
            for item in resultat.get("rdvs", [])
        }

        if len(propositions) != len(nouveaux):
            raise RuntimeError(
                f"Seulement {len(propositions)} créneaux calculés "
                f"pour {len(nouveaux)} demandes. "
                "Aucun changement ne sera validé."
            )

        # 6. Enregistrer les horaires calculés.
        for rdv in nouveaux:
            proposition = propositions[rdv.id]

            rdv.debut = datetime.fromisoformat(
                proposition["debut"]
            )
            rdv.fin = datetime.fromisoformat(
                proposition["fin"]
            )
            rdv.statut = STATUT_PLANIFIE

        db.flush()

        # Les repas calculés par le code actuel ne sont pas enregistrés
        # comme des RDV : ils restent des propositions séparées.
        print("Repas proposés :", len(resultat.get("repas", [])))

        # 7. Validation finale de toute l'opération.
        db.commit()

        print("\nSUCCÈS : planning enregistré.")
        print("Anciens RDV remplacés :", anciens)
        print("Nouveaux RDV planifiés :", len(nouveaux))

        for item in sorted(
            resultat["rdvs"],
            key=lambda x: x["debut"],
        ):
            print(
                f"Patient {item['patient_id']} | "
                f"{item['type']} | "
                f"{item['debut']} -> {item['fin']}"
            )

    except Exception as erreur:
        db.rollback()
        print("\nÉCHEC :", erreur)
        print(
            "Transaction annulée : les suppressions et créations "
            "non validées ont été annulées."
        )
        raise

    finally:
        db.close()


if __name__ == "__main__":
    main()
