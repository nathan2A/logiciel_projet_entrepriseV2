/**
 * Gabarit commun des écrans connectés : menu latéral à gauche, bouton de
 * déconnexion en haut à droite (avec le bouton « Actualiser » à côté).
 */
import { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { FaPowerOff } from "react-icons/fa6";
import { useAuth, useUtilisateur } from "@/hooks/useAuth";
import { PopupMessage } from "@/components/ui/PopupMessage";
import { BoutonActualiser } from "@/components/ui/Etats";
import { Sidebar } from "./Sidebar";

export function AppLayout() {
  const utilisateur = useUtilisateur();
  const { deconnexion } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const enChargement = useIsFetching() > 0;
  const [menuDeplie, setMenuDeplie] = useState(false);
  const [confirmerDeconnexion, setConfirmerDeconnexion] = useState(false);

  return (
    <div className="flex h-screen min-h-[40rem] overflow-hidden">
      <Sidebar role={utilisateur.role} deplie={menuDeplie} onBasculer={() => setMenuDeplie((v) => !v)} />

      <main className="relative min-w-0 flex-1 overflow-auto">
        <div className="fixed right-[0.7rem] top-[0.6rem] z-30 flex items-center gap-[0.4rem]">
          <BoutonActualiser enCours={enChargement} onClick={() => queryClient.invalidateQueries()} />
          <button
            type="button"
            onClick={() => setConfirmerDeconnexion(true)}
            aria-label="Se déconnecter"
            className="grid h-[3.3rem] w-[3.3rem] place-items-center rounded-full bg-black text-[1.75rem] text-white transition hover:scale-105"
          >
            <FaPowerOff aria-hidden />
          </button>
        </div>
        <Outlet />
      </main>

      {confirmerDeconnexion && (
        <PopupMessage variante="deconnexion" titre="Déconnexion" onFermer={() => setConfirmerDeconnexion(false)}>
          <button
            type="button"
            data-autofocus
            className="text-lien underline"
            onClick={() => {
              deconnexion();
              navigate("/connexion", { replace: true });
            }}
          >
            Cliquez pour vous déconnecter
          </button>
        </PopupMessage>
      )}
    </div>
  );
}
