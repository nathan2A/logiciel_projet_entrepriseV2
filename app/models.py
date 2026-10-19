"""
Modèles SQLAlchemy – v1 de l'agenda partagé (SMR Carhaix).

OBJECTIF :
Définir les différentes tables utilisées par l'application
d'agenda partagé des professionnels de santé.

Le fichier contient :
    1. Les rôles et statuts disponibles
    2. Les utilisateurs (patients, soignants, administrateurs)
    3. Les chambres et lieux d'intervention
    4. Les types de rendez-vous
    5. Les rendez-vous et leurs relations

Chaque classe représente une entité du modèle de données.

Les relations permettent de savoir :
    - Quel patient est concerné par un RDV
    - Quel soignant réalise l'intervention
    - Qui a créé le RDV
    - Où et quand se déroule le RDV
    - Quel type d'intervention est prévu

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

# --------------------------------------------------------------------------
# Importation des bibliothèques
# --------------------------------------------------------------------------
from sqlalchemy import (
    CheckConstraint,     # Vérifie une condition dans la base
    Column,              # Définit une colonne de table
    Date,                # Stocke une date sans heure
    DateTime,            # Stocke une date et une heure
    ForeignKey,          # Crée un lien entre deux tables
    Integer,             # Nombre entier
    String,              # Chaîne de caractères de taille limitée
    Text,                # Texte libre
)
from sqlalchemy.orm import relationship

# Base commune dont héritent les modèles SQLAlchemy
# Définie dans le fichier database.py
from app.database import Base


# --------------------------------------------------------------------------
# Valeurs autorisées (constantes réutilisables dans l'API et l'interface)
# --------------------------------------------------------------------------

# Rôles possibles des utilisateurs de l'application
ROLE_PATIENT = "patient"
ROLE_SOIGNANT = "soignant"
ROLE_ADMINISTRATEUR = "administrateur"


# Statuts possibles d'un rendez-vous
STATUT_PLANIFIE = "planifie"
STATUT_EN_ATTENTE = "en_attente"
STATUT_REALISE = "realise"
STATUT_ANNULE = "annule"

# Regroupement des statuts utilisés dans l'application.
# Attention : cette liste ne constitue pas, à elle seule,
# une contrainte de validation dans la base de données.
STATUTS_RDV = [STATUT_PLANIFIE, STATUT_EN_ATTENTE, STATUT_REALISE, STATUT_ANNULE]


# --------------------------------------------------------------------------
# Utilisateurs
# --------------------------------------------------------------------------

class Utilisateur(Base):
    """
    Classe générale représentant un utilisateur.

    Tous les utilisateurs possèdent :
        - Un identifiant
        - Un nom et un prénom
        - Un login
        - Un mot de passe haché
        - Un rôle

    Les patients, soignants et administrateurs
    héritent de cette classe.
    """

    # Nom de la table PostgreSQL
    __tablename__ = "utilisateurs"

    # Identifiant unique de chaque utilisateur
    # primary_key=True : clé primaire de la table
    id = Column(Integer, primary_key=True)

    # Informations personnelles obligatoires
    # nullable=False : le champ ne peut pas être NULL
    nom = Column(String(100), nullable=False)
    prenom = Column(String(100), nullable=False)

    # Identifiant utilisé pour se connecter
    # unique=True : deux utilisateurs ne peuvent pas
    # avoir le même login
    login = Column(String(255), nullable=False, unique=True)

    # Le mot de passe n'est jamais stocké en clair.
    # On conserve uniquement son empreinte (hash).
    mot_de_passe_hash = Column(String(255), nullable=False)  # jamais en clair
    
    # Colonne qui indique de quel type est l'utilisateur
    # Détermine si l'utilisateur est un patient,
    # un soignant ou un administrateur.
    role = Column(String(30), nullable=False)

    # Configuration de l'héritage SQLAlchemy.
    # polymorphic_on : colonne permettant de déterminer
    # la classe réelle de l'utilisateur.
    # polymorphic_identity : valeur correspondant
    # à cette classe générale.
    __mapper_args__ = {
        "polymorphic_on": role,
        "polymorphic_identity": "utilisateur",
    }

    def __repr__(self):
        """
        Fournit une représentation lisible de l'objet.

        Utile lors du débogage pour identifier facilement
        un utilisateur.
        """
        return f"<{self.__class__.__name__} {self.id} {self.prenom} {self.nom}>"


# --------------------------------------------------------------------------
# Soignants
# --------------------------------------------------------------------------
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
