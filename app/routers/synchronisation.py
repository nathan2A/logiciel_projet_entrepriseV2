"""
Synchronisation de l'agenda (bouton « Synchroniser » de l'interface).

POST /planification/synchroniser : relance le solveur OR-Tools
(app/services/planification.py, classe PlanificateurJournee) pour chaque jour
de la période, puis enregistre les créneaux trouvés.

- Seuls les RDV « en_attente » reçoivent un horaire. Les RDV « planifie »
  (créés à la main ou déjà placés par le solveur) ne sont jamais modifiés :
  ils servent de contraintes fixes.
- Chaque jour est traité séparément : un jour impossible n'empêche pas les
  autres d'être enregistrés. Pour un jour impossible, rien n'est enregistré.
- Un RDV dont un soignant n'a pas d'horaire connu est écarté (et signalé) au
  lieu de bloquer toute la journée.
- Une seule synchronisation à la fois (verrou PostgreSQL) : un second appel
  pendant le calcul reçoit 409, même avec plusieurs processus serveur.
"""

from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app import models as m
from app import schemas
from app.database import engine
from app.deps import get_db, soignant_connecte
from app.services.planification import ConfigPlanification, ConflitConcurrent, PlanificateurJournee

router = APIRouter(prefix="/planification", tags=["Planification"])

# Identifiant arbitraire du verrou PostgreSQL « synchronisation en cours »
VERROU_SYNCHRONISATION = 718_204


def _nb_en_attente(db: Session, jour: date) -> int:
    debut = datetime.combine(jour, time.min)
    return db.scalar(
        select(func.count(m.RDV.id)).where(
            m.RDV.statut == m.STATUT_EN_ATTENTE,
            m.RDV.debut < debut + timedelta(days=1),
            m.RDV.fin > debut,
        )
    )


def _synchroniser_jour(db: Session, jour: date) -> schemas.JourSynchroniseOut:
    en_attente = _nb_en_attente(db, jour)
    if en_attente == 0:
        return schemas.JourSynchroniseOut(jour=jour, statut="rien_a_planifier")

    planificateur = PlanificateurJournee(
        db, jour, ConfigPlanification(ignorer_rdv_sans_horaire=True, pas_avant=datetime.now())
    )
    resultat = planificateur.planifier()
    sortie = schemas.JourSynchroniseOut(
        jour=jour,
        statut=resultat.statut,
        message=resultat.message,
        nb_en_attente=en_attente,
        incoherences=[schemas.IncoherenceOut(code=i.code, gravite=i.gravite, message=i.message) for i in resultat.incoherences],
        ignores=[schemas.RdvIgnoreOut(**i) for i in resultat.ignores],
    )
    if resultat.solution_valide:
        try:
            sortie.nb_planifies = planificateur.enregistrer(resultat)
        except ConflitConcurrent as erreur:
            sortie.statut = "conflit"
            sortie.message = str(erreur)
    else:
        db.rollback()  # lecture seule, mais on repart d'une transaction propre
    return sortie


@router.post("/synchroniser", response_model=schemas.SynchronisationOut)
def synchroniser(
    demande: schemas.SynchronisationDemande = schemas.SynchronisationDemande(),
    db: Session = Depends(get_db),
    soignant: m.Soignant = Depends(soignant_connecte),
):
    """
    Planifie les RDV en attente de `jours` jours à partir de `du` (aujourd'hui
    par défaut) et enregistre les horaires trouvés. Réservé aux soignants.
    """
    du = demande.du or date.today()
    jours = [du + timedelta(days=i) for i in range(demande.jours)]

    # Verrou tenu sur une connexion dédiée pendant tout le calcul
    with engine.connect() as verrou:
        if not verrou.scalar(text("SELECT pg_try_advisory_lock(:cle)"), {"cle": VERROU_SYNCHRONISATION}):
            raise HTTPException(
                status_code=409,
                detail="Une synchronisation est déjà en cours. Réessayez dans quelques secondes.",
            )
        try:
            resultats = [_synchroniser_jour(db, jour) for jour in jours]
        finally:
            verrou.execute(text("SELECT pg_advisory_unlock(:cle)"), {"cle": VERROU_SYNCHRONISATION})
            verrou.commit()

    return schemas.SynchronisationOut(
        du=jours[0],
        au=jours[-1],
        total_planifies=sum(r.nb_planifies for r in resultats),
        total_restants=sum(_nb_en_attente(db, jour) for jour in jours),
        jours=resultats,
    )
