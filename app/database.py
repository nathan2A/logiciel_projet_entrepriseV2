"""Connexion à PostgreSQL et socle des modèles SQLAlchemy.
Les paramètres sont lus depuis les variables d'environnement.
Ce module ne crée pas les tables et ne gère pas les migrations.
"""

import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase

load_dotenv()


DATABASE_URL = (
    f"postgresql+psycopg://"
    f"{os.getenv('POSTGRES_USER')}:{os.getenv('POSTGRES_PASSWORD')}"
    f"@{os.getenv('POSTGRES_HOST')}:{os.getenv('POSTGRES_PORT')}"
    f"/{os.getenv('POSTGRES_DB')}"
)


engine = create_engine(DATABASE_URL)


class Base(DeclarativeBase):
    """Classe mère commune à toutes les tables SQLAlchemy."""
    pass