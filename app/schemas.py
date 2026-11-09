"""
schemas.py — Schémas de données de l'API SMR Carhaix.

OBJECTIF :
Définir les informations que l'API accepte en entrée
et renvoie en sortie.

Le fichier contient :
    1. Les imports et la configuration Pydantic
    2. Les schémas d'authentification
    3. Les schémas de sortie (lecture des données)
    4. Les schémas d'entrée (création et modification)

IMPORTANT :
Un schéma Pydantic ne crée pas de table PostgreSQL.

Les tables sont définies dans models.py.

Les schémas servent notamment à :
    - Vérifier les données reçues
    - Définir les champs obligatoires ou facultatifs
    - Contrôler les informations renvoyées par l'API
    - Éviter d'exposer des informations sensibles

"""

# --------------------------------------------------------------------------
# Importations
# --------------------------------------------------------------------------

# Types Python pour représenter les dates et heures
from datetime import date, datetime

# Literal : limite un champ à certaines valeurs
# Optional : indique qu'un champ peut aussi valoir None
from typing import Literal, Optional

# BaseModel : classe de base des schémas Pydantic
# ConfigDict : permet de configurer leur comportement
# model_validator : vérifie des conditions entre champs
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# --------------------------------------------------------------------------
# Status autorisés
# --------------------------------------------------------------------------

# Définition des statuts acceptés pour un rendez-vous.
#
# Literal limite les valeurs à cette liste.
# Une valeur différente provoque une erreur de validation.
#
# Exemple valide : "planifie"
# Exemple invalide : "termine"
Statut = Literal["planifie", "en_attente", "realise", "annule"]


# --------------------------------------------------------------------------
# Schéma de base
# --------------------------------------------------------------------------

class Schema(BaseModel):
    """
    Classe mère de tous les schémas de l'application.

    Tous les schémas ci-dessous héritent de cette classe.

    Elle permet à Pydantic de lire les attributs
    des objets Python, notamment ceux de SQLAlchemy.
    """
    # from_attributes=True permet de construire un schéma à partir d'un objet SQLAlchemy.
    #
    # Exemple :
    # Un objet Patient possède les attributs nom, prenom, date_arrivee, etc.
    #
    # Pydantic peut les lire pour produire une réponse.

    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------------------------------
# Connexion / authentification
# --------------------------------------------------------------------------

class Token(Schema):
    """
    Représente la réponse envoyée après une connexion
    réussie.

    Le serveur transmet un jeton d'authentification.

    Ce jeton sera utilisé lors des prochaines requêtes
    pour identifier l'utilisateur connecté.
    """
    # Jeton JWT généré par le backend
    access_token: str
    # Type du jeton, généralement "bearer"
    token_type: str


class MoiOut(Schema):
    """
    Définit les informations renvoyées lorsque
    l'utilisateur demande ses propres informations.

    Utilisé par la route GET /auth/moi.

    Le mot de passe haché n'est pas présent :
    il ne sera donc pas inclus dans cette réponse.
    """
      # Identifiant de l'utilisateur
    id: int
    # Identifiant de connexion
    login: str
    # Nom et prénom
    nom: str
    prenom: str
    # Rôle : patient, soignant ou administrateur
    role: str
    # Soignant uniquement : profession (vide pour un patient)
    profession: Optional[str] = None
    # Patient uniquement : séjour (vides pour un soignant)
    date_arrivee: Optional[date] = None
    date_depart_prevue: Optional[date] = None
    chambre: Optional["ChambreOut"] = None


# --------------------------------------------------------------------------
# Schéma de sortie : informations renvoyées par l'API
# --------------------------------------------------------------------------
# Le suffixe Out indique que ces schémas décrivent
# les informations renvoyées par l'API.

class ChambreOut(Schema):
    """
    Informations d'une chambre.

    Permet de transmettre le numéro et l'étage
    d'une chambre associée à un patient.
    """

    id: int
    numero: int
    etage: int


class LieuOut(Schema):
    """
    Informations sur le lieu d'une intervention.

    Exemple : plateau de kinésithérapie, salle APA,
    chambre, extérieur.
    """
    id: int
    libelle: str


class TypeRDVOut(Schema):
    """
    Informations décrivant un type de rendez-vous.

    Ces données permettent notamment au frontend
    d'afficher des interventions avec une couleur
    et une durée habituelle.
    """
    # Identifiant du type
    id: int
    # Nom du type : Kiné, EAPA, Ergothérapie...
    libelle: str
    # Couleur utilisée dans l'agenda
    couleur: str
    # Durée habituelle en minutes
    duree_par_defaut: int


# --------------------------------------------------------------------------
# Schémas des soignants
# --------------------------------------------------------------------------

class SoignantResume(Schema):
    """
    Version simplifiée des informations d'un soignant.

    Utilisée notamment lorsqu'un soignant est
    associé à un rendez-vous.

    Elle évite de renvoyer toutes les informations
    de son compte à chaque rendez-vous.
    """
    id: int
    nom: str
    prenom: str
    # Exemples : kiné, IDE, EAPA, ergothérapeute
    profession: str


class SoignantOut(SoignantResume):
    """
    Version plus complète d'un soignant.

    Hérite des champs de SoignantResume :
        - id
        - nom
        - prenom
        - profession

    Ajoute les informations nécessaires
    à la liste des soignants.
    """
    # Identifiant de connexion
    login: str
    # Rôle du professionnel
    role: str

# --------------------------------------------------------------------------
# Schémas des patients
# --------------------------------------------------------------------------

class PatientResume(Schema):
    """
    Version simplifiée des informations d'un patient.

    Utilisée notamment dans les réponses concernant
    les rendez-vous.

    Elle permet d'identifier le patient concerné
    sans renvoyer toutes ses informations.
    """
    id: int
    login: str
    nom: str
    prenom: str


class PatientOut(PatientResume):
    """
    Version détaillée des informations d'un patient.

    Hérite des champs de PatientResume et ajoute :
        - Sa date d'arrivée
        - Sa date de départ prévue
        - Sa chambre éventuelle

    Utilisée dans la liste des patients.
    """
    # Date d'entrée dans le service
    date_arrivee: date

    # Date de sortie prévue.
    # Optional[date] autorise une valeur None.
    # = None indique aussi une valeur par défaut.
    date_depart_prevue: Optional[date] = None

    # Chambre du patient.
    # Si aucune chambre n'est attribuée, la valeur renvoyée sera None.
    # Sinon, elle sera représentée selon le schéma ChambreOut.
    chambre: Optional[ChambreOut] = None


# --------------------------------------------------------------------------
# Schémas de sortie d'un rendez-vous
# --------------------------------------------------------------------------

class RDVOut(Schema):
    """
    Décrit les informations renvoyées pour un RDV.

    Ce schéma regroupe :
        - Les horaires
        - Le statut
        - Le commentaire
        - Le créateur
        - Le patient concerné
        - Le soignant
        - Le type d'intervention
        - Le lieu

    Il est utilisé pour afficher les rendez-vous
    dans l'agenda.
    """
    # Identifiant unique du rendez-vous
    id: int
    # Date et heure de début de l'intervention
    debut: datetime
    # Date et heure de fin de l'intervention
    fin: datetime
    # État du rendez-vous
    statut: str
    # Commentaire facultatif
    commentaire: Optional[str] = None
    # Identifiant de l'utilisateur ayant créé le RDV
    createur_id: int
    # Informations résumées du patient (None : RDV sans patient)
    # Pydantic produit un objet imbriqué contenant les champs de PatientResume.
    patient: Optional[PatientResume] = None
    # Professionnels qui réalisent l'intervention (liste éventuellement vide)
    soignants: list[SoignantResume] = []
    # Informations sur le type d'intervention
    type: TypeRDVOut
    # Informations sur le lieu
    lieu: LieuOut
    # Conflits détectés après une création ou une modification (vide en lecture)
    conflits: list["ConflitOut"] = []


class ConflitOut(Schema):
    """
    Un conflit détecté dans le planning (voir app/conflits.py).

    Tous les conflits sont des avertissements : le RDV est enregistré,
    l'interface propose à l'utilisateur de continuer ou d'annuler.
    """
    id: str
    # PATIENT_DOUBLE_TACHE, SOIGNANT_DOUBLE_TACHE, HORS_HORAIRES, PLAGE_REPAS
    type: str
    gravite: Literal["bloquant", "avertissement"] = "avertissement"
    # Message en français, affiché tel quel
    message: str
    # RDV concernés (le RDV créé ou modifié en premier)
    rdv_ids: list[int]
    # Personne concernée : le patient OU un soignant
    patient_id: Optional[int] = None
    soignant_id: Optional[int] = None


# --------------------------------------------------------------------------
# Ce que l'API reçoit
# --------------------------------------------------------------------------

# --------------------------------------------------------------------------
# Schémas de création d'un rendez-vous
# --------------------------------------------------------------------------
class RDVCreation(Schema):
    """
    Définit les informations nécessaires pour créer
    un nouveau rendez-vous dans l'agenda.

    Utilisé par la route POST /rdv.

    Le frontend doit transmettre :
        - Un début
        - Une fin
        - Zéro, un ou plusieurs soignants (soignant_ids)
        - Zéro ou un patient (patient_id)
          (au moins un patient ou un soignant)
        - Un type de RDV
        - Un lieu

    Le statut et le commentaire sont facultatifs.

    Le createur_id n'est pas demandé :
    il est déterminé par le backend à partir
    de l'utilisateur connecté.
    """
    # Date et heure de début
    debut: datetime
    # Date et heure de fin
    fin: datetime
    # Statut initial.
    # Si aucun statut n'est fourni : "planifie".
    statut: Statut = "planifie"
    # Informations complémentaires facultatives
    commentaire: Optional[str] = None
    # Identifiants des soignants qui interviendront (liste éventuellement vide)
    soignant_ids: list[int] = []
    # Identifiant du patient concerné (None : RDV sans patient)
    patient_id: Optional[int] = None
    # Identifiant du type d'intervention
    type_id: int
    # Identifiant du lieu
    lieu_id: int

# --------------------------------------------------------------------------
# Validation des horaires
# --------------------------------------------------------------------------
    @model_validator(mode="after")
    def fin_apres_debut(self):
        """
        Vérifie que la date de fin est strictement
        postérieure à la date de début.

        mode="after" :
        la vérification est réalisée après
        la validation des différents champs.

        Si la condition n'est pas respectée,
        Pydantic déclenche une erreur de validation.

        Attention :
        cette fonction ne vérifie pas les conflits
        entre plusieurs rendez-vous.
        """
        # Refuse les horaires incohérents
        if self.fin <= self.debut:
            raise ValueError("La fin du RDV doit être après son début.")
        # « Au moins un patient ou un soignant » est vérifié dans la route
        # (un patient qui ajoute une visite peut omettre patient_id : c'est lui).
        # Un même soignant n'est compté qu'une fois
        self.soignant_ids = list(dict.fromkeys(self.soignant_ids))
        # Renvoie l'objet validé
        return self


# --------------------------------------------------------------------------
# Schémas de modification d'un rendez-vous
# --------------------------------------------------------------------------
class RDVModification(Schema):
    """
    Définit les champs qui peuvent être modifiés
    sur un rendez-vous existant.

    Utilisé par la route PATCH /rdv/{rdv_id}.

    Contrairement à RDVCreation, tous les champs
    peuvent être omis.

    Cela permet de modifier uniquement les
    informations souhaitées sans renvoyer
    l'ensemble du rendez-vous.
    """
    # Nouvel horaire de début si modification
    debut: Optional[datetime] = None
    # Nouvel horaire de fin si modification
    fin: Optional[datetime] = None
    # Nouveau statut éventuel
    statut: Optional[Statut] = None
    # Nouveau commentaire éventuel
    commentaire: Optional[str] = None
    # Nouvelle liste complète de soignants (remplace l'ancienne ; [] = aucun)
    soignant_ids: Optional[list[int]] = None
    # Changement de patient (null explicite = plus de patient)
    patient_id: Optional[int] = None
    # Changement de type d'intervention
    type_id: Optional[int] = None
    # Changement de lieu
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
    soignants: list[SoignantResume] = []
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


# --------------------------------------------------------------------------
# Synchronisation (bouton « Synchroniser » : solveur OR-Tools)
# --------------------------------------------------------------------------

class SynchronisationDemande(Schema):
    """Période à planifier : `jours` jours à partir de `du` (aujourd'hui par défaut)."""
    du: Optional[date] = None
    jours: int = Field(7, ge=1, le=14)


class IncoherenceOut(Schema):
    code: str
    gravite: str
    message: str


class RdvIgnoreOut(Schema):
    rdv_id: int
    raison: str


class JourSynchroniseOut(Schema):
    """
    statut : « rien_a_planifier », « optimal », « faisable » (enregistrés),
    ou « impossible », « inconnu », « donnees_incompletes », « erreur », « conflit »
    (rien n'est enregistré pour ce jour).
    """
    jour: date
    statut: str
    message: str = ""
    nb_en_attente: int = 0
    nb_planifies: int = 0
    incoherences: list[IncoherenceOut] = []
    ignores: list[RdvIgnoreOut] = []


class SynchronisationOut(Schema):
    du: date
    au: date
    total_planifies: int
    total_restants: int  # RDV toujours en attente sur la période
    jours: list[JourSynchroniseOut]


# Références en avant (ChambreOut et ConflitOut sont définis après leur première utilisation)
MoiOut.model_rebuild()
RDVOut.model_rebuild()
