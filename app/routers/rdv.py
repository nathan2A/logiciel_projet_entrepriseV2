"""
Routes des rendez-vous : lire (agenda), créer, modifier, annuler.

Un "agenda" n'est pas stocké : c'est simplement la liste des RDV filtrée
(par patient, par soignant, par période).

Un RDV a zéro, un ou plusieurs soignants, et zéro ou un patient
(au moins l'un des deux).

Droits :
- Patient : voit UNIQUEMENT ses propres RDV. Il peut créer des RDV de type
  « Visite » pour lui-même, sans soignant, et modifier ou annuler les visites
  qu'il a créées lui-même. Rien d'autre.
- Soignant et administrateur : voient tous les RDV, peuvent créer, modifier, annuler.

Conflits : après une création ou une modification, la réponse contient la liste
des conflits détectés (app/conflits.py). Ce sont des avertissements : le RDV est
enregistré, l'interface demande à l'utilisateur de continuer ou d'annuler.
"""

import unicodedata
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app import conflits
from app import models as m
from app import schemas
from app.deps import get_db, soignant_connecte, utilisateur_courant

router = APIRouter(prefix="/rdv", tags=["Rendez-vous"])

# On charge d'un coup le patient, les soignants, le type et le lieu de chaque RDV
CHARGER_LIENS = (
    joinedload(m.RDV.patient),
    selectinload(m.RDV.soignants),
    joinedload(m.RDV.type),
    joinedload(m.RDV.lieu),
)


def _rdv_ou_404(db: Session, rdv_id: int) -> m.RDV:
    rdv = db.scalar(select(m.RDV).options(*CHARGER_LIENS).where(m.RDV.id == rdv_id))
    if rdv is None:
        raise HTTPException(status_code=404, detail=f"RDV {rdv_id} introuvable.")
    return rdv


def _est_visite(type_rdv: Optional[m.TypeRDV]) -> bool:
    """Vrai si le type de RDV est « Visite » (accents et majuscules ignorés)."""
    if type_rdv is None:
        return False
    libelle = unicodedata.normalize("NFD", type_rdv.libelle)
    libelle = "".join(c for c in libelle if unicodedata.category(c) != "Mn").lower()
    return libelle.startswith("visite")


def _soignants_ou_404(db: Session, ids: list[int]) -> list[m.Soignant]:
    """Les soignants demandés, dans l'ordre ; 404 si l'un n'existe pas."""
    trouves = []
    for soignant_id in dict.fromkeys(ids):
        soignant = db.get(m.Soignant, soignant_id)
        if soignant is None:
            raise HTTPException(status_code=404, detail=f"Soignant {soignant_id} introuvable.")
        trouves.append(soignant)
    return trouves


def _verifier_liens(db: Session, donnees: dict):
    """Vérifie que le patient, le type et le lieu donnés existent."""
    verifications = [
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


def _reponse(db: Session, rdv_id: int, avec_conflits: bool) -> schemas.RDVOut:
    """Le RDV relu depuis la base, avec ses conflits après une création ou une modification."""
    db.expire_all()
    rdv = _rdv_ou_404(db, rdv_id)
    sortie = schemas.RDVOut.model_validate(rdv)
    if avec_conflits:
        sortie.conflits = [schemas.ConflitOut(**c) for c in conflits.detecter(db, rdv)]
    return sortie


def _patient_peut_gerer(utilisateur: m.Utilisateur, rdv: m.RDV) -> bool:
    """Un patient ne gère que les visites qu'il a créées lui-même, pour lui-même."""
    return (
        rdv.createur_id == utilisateur.id
        and rdv.patient_id == utilisateur.id
        and _est_visite(rdv.type)
    )


@router.get("", response_model=list[schemas.RDVOut])
def lister_rdv(
    patient_id: Optional[int] = Query(None, description="Agenda d'un patient"),
    soignant_id: Optional[int] = Query(None, description="Agenda d'un soignant"),
    du: Optional[datetime] = Query(None, description="RDV qui commencent à partir de cette date"),
    au: Optional[datetime] = Query(None, description="RDV qui commencent avant cette date"),
    limite: int = Query(500, ge=1, le=3000, description="Nombre maximum de RDV renvoyés"),
    db: Session = Depends(get_db),
    utilisateur: m.Utilisateur = Depends(utilisateur_courant),
):
    """Liste des RDV, triés par date. Un patient ne voit que les siens."""
    if isinstance(utilisateur, m.Patient):
        if patient_id is not None and patient_id != utilisateur.id:
            raise HTTPException(
                status_code=403, detail="Vous ne pouvez consulter que votre propre agenda."
            )
        patient_id = utilisateur.id  # on force le filtre : il ne verra que ses RDV

    requete = select(m.RDV).options(*CHARGER_LIENS)
    if patient_id is not None:
        requete = requete.where(m.RDV.patient_id == patient_id)
    if soignant_id is not None:
        # Agenda d'un soignant : tous les RDV où il fait partie des soignants
        requete = requete.where(m.RDV.soignants.any(m.Soignant.id == soignant_id))
    if du is not None:
        requete = requete.where(m.RDV.debut >= du)
    if au is not None:
        requete = requete.where(m.RDV.debut < au)
    requete = requete.order_by(m.RDV.debut, m.RDV.id).limit(limite)
    return db.scalars(requete).unique().all()


@router.get("/{rdv_id}", response_model=schemas.RDVOut)
def lire_rdv(
    rdv_id: int,
    db: Session = Depends(get_db),
    utilisateur: m.Utilisateur = Depends(utilisateur_courant),
):
    """Un seul RDV. Un patient ne peut lire que les siens."""
    rdv = _rdv_ou_404(db, rdv_id)
    if isinstance(utilisateur, m.Patient) and rdv.patient_id != utilisateur.id:
        raise HTTPException(status_code=403, detail="Ce RDV n'est pas le vôtre.")
    return rdv


@router.post("", response_model=schemas.RDVOut, status_code=201)
def creer_rdv(
    donnees: schemas.RDVCreation,
    db: Session = Depends(get_db),
    utilisateur: m.Utilisateur = Depends(utilisateur_courant),
):
    """Crée un RDV. Le créateur est la personne connectée.

    Soignant : tout type de RDV. Patient : une visite pour lui-même, sans soignant.
    """
    valeurs = donnees.model_dump()
    _verifier_liens(db, valeurs)

    if isinstance(utilisateur, m.Patient):
        if not _est_visite(db.get(m.TypeRDV, donnees.type_id)):
            raise HTTPException(status_code=403, detail="Un patient ne peut ajouter que des visites.")
        if donnees.patient_id not in (None, utilisateur.id):
            raise HTTPException(status_code=403, detail="Vous ne pouvez ajouter une visite que pour vous-même.")
        if donnees.soignant_ids:
            raise HTTPException(status_code=403, detail="Une visite ajoutée par un patient n'a pas de soignant.")
        valeurs["patient_id"] = utilisateur.id

    if valeurs["patient_id"] is None and not valeurs["soignant_ids"]:
        raise HTTPException(
            status_code=422, detail="Choisissez au moins un patient ou un soignant."
        )

    soignant_ids = valeurs.pop("soignant_ids")
    rdv = m.RDV(**valeurs, createur_id=utilisateur.id)
    rdv.soignants = _soignants_ou_404(db, soignant_ids)
    db.add(rdv)
    db.commit()
    return _reponse(db, rdv.id, avec_conflits=True)


@router.patch("/{rdv_id}", response_model=schemas.RDVOut)
def modifier_rdv(
    rdv_id: int,
    donnees: schemas.RDVModification,
    db: Session = Depends(get_db),
    utilisateur: m.Utilisateur = Depends(utilisateur_courant),
):
    """Modifie un RDV, par exemple pour le décaler.

    Soignant : tout RDV. Patient : seulement les visites qu'il a créées, sans
    changer de patient, de type, ni ajouter de soignant.
    """
    rdv = _rdv_ou_404(db, rdv_id)
    changements = donnees.model_dump(exclude_unset=True)
    _verifier_liens(db, changements)

    if isinstance(utilisateur, m.Patient):
        if not _patient_peut_gerer(utilisateur, rdv):
            raise HTTPException(status_code=403, detail="Vous ne pouvez modifier que les visites que vous avez ajoutées.")
        if "patient_id" in changements and changements["patient_id"] != utilisateur.id:
            raise HTTPException(status_code=403, detail="Une visite reste à votre nom.")
        if changements.get("soignant_ids"):
            raise HTTPException(status_code=403, detail="Une visite ajoutée par un patient n'a pas de soignant.")
        if "type_id" in changements and not _est_visite(db.get(m.TypeRDV, changements["type_id"])):
            raise HTTPException(status_code=403, detail="Un patient ne peut ajouter que des visites.")

    debut = changements.get("debut", rdv.debut)
    fin = changements.get("fin", rdv.fin)
    if fin <= debut:
        raise HTTPException(
            status_code=422, detail="La fin du RDV doit être après son début."
        )

    nouveaux_soignants = (
        _soignants_ou_404(db, changements.pop("soignant_ids"))
        if "soignant_ids" in changements and changements["soignant_ids"] is not None
        else None
    )
    changements.pop("soignant_ids", None)
    patient_final = changements.get("patient_id", rdv.patient_id)
    soignants_finaux = nouveaux_soignants if nouveaux_soignants is not None else rdv.soignants
    if patient_final is None and not soignants_finaux:
        raise HTTPException(
            status_code=422, detail="Choisissez au moins un patient ou un soignant."
        )

    for champ, valeur in changements.items():
        setattr(rdv, champ, valeur)
    if nouveaux_soignants is not None:
        rdv.soignants = nouveaux_soignants
    db.commit()
    return _reponse(db, rdv_id, avec_conflits=True)


@router.post("/{rdv_id}/annuler", response_model=schemas.RDVOut)
def annuler_rdv(
    rdv_id: int,
    db: Session = Depends(get_db),
    utilisateur: m.Utilisateur = Depends(utilisateur_courant),
):
    """Annule un RDV : on change son statut, on ne le supprime jamais.

    Soignant : tout RDV. Patient : seulement les visites qu'il a créées.
    """
    rdv = _rdv_ou_404(db, rdv_id)
    if isinstance(utilisateur, m.Patient) and not _patient_peut_gerer(utilisateur, rdv):
        raise HTTPException(status_code=403, detail="Vous ne pouvez annuler que les visites que vous avez ajoutées.")
    rdv.statut = m.STATUT_ANNULE
    db.commit()
    return _reponse(db, rdv_id, avec_conflits=False)


@router.post("/{rdv_id}/terminer", response_model=schemas.RDVOut)
def terminer_rdv(
    rdv_id: int,
    db: Session = Depends(get_db),
    soignant: m.Soignant = Depends(soignant_connecte),
):
    """Marque la séance comme réalisée (le bouton « séance terminée » de l'interface)."""
    rdv = _rdv_ou_404(db, rdv_id)
    if rdv.statut == m.STATUT_ANNULE:
        raise HTTPException(status_code=409, detail="Ce RDV est annulé, il ne peut pas être terminé.")
    rdv.statut = m.STATUT_REALISE
    db.commit()
    return _reponse(db, rdv_id, avec_conflits=False)
