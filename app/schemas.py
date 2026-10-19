"""
schemas.py : la FORME des informations qui entrent et sortent de l'API.

Un schéma décrit ce qu'on a le droit de montrer ou de recevoir. Par exemple, on ne
renvoie jamais le mot de passe haché d'un utilisateur : il n'est dans aucun schéma.
"""

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

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


# --------------------------------------------------------------------------
# Gestion des comptes (administrateur)
# --------------------------------------------------------------------------

Role = Literal["patient", "soignant", "administrateur"]


def _mot_de_passe_valide(valeur: str) -> str:
    if len(valeur) < 8:
        raise ValueError("Le mot de passe doit faire au moins 8 caractères.")
    if len(valeur.encode()) > 72:
        raise ValueError("Le mot de passe est trop long (72 octets maximum).")
    return valeur


class UtilisateurOut(Schema):
    """Un compte, quel que soit son rôle. Les champs qui ne concernent pas le rôle restent vides."""

    id: int
    login: str
    nom: str
    prenom: str
    role: str
    profession: Optional[str] = None
    date_arrivee: Optional[date] = None
    date_depart_prevue: Optional[date] = None
    chambre_id: Optional[int] = None


class CompteCreation(Schema):
    role: Role
    login: str = Field(min_length=3, max_length=255)
    nom: str = Field(min_length=1, max_length=100)
    prenom: str = Field(min_length=1, max_length=100)
    mot_de_passe: str
    # Soignant et administrateur
    profession: Optional[str] = None
    # Patient
    date_arrivee: Optional[date] = None
    date_depart_prevue: Optional[date] = None
    chambre_id: Optional[int] = None

    @field_validator("login")
    @classmethod
    def login_propre(cls, valeur):
        return valeur.strip().lower()

    @field_validator("mot_de_passe")
    @classmethod
    def mot_de_passe_ok(cls, valeur):
        return _mot_de_passe_valide(valeur)

    @model_validator(mode="after")
    def champs_selon_le_role(self):
        if self.role in ("soignant", "administrateur"):
            if not self.profession:
                raise ValueError("La profession est obligatoire pour un soignant ou un administrateur.")
            if self.date_arrivee or self.date_depart_prevue or self.chambre_id is not None:
                raise ValueError("Dates et chambre ne concernent que les patients.")
        else:
            if self.date_arrivee is None:
                raise ValueError("La date d'arrivée est obligatoire pour un patient.")
            if self.profession:
                raise ValueError("La profession ne concerne que les soignants.")
            if self.date_depart_prevue and self.date_depart_prevue < self.date_arrivee:
                raise ValueError("Le départ prévu doit être après l'arrivée.")
        return self


class CompteModification(Schema):
    """Tous les champs sont facultatifs. Le rôle ne peut pas être modifié."""

    login: Optional[str] = Field(None, min_length=3, max_length=255)
    nom: Optional[str] = Field(None, min_length=1, max_length=100)
    prenom: Optional[str] = Field(None, min_length=1, max_length=100)
    mot_de_passe: Optional[str] = None
    profession: Optional[str] = None
    date_arrivee: Optional[date] = None
    date_depart_prevue: Optional[date] = None
    chambre_id: Optional[int] = None

    @field_validator("login")
    @classmethod
    def login_propre(cls, valeur):
        return valeur.strip().lower() if valeur else valeur

    @field_validator("mot_de_passe")
    @classmethod
    def mot_de_passe_ok(cls, valeur):
        return _mot_de_passe_valide(valeur) if valeur is not None else valeur


class MotDePasseChangement(Schema):
    ancien: str
    nouveau: str

    @field_validator("nouveau")
    @classmethod
    def nouveau_ok(cls, valeur):
        return _mot_de_passe_valide(valeur)


# --------------------------------------------------------------------------
# Plan du service : "qui est où"
# --------------------------------------------------------------------------

class RDVResume(Schema):
    id: int
    debut: datetime
    fin: datetime
    statut: str
    soignant: SoignantResume
    type: TypeRDVOut
    lieu: LieuOut


class PatientPlan(Schema):
    patient: PatientResume
    rdv_en_cours: Optional[RDVResume] = None


class ChambrePlan(Schema):
    id: int
    numero: int
    etage: int
    patients: list[PatientPlan]


class PlanOut(Schema):
    moment: datetime
    chambres: list[ChambrePlan]
    hors_chambre: list[PatientPlan]
