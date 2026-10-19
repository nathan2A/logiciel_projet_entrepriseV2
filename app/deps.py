"""
deps.py : outils partagés par les routes.

- get_db()             : ouvre/referme la conversation avec la base pour chaque demande.
- utilisateur_courant(): retrouve QUI fait la demande grâce à son jeton de connexion.
- soignant_connecte()  : comme le précédent, mais refuse les patients (accès réservé
                         aux soignants et à l'administrateur, qui est un soignant).
- administrateur_connecte() : réservé à l'administrateur (gestion des comptes).
"""

from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session, sessionmaker

from app import models as m
from app.database import engine
from app.security import lire_jeton

SessionLocal = sessionmaker(bind=engine, autoflush=False)

# Indique à FastAPI où se connecter (ça active le bouton "Authorize" dans /docs)
schema_oauth2 = OAuth2PasswordBearer(tokenUrl="auth/connexion")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def utilisateur_courant(
    jeton: str = Depends(schema_oauth2), db: Session = Depends(get_db)
) -> m.Utilisateur:
    """Retourne l'utilisateur connecté, ou refuse avec l'erreur 401."""
    erreur = HTTPException(
        status_code=401,
        detail="Non connecté, ou session expirée. Connectez-vous à nouveau.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    utilisateur_id = lire_jeton(jeton)
    if utilisateur_id is None:
        raise erreur
    utilisateur = db.get(m.Utilisateur, utilisateur_id)
    if utilisateur is None:
        raise erreur
    return utilisateur


def soignant_connecte(
    utilisateur: m.Utilisateur = Depends(utilisateur_courant),
) -> m.Soignant:
    """Réservé aux soignants (l'administrateur en est un). Les patients reçoivent 403."""
    if not isinstance(utilisateur, m.Soignant):
        raise HTTPException(status_code=403, detail="Accès réservé aux soignants.")
    return utilisateur


def administrateur_connecte(
    utilisateur: m.Utilisateur = Depends(utilisateur_courant),
) -> m.Administrateur:
    """Réservé à l'administrateur. Les autres reçoivent 403."""
    if not isinstance(utilisateur, m.Administrateur):
        raise HTTPException(status_code=403, detail="Accès réservé à l'administrateur.")
    return utilisateur
