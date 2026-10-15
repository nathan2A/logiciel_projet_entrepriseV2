"""
deps.py : outils partagés par les routes.

get_db() ouvre une "session" (une conversation avec la base) pour la durée d'une
demande, la donne à la route, puis la referme proprement quoi qu'il arrive.
"""

from sqlalchemy.orm import sessionmaker

from app.database import engine

SessionLocal = sessionmaker(bind=engine, autoflush=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
