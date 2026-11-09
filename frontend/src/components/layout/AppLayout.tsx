/**
 * Gabarit commun des écrans connectés : menu latéral à gauche, bouton de
 * déconnexion en haut à droite (avec « Synchroniser » et la jauge de zoom à côté).
 * Le zoom s'applique à la zone de travail seulement (pas au menu ni à ces boutons).
 *
 * Fonctionnement du zoom : toute l'interface est en rem, on agrandit donc la
 * taille de base (variable CSS --zoom sur <html>). Le menu et les boutons du
 * haut sont « dé-zoomés » (zoom CSS inverse) pour garder leur taille.
 * Le zoom CSS n'est pas appliqué au planning lui-même : FullCalendar mesure
 * l'écran et se décalerait.
 */
import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { FaPowerOff } from "react-icons/fa6";
import { useAuth, useUtilisateur } from "@/hooks/useAuth";
import { PopupMessage } from "@/components/ui/PopupMessage";
import { BoutonSynchroniser } from "./BoutonSynchroniser";
import { JaugeZoom, useZoom } from "./JaugeZoom";
import { Sidebar } from "./Sidebar";

export function AppLayout() {
  const utilisateur = useUtilisateur();
  const { deconnexion } = useAuth();
  const navigate = useNavigate();
  const [menuDeplie, setMenuDeplie] = useState(false);
  const [confirmerDeconnexion, setConfirmerDeconnexion] = useState(false);
  const { zoom, setZoom } = useZoom();
  const inverse = { zoom: 100 / zoom };

  useEffect(() => {
    document.documentElement.style.setProperty("--zoom", String(zoom / 100));
    // Écran de connexion : taille normale
    return () => {
      document.documentElement.style.removeProperty("--zoom");
    };
  }, [zoom]);

  return (
    <div className="flex h-screen min-h-[40rem] overflow-hidden">
      <div className="flex shrink-0" style={inverse}>
        <Sidebar role={utilisateur.role} deplie={menuDeplie} onBasculer={() => setMenuDeplie((v) => !v)} />
      </div>

      <main className="relative min-w-0 flex-1 overflow-auto">
        <div className="fixed right-[0.7rem] top-[0.6rem] z-30 flex items-center gap-[0.4rem]" style={inverse}>
          <JaugeZoom zoom={zoom} onChange={setZoom} />
          <BoutonSynchroniser lanceLeSolveur={utilisateur.role === "soignant"} />
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
