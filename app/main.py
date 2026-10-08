from fastapi import FastAPI

app = FastAPI()


@app.get("/")
def accueil():
    return {"message": "Bonjour, le logiciel fonctionne !"}