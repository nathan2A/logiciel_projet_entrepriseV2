"""
Plan du service : « qui est où ».

Pour chaque chambre, quel patient s'y trouve et, s'il est en séance à ce moment-là,
laquelle (type, soignant, lieu). Sert à la vue d'ensemble des soignants et au code
couleur « patient en soin ». Réservé aux soignants.
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app import models as m
from app import schemas
from app.deps import get_db, soignant_connecte

router = APIRouter(tags=["Plan du service"])

# Une séance annulée ou déjà terminée ne compte pas comme « en cours »
STATUTS_EN_COURS = (m.STATUT_PLANIFIE, m.STATUT_EN_ATTENTE)


@router.get(
    "/plan", response_model=schemas.PlanOut, dependencies=[Depends(soignant_connecte)]
)
def plan_du_service(
    moment: Optional[datetime] = Query(
        None, description="Instant à afficher (par défaut : maintenant)"
    ),
    db: Session = Depends(get_db),
):
    """Chambres, patients présents et séances en cours à un instant donné."""
    moment = moment or datetime.now()
    jour = moment.date()

    en_cours = db.scalars(
        select(m.RDV)
        .options(
            selectinload(m.RDV.soignants), joinedload(m.RDV.type), joinedload(m.RDV.lieu)
        )
        .where(
            m.RDV.debut <= moment,
            m.RDV.fin > moment,
            m.RDV.statut.in_(STATUTS_EN_COURS),
            m.RDV.patient_id.is_not(None),  # un RDV sans patient ne place personne
        )
        .order_by(m.RDV.debut, m.RDV.id)
    ).all()
    rdv_par_patient = {}
    for rdv in en_cours:
        rdv_par_patient.setdefault(rdv.patient_id, rdv)  # on garde le premier

    # Patients présents ce jour-là (entre leur arrivée et leur départ prévu)
    presents = db.scalars(
        select(m.Patient).where(
            m.Patient.date_arrivee <= jour,
            (m.Patient.date_depart_prevue.is_(None)) | (m.Patient.date_depart_prevue >= jour),
        )
    ).all()
    presents_par_chambre = {}
    hors_chambre = []
    for patient in presents:
        fiche = {"patient": patient, "rdv_en_cours": rdv_par_patient.get(patient.id)}
        if patient.chambre_id is None:
            if fiche["rdv_en_cours"] is not None:  # ex. hôpital de jour, en séance
                hors_chambre.append(fiche)
        else:
            presents_par_chambre.setdefault(patient.chambre_id, []).append(fiche)

    chambres = db.scalars(select(m.Chambre).order_by(m.Chambre.numero)).all()
    return {
        "moment": moment,
        "chambres": [
            {
                "id": c.id,
                "numero": c.numero,
                "etage": c.etage,
                "patients": presents_par_chambre.get(c.id, []),
            }
            for c in chambres
        ],
        "hors_chambre": sorted(hors_chambre, key=lambda f: f["patient"].nom),
    }
