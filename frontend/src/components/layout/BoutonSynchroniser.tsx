/**
 * Bouton rond « Synchroniser » (en haut à droite).
 *
 * Soignant : relance le solveur OR-Tools côté backend sur les 7 jours à venir
 * (POST /planification/synchroniser). Le backend place les RDV « en attente »
 * et les enregistre ; les RDV déjà planifiés (créés à la main ou par le
 * solveur) ne bougent pas. Ensuite, toutes les données sont relues depuis la
 * base, puis un bilan s'affiche.
 *
 * Patient : recharge simplement les données (il ne lance pas le solveur).
 *
 * Un seul calcul à la fois : le bouton est désactivé pendant le calcul, un
 * double clic est ignoré, et le backend refuse un second appel simultané (409).
 */
import { useRef } from "react";
import { useIsFetching, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { FaArrowsRotate } from "react-icons/fa6";
import { useNotifications } from "@/hooks/useNotifications";
import { estErreurApi, planificationApi } from "@/services/api";
import type { ResultatSynchronisation } from "@/types";
import { depuisIso, jourCourtEtDate } from "@/utils/dates";

const JOURS_ENREGISTRES = ["rien_a_planifier", "optimal", "faisable"];

/** Bilan affiché après le calcul : message principal + détails éventuels. */
function bilan(r: ResultatSynchronisation): { ok: boolean; message: string; details: string[] } {
  const jour = (iso: string) => jourCourtEtDate(depuisIso(`${iso}T12:00:00`));
  const details: string[] = [];
  for (const j of r.jours) {
    if (!JOURS_ENREGISTRES.includes(j.statut)) {
      details.push(`${jour(j.jour)} : rien n'a été planifié. ${j.message}`);
    }
    for (const i of j.ignores) details.push(`${jour(j.jour)}, RDV ${i.rdvId} écarté : ${i.raison}`);
  }
  const planifies =
    r.totalPlanifies === 0
      ? "Aucun nouveau RDV planifié"
      : `${r.totalPlanifies} RDV planifié${r.totalPlanifies > 1 ? "s" : ""}`;
  if (details.length) {
    return {
      ok: false,
      message: `Synchronisation terminée : ${planifies}, ${r.totalRestants} encore en attente. Points à vérifier :`,
      details,
    };
  }
  if (r.totalPlanifies === 0) return { ok: true, message: "Agenda à jour : aucun RDV en attente.", details };
  return { ok: true, message: `Synchronisation terminée : ${planifies}.`, details };
}

export function BoutonSynchroniser({ lanceLeSolveur }: { lanceLeSolveur: boolean }) {
  const queryClient = useQueryClient();
  const rechargement = useIsFetching() > 0;
  const { succes, erreur } = useNotifications();
  const verrou = useRef(false); // bloque un double clic avant même le prochain rendu
  const synchronisation = useMutation({
    mutationFn: () => planificationApi.synchroniser(format(new Date(), "yyyy-MM-dd")),
  });
  const calcul = synchronisation.isPending;

  const cliquer = async () => {
    if (!lanceLeSolveur) {
      queryClient.invalidateQueries();
      return;
    }
    if (verrou.current) return;
    verrou.current = true;
    try {
      const resultat = await synchronisation.mutateAsync();
      // On relit TOUT depuis la base : agendas, unités, listes.
      await queryClient.invalidateQueries();
      const b = bilan(resultat);
      if (b.ok) succes(b.message);
      else erreur(b.message, b.details, "Synchronisation");
    } catch (e) {
      // Le calcul a pu enregistrer une partie des jours : on relit quand même.
      queryClient.invalidateQueries();
      erreur(estErreurApi(e) ? e.message : "La synchronisation n'a pas pu être effectuée.");
    } finally {
      verrou.current = false;
    }
  };

  const libelle = lanceLeSolveur ? "Synchroniser" : "Actualiser";
  return (
    <span className="flex items-center gap-[0.3rem]">
      {calcul && (
        <span role="status" className="rounded-full bg-white/90 px-[0.6rem] text-[0.85rem] text-[#333]">
          Planification en cours…
        </span>
      )}
      <button
        type="button"
        onClick={cliquer}
        disabled={calcul}
        aria-busy={calcul}
        aria-label={lanceLeSolveur ? "Synchroniser : planifier les RDV en attente et actualiser" : "Actualiser les données"}
        title={calcul ? "Planification en cours…" : libelle}
        className="grid h-[2.2rem] w-[2.2rem] place-items-center rounded-full text-[1.1rem] text-[#333] transition hover:bg-gris disabled:cursor-wait"
      >
        <FaArrowsRotate aria-hidden className={calcul || rechargement ? "animate-spin" : ""} />
      </button>
    </span>
  );
}
