from ortools.sat.python import cp_model

def creer_planning():
    # 1. Définir les personnes et leurs compétences
    personnes = {
    "Alice": {"Conception", "Tests"},
    "Bob": {"Python"},
    "Claire": {"Python", "Tests"},
    }

    
    # 2. Définir les tâches et leurs durées en heures
    taches = {
        "Conception": {"duree": 4, "competence": "Conception"},
        "Developpement": {"duree": 8, "competence": "Python"},
        "Tests": {"duree": 3, "competence": "Tests"},
    }

    # 3. Définir les dépendances entre les tâches
    dependances = [
        ("Conception", "Developpement"),
        ("Developpement", "Tests"),
    ]

    # 4. Une semaine de travail = 5 jours de 8 heures
    horizon = 5 * 8

    modele = cp_model.CpModel()

    debuts = {}
    fins = {}
    intervalles = {}
    affectations = {}

    # 5. Créer les variables du solveur
    for nom_tache, infos in taches.items():
        duree = infos["duree"]

        debuts[nom_tache] = modele.new_int_var(
            0, horizon, f"debut_{nom_tache}"
        )
        fins[nom_tache] = modele.new_int_var(
            0, horizon, f"fin_{nom_tache}"
        )

        intervalles[nom_tache] = modele.new_interval_var(
            debuts[nom_tache],
            duree,
            fins[nom_tache],
            f"intervalle_{nom_tache}",
        )

        # Une tâche doit être confiée à une personne compétente
        candidats = [
            nom_personne
            for nom_personne, competences in personnes.items()
            if infos["competence"] in competences
        ]

        choix = []
        for nom_personne in candidats:
            affectation = modele.new_bool_var(
                f"{nom_tache}_{nom_personne}"
            )
            affectations[(nom_tache, nom_personne)] = affectation
            choix.append(affectation)

        modele.add_exactly_one(choix)

    # 6. Respecter les dépendances
    for precedente, suivante in dependances:
        modele.add(
            debuts[suivante] >= fins[precedente]
        )

    # 7. Une personne ne peut pas effectuer deux tâches en même temps
    for nom_personne in personnes:
        intervalles_personne = []

        for nom_tache, infos in taches.items():
            cle = (nom_tache, nom_personne)

            if cle not in affectations:
                continue

            intervalle_personne = modele.new_optional_interval_var(
                debuts[nom_tache],
                infos["duree"],
                fins[nom_tache],
                affectations[cle],
                f"intervalle_{nom_tache}_{nom_personne}",
            )
            intervalles_personne.append(intervalle_personne)

        modele.add_no_overlap(intervalles_personne)

    # 8. Chercher un planning qui termine le plus tôt possible
    fin_projet = modele.new_int_var(0, horizon, "fin_projet")
    modele.add_max_equality(fin_projet, list(fins.values()))
    modele.minimize(fin_projet)

    # 9. Résoudre le problème
    solveur = cp_model.CpSolver()
    statut = solveur.solve(modele)

    if statut not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        print("Aucun planning réalisable trouvé.")
        return

    print("\nPLANNING CALCULÉ\n")

    for nom_tache, infos in sorted(
        taches.items(),
        key=lambda element: solveur.value(debuts[element[0]]),
    ):
        personne = next(
            nom_personne
            for nom_personne in personnes
            if (nom_tache, nom_personne) in affectations
            and solveur.value(affectations[(nom_tache, nom_personne)])
        )

        debut = solveur.value(debuts[nom_tache])
        fin = solveur.value(fins[nom_tache])

        print(
            f"{nom_tache} : {personne} | "
            f"heure {debut} à heure {fin}"
        )

    print(f"\nDurée totale du projet : {solveur.value(fin_projet)} heures")
    


if __name__ == "__main__":
    creer_planning()


