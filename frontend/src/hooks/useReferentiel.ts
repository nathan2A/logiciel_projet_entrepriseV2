/** Listes de référence (changent rarement : cache long). */
import { useQuery } from "@tanstack/react-query";
import { planApi, POLLING_MS, referentielApi } from "@/services/api";

const LONG = 5 * 60_000;

export const useTypesRdv = () =>
  useQuery({ queryKey: ["types-rdv"], queryFn: referentielApi.listerTypesRdv, staleTime: LONG, refetchInterval: false });

export const useLieux = () =>
  useQuery({ queryKey: ["lieux"], queryFn: referentielApi.listerLieux, staleTime: LONG, refetchInterval: false });

export const usePatients = (actif = true) =>
  useQuery({ queryKey: ["patients"], queryFn: referentielApi.listerPatients, staleTime: LONG, enabled: actif });

export const useSoignants = (actif = true) =>
  useQuery({ queryKey: ["soignants"], queryFn: referentielApi.listerSoignants, staleTime: LONG, enabled: actif });

/** Chambres et patients présents un jour donné (« 2026-10-22 »). */
export const useOccupation = (jour: string) =>
  useQuery({ queryKey: ["plan", jour], queryFn: () => planApi.occupationDuJour(jour), refetchInterval: POLLING_MS });
