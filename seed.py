"""
seed.py : remplit la base de données avec les données fictives de data/donnees_v1.xlsx

Utilisation (depuis la racine du projet, environnement virtuel activé, Docker démarré) :

    python seed.py

ATTENTION : ce script VIDE d'abord les tables de données (RDV, patients, soignants,
utilisateurs, chambres, lieux, types de RDV) puis les remplit. À n'utiliser que sur
une base de développement. Il ne modifie pas la structure (c'est le rôle d'Alembic).

Pour ne pas avoir à confirmer : python seed.py --oui
"""

import sys
from datetime import date, datetime
from pathlib import Path

import bcrypt
from openpyxl import load_workbook
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app import models as m
from app.database import engine

FICHIER = Path("data/donnees_v1.xlsx")

# Mot de passe de TOUS les comptes de test (développement uniquement)
MOT_DE_PASSE_TEST = "test1234"


# --------------------------------------------------------------------------
# Lecture de l'Excel
# --------------------------------------------------------------------------

def lire_onglet(classeur, nom):
    """Retourne la liste des lignes d'un onglet sous forme de dictionnaires.

    La ligne 1 donne les noms de colonnes. Les lignes entièrement vides sont ignorées.
    Chaque dictionnaire contient aussi '_ligne' (le numéro de ligne dans Excel).
    """
    if nom not in classeur.sheetnames:
        sys.exit(f"Onglet introuvable dans l'Excel : « {nom} ».")
    lignes = classeur[nom].iter_rows(values_only=True)
    entetes = [str(e).strip() for e in next(lignes)]
    resultat = []
    for numero, valeurs in enumerate(lignes, start=2):
        if all(v is None or str(v).strip() == "" for v in valeurs):
            continue
        ligne = dict(zip(entetes, valeurs))
        ligne["_ligne"] = numero
        resultat.append(ligne)
    return resultat


def en_date(valeur):
    return valeur.date() if isinstance(valeur, datetime) else valeur


def trouver(dictionnaire, cle, onglet, ligne, colonne):
    """Cherche une valeur référencée (ex. login du patient) ou s'arrête avec un message clair."""
    if cle not in dictionnaire:
        sys.exit(
            f"Erreur onglet « {onglet} », ligne {ligne} : la valeur « {cle} » "
            f"(colonne {colonne}) n'existe pas dans l'onglet correspondant."
        )
    return dictionnaire[cle]


# --------------------------------------------------------------------------
# Programme principal
# --------------------------------------------------------------------------

def main():
    if not FICHIER.exists():
        sys.exit(f"Fichier introuvable : {FICHIER}. Placez l'Excel dans le dossier data/.")

    if "--oui" not in sys.argv:
        print("Ce script va VIDER les tables de données puis les remplir avec l'Excel.")
        if input("Continuer ? (oui/non) : ").strip().lower() != "oui":
            sys.exit("Annulé, rien n'a été modifié.")

    classeur = load_workbook(FICHIER, data_only=True)

    # Un seul hash pour tous les comptes : il est identique et bien plus rapide à produire
    mdp_hash = bcrypt.hashpw(
        MOT_DE_PASSE_TEST.encode(), bcrypt.gensalt(rounds=4)
    ).decode()

    with Session(engine) as session:
        # 1) On vide, dans l'ordre inverse des dépendances (les RDV d'abord)
        for table in (
            m.RDV.__table__,
            m.Patient.__table__,
            m.Soignant.__table__,
            m.Utilisateur.__table__,
            m.Chambre.__table__,
            m.Lieu.__table__,
            m.TypeRDV.__table__,
        ):
            session.execute(delete(table))

        # 2) Tables simples
        chambres = {}
        for r in lire_onglet(classeur, "Chambres"):
            c = m.Chambre(numero=int(r["numero"]), etage=int(r["etage"]))
            chambres[c.numero] = c
            session.add(c)

        lieux = {}
        for r in lire_onglet(classeur, "Lieux"):
            lieu = m.Lieu(libelle=r["libelle"])
            lieux[lieu.libelle] = lieu
            session.add(lieu)

        types = {}
        for r in lire_onglet(classeur, "Types_RDV"):
            t = m.TypeRDV(
                libelle=r["libelle"],
                couleur=r["couleur"],
                duree_par_defaut=int(r["duree_par_defaut"]),
            )
            types[t.libelle] = t
            session.add(t)

        # 3) Utilisateurs : soignants (et administrateur), puis patients
        soignants = {}
        for r in lire_onglet(classeur, "Soignants"):
            if r["role"] not in (m.ROLE_SOIGNANT, m.ROLE_ADMINISTRATEUR):
                sys.exit(
                    f"Erreur onglet « Soignants », ligne {r['_ligne']} : "
                    f"rôle « {r['role']} » inconnu (soignant ou administrateur)."
                )
            classe = m.Administrateur if r["role"] == m.ROLE_ADMINISTRATEUR else m.Soignant
            s = classe(
                login=r["login"],
                nom=r["nom"],
                prenom=r["prenom"],
                mot_de_passe_hash=mdp_hash,
                profession=r["profession"],
            )
            soignants[s.login] = s
            session.add(s)

        patients = {}
        for r in lire_onglet(classeur, "Patients"):
            numero = r["chambre_numero"]
            chambre = None
            if numero not in (None, ""):
                chambre = trouver(
                    chambres, int(numero), "Patients", r["_ligne"], "chambre_numero"
                )
            p = m.Patient(
                login=r["login"],
                nom=r["nom"],
                prenom=r["prenom"],
                mot_de_passe_hash=mdp_hash,
                date_arrivee=en_date(r["date_arrivee"]),
                date_depart_prevue=en_date(r["date_depart_prevue"]),
                chambre=chambre,
            )
            patients[p.login] = p
            session.add(p)

        # On envoie tout à la base maintenant pour que chaque objet reçoive son identifiant
        session.flush()

        # 4) Rendez-vous
        nb_rdv = 0
        for r in lire_onglet(classeur, "RDV"):
            ligne = r["_ligne"]
            if r["statut"] not in m.STATUTS_RDV:
                sys.exit(
                    f"Erreur onglet « RDV », ligne {ligne} : statut « {r['statut']} » "
                    f"inconnu (autorisés : {', '.join(m.STATUTS_RDV)})."
                )
            if r["fin"] <= r["debut"]:
                sys.exit(f"Erreur onglet « RDV », ligne {ligne} : la fin doit être après le début.")
            session.add(
                m.RDV(
                    debut=r["debut"],
                    fin=r["fin"],
                    statut=r["statut"],
                    commentaire=r["commentaire"],
                    createur_id=trouver(soignants, r["createur_login"], "RDV", ligne, "createur_login").id,
                    soignant_id=trouver(soignants, r["soignant_login"], "RDV", ligne, "soignant_login").id,
                    patient_id=trouver(patients, r["patient_login"], "RDV", ligne, "patient_login").id,
                    type_id=trouver(types, r["type"], "RDV", ligne, "type").id,
                    lieu_id=trouver(lieux, r["lieu"], "RDV", ligne, "lieu").id,
                )
            )
            nb_rdv += 1

        session.commit()

        # 5) Résumé
        print("Base remplie :")
        for nom, modele in (
            ("utilisateurs", m.Utilisateur),
            ("soignants (admin compris)", m.Soignant),
            ("patients", m.Patient),
            ("chambres", m.Chambre),
            ("lieux", m.Lieu),
            ("types de RDV", m.TypeRDV),
            ("RDV", m.RDV),
        ):
            total = session.scalar(select(func.count()).select_from(modele))
            print(f"  {nom:28s} {total}")
        print(f"Mot de passe de tous les comptes de test : {MOT_DE_PASSE_TEST}")


if __name__ == "__main__":
    main()
