from fastapi import FastAPI
from app.routers import referentiel, rdv, auth, comptes, plan

app = FastAPI()
app.include_router(referentiel.router)
app.include_router(rdv.router)
app.include_router(auth.router)
app.include_router(comptes.router)
app.include_router(plan.router)

@app.get("/")
def accueil():
    return {"message": "Bonjour, le logiciel fonctionne !"}