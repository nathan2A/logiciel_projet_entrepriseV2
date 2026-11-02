/**
 * Orchestration des modifications du planning, commune à tous les écrans :
 *  - état « en cours » sur les RDV concernés ;
 *  - rechargement des données après chaque action ;
 *  - pop-up « Action réalisée ! » en cas de succès ;
 *  - conflit bloquant (HTTP 409) ou erreur : rien n'est modifié, message d'erreur ;
 *  - conflit d'avertissement : l'action est enregistrée, l'utilisateur choisit
 *    de la conserver ou de revenir en arrière.
 * Les conflits viennent toujours du backend ; ils sont seulement affichés ici.
 */
import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { estErreurApi } from "@/services/api";
import type { ResultatAction } from "@/services/api/rdv";
import type { Conflit } from "@/types";
import { useNotifications } from "./useNotifications";

/**
 * Une séance de groupe produit souvent le même conflit pour chaque patient :
 * on n'affiche qu'une fois chaque message (la surbrillance, elle, garde tous les RDV).
 */
export function messagesUniques(conflits: Conflit[]): Conflit[] {
  const vus = new Map<string, Conflit>();
  conflits.forEach((c) => {
    const cle = `${c.gravite}|${c.message}`;
    const deja = vus.get(cle);
    vus.set(cle, deja ? { ...deja, rdvIds: [...new Set([...deja.rdvIds, ...c.rdvIds])] } : c);
  });
  return [...vus.values()];
}

export interface AvertissementEnAttente {
  conflits: Conflit[];
  defaire: () => Promise<void>;
}

export function useEditionPlanning() {
  const queryClient = useQueryClient();
  const { erreur, succes } = useNotifications();
  const [rdvEnCours, setRdvEnCours] = useState<number[]>([]);
  const [conflits, setConflits] = useState<Conflit[]>([]);
  const [avertissement, setAvertissement] = useState<AvertissementEnAttente | null>(null);

  const recharger = useCallback(() => queryClient.invalidateQueries({ queryKey: ["rdv"] }), [queryClient]);

  /**
   * Lance une action. Renvoie true si elle a été enregistrée (même avec
   * avertissement), false si elle a été refusée ou a échoué.
   */
  const lancer = useCallback(
    async (action: () => Promise<ResultatAction>, rdvConcernes: number[] = []): Promise<boolean> => {
      setRdvEnCours(rdvConcernes);
      try {
        const res = await action();
        await recharger();
        const avertissements = res.conflits.filter((c) => c.gravite === "avertissement");
        setConflits(res.conflits);
        if (avertissements.length) setAvertissement({ conflits: messagesUniques(avertissements), defaire: res.defaire });
        else succes();
        return true;
      } catch (e) {
        await recharger();
        if (estErreurApi(e) && e.conflits?.length) {
          // Conflit bloquant : on l'explique et on met les RDV concernés en évidence
          setConflits(e.conflits);
          erreur("L’action est refusée :", messagesUniques(e.conflits).map((c) => c.message));
        } else {
          erreur(estErreurApi(e) ? e.message : undefined);
        }
        return false;
      } finally {
        setRdvEnCours([]);
      }
    },
    [recharger, erreur, succes],
  );

  /** L'utilisateur conserve l'action malgré l'avertissement. */
  const conserver = useCallback(() => {
    setAvertissement(null);
    succes();
  }, [succes]);

  /** L'utilisateur renonce : retour à l'état d'avant l'action. */
  const renoncer = useCallback(async () => {
    const a = avertissement;
    setAvertissement(null);
    if (!a) return;
    try {
      await a.defaire();
      setConflits([]);
    } catch {
      erreur("Le retour en arrière n’a pas pu être effectué.");
    } finally {
      await recharger();
    }
  }, [avertissement, erreur, recharger]);

  /** Couleur de surbrillance par RDV : « bloquant » l'emporte sur « avertissement ». */
  const graviteParRdv = useMemo(() => {
    const m: Record<number, "bloquant" | "avertissement"> = {};
    conflits.forEach((c) =>
      c.rdvIds.forEach((id) => {
        if (m[id] !== "bloquant") m[id] = c.gravite;
      }),
    );
    return m;
  }, [conflits]);

  return {
    lancer,
    rdvEnCours,
    conflits: messagesUniques(conflits),
    effacerConflits: () => setConflits([]),
    graviteParRdv,
    avertissement,
    conserver,
    renoncer,
  };
}
