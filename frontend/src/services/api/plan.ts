/** Plan du service (GET /plan, soignants uniquement) : qui occupe quelle chambre. */
import type { OccupationChambre } from "@/types";
import { appeler } from "./client";
import type { PlanJSON } from "./backendTypes";

/** Toutes les chambres, avec les patients présents le jour donné (« 2026-10-22 »). */
export async function occupationDuJour(jour: string): Promise<OccupationChambre[]> {
  const plan = await appeler<PlanJSON>({ methode: "GET", chemin: "/plan", query: { moment: `${jour}T12:00:00` } });
  return plan.chambres.map((c) => ({
    chambre: { id: c.id, numero: c.numero, etage: c.etage },
    patients: c.patients.map(({ patient: p }) => ({ id: p.id, login: p.login, nom: p.nom, prenom: p.prenom })),
  }));
}
