"""
security.py : tout ce qui touche aux mots de passe et aux jetons de connexion.

- Un mot de passe n'est jamais stocké en clair : on stocke son "hash" (empreinte).
- Quand quelqu'un se connecte, on lui remet un JETON (un long texte signé) qui prouve
  qui il est. Il le renvoie à chaque demande, et on vérifie la signature.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # le chargement du .env est peut-être fait ailleurs
    pass

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError(
        "SECRET_KEY est absente de votre fichier .env. "
        "Ajoutez une ligne SECRET_KEY=... (voir le tuto, étape 2)."
    )

ALGORITHME = "HS256"
DUREE_JETON_HEURES = 8  # une journée de travail


def hacher_mot_de_passe(mot_de_passe: str) -> str:
    """Transforme un mot de passe en empreinte (hash) à stocker dans la base."""
    return bcrypt.hashpw(mot_de_passe.encode(), bcrypt.gensalt()).decode()


def verifier_mot_de_passe(mot_de_passe: str, hash_enregistre: str) -> bool:
    """Compare un mot de passe saisi avec le hash stocké dans la base."""
    try:
        return bcrypt.checkpw(mot_de_passe.encode(), hash_enregistre.encode())
    except ValueError:  # hash mal formé
        return False


def creer_jeton(utilisateur_id: int) -> str:
    """Fabrique un jeton signé qui contient le numéro de l'utilisateur."""
    contenu = {
        "sub": str(utilisateur_id),
        "exp": datetime.now(timezone.utc) + timedelta(hours=DUREE_JETON_HEURES),
    }
    return jwt.encode(contenu, SECRET_KEY, algorithm=ALGORITHME)


def lire_jeton(jeton: str) -> Optional[int]:
    """Retourne le numéro d'utilisateur si le jeton est valide, sinon None."""
    try:
        contenu = jwt.decode(jeton, SECRET_KEY, algorithms=[ALGORITHME])
        return int(contenu["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None
