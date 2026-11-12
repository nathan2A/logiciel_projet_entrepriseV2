/**
 * Création, modification et suppression de profils (tous les soignants).
 * Après chaque action, les listes et plannings concernés sont rechargés.
 */
import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { comptesApi } from "@/services/api";
import type { SaisieProfil } from "@/types";

export function useProfils() {
  const queryClient = useQueryClient();
  const recharger = useCallback(
    () => Promise.all(["patients", "soignants", "rdv", "plan"].map((k) => queryClient.invalidateQueries({ queryKey: [k] }))),
    [queryClient],
  );

  return useMemo(
    () => ({
      creer: async (s: SaisieProfil) => {
        const r = await comptesApi.creerProfil(s);
        await recharger();
        return r;
      },
      modifier: async (id: number, s: SaisieProfil) => {
        await comptesApi.modifierProfil(id, s);
        await recharger();
      },
      /** Ne recharge pas : l'appelant le fait (après avoir quitté la fiche supprimée). */
      supprimer: (id: number) => comptesApi.supprimerProfil(id),
      recharger,
    }),
    [recharger],
  );
}
