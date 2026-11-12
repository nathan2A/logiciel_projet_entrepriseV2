/**
 * Message de confirmation après la suppression d'un profil, avec le devenir
 * de ses RDV à venir (patient : annulés ; soignant : transférés).
 */
import { Modal } from "@/components/ui/Modal";
import type { RdvTransfere, ResultatSuppression } from "@/types";
import { depuisIso, jourCourtEtDate, plageHoraire } from "@/utils/dates";

export interface EtatSuppression {
  nom: string;
  resultat: ResultatSuppression;
}

const DEVENIR: Record<RdvTransfere["resultat"], string> = {
  meme_heure: "même horaire",
  replanifie: "nouvel horaire le même jour",
  en_attente: "en attente : à replanifier (bouton « Synchroniser »)",
  sans_remplacant: "aucun collègue de même profession : à réattribuer",
  annule: "annulé",
};

function ligne(r: RdvTransfere) {
  const quand = `${jourCourtEtDate(depuisIso(r.debut))}, ${plageHoraire(depuisIso(r.debut), depuisIso(r.fin))}`;
  const qui = r.patient ? ` avec ${r.patient}` : "";
  const vers = r.remplacant ? ` → ${r.remplacant}` : "";
  return `${quand} · ${r.type}${qui}${vers} (${DEVENIR[r.resultat]})`;
}

export function BilanSuppression({ etat, onFermer }: { etat: EtatSuppression; onFermer: () => void }) {
  const { nom, resultat } = etat;
  const aRevoir = resultat.rdv.filter((r) => r.resultat === "en_attente" || r.resultat === "sans_remplacant").length;
  return (
    <Modal titre="Profil supprimé" titreAccessible="Profil supprimé" onFermer={onFermer}>
      <p className="text-[1.15rem]">Le profil de {nom} a été supprimé. Son historique est conservé.</p>
      {resultat.role === "patient" ? (
        <p className="mt-[0.4rem]">
          {resultat.rdvAnnules === 0
            ? "Il n’avait aucun RDV à venir."
            : `${resultat.rdvAnnules} RDV à venir ${resultat.rdvAnnules > 1 ? "ont été annulés" : "a été annulé"}.`}
        </p>
      ) : resultat.rdv.length === 0 ? (
        <p className="mt-[0.4rem]">Aucun RDV à venir à transférer.</p>
      ) : (
        <>
          <p className="mt-[0.4rem]">
            {resultat.rdv.length} RDV à venir {resultat.rdv.length > 1 ? "ont été transférés" : "a été transféré"}
            {aRevoir ? `, dont ${aRevoir} à revoir à la main` : ""} :
          </p>
          <ul className="mt-[0.3rem] max-h-[18rem] list-disc overflow-y-auto pl-[1.2rem] text-[0.95rem] leading-[1.45rem]">
            {resultat.rdv.map((r) => (
              <li key={r.rdvId} className={r.resultat === "en_attente" || r.resultat === "sans_remplacant" ? "text-supprimer" : ""}>
                {ligne(r)}
              </li>
            ))}
          </ul>
        </>
      )}
      <button type="button" onClick={onFermer} className="mt-[1rem] text-[1.3rem] text-valider underline">
        Fermer
      </button>
    </Modal>
  );
}
