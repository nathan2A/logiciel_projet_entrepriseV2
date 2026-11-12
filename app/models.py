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
    Table,               # Table d'association (sans classe Python)
    Text,                # Texte libre
)
from sqlalchemy.orm import relationship

# Base commune dont héritent les modèles SQLAlchemy
# Définie dans le fichier database.py
from app.database import Base
from sqlalchemy import Boolean


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
    # unique=True : deux utilisateurs ne peuvent pas avoir le même login
    login = Column(String(255), nullable=False, unique=True)

    # Le mot de passe n'est jamais stocké en clair.
    # On conserve uniquement son empreinte (hash).
    mot_de_passe_hash = Column(String(255), nullable=False)  # jamais en clair
    
    # Coordonnées facultatives (affichées dans les fiches profil)
    date_naissance = Column(Date, nullable=True)
    email = Column(String(255), nullable=True)
    telephone = Column(String(30), nullable=True)

    # Compte actif. Un profil « supprimé » est archivé (actif = False) : il ne
    # peut plus se connecter et disparaît des listes, mais l'historique de ses
    # RDV reste dans la base.
    actif = Column(Boolean, nullable=False, default=True, server_default="true")

    # Colonne qui indique de quel type est l'utilisateur
    # Détermine si l'utilisateur est un patient, un soignant ou un administrateur.
    role = Column(String(30), nullable=False)

    # Configuration de l'héritage SQLAlchemy.
    # polymorphic_on : colonne permettant de déterminer la classe réelle de l'utilisateur.
    # polymorphic_identity : valeur correspondant à cette classe générale.
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
    """
    Représente un professionnel de santé.

    Hérite des informations de Utilisateur
    et ajoute sa profession.

    Exemples :
        - Kinésithérapeute
        - Infirmier / infirmière (IDE)
        - Enseignant en activité physique adaptée (EAPA)
        - Ergothérapeute

    Un soignant peut être associé à plusieurs RDV.
    """

    __tablename__ = "soignants"

    # L'identifiant du soignant est aussi un identifiant de la table utilisateurs.
    # ForeignKey : établit une référence vers utilisateurs.id.
    id = Column(Integer, ForeignKey("utilisateurs.id"), primary_key=True)

    # Profession exercée par le soignant
    profession = Column(String(100), nullable=False)  # kiné, IDE, EAPA, ergo...
    equipe = Column(String(20), nullable=True)

    # Identifie ce modèle comme un soignant
    __mapper_args__ = {"polymorphic_identity": ROLE_SOIGNANT}

    # RDV dont ce soignant est l'un des intervenants
    # Relation plusieurs-à-plusieurs : un soignant intervient sur plusieurs RDV,
    # et un RDV peut avoir plusieurs soignants (table d'association rdv_soignants).
    rdvs = relationship("RDV", secondary="rdv_soignants", back_populates="soignants")


# --------------------------------------------------------------------------
# Administrateur
# --------------------------------------------------------------------------
class Administrateur(Soignant):
    """
    Représente un soignant disposant d'un rôle
    d'administrateur.

    Il hérite :
        - Des informations d'Utilisateur
        - Des informations de Soignant

    Particularité :
    Il ne possède pas de table spécifique.

    Les administrateurs sont enregistrés dans
    les tables utilisateurs et soignants.

    Leur rôle permet de les distinguer des
    autres professionnels de santé.

    Cette classe définit leur identité ORM,
    mais les autorisations doivent être vérifiées
    dans les routes de l'API.
    
    Pas de __tablename__ : il utilise les tables `utilisateurs` et `soignants`
    et se distingue par role = 'administrateur'.
    """

    __mapper_args__ = {"polymorphic_identity": ROLE_ADMINISTRATEUR}


# --------------------------------------------------------------------------
# Patients
# --------------------------------------------------------------------------
class Patient(Utilisateur):
    """
    Représente un patient pris en charge au SMR.

    Le patient possède les informations générales
    d'Utilisateur ainsi que :
        - Sa date d'arrivée
        - Sa date de départ prévue
        - Sa chambre éventuelle

    Un patient peut avoir plusieurs rendez-vous.
    """
    __tablename__ = "patients"

    # Identifiant partagé avec la table utilisateurs
    id = Column(Integer, ForeignKey("utilisateurs.id"), primary_key=True)
    # Date d'arrivée du patient dans le service
    date_arrivee = Column(Date, nullable=False)

    # Date de départ prévue.
    # nullable=True : la date peut être inconnue.
    date_depart_prevue = Column(Date, nullable=True)
    # Référence vers la chambre occupée.
    # La chambre est facultative : certains patients peuvent ne pas en avoir,notamment en hospitalisation de jour.
    # Nullable : un patient peut ne pas (encore) avoir de chambre (ex. hôpital de jour)
    chambre_id = Column(Integer, ForeignKey("chambres.id"), nullable=True)
    # Patient autonome (utilisé par la planification)
    autonome = Column(Boolean, nullable=False, default=False)

    # Permet à SQLAlchemy d'identifier un patient
    __mapper_args__ = {"polymorphic_identity": ROLE_PATIENT}

    # Association entre un patient et sa chambre
    # patient.chambre permet d'accéder directement
    # à l'objet Chambre correspondant.
    chambre = relationship("Chambre", back_populates="patients")

    # Association entre un patient et ses RDV
    # patient.rdvs permet de récupérer les
    # interventions concernant ce patient.
    rdvs = relationship(
        "RDV", back_populates="patient", foreign_keys="RDV.patient_id"
    )


# --------------------------------------------------------------------------
# Chambres
# --------------------------------------------------------------------------

class Chambre(Base):
    """
    Représente une chambre de l'établissement.

    Chaque chambre possède :
        - Un identifiant
        - Un numéro
        - Un étage

    Le modèle permet d'associer plusieurs patients
    à une même chambre.

    Attention :
    aucune contrainte de capacité ou d'occupation
    temporelle n'est définie ici.
    """

    __tablename__ = "chambres"

    # Identifiant interne de la chambre
    id = Column(Integer, primary_key=True)
    # Numéro unique dans le modèle actuel
    numero = Column(Integer, nullable=False, unique=True)
    # Étage où se trouve la chambre
    etage = Column(Integer, nullable=False)
    # Relation inverse de Patient.chambre
    # chambre.patients donne accès à la liste des patients associés à cette chambre.
    patients = relationship("Patient", back_populates="chambre")

# --------------------------------------------------------------------------
# Lieux d'intervention
# --------------------------------------------------------------------------

class Lieu(Base):
    """
    Représente un lieu où se déroule une intervention.

    Exemples :
        - Chambre
        - Plateau de kinésithérapie
        - Salle APA
        - Extérieur
        - Salle de consultation

    Les lieux permettent notamment de renseigner
    l'emplacement d'un rendez-vous dans l'agenda.
    """

    __tablename__ = "lieux"

    # Identifiant unique
    id = Column(Integer, primary_key=True)
    # Nom du lieu, obligatoirement unique
    libelle = Column(String(100), nullable=False, unique=True)

    # Tous les rendez-vous associés à ce lieu
    rdvs = relationship("RDV", back_populates="lieu")


# --------------------------------------------------------------------------
# Types de rendez-vous
# --------------------------------------------------------------------------

class TypeRDV(Base):
    """
    Définit les différentes catégories d'intervention.

    Exemples :
        - Kinésithérapie
        - Activité physique adaptée
        - Ergothérapie
        - Soin infirmier
        - Consultation extérieure

    Chaque type possède une couleur et
    une durée par défaut.

    La couleur permet de distinguer visuellement
    les catégories d'intervention dans l'agenda.
    """

    __tablename__ = "types_rdv"

    # Identifiant du type de rendez-vous
    id = Column(Integer, primary_key=True)
    # Intitulé unique de l'intervention
    libelle = Column(String(100), nullable=False, unique=True)
    # Couleur par défaut en notation hexadécimale.
    # Exemple : "#3B82F6" correspond à un bleu.
    # String(7) fixe la longueur maximale, mais ne vérifie pas le format hexadécimal.
    couleur = Column(String(7), nullable=False, default="#888888")  # ex. "#3B82F6"
    
     # Durée habituelle de l'intervention en minutes.
    # Par défaut : 30 minutes.
    # Ce paramètre n'impose pas automatiquement la durée des RDV qui utilisent ce type.
    duree_par_defaut = Column(Integer, nullable=False, default=30)  # en minutes

    # Relation avec les RDV de ce type
    rdvs = relationship("RDV", back_populates="type")

# --------------------------------------------------------------------------
# Rendez-vous
# --------------------------------------------------------------------------
# --------------------------------------------------------------------------
# Association RDV <-> soignants
# --------------------------------------------------------------------------

# Table d'association : une ligne par couple (RDV, soignant).
# Supprimer un RDV supprime ses lignes ici (ondelete="CASCADE").
rdv_soignants = Table(
    "rdv_soignants",
    Base.metadata,
    Column("rdv_id", Integer, ForeignKey("rdv.id", ondelete="CASCADE"), primary_key=True),
    Column("soignant_id", Integer, ForeignKey("soignants.id"), primary_key=True, index=True),
)


class RDV(Base):
    """
    Représente une intervention planifiée
    dans l'agenda partagé.

    Un rendez-vous possède :
        - Une date et une heure de début
        - Une date et une heure de fin
        - Un statut
        - Un commentaire facultatif

    Il est associé à :
        - Un créateur
        - Zéro, un ou plusieurs soignants (table rdv_soignants)
        - Zéro ou un patient
        - Un type d'intervention
        - Un lieu

    Un RDV a au moins un patient ou un soignant (vérifié par l'API).
    Un RDV de groupe (plusieurs patients) reste un RDV par patient.
    Un RDV sans patient (ex. staff, transmissions) n'apparaît dans aucun agenda patient.
    """
    __tablename__ = "rdv"

    # Contrainte appliquée directement dans PostgreSQL.
    # Empêche qu'un rendez-vous se termine avant son heure de début ou à la même heure.
    # Ne vérifie pas les chevauchements entre RDV.
    __table_args__ = (
        CheckConstraint("fin > debut", name="ck_rdv_fin_apres_debut"),
    )

    # Identifiant unique du rendez-vous
    id = Column(Integer, primary_key=True)
    # Date et heure de début
    # index=True : crée un index pour accélérer certaines recherches sur cette colonne.
    debut = Column(DateTime, nullable=False, index=True)
    # Date et heure de fin
    fin = Column(DateTime, nullable=False)
    # État du rendez-vous
    # Par défaut, un RDV créé est "planifie".
    # Cette colonne n'impose pas à elle seule l'utilisation exclusive des statuts définis.
    statut = Column(String(20), nullable=False, default=STATUT_PLANIFIE)
    # Informations complémentaires facultatives
    commentaire = Column(Text, nullable=True)

    # --------------------------------------------------------------------------
    # clef étrangère
    # --------------------------------------------------------------------------

    # Utilisateur ayant créé le rendez-vous
    createur_id = Column(Integer, ForeignKey("utilisateurs.id"), nullable=False)
    # Patient concerné par le rendez-vous (facultatif : RDV entre soignants)
    # Les soignants sont dans la table d'association rdv_soignants.
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=True, index=True)
    # Type d'intervention prévu
    type_id = Column(Integer, ForeignKey("types_rdv.id"), nullable=False)
    # Lieu où se déroule l'intervention
    lieu_id = Column(Integer, ForeignKey("lieux.id"), nullable=False)


    # --------------------------------------------------------------------------
    # relations sqlalachemy
    # --------------------------------------------------------------------------
    
    # Accès à l'utilisateur créateur du rendez-vous
    # Exemple : rdv.createur.nom
    createur = relationship("Utilisateur", foreign_keys=[createur_id])
    # Accès aux soignants qui réalisent l'intervention (liste, éventuellement vide)
    # Exemple : [s.nom for s in rdv.soignants]
    soignants = relationship(
        "Soignant", secondary="rdv_soignants", back_populates="rdvs"
    )
    # Accès au patient concerné
    # Exemple : rdv.patient.nom
    patient = relationship(
        "Patient", back_populates="rdvs", foreign_keys=[patient_id]
    )
    # Accès au type de rendez-vous
    # Exemple : rdv.type.libelle
    type = relationship("TypeRDV", back_populates="rdvs")
    # Accès au lieu d'intervention
    # Exemple : rdv.lieu.libelle
    lieu = relationship("Lieu", back_populates="rdvs")
