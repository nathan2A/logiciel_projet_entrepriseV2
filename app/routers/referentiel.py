"""
Routes de LECTURE des listes de base : patients, soignants, types de RDV, lieux, chambres.
Elles servent surtout à remplir les menus déroulants de l'interface.

Droits :
- patients et soignants : réservé aux soignants (un patient n'a pas à voir les autres) ;
- types de RDV et lieux : tout utilisateur connecté (nécessaire pour les couleurs).
"""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app import models as m
from app import schemas
from app.deps import get_db, soignant_connecte, utilisateur_courant

router = APIRouter(tags=["Listes de référence"])


@router.get(
    "/patients",
    response_model=list[schemas.PatientOut],
    dependencies=[Depends(soignant_connecte)],
)
def lister_patients(db: Session = Depends(get_db)):
    """Tous les patients actifs, avec leur chambre (soignants uniquement)."""
    requete = (
        select(m.Patient)
        .options(joinedload(m.Patient.chambre))
        .where(m.Patient.actif.is_(True))  # profils supprimés (archivés) exclus
        .order_by(m.Patient.nom)
    )
    return db.scalars(requete).all()


@router.get(
    "/soignants",
    response_model=list[schemas.SoignantOut],
    dependencies=[Depends(soignant_connecte)],
)
def lister_soignants(db: Session = Depends(get_db)):
    """Tous les soignants actifs, l'administrateur compris (soignants uniquement)."""
    return db.scalars(
        select(m.Soignant).where(m.Soignant.actif.is_(True)).order_by(m.Soignant.nom)
    ).all()


@router.get(
    "/types-rdv",
    response_model=list[schemas.TypeRDVOut],
    dependencies=[Depends(utilisateur_courant)],
)
def lister_types_rdv(db: Session = Depends(get_db)):
    """Les types de RDV, avec leur couleur (tout utilisateur connecté)."""
    return db.scalars(select(m.TypeRDV).order_by(m.TypeRDV.libelle)).all()


@router.get(
    "/lieux",
    response_model=list[schemas.LieuOut],
    dependencies=[Depends(utilisateur_courant)],
)
def lister_lieux(db: Session = Depends(get_db)):
    """Les lieux où peut se dérouler un RDV (tout utilisateur connecté)."""
    return db.scalars(select(m.Lieu).order_by(m.Lieu.libelle)).all()


@router.get(
    "/chambres",
    response_model=list[schemas.ChambreOut],
    dependencies=[Depends(soignant_connecte)],
)
def lister_chambres(db: Session = Depends(get_db)):
    """Toutes les chambres, par numéro (formulaire de création de profil patient)."""
    return db.scalars(select(m.Chambre).order_by(m.Chambre.numero)).all()
