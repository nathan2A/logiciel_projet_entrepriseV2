"""
schemas.py : la FORME des informations qui entrent et sortent de l'API.

Un schéma décrit ce qu'on a le droit de montrer ou de recevoir. Par exemple, on ne
renvoie jamais le mot de passe haché d'un utilisateur : il n'est dans aucun schéma.
"""

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, model_validator

Statut = Literal["planifie", "en_attente", "realise", "annule"]


class Schema(BaseModel):
    # Permet de fabriquer un schéma directement à partir d'un objet de models.py
    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------------------------------
# Connexion
# --------------------------------------------------------------------------

class Token(Schema):
    access_token: str
    token_type: str


class MoiOut(Schema):
    id: int
    login: str
    nom: str
    prenom: str
    role: str


# --------------------------------------------------------------------------
# Ce que l'API renvoie
# --------------------------------------------------------------------------

class ChambreOut(Schema):
    id: int
    numero: int
    etage: int


class LieuOut(Schema):
    id: int
    libelle: str


class TypeRDVOut(Schema):
    id: int
    libelle: str
    couleur: str
    duree_par_defaut: int


class SoignantResume(Schema):
    id: int
    nom: str
    prenom: str
    profession: str


class SoignantOut(SoignantResume):
    login: str
    role: str


class PatientResume(Schema):
    id: int
    login: str
    nom: str
    prenom: str


class PatientOut(PatientResume):
    date_arrivee: date
    date_depart_prevue: Optional[date] = None
    chambre: Optional[ChambreOut] = None


class RDVOut(Schema):
    id: int
    debut: datetime
    fin: datetime
    statut: str
    commentaire: Optional[str] = None
    createur_id: int
    patient: PatientResume
    soignant: SoignantResume
    type: TypeRDVOut
    lieu: LieuOut


# --------------------------------------------------------------------------
# Ce que l'API reçoit
# --------------------------------------------------------------------------

class RDVCreation(Schema):
    debut: datetime
    fin: datetime
    statut: Statut = "planifie"
    commentaire: Optional[str] = None
    soignant_id: int
    patient_id: int
    type_id: int
    lieu_id: int

    @model_validator(mode="after")
    def fin_apres_debut(self):
        if self.fin <= self.debut:
            raise ValueError("La fin du RDV doit être après son début.")
        return self


class RDVModification(Schema):
    """Tous les champs sont facultatifs : on n'envoie que ce qui change."""

    debut: Optional[datetime] = None
    fin: Optional[datetime] = None
    statut: Optional[Statut] = None
    commentaire: Optional[str] = None
    soignant_id: Optional[int] = None
    patient_id: Optional[int] = None
    type_id: Optional[int] = None
    lieu_id: Optional[int] = None
