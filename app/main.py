from fastapi import FastAPI
from app.routers import referentiel, rdv

app = FastAPI()
app.include_router(referentiel.router)
app.include_router(rdv.router)

@app.get("/")
def accueil():
    return {"message": "Bonjour, le logiciel fonctionne !"}