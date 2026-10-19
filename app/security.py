"""
security.py — Gestion de la sécurité de l'API SMR Carhaix.

OBJECTIF :
Sécuriser l'authentification des utilisateurs de l'application.

Ce fichier contient :
    1. Le chargement des variables d'environnement
    2. La configuration des jetons JWT
    3. La vérification des mots de passe
    4. La création des jetons de connexion
    5. La lecture et la validation des jetons

IMPORTANT :
Ce fichier ne gère pas directement la connexion.

Il fournit des fonctions utilisées par :
    - auth.py : authentification de l'utilisateur
    - deps.py : identification de l'utilisateur connecté
"""

# --------------------------------------------------------------------------
# Importation des bibliothèques
# --------------------------------------------------------------------------

# Permet de récupérer des variables d'environnement, notamment la clé secrète utilisée pour signer les JWT.
import os
# datetime : représente une date et une heure
# timedelta : représente une durée
# timezone : permet de travailler avec le fuseau UTC
from datetime import datetime, timedelta, timezone
# Optional[int] signifie que la fonction peut renvoyer un entier ou None.
from typing import Optional

# Bibliothèque utilisée pour vérifier les mots de passe à partir de leur empreinte cryptographique.
import bcrypt
# Bibliothèque utilisée pour créer et lire les JWT.
import jwt


# --------------------------------------------------------------------------
# Chargement des variables d'environnement
# --------------------------------------------------------------------------
try:
    # python-dotenv permet de lire les variables présentes dans un fichier .env.
    from dotenv import load_dotenv

    # Charge les variables du fichier .env dans l'environnement du programme.
    load_dotenv()
except ImportError:  # le chargement du .env est peut-être fait ailleurs
    # Si python-dotenv n'est pas installé, le programme continue.
    # Les variables peuvent être déjà définies directement dans l'environnement du système.
    pass

# --------------------------------------------------------------------------
# Configuration de la sécurité
# --------------------------------------------------------------------------

# Récupère la clé secrète définie dans l'environnement.
# Cette clé permet de signer les jetons JWT et de vérifier qu'ils n'ont pas été modifiés.
# Elle ne doit jamais être publiée dans GitLab.
SECRET_KEY = os.getenv("SECRET_KEY")
# Vérifie qu'une clé secrète est disponible.
# Sans elle, le serveur refuse de démarrer, ce qui évite de générer des jetons non sécurisés.
if not SECRET_KEY:
    raise RuntimeError(
        "SECRET_KEY est absente de votre fichier .env. "
        "Ajoutez une ligne SECRET_KEY=... (voir le tuto, étape 2)."
    )

# Algorithme cryptographique utilisé pour signer les JWT.
# HS256 utilise une signature HMAC avec SHA-256 et la clé secrète partagée.
ALGORITHME = "HS256"
# Durée de validité d'un jeton en heures.
# Ici, un jeton reste valide pendant 8 heures à partir de sa création.
DUREE_JETON_HEURES = 8  # une journée de travail

# --------------------------------------------------------------------------
# vérification des mots de passe
# --------------------------------------------------------------------------

def hacher_mot_de_passe(mot_de_passe: str) -> str:
    """
    Transforme un mot de passe en empreinte (hash)
    pour permettre son stockage sécurisé dans la base.

    PARAMÈTRE :
        mot_de_passe : mot de passe en clair à hacher.

    RETOUR :
        Une chaîne de caractères contenant le hash bcrypt.

    Cette opération est à sens unique :
    on ne peut pas retrouver directement le mot de passe
    initial à partir de son empreinte.
    """
    # mot_de_passe.encode() :
    # Convertit le mot de passe (str) en octets (bytes), car bcrypt travaille avec des données binaires.

    # bcrypt.gensalt() :
    # Génère un sel aléatoire.
    # Le sel permet d'obtenir des empreintes différentes même lorsque deux utilisateurs ont le même mot de passe.

    # bcrypt.hashpw() :
    # Calcule l'empreinte cryptographique du mot de passe
    # en utilisant le sel généré.

    # .decode() :
    # Convertit le résultat (bytes) en chaîne de caractères pour pouvoir l'enregistrer dans PostgreSQ
    return bcrypt.hashpw(mot_de_passe.encode(), bcrypt.gensalt()).decode()


def verifier_mot_de_passe(mot_de_passe: str, hash_enregistre: str) -> bool:
    """
    Vérifie si le mot de passe saisi correspond à son empreinte enregistrée dans PostgreSQL.

    PARAMÈTRES :
        mot_de_passe :
            Mot de passe saisi lors de la connexion.

        hash_enregistre :
            Empreinte du mot de passe enregistrée
            dans la table utilisateurs.

    RETOUR :
        True  : le mot de passe est correct.
        False : le mot de passe est incorrect
                ou l'empreinte est mal formée.

    Cette fonction ne récupère pas elle-même les données depuis la base.
    """
    try:
        # bcrypt travaille avec des octets (bytes).
        # encode() convertit les chaînes de caractères Python en octets.
        # checkpw() compare le mot de passe saisi avec l'empreinte stockée.
        return bcrypt.checkpw(mot_de_passe.encode(), hash_enregistre.encode())
    except ValueError:  
        # Si le hash enregistré est mal formé, la fonction considère le mot de passe comme invalide.
        return False


# --------------------------------------------------------------------------
# Création d'un jeton jwt
# --------------------------------------------------------------------------

def creer_jeton(utilisateur_id: int) -> str:
    """
    Génère un jeton JWT signé.

    PARAMÈTRE :
        utilisateur_id :
            Identifiant de l'utilisateur connecté.

    RETOUR :
        Une chaîne de caractères représentant
        le jeton d'authentification.

    Le jeton contient :
        - sub : identifiant de l'utilisateur
        - exp : date et heure d'expiration

    Il est valable pendant 8 heures.
    """
    # Informations à inclure dans le jeton JWT.
    # On appelle cet ensemble de données le payload
    contenu = {
        # sub signifie "subject".
        # Il permet d'identifier l'utilisateur auquel le jeton appartient.
        # Il est converti en chaîne de caractères.
        "sub": str(utilisateur_id),

        # exp signifie "expiration".
        # On récupère la date et l'heure actuelles en UTC, puis on ajoute 8 heures.
        # Au-delà, le jeton sera refusé lors de sa vérification.
        "exp": datetime.now(timezone.utc) + timedelta(hours=DUREE_JETON_HEURES),
    }
    # jwt.encode() :
    # 1. Prend les informations du jeton
    # 2. Les signe avec SECRET_KEY
    # 3. Utilise l'algorithme HS256
    # 4. Renvoie le JWT sous forme de texte.
    # Attention : le JWT est signé, mais son contenu n'est pas chiffré.
    return jwt.encode(contenu, SECRET_KEY, algorithm=ALGORITHME)


# --------------------------------------------------------------------------
# Lecture et validation d'un jeton jwt
# --------------------------------------------------------------------------

def lire_jeton(jeton: str) -> Optional[int]:
    """
    Vérifie un jeton JWT transmis par un utilisateur.

    PARAMÈTRE :
        jeton :
            Chaîne de caractères JWT.

    RETOUR :
        Identifiant de l'utilisateur si le jeton
        est valide.

        None si le jeton est invalide ou expiré.

    Cette fonction vérifie notamment :
        - La signature du jeton
        - Sa date d'expiration, si présente
        - La possibilité de récupérer un identifiant

    Elle ne vérifie pas directement si l'utilisateur
    existe toujours dans la base de données.
    """
    try:
        # jwt.decode() décode le jeton et vérifie sa signature avec SECRET_KEY.
        # algorithms précise les algorithmes autorisés pour la vérification.
        contenu = jwt.decode(jeton, SECRET_KEY, algorithms=[ALGORITHME])
        # Récupère l'identifiant de l'utilisateur depuis le champ "sub".
        # int() transforme l'identifiant en entier.
        return int(contenu["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        # Cas possibles :
        # - Jeton expiré
        # - Signature invalide
        # - Jeton mal formé
        # - Champ "sub" absent
        # - Identifiant non convertible en entier
        # Dans ces situations, le jeton est refusé.
        return None
