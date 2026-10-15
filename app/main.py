from fastapi import FastAPI
from app.routers import referentiel, rdv, auth

app = FastAPI()
app.include_router(referentiel.router)
app.include_router(rdv.router)
app.include_router(auth.router)

@app.get("/")
def accueil():
    return {"message": "Bonjour, le logiciel fonctionne !"}