/**
 * Petit pop-up centré (maquettes 09 Erreur, 10 Déconnexion, 16 Action réalisée) :
 * pastille ronde à gauche, titre et message centrés, croix en haut à droite.
 */
import { useEffect, type ReactNode } from "react";
import { FaCheck, FaMinus, FaPowerOff } from "react-icons/fa6";
import { BoutonFermer } from "./BoutonFermer";
import { useDialogue } from "./useDialogue";

type Variante = "erreur" | "succes" | "deconnexion";

const PASTILLES: Record<Variante, ReactNode> = {
  erreur: (
    <span className="grid h-[2.9rem] w-[2.9rem] place-items-center rounded-full border-[0.2rem] border-white bg-erreur text-[1.4rem] text-white ring-1 ring-erreur">
      <FaMinus aria-hidden />
    </span>
  ),
  succes: (
    <span className="grid h-[2.9rem] w-[2.9rem] place-items-center rounded-full bg-black text-[1.5rem] text-succes">
      <FaCheck aria-hidden />
    </span>
  ),
  deconnexion: (
    <span className="grid h-[2.9rem] w-[2.9rem] place-items-center rounded-full bg-black text-[1.45rem] text-white">
      <FaPowerOff aria-hidden />
    </span>
  ),
};

interface Props {
  variante: Variante;
  titre?: string;
  children: ReactNode;
  onFermer: () => void;
  /** Ferme tout seul après quelques secondes (message de succès). */
  fermetureAuto?: boolean;
}

export function PopupMessage({ variante, titre, children, onFermer, fermetureAuto }: Props) {
  const ref = useDialogue<HTMLDivElement>(onFermer);

  useEffect(() => {
    if (!fermetureAuto) return;
    const t = setTimeout(onFermer, 3000);
    return () => clearTimeout(t);
  }, [fermetureAuto, onFermer]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/15" onMouseDown={onFermer}>
      <div
        ref={ref}
        role={variante === "erreur" ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-label={titre ?? (variante === "succes" ? "Confirmation" : "Message")}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        className="relative flex min-h-[5.2rem] w-[24rem] items-center gap-[0.9rem] rounded-charte border border-black bg-white py-[0.6rem] pl-[0.8rem] pr-[2.6rem] shadow-lg"
      >
        {PASTILLES[variante]}
        <div className="flex-1 text-center">
          {titre && <p className="text-[1rem] font-medium">{titre}</p>}
          <div className={titre ? "mt-[0.15rem] text-[1.05rem]" : "text-[1.25rem]"} role={variante === "erreur" ? "alert" : "status"}>
            {children}
          </div>
        </div>
        <BoutonFermer onClick={onFermer} />
      </div>
    </div>
  );
}
