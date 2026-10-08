from sqlalchemy import create_engine

DATABASE_URL = "postgresql+psycopg://logiciel_user:dev_password@localhost:5432/logiciel_projet"

engine = create_engine(DATABASE_URL)