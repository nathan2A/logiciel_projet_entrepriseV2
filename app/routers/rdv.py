"""
Routes des rendez-vous : lire (agenda), créer, modifier, annuler.

Un "agenda" n'est pas stocké : c'est simplement la liste des RDV filtrée
(par patient, par soignant, par période).
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app import models as m
from app import schemas
from app.deps import get_db

router = APIRouter(prefix="/rdv", tags=["Rendez-vous"])

# On charge d'un coup le patient, le soignant, le type et le lieu de chaque RDV
CHARGER_LIENS = (
    joinedload(m.RDV.patient),
    joinedload(m.RDV.soignant),
    joinedload(m.RDV.type),
    joinedload(m.RDV.lieu),
)


def _rdv_ou_404(db: Session, rdv_id: int) -> m.RDV:
    rdv = db.scalar(select(m.RDV).options(*CHARGER_LIENS).where(m.RDV.id == rdv_id))
    if rdv is None:
        raise HTTPException(status_code=404, detail=f"RDV {rdv_id} introuvable.")
    return rdv


def _verifier_liens(db: Session, donnees: dict):
    """Vérifie que les numéros donnés (patient, soignant, type, lieu...) existent."""
    verifications = [
        ("createur_id", m.Utilisateur, "Utilisateur créateur"),
        ("soignant_id", m.Soignant, "Soignant"),
        ("patient_id", m.Patient, "Patient"),
        ("type_id", m.TypeRDV, "Type de RDV"),
        ("lieu_id", m.Lieu, "Lieu"),
    ]
    for champ, modele, nom in verifications:
        if champ in donnees and donnees[champ] is not None:
            if db.get(modele, donnees[champ]) is None:
                raise HTTPException(
                    status_code=404, detail=f"{nom} {donnees[champ]} introuvable."
                )


@router.get("", response_model=list[schemas.RDVOut])
def lister_rdv(
    patient_id: Optional[int] = Query(None, description="Agenda d'un patient"),
    soignant_id: Optional[int] = Query(None, description="Agenda d'un soignant"),
    du: Optional[datetime] = Query(None, description="RDV qui commencent à partir de cette date"),
    au: Optional[datetime] = Query(None, description="RDV qui commencent avant cette date"),
    limite: int = Query(500, ge=1, le=3000, description="Nombre maximum de RDV renvoyés"),
    db: Session = Depends(get_db),
):
    """Liste des RDV, triés par date. Tous les filtres sont facultatifs."""
    requete = select(m.RDV).options(*CHARGER_LIENS)
    if patient_id is not None:
        requete = requete.where(m.RDV.patient_id == patient_id)
    if soignant_id is not None:
        requete = requete.where(m.RDV.soignant_id == soignant_id)
    if du is not None:
        requete = requete.where(m.RDV.debut >= du)
    if au is not None:
        requete = requete.where(m.RDV.debut < au)
    requete = requete.order_by(m.RDV.debut, m.RDV.id).limit(limite)
    return db.scalars(requete).all()


@router.get("/{rdv_id}", response_model=schemas.RDVOut)
def lire_rdv(rdv_id: int, db: Session = Depends(get_db)):
    """Un seul RDV."""
    return _rdv_ou_404(db, rdv_id)


@router.post("", response_model=schemas.RDVOut, status_code=201)
def creer_rdv(donnees: schemas.RDVCreation, db: Session = Depends(get_db)):
    """Crée un RDV."""
    _verifier_liens(db, donnees.model_dump())
    rdv = m.RDV(**donnees.model_dump())
    db.add(rdv)
    db.commit()
    return _rdv_ou_404(db, rdv.id)


@router.patch("/{rdv_id}", response_model=schemas.RDVOut)
def modifier_rdv(
    rdv_id: int, donnees: schemas.RDVModification, db: Session = Depends(get_db)
):
    """Modifie un RDV (par exemple pour le décaler). Seuls les champs envoyés changent."""
    rdv = _rdv_ou_404(db, rdv_id)
    changements = donnees.model_dump(exclude_unset=True)
    _verifier_liens(db, changements)

    debut = changements.get("debut", rdv.debut)
    fin = changements.get("fin", rdv.fin)
    if fin <= debut:
        raise HTTPException(
            status_code=422, detail="La fin du RDV doit être après son début."
        )

    for champ, valeur in changements.items():
        setattr(rdv, champ, valeur)
    db.commit()
    db.expire_all()
    return _rdv_ou_404(db, rdv_id)


@router.post("/{rdv_id}/annuler", response_model=schemas.RDVOut)
def annuler_rdv(rdv_id: int, db: Session = Depends(get_db)):
    """Annule un RDV : on change son statut, on ne le supprime jamais."""
    rdv = _rdv_ou_404(db, rdv_id)
    rdv.statut = m.STATUT_ANNULE
    db.commit()
    db.expire_all()
    return _rdv_ou_404(db, rdv_id)
