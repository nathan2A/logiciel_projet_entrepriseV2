"""
Modèles SQLAlchemy – v1 de l'agenda partagé (SMR Carhaix).

Traduction du diagramme UML v1 :

    Utilisateur  <|--  Soignant  <|--  Administrateur
    Utilisateur  <|--  Patient

    Patient  * --> 1  Chambre        (occupe)
    RDV      * --> 1  Utilisateur    (créé par)
    RDV      * --> 1  Soignant       (réalisé par)
    RDV      * --> 1  Patient        (concerne)
    RDV      * --> 1  TypeRDV        (est de type)
    RDV      * --> 1  Lieu           (se déroule en)

Choix techniques :
- L'héritage est "joined" : une table `utilisateurs` commune, plus une table
  `soignants` et une table `patients` pour les champs propres à chacun.
- L'administrateur est un soignant (comme décidé dans l'équipe) : il n'a pas de
  table à lui, il est reconnu grâce à la colonne `role` de `utilisateurs`.
- Le statut d'un RDV est un simple texte (pas un "enum" PostgreSQL) pour
  simplifier les migrations Alembic.
"""

from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from app.database import Base


# --------------------------------------------------------------------------
# Valeurs autorisées (constantes réutilisables dans l'API et l'interface)
# --------------------------------------------------------------------------

ROLE_PATIENT = "patient"
ROLE_SOIGNANT = "soignant"
ROLE_ADMINISTRATEUR = "administrateur"

STATUT_PLANIFIE = "planifie"
STATUT_EN_ATTENTE = "en_attente"
STATUT_REALISE = "realise"
STATUT_ANNULE = "annule"
STATUTS_RDV = [STATUT_PLANIFIE, STATUT_EN_ATTENTE, STATUT_REALISE, STATUT_ANNULE]


# --------------------------------------------------------------------------
# Utilisateurs
# --------------------------------------------------------------------------

class Utilisateur(Base):
    """Classe de base : tout le monde a un compte (patient, soignant, admin)."""

    __tablename__ = "utilisateurs"

    id = Column(Integer, primary_key=True)
    nom = Column(String(100), nullable=False)
    prenom = Column(String(100), nullable=False)
    login = Column(String(255), nullable=False, unique=True)
    mot_de_passe_hash = Column(String(255), nullable=False)  # jamais en clair
    # Colonne qui indique de quel type est l'utilisateur
    role = Column(String(30), nullable=False)

    __mapper_args__ = {
        "polymorphic_on": role,
        "polymorphic_identity": "utilisateur",
    }

    def __repr__(self):
        return f"<{self.__class__.__name__} {self.id} {self.prenom} {self.nom}>"


class Soignant(Utilisateur):
    __tablename__ = "soignants"

    id = Column(Integer, ForeignKey("utilisateurs.id"), primary_key=True)
    profession = Column(String(100), nullable=False)  # kiné, IDE, EAPA, ergo...

    __mapper_args__ = {"polymorphic_identity": ROLE_SOIGNANT}

    # RDV dont ce soignant est l'intervenant
    rdvs = relationship(
        "RDV", back_populates="soignant", foreign_keys="RDV.soignant_id"
    )


class Administrateur(Soignant):
    """Un administrateur est un soignant qui peut en plus gérer les comptes.

    Pas de __tablename__ : il utilise les tables `utilisateurs` et `soignants`
    et se distingue par role = 'administrateur'.
    """

    __mapper_args__ = {"polymorphic_identity": ROLE_ADMINISTRATEUR}


class Patient(Utilisateur):
    __tablename__ = "patients"

    id = Column(Integer, ForeignKey("utilisateurs.id"), primary_key=True)
    date_arrivee = Column(Date, nullable=False)
    date_depart_prevue = Column(Date, nullable=True)
    # Nullable : un patient peut ne pas (encore) avoir de chambre (ex. hôpital de jour)
    chambre_id = Column(Integer, ForeignKey("chambres.id"), nullable=True)

    __mapper_args__ = {"polymorphic_identity": ROLE_PATIENT}

    chambre = relationship("Chambre", back_populates="patients")
    rdvs = relationship(
        "RDV", back_populates="patient", foreign_keys="RDV.patient_id"
    )


# --------------------------------------------------------------------------
# Lieux
# --------------------------------------------------------------------------

class Chambre(Base):
    __tablename__ = "chambres"

    id = Column(Integer, primary_key=True)
    numero = Column(Integer, nullable=False, unique=True)
    etage = Column(Integer, nullable=False)

    patients = relationship("Patient", back_populates="chambre")


class Lieu(Base):
    """Où se déroule un RDV : chambre, plateau kiné, salle APA, extérieur..."""

    __tablename__ = "lieux"

    id = Column(Integer, primary_key=True)
    libelle = Column(String(100), nullable=False, unique=True)

    rdvs = relationship("RDV", back_populates="lieu")


# --------------------------------------------------------------------------
# Rendez-vous
# --------------------------------------------------------------------------

class TypeRDV(Base):
    """Nature d'un RDV : Kiné, EAPA, Ergothérapie, IDE, Consultation externe..."""

    __tablename__ = "types_rdv"

    id = Column(Integer, primary_key=True)
    libelle = Column(String(100), nullable=False, unique=True)
    couleur = Column(String(7), nullable=False, default="#888888")  # ex. "#3B82F6"
    duree_par_defaut = Column(Integer, nullable=False, default=30)  # en minutes

    rdvs = relationship("RDV", back_populates="type")


class RDV(Base):
    __tablename__ = "rdv"
    __table_args__ = (
        CheckConstraint("fin > debut", name="ck_rdv_fin_apres_debut"),
    )

    id = Column(Integer, primary_key=True)
    debut = Column(DateTime, nullable=False, index=True)
    fin = Column(DateTime, nullable=False)
    statut = Column(String(20), nullable=False, default=STATUT_PLANIFIE)
    commentaire = Column(Text, nullable=True)

    createur_id = Column(Integer, ForeignKey("utilisateurs.id"), nullable=False)
    soignant_id = Column(Integer, ForeignKey("soignants.id"), nullable=False, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    type_id = Column(Integer, ForeignKey("types_rdv.id"), nullable=False)
    lieu_id = Column(Integer, ForeignKey("lieux.id"), nullable=False)

    createur = relationship("Utilisateur", foreign_keys=[createur_id])
    soignant = relationship(
        "Soignant", back_populates="rdvs", foreign_keys=[soignant_id]
    )
    patient = relationship(
        "Patient", back_populates="rdvs", foreign_keys=[patient_id]
    )
    type = relationship("TypeRDV", back_populates="rdvs")
    lieu = relationship("Lieu", back_populates="rdvs")
