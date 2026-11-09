/**
 * Synchronisation (bouton « Synchroniser ») : le backend relance le solveur
 * OR-Tools sur la période, enregistre les créneaux trouvés pour les RDV
 * « en attente », et renvoie le bilan jour par jour. Réservé aux soignants.
 */
import type { ResultatSynchronisation } from "@/types";
import { appeler } from "./client";
import type { SynchronisationJSON } from "./backendTypes";

/** Nombre de jours planifiés à partir d'aujourd'hui. */
export const JOURS_SYNCHRONISES = 7;

/** `du` : « AAAA-MM-JJ » (aujourd'hui, côté navigateur). */
export async function synchroniser(du: string, jours = JOURS_SYNCHRONISES): Promise<ResultatSynchronisation> {
  const r = await appeler<SynchronisationJSON>({
    methode: "POST",
    chemin: "/planification/synchroniser",
    json: { du, jours },
  });
  return {
    du: r.du,
    au: r.au,
    totalPlanifies: r.total_planifies,
    totalRestants: r.total_restants,
    jours: r.jours.map((j) => ({
      jour: j.jour,
      statut: j.statut,
      message: j.message,
      nbEnAttente: j.nb_en_attente,
      nbPlanifies: j.nb_planifies,
      ignores: j.ignores.map((i) => ({ rdvId: i.rdv_id, raison: i.raison })),
    })),
  };
}
