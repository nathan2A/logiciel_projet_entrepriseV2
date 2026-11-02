/**
 * Pop-up de rendez-vous (maquettes 11, 12, 13) : bandeau de titre coloré
 * (couleur du type de RDV, ou gris pour « Nouveau RDV »), croix à droite.
 */
import type { ReactNode } from "react";
import { couleurTexteSur, COULEURS_UI } from "@/theme/couleursRdv";
import { BoutonFermer } from "./BoutonFermer";
import { useDialogue } from "./useDialogue";

interface Props {
  titre: ReactNode;
  titreAccessible: string;
  couleurBandeau?: string;
  onFermer: () => void;
  children: ReactNode;
}

export function Modal({ titre, titreAccessible, couleurBandeau = COULEURS_UI.gris, onFermer, children }: Props) {
  const ref = useDialogue<HTMLDivElement>(onFermer);
  const texte = couleurTexteSur(couleurBandeau);

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/15 p-[1rem]" onMouseDown={onFermer}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={titreAccessible}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        className="relative flex max-h-[90vh] w-[40rem] flex-col overflow-hidden rounded-charte border border-[#444] bg-white shadow-xl"
      >
        <header
          className="relative flex min-h-[3.3rem] items-center justify-center px-[3rem] text-[1.45rem]"
          style={{ backgroundColor: couleurBandeau, color: texte }}
        >
          <h2 className="font-normal">{titre}</h2>
          <BoutonFermer onClick={onFermer} clair={texte === "#ffffff"} />
        </header>
        <div className="overflow-y-auto px-[2.9rem] pb-[1.4rem] pt-[1rem] text-[1.05rem] leading-[1.75rem]">{children}</div>
      </div>
    </div>
  );
}
