
from datetime import date, datetime, time, timedelta

from sqlalchemy import inspect
from sqlalchemy.orm import Session, joinedload

from app.database import SessionLocal
from app.models import RDV


JOUR = date(2026, 10, 20)



def obtenir_relation(objet, noms_possibles):
    """Retourne le nom de la première relation SQLAlchemy existante."""
    relations = inspect(objet).relationships

    for nom in noms_possibles:
        if nom in relations:
            return nom

    return None



def obtenir_valeur(objet, noms_possibles, defaut="Non renseigné"):
    """Lit un attribut parmi plusieurs noms possibles."""
    if objet is None:
        return defaut

    for nom in noms_possibles:
        valeur = getattr(objet, nom, None)

        if valeur is not None and not callable(valeur):
            return str(valeur)

    return defaut


def nom_personne(personne):
    if personne is None:
        return "Non affecté"

    prenom = getattr(personne, "prenom", "") or ""
    nom = getattr(personne, "nom", "") or ""

    resultat = f"{prenom} {nom}".strip()
    return resultat or "Non renseigné"


def afficher_rendez_vous(db: Session, jour: date):
    debut_jour = datetime.combine(jour, time.min)
    fin_jour = debut_jour + timedelta(days=1)

    # Identifier les noms réels des relations dans le modèle RDV.
    relations = inspect(RDV).relationships

    relation_patient = (
        "patient" if "patient" in relations else None
    )
    # Un RDV peut avoir plusieurs soignants (relation « soignants »)
    relation_soignant = (
        "soignants" if "soignants" in relations
        else "soignant" if "soignant" in relations
        else None
    )
    relation_lieu = "lieu" if "lieu" in relations else None

    relation_type = obtenir_relation(
        RDV,
        ["type", "type_rdv", "typeRDV", "type_de_rdv"],
    )

    options = []

    for nom in (
        relation_patient,
        relation_soignant,
        relation_lieu,
        relation_type,
    ):
        if nom:
            options.append(joinedload(getattr(RDV, nom)))

    requete = (
        db.query(RDV)
        .options(*options)
        .filter(
            RDV.debut < fin_jour,
            RDV.fin > debut_jour,
        )
        .order_by(RDV.debut)
    )

    rendez_vous = requete.all()

    print("\n" + "=" * 120)
    print(f"          PLANNING DES RENDEZ-VOUS — {jour:%d/%m/%Y}")
    print("=" * 120)

    if not rendez_vous:
        print("Aucun rendez-vous pour cette journée.")
        return

    colonnes = [
        ("HORAIRES", 13),
        ("PATIENT", 22),
        ("SOIGNANT", 22),
        ("TYPE DE SOIN", 20),
        ("LIEU", 17),
        ("STATUT", 14),
    ]

    entete = " | ".join(
        titre.ljust(largeur)
        for titre, largeur in colonnes
    )

    print(entete)
    print("-" * len(entete))

    for rdv in rendez_vous:
        patient = (
            getattr(rdv, relation_patient)
            if relation_patient else None
        )
        soignant = (
            getattr(rdv, relation_soignant)
            if relation_soignant else None
        )
        lieu = (
            getattr(rdv, relation_lieu)
            if relation_lieu else None
        )
        type_rdv = (
            getattr(rdv, relation_type)
            if relation_type else None
        )

        horaires = (
            f"{rdv.debut:%H:%M}-{rdv.fin:%H:%M}"
            if rdv.debut and rdv.fin
            else "Non défini"
        )

        valeurs = [
            horaires,
            nom_personne(patient),
            (
                ", ".join(nom_personne(s) for s in soignant) or "Aucun"
                if isinstance(soignant, list)
                else nom_personne(soignant)
            ),
            obtenir_valeur(
                type_rdv,
                ["libelle", "nom", "intitule", "description"],
            ),
            obtenir_valeur(
                lieu,
                ["libelle", "nom", "intitule"],
            ),
            getattr(rdv, "statut", None) or "Inconnu",
        ]

        ligne = " | ".join(
            valeur[:largeur].ljust(largeur)
            for valeur, (_, largeur) in zip(valeurs, colonnes)
        )

        print(ligne)

    print("-" * len(entete))
    print(f"Nombre total de rendez-vous : {len(rendez_vous)}")
    print("=" * 120)


def main():
    db = SessionLocal()

    try:
        afficher_rendez_vous(db, JOUR)
    except Exception as erreur:
        print(f"\nErreur pendant l'affichage : {erreur}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
