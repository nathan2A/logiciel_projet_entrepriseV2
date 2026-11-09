"""
Remplit le champ « equipe » des soignants (données de test).

    python remplir_equipes.py               # applique
    python remplir_equipes.py --simulation  # affiche seulement, n'enregistre rien

- Les kinésithérapeutes ne sont pas modifiés : leurs horaires (9h-18h)
  viennent de leur profession.
- Les autres soignants sont répartis moitié « matin », moitié « apres_midi ».
  La répartition alterne à l'intérieur de chaque profession, pour que chaque
  métier ait du monde le matin et l'après-midi.
- Les horaires de chaque équipe sont ceux du document « Contraintes OR-Tools »,
  définis dans app/services/planification.py (HORAIRES_EQUIPE) :
  matin 6h30-14h30, après-midi 14h-21h30.

Sans équipe, le solveur ne connaît pas les horaires d'un soignant et écarte ses
RDV en attente (message « Horaire inconnu » après « Synchroniser »).

`python seed.py` recrée les soignants sans équipe : relancer ce script après.
"""

import sys

from app.database import SessionLocal
from app.models import Soignant
from app.services.planification import HORAIRES_EQUIPE, est_kine

EQUIPES = ["matin", "apres_midi"]


def hhmm(minutes: int) -> str:
    return f"{minutes // 60}h{minutes % 60:02d}"


def main(simulation: bool):
    db = SessionLocal()
    try:
        soignants = db.query(Soignant).order_by(Soignant.profession, Soignant.id).all()
        a_repartir = [s for s in soignants if not est_kine(s)]

        # Alternance matin / après-midi à l'intérieur de chaque profession,
        # en continuant d'une profession à l'autre pour garder 50 / 50 au total.
        for i, s in enumerate(a_repartir):
            s.equipe = EQUIPES[i % 2]

        print(f"{'LOGIN':<20} {'PROFESSION':<42} {'ÉQUIPE':<11} HORAIRES")
        for s in soignants:
            if est_kine(s):
                print(f"{s.login:<20} {s.profession:<42} {'(kiné)':<11} 9h00-18h00")
            else:
                debut, fin = HORAIRES_EQUIPE[s.equipe]
                print(f"{s.login:<20} {s.profession:<42} {s.equipe:<11} {hhmm(debut)}-{hhmm(fin)}")

        nb_matin = sum(1 for s in a_repartir if s.equipe == "matin")
        print(f"\n{nb_matin} soignant(s) le matin, {len(a_repartir) - nb_matin} l'après-midi, "
              f"{len(soignants) - len(a_repartir)} kiné(s) inchangé(s).")

        if simulation:
            db.rollback()
            print("Simulation : rien n'a été enregistré.")
        else:
            db.commit()
            print("Équipes enregistrées.")
    except Exception:
        db.rollback()
        print("Erreur : rien n'a été enregistré.")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main(simulation="--simulation" in sys.argv)
