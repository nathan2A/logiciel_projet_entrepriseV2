/**
 * Contexte de connexion : qui est connecté, se connecter, se déconnecter.
 * Le rôle de l'utilisateur détermine les vues et les droits (édition réservée aux soignants).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { authApi, quandNonAutorise } from "@/services/api";
import { stockageJeton } from "@/services/api/client";
import type { Utilisateur } from "@/types";

type Statut = "verification" | "connecte" | "deconnecte";

interface ValeurAuth {
  statut: Statut;
  utilisateur: Utilisateur | null;
  peutModifier: boolean; // soignants uniquement
  connexion: (identifiant: string, motDePasse: string) => Promise<Utilisateur>;
  deconnexion: () => void;
  /** Relit /auth/moi (après modification de son propre profil). */
  rafraichir: () => Promise<void>;
}

const ContexteAuth = createContext<ValeurAuth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(null);
  const [statut, setStatut] = useState<Statut>(stockageJeton.lire() ? "verification" : "deconnecte");

  const deconnexion = useCallback(() => {
    authApi.deconnexion();
    setUtilisateur(null);
    setStatut("deconnecte");
    queryClient.clear();
  }, [queryClient]);

  // Au chargement : si un jeton existe déjà, on vérifie qu'il est encore valable
  useEffect(() => {
    if (!stockageJeton.lire()) return;
    authApi
      .moi()
      .then((u) => {
        setUtilisateur(u);
        setStatut("connecte");
      })
      .catch(() => deconnexion());
  }, [deconnexion]);

  // Jeton expiré pendant l'utilisation : retour à l'écran de connexion
  useEffect(() => {
    quandNonAutorise(deconnexion);
    return () => quandNonAutorise(null);
  }, [deconnexion]);

  const connexion = useCallback(async (identifiant: string, motDePasse: string) => {
    const u = await authApi.connexion(identifiant, motDePasse);
    setUtilisateur(u);
    setStatut("connecte");
    return u;
  }, []);

  const rafraichir = useCallback(async () => {
    setUtilisateur(await authApi.moi());
  }, []);

  const valeur = useMemo<ValeurAuth>(
    () => ({ statut, utilisateur, peutModifier: utilisateur?.role === "soignant", connexion, deconnexion, rafraichir }),
    [statut, utilisateur, connexion, deconnexion, rafraichir],
  );

  return <ContexteAuth.Provider value={valeur}>{children}</ContexteAuth.Provider>;
}

export function useAuth(): ValeurAuth {
  const v = useContext(ContexteAuth);
  if (!v) throw new Error("useAuth doit être utilisé dans <AuthProvider>");
  return v;
}

/** Raccourci pour les écrans protégés : l'utilisateur est forcément connecté. */
export function useUtilisateur(): Utilisateur {
  const { utilisateur } = useAuth();
  if (!utilisateur) throw new Error("Aucun utilisateur connecté");
  return utilisateur;
}
