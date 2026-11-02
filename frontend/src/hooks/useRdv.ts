/** Rendez-vous d'une période, rafraîchis automatiquement (polling). */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { addDays } from "date-fns";
import { POLLING_MS, rdvApi } from "@/services/api";
import { versIsoLocal } from "@/utils/dates";

interface Options {
  lundi: Date;
  patientId?: number;
  soignantId?: number;
  actif?: boolean;
}

/** RDV de la semaine commençant au lundi donné, pour un patient ou un soignant. */
export function useRdvSemaine({ lundi, patientId, soignantId, actif = true }: Options) {
  const du = versIsoLocal(lundi);
  const au = versIsoLocal(addDays(lundi, 7));
  return useQuery({
    queryKey: ["rdv", { du, au, patientId, soignantId }],
    queryFn: () => rdvApi.listerRdv({ du, au, patientId, soignantId }),
    refetchInterval: POLLING_MS,
    placeholderData: keepPreviousData, // pas d'écran vide en changeant de semaine
    enabled: actif,
  });
}

/** Tous les RDV d'une journée (vues Unité), rafraîchis automatiquement. */
export function useRdvJour(jour: Date) {
  const du = versIsoLocal(new Date(jour.getFullYear(), jour.getMonth(), jour.getDate()));
  const au = versIsoLocal(addDays(new Date(jour.getFullYear(), jour.getMonth(), jour.getDate()), 1));
  return useQuery({
    queryKey: ["rdv", { du, au }],
    queryFn: () => rdvApi.listerRdv({ du, au }),
    refetchInterval: POLLING_MS,
  });
}
