"""
Gestion des comptes : réservée à l'administrateur.

Créer, lister, lire, modifier et supprimer des utilisateurs (patients, soignants,
administrateurs). On ne peut pas supprimer un compte lié à des RDV : l'historique
des RDV doit rester complet.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, with_polymorphic

from app import models as m
from app import schemas
from app.deps import administrateur_connecte, get_db
from app.security import hacher_mot_de_passe

router = APIRouter(
    prefix="/utilisateurs",
    tags=["Gestion des comptes (administrateur)"],
    dependencies=[Depends(administrateur_connecte)],
)

CHAMPS_OBLIGATOIRES = ("login", "nom", "prenom", "mot_de_passe", "profession", "date_arrivee")
CHAMPS_PATIENT = ("date_arrivee", "date_depart_prevue", "chambre_id")


def _utilisateur_ou_404(db: Session, utilisateur_id: int) -> m.Utilisateur:
    utilisateur = db.get(m.Utilisateur, utilisateur_id)
    if utilisateur is None:
        raise HTTPException(status_code=404, detail=f"Utilisateur {utilisateur_id} introuvable.")
    return utilisateur


def _verifier_login_libre(db: Session, login: str, sauf_id: Optional[int] = None):
    requete = select(m.Utilisateur.id).where(func.lower(m.Utilisateur.login) == login.lower())
    if sauf_id is not None:
        requete = requete.where(m.Utilisateur.id != sauf_id)
    if db.scalar(requete) is not None:
        raise HTTPException(status_code=409, detail=f"Le login « {login} » est déjà utilisé.")


def _verifier_chambre(db: Session, chambre_id: Optional[int]):
    if chambre_id is not None and db.get(m.Chambre, chambre_id) is None:
        raise HTTPException(status_code=404, detail=f"Chambre {chambre_id} introuvable.")


@router.get("", response_model=list[schemas.UtilisateurOut])
def lister_utilisateurs(
    role: Optional[schemas.Role] = Query(None, description="Filtrer par rôle"),
    db: Session = Depends(get_db),
):
    """Tous les comptes, triés par nom. Le mot de passe n'est jamais renvoyé."""
    tous = with_polymorphic(m.Utilisateur, [m.Soignant, m.Patient])
    requete = select(tous).order_by(tous.nom, tous.prenom)
    if role is not None:
        requete = requete.where(tous.role == role)
    return db.scalars(requete).all()


@router.get("/{utilisateur_id}", response_model=schemas.UtilisateurOut)
def lire_utilisateur(utilisateur_id: int, db: Session = Depends(get_db)):
    return _utilisateur_ou_404(db, utilisateur_id)


@router.post("", response_model=schemas.UtilisateurOut, status_code=201)
def creer_utilisateur(donnees: schemas.CompteCreation, db: Session = Depends(get_db)):
    """Crée un compte. Selon le rôle, certains champs sont obligatoires (voir le schéma)."""
    _verifier_login_libre(db, donnees.login)
    commun = dict(
        login=donnees.login,
        nom=donnees.nom,
        prenom=donnees.prenom,
        mot_de_passe_hash=hacher_mot_de_passe(donnees.mot_de_passe),
    )
    if donnees.role == "patient":
        _verifier_chambre(db, donnees.chambre_id)
        compte = m.Patient(
            **commun,
            date_arrivee=donnees.date_arrivee,
            date_depart_prevue=donnees.date_depart_prevue,
            chambre_id=donnees.chambre_id,
        )
    elif donnees.role == "administrateur":
        compte = m.Administrateur(**commun, profession=donnees.profession)
    else:
        compte = m.Soignant(**commun, profession=donnees.profession)
    db.add(compte)
    db.commit()
    return compte


@router.patch("/{utilisateur_id}", response_model=schemas.UtilisateurOut)
def modifier_utilisateur(
    utilisateur_id: int, donnees: schemas.CompteModification, db: Session = Depends(get_db)
):
    """Modifie un compte. Seuls les champs envoyés changent. Le rôle est fixe."""
    compte = _utilisateur_ou_404(db, utilisateur_id)
    changements = donnees.model_dump(exclude_unset=True)

    for champ in CHAMPS_OBLIGATOIRES:
        if champ in changements and changements[champ] is None:
            raise HTTPException(status_code=422, detail=f"Le champ « {champ} » ne peut pas être vide.")

    if isinstance(compte, m.Patient) and "profession" in changements:
        raise HTTPException(status_code=422, detail="Un patient n'a pas de profession.")
    if isinstance(compte, m.Soignant) and any(c in changements for c in CHAMPS_PATIENT):
        raise HTTPException(
            status_code=422, detail="Dates et chambre ne concernent que les patients."
        )

    if "login" in changements:
        _verifier_login_libre(db, changements["login"], sauf_id=compte.id)
    if "chambre_id" in changements:
        _verifier_chambre(db, changements["chambre_id"])

    if isinstance(compte, m.Patient):
        arrivee = changements.get("date_arrivee", compte.date_arrivee)
        depart = changements.get("date_depart_prevue", compte.date_depart_prevue)
        if depart is not None and depart < arrivee:
            raise HTTPException(status_code=422, detail="Le départ prévu doit être après l'arrivée.")

    if "mot_de_passe" in changements:
        compte.mot_de_passe_hash = hacher_mot_de_passe(changements.pop("mot_de_passe"))
    for champ, valeur in changements.items():
        setattr(compte, champ, valeur)
    db.commit()
    return compte


@router.delete("/{utilisateur_id}", status_code=204)
def supprimer_utilisateur(
    utilisateur_id: int,
    db: Session = Depends(get_db),
    administrateur: m.Administrateur = Depends(administrateur_connecte),
):
    """Supprime un compte, sauf le sien ou un compte lié à des RDV."""
    compte = _utilisateur_ou_404(db, utilisateur_id)
    if compte.id == administrateur.id:
        raise HTTPException(status_code=409, detail="Vous ne pouvez pas supprimer votre propre compte.")
    nb_rdv = db.scalar(
        select(func.count())
        .select_from(m.RDV)
        .where(
            or_(
                m.RDV.patient_id == compte.id,
                m.RDV.soignant_id == compte.id,
                m.RDV.createur_id == compte.id,
            )
        )
    )
    if nb_rdv:
        raise HTTPException(
            status_code=409,
            detail=f"Ce compte est lié à {nb_rdv} RDV : il ne peut pas être supprimé "
            "(l'historique des RDV est conservé).",
        )
    db.delete(compte)
    db.commit()
