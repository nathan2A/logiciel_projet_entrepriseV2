"""
Transfert des RDV à venir d'un soignant dont le profil est supprimé (archivé).

But : garder la continuité du suivi des patients, en changeant le moins
possible leurs horaires. Pour chaque RDV à venir (ou séance de groupe) :

1. Même heure : on le confie à un collègue de la MÊME profession, actif,
   libre sur ce créneau et dans ses horaires (le moins chargé ce jour-là).
2. Sinon, même jour : on le confie au collègue de même profession le moins
   chargé, le RDV passe « en attente » et le solveur OR-Tools lui cherche un
   nouvel horaire le même jour (seuls ces RDV sont replanifiés).
   Si le solveur ne trouve pas, le RDV reste « en attente » chez ce collègue :
   il apparaît dans son bandeau « À planifier » (bouton « Synchroniser »).
   C'est aussi le cas si OR-Tools ne peut pas être chargé sur cet ordinateur.
3. Aucun collègue de même profession : le RDV garde son horaire, sans ce
   soignant (à réattribuer à la main). Un RDV sans patient dont il était le
   seul participant est annulé.

Les RDV passés ne changent pas : ils restent à son nom dans l'historique.
Rien n'est validé ici (pas de commit) : l'appelant valide ou annule le tout.
"""

from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app import models as m
from app.services.planification import (
    ConfigPlanification,
    PlanificateurJournee,
    _cle,
    horaires_soignant,
)

STATUTS_A_VENIR = (m.STATUT_PLANIFIE, m.STATUT_EN_ATTENTE)


def _nom(personne) -> str:
    prenom = "-".join(p.capitalize() for p in (personne.prenom or "").split("-"))
    return f"{(personne.nom or '').upper()} {prenom}".strip()


def _cle_seance(rdv: m.RDV) -> tuple:
    return (rdv.debut, rdv.fin, rdv.type_id, rdv.lieu_id, tuple(sorted(s.id for s in rdv.soignants)))


class TransfertRdv:
    def __init__(self, db: Session, soignant: m.Soignant, maintenant: datetime):
        self.db = db
        self.soignant = soignant
        self.maintenant = maintenant
        self.bilan: dict[int, dict] = {}

    # ------------------------------------------------------------------

    def collegues(self) -> list[m.Soignant]:
        """Soignants actifs de la même profession (casse et espaces ignorés)."""
        profession = _cle(self.soignant.profession)
        return [
            s for s in self.db.scalars(select(m.Soignant).where(m.Soignant.actif.is_(True))).all()
            if s.id != self.soignant.id and _cle(s.profession) == profession
        ]

    def _occupations(self, soignant: m.Soignant, jour: date) -> list[m.RDV]:
        debut = datetime.combine(jour, datetime.min.time())
        return [
            r for r in self.db.scalars(
                select(m.RDV)
                .options(selectinload(m.RDV.soignants))
                .where(
                    m.RDV.soignants.any(m.Soignant.id == soignant.id),
                    m.RDV.statut == m.STATUT_PLANIFIE,
                    m.RDV.debut < datetime.combine(jour, datetime.max.time()),
                    m.RDV.fin > debut,
                )
            ).all()
        ]

    def _charge(self, soignant: m.Soignant, jour: date) -> float:
        return sum((r.fin - r.debut).total_seconds() for r in self._occupations(soignant, jour))

    def _libre(self, soignant: m.Soignant, seance: list[m.RDV]) -> bool:
        """Libre sur tout le créneau de la séance, et dans ses horaires s'ils sont connus."""
        rdv = seance[0]
        horaires = horaires_soignant(soignant)
        if horaires is not None:
            debut_min = rdv.debut.hour * 60 + rdv.debut.minute
            fin_min = rdv.fin.hour * 60 + rdv.fin.minute if rdv.fin.date() == rdv.debut.date() else 24 * 60
            if debut_min < horaires[0] or fin_min > horaires[1]:
                return False
        ids_seance = {r.id for r in seance}
        return not any(
            r.debut < rdv.fin and rdv.debut < r.fin
            for r in self._occupations(soignant, rdv.debut.date())
            if r.id not in ids_seance
        )

    def _noter(self, rdv: m.RDV, resultat: str, remplacant=None):
        self.bilan[rdv.id] = {
            "rdv_id": rdv.id,
            "debut": rdv.debut,
            "fin": rdv.fin,
            "type": rdv.type.libelle,
            "patient": _nom(rdv.patient) if rdv.patient else None,
            "remplacant": _nom(remplacant) if remplacant else None,
            "resultat": resultat,
        }

    def _remplacer(self, seance: list[m.RDV], remplacant: m.Soignant | None):
        for rdv in seance:
            restants = [s for s in rdv.soignants if s.id != self.soignant.id]
            if remplacant is not None and all(s.id != remplacant.id for s in restants):
                restants.append(remplacant)  # pas de doublon si le collègue y est déjà
            rdv.soignants = restants
        self.db.flush()

    # ------------------------------------------------------------------

    def executer(self) -> list[dict]:
        a_venir = self.db.scalars(
            select(m.RDV)
            .options(selectinload(m.RDV.soignants), joinedload(m.RDV.type), joinedload(m.RDV.patient))
            .where(
                m.RDV.soignants.any(m.Soignant.id == self.soignant.id),
                m.RDV.statut.in_(STATUTS_A_VENIR),
                m.RDV.debut >= self.maintenant,
            )
            .order_by(m.RDV.debut, m.RDV.id)
        ).unique().all()

        # Séances de groupe (un RDV par patient) : transférées ensemble
        seances: dict[tuple, list[m.RDV]] = {}
        for rdv in a_venir:
            seances.setdefault(_cle_seance(rdv), []).append(rdv)

        collegues = self.collegues()
        a_replanifier: dict[date, list[int]] = {}

        for seance in seances.values():
            rdv = seance[0]
            jour = rdv.debut.date()
            if not collegues:
                for r in seance:
                    if r.patient_id is None and len(r.soignants) == 1:
                        r.statut = m.STATUT_ANNULE
                        self._noter(r, "annule")
                    else:
                        self._noter(r, "sans_remplacant")
                self._remplacer([r for r in seance if r.statut != m.STATUT_ANNULE], None)
                continue

            # On préfère un collègue qui ne participe pas déjà à ce RDV, puis le moins chargé
            deja = {s.id for s in rdv.soignants}
            par_charge = sorted(collegues, key=lambda c: (c.id in deja, self._charge(c, jour), c.nom, c.prenom))
            meme_heure = next((c for c in par_charge if self._libre(c, seance)), None)
            if meme_heure is not None:
                self._remplacer(seance, meme_heure)
                for r in seance:
                    self._noter(r, "meme_heure", meme_heure)
                continue

            remplacant = par_charge[0]
            self._remplacer(seance, remplacant)
            for r in seance:
                r.statut = m.STATUT_EN_ATTENTE
                self._noter(r, "en_attente", remplacant)
                a_replanifier.setdefault(jour, []).append(r.id)
            self.db.flush()

        # Nouveaux horaires le même jour, avec le solveur (seuls ces RDV)
        for jour, ids in a_replanifier.items():
            config = ConfigPlanification(
                rdv_ids=set(ids),
                ignorer_rdv_sans_horaire=True,
                pas_avant=self.maintenant,
                regrouper_seances_en_attente=True,  # une séance de groupe garde un seul créneau
            )
            planificateur = PlanificateurJournee(self.db, jour, config)
            resultat = planificateur.planifier()
            if resultat.solution_valide:
                planificateur.enregistrer(resultat, valider=False)
                for p in resultat.propositions:
                    self.bilan[p.rdv_id].update(debut=p.debut, fin=p.fin, resultat="replanifie")

        return sorted(self.bilan.values(), key=lambda b: (b["debut"], b["rdv_id"]))


def transferer_rdv(db: Session, soignant: m.Soignant, maintenant: datetime | None = None) -> list[dict]:
    """Transfère les RDV à venir de `soignant`. Voir le docstring du module."""
    return TransfertRdv(db, soignant, maintenant or datetime.now()).executer()
