"""
Gestion des comptes : ouverte à tous les soignants (tous les soignants sont
administrateurs). Les patients n'y ont pas accès.

Créer, lister, lire, modifier et supprimer des profils (patients, soignants).

- Deux profils actifs ne peuvent pas avoir les mêmes nom, prénom et date de
  naissance (409, code PROFIL_EXISTANT).
- « Supprimer » archive le profil (actif = false) : il ne peut plus se
  connecter et disparaît des listes, mais l'historique des RDV est conservé.
    * Patient : ses RDV à venir sont annulés ; tous ses RDV disparaissent de
      l'affichage (filtre dans GET /rdv).
    * Soignant : ses RDV à venir sont transférés à des collègues de même
      profession (app/services/transfert.py). La réponse donne le bilan.
"""

from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, with_polymorphic

from app import models as m
from app import schemas
from app.deps import get_db, soignant_connecte
from app.security import hacher_mot_de_passe
from app.services.transfert import transferer_rdv

router = APIRouter(
    prefix="/utilisateurs",
    tags=["Gestion des comptes (soignants)"],
    dependencies=[Depends(soignant_connecte)],
)

CHAMPS_OBLIGATOIRES = ("login", "nom", "prenom", "mot_de_passe", "profession", "date_arrivee")
CHAMPS_PATIENT = ("date_arrivee", "date_depart_prevue", "chambre_id")


def _utilisateur_ou_404(db: Session, utilisateur_id: int) -> m.Utilisateur:
    utilisateur = db.get(m.Utilisateur, utilisateur_id)
    if utilisateur is None or not utilisateur.actif:
        raise HTTPException(status_code=404, detail=f"Utilisateur {utilisateur_id} introuvable.")
    return utilisateur


def _verifier_login_libre(db: Session, login: str, sauf_id: Optional[int] = None):
    # Un login reste réservé même après archivage (l'historique y fait référence)
    requete = select(m.Utilisateur.id).where(func.lower(m.Utilisateur.login) == login.lower())
    if sauf_id is not None:
        requete = requete.where(m.Utilisateur.id != sauf_id)
    if db.scalar(requete) is not None:
        raise HTTPException(status_code=409, detail=f"L'identifiant « {login} » est déjà utilisé.")


def _prenom(prenom: str) -> str:
    """« marie-claire » → « Marie-Claire » (comme l'affichage du frontend)."""
    return "-".join(p[:1].upper() + p[1:].lower() for p in prenom.strip().split("-"))


def _verifier_profil_unique(
    db: Session, nom: str, prenom: str, date_naissance: Optional[date], sauf_id: Optional[int] = None
):
    """Pas deux profils actifs avec mêmes nom, prénom et date de naissance."""
    if date_naissance is None:
        return
    requete = select(m.Utilisateur).where(
        m.Utilisateur.actif.is_(True),
        func.lower(func.trim(m.Utilisateur.nom)) == nom.strip().lower(),
        func.lower(func.trim(m.Utilisateur.prenom)) == prenom.strip().lower(),
        m.Utilisateur.date_naissance == date_naissance,
    )
    if sauf_id is not None:
        requete = requete.where(m.Utilisateur.id != sauf_id)
    existant = db.scalars(requete).first()
    if existant is not None:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "PROFIL_EXISTANT",
                "message": (
                    f"Un profil existe déjà pour {existant.nom.upper()} {_prenom(existant.prenom)}, "
                    f"né(e) le {date_naissance:%d/%m/%Y} (identifiant « {existant.login} »)."
                ),
            },
        )


def _verifier_chambre(db: Session, chambre_id: Optional[int]):
    if chambre_id is not None and db.get(m.Chambre, chambre_id) is None:
        raise HTTPException(status_code=404, detail=f"Chambre {chambre_id} introuvable.")


@router.get("", response_model=list[schemas.UtilisateurOut])
def lister_utilisateurs(
    role: Optional[schemas.Role] = Query(None, description="Filtrer par rôle"),
    archives: bool = Query(False, description="Inclure les profils supprimés (archivés)"),
    db: Session = Depends(get_db),
):
    """Tous les comptes, triés par nom. Le mot de passe n'est jamais renvoyé."""
    tous = with_polymorphic(m.Utilisateur, [m.Soignant, m.Patient])
    requete = select(tous).order_by(tous.nom, tous.prenom)
    if role is not None:
        requete = requete.where(tous.role == role)
    if not archives:
        requete = requete.where(tous.actif.is_(True))
    return db.scalars(requete).all()


@router.get("/{utilisateur_id}", response_model=schemas.UtilisateurOut)
def lire_utilisateur(utilisateur_id: int, db: Session = Depends(get_db)):
    return _utilisateur_ou_404(db, utilisateur_id)


@router.post("", response_model=schemas.UtilisateurOut, status_code=201)
def creer_utilisateur(donnees: schemas.CompteCreation, db: Session = Depends(get_db)):
    """Crée un compte. Selon le rôle, certains champs sont obligatoires (voir le schéma)."""
    _verifier_profil_unique(db, donnees.nom, donnees.prenom, donnees.date_naissance)
    _verifier_login_libre(db, donnees.login)
    commun = dict(
        login=donnees.login,
        nom=donnees.nom.strip(),
        prenom=donnees.prenom.strip(),
        mot_de_passe_hash=hacher_mot_de_passe(donnees.mot_de_passe),
        date_naissance=donnees.date_naissance,
        email=donnees.email,
        telephone=donnees.telephone,
    )
    if donnees.role == "patient":
        _verifier_chambre(db, donnees.chambre_id)
        compte = m.Patient(
            **commun,
            date_arrivee=donnees.date_arrivee,
            date_depart_prevue=donnees.date_depart_prevue,
            chambre_id=donnees.chambre_id,
        )
    elif donnees.role == "administrateur":
        compte = m.Administrateur(**commun, profession=donnees.profession)
    else:
        compte = m.Soignant(**commun, profession=donnees.profession)
    db.add(compte)
    db.commit()
    return compte


@router.patch("/{utilisateur_id}", response_model=schemas.UtilisateurOut)
def modifier_utilisateur(
    utilisateur_id: int, donnees: schemas.CompteModification, db: Session = Depends(get_db)
):
    """Modifie un compte. Seuls les champs envoyés changent. Le rôle est fixe."""
    compte = _utilisateur_ou_404(db, utilisateur_id)
    changements = donnees.model_dump(exclude_unset=True)

    for champ in CHAMPS_OBLIGATOIRES:
        if champ in changements and changements[champ] is None:
            raise HTTPException(status_code=422, detail=f"Le champ « {champ} » ne peut pas être vide.")

    if isinstance(compte, m.Patient) and changements.get("profession"):
        raise HTTPException(status_code=422, detail="Un patient n'a pas de profession.")
    changements.pop("profession", None) if isinstance(compte, m.Patient) else None
    if isinstance(compte, m.Soignant) and any(changements.get(c) is not None for c in CHAMPS_PATIENT):
        raise HTTPException(
            status_code=422, detail="Dates et chambre ne concernent que les patients."
        )
    if isinstance(compte, m.Soignant):
        for c in CHAMPS_PATIENT:
            changements.pop(c, None)

    _verifier_profil_unique(
        db,
        changements.get("nom", compte.nom),
        changements.get("prenom", compte.prenom),
        changements.get("date_naissance", compte.date_naissance),
        sauf_id=compte.id,
    )
    if "login" in changements:
        _verifier_login_libre(db, changements["login"], sauf_id=compte.id)
    if "chambre_id" in changements:
        _verifier_chambre(db, changements["chambre_id"])

    if isinstance(compte, m.Patient):
        arrivee = changements.get("date_arrivee", compte.date_arrivee)
        depart = changements.get("date_depart_prevue", compte.date_depart_prevue)
        if depart is not None and depart < arrivee:
            raise HTTPException(status_code=422, detail="Le départ prévu doit être après l'arrivée.")

    if "mot_de_passe" in changements:
        compte.mot_de_passe_hash = hacher_mot_de_passe(changements.pop("mot_de_passe"))
    for champ, valeur in changements.items():
        setattr(compte, champ, valeur.strip() if champ in ("nom", "prenom") and valeur else valeur)
    db.commit()
    return compte


@router.delete("/{utilisateur_id}", response_model=schemas.SuppressionOut)
def supprimer_utilisateur(
    utilisateur_id: int,
    db: Session = Depends(get_db),
    soignant: m.Soignant = Depends(soignant_connecte),
):
    """
    Supprime (archive) un profil et renvoie le bilan.
    On peut supprimer son propre profil, sauf s'il ne reste aucun autre soignant actif.
    """
    compte = _utilisateur_ou_404(db, utilisateur_id)
    maintenant = datetime.now()
    try:
        if isinstance(compte, m.Patient):
            a_venir = db.scalars(
                select(m.RDV).where(
                    m.RDV.patient_id == compte.id,
                    m.RDV.debut >= maintenant,
                    m.RDV.statut.in_((m.STATUT_PLANIFIE, m.STATUT_EN_ATTENTE)),
                )
            ).all()
            for rdv in a_venir:
                rdv.statut = m.STATUT_ANNULE
            compte.actif = False
            db.commit()
            return schemas.SuppressionOut(utilisateur_id=compte.id, role=compte.role, rdv_annules=len(a_venir))

        autres = db.scalar(
            select(func.count()).select_from(m.Soignant).where(m.Soignant.actif.is_(True), m.Soignant.id != compte.id)
        )
        if not autres:
            raise HTTPException(status_code=409, detail="C'est le dernier soignant actif : il ne peut pas être supprimé.")
        compte.actif = False
        db.flush()
        bilan = transferer_rdv(db, compte, maintenant)
        db.commit()
        return schemas.SuppressionOut(
            utilisateur_id=compte.id, role=compte.role, rdv=[schemas.RdvTransfereOut(**b) for b in bilan]
        )
    except Exception:
        db.rollback()
        raise
