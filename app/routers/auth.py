"""
Routes de connexion : se connecter, et savoir qui je suis.
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models as m
from app import schemas
from app.deps import get_db, utilisateur_courant
from app.security import creer_jeton, hacher_mot_de_passe, verifier_mot_de_passe

router = APIRouter(prefix="/auth", tags=["Connexion"])


@router.post("/connexion", response_model=schemas.Token)
def connexion(
    formulaire: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)
):
    """Vérifie le login et le mot de passe, puis remet un jeton valable 8 heures.

    Le champ « username » du formulaire est le login (ex. a05, kine1, admin).
    """
    utilisateur = db.scalar(
        select(m.Utilisateur).where(
            func.lower(m.Utilisateur.login) == formulaire.username.strip().lower()
        )
    )
    # Même message dans les deux cas : on ne révèle pas si le login existe
    if utilisateur is None or not verifier_mot_de_passe(
        formulaire.password, utilisateur.mot_de_passe_hash
    ):
        raise HTTPException(
            status_code=401,
            detail="Login ou mot de passe incorrect.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return {"access_token": creer_jeton(utilisateur.id), "token_type": "bearer"}


@router.get("/moi", response_model=schemas.MoiOut)
def qui_suis_je(utilisateur: m.Utilisateur = Depends(utilisateur_courant)):
    """Renvoie les informations de la personne connectée."""
    return utilisateur


@router.post("/mot-de-passe", status_code=204)
def changer_mot_de_passe(
    donnees: schemas.MotDePasseChangement,
    db: Session = Depends(get_db),
    utilisateur: m.Utilisateur = Depends(utilisateur_courant),
):
    """Permet à la personne connectée de changer SON mot de passe."""
    if not verifier_mot_de_passe(donnees.ancien, utilisateur.mot_de_passe_hash):
        raise HTTPException(status_code=400, detail="L'ancien mot de passe est incorrect.")
    utilisateur.mot_de_passe_hash = hacher_mot_de_passe(donnees.nouveau)
    db.commit()
