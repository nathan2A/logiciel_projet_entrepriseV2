/** États de chargement, d'erreur et de liste vide, réutilisés partout. */
import { FaArrowsRotate, FaTriangleExclamation } from "react-icons/fa6";

export function Chargement({ texte = "Chargement…" }: { texte?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-[0.6rem] p-[1rem] text-[1rem] text-[#444]">
      <span className="h-[1.2rem] w-[1.2rem] animate-spin rounded-full border-[0.18rem] border-violet border-t-transparent" aria-hidden />
      {texte}
    </div>
  );
}

/** Le backend ne répond plus : on garde les dernières données affichées. */
export function BandeauHorsLigne({ message, onReessayer }: { message: string; onReessayer: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-center gap-[0.6rem] rounded-charte bg-[#fff1f1] px-[1rem] py-[0.35rem] text-[0.9rem] text-[#8a1c1c]">
      <FaTriangleExclamation aria-hidden />
      <span>{message}</span>
      <button type="button" onClick={onReessayer} className="font-medium underline">
        Réessayer
      </button>
    </div>
  );
}

export function ListeVide({ texte }: { texte: string }) {
  return <p className="p-[1rem] text-center text-[1rem] text-[#555]">{texte}</p>;
}

/** Bouton « Actualiser » (rafraîchissement manuel, en plus du polling). */
export function BoutonActualiser({ onClick, enCours }: { onClick: () => void; enCours: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Actualiser les données"
      title="Actualiser"
      className="grid h-[2.2rem] w-[2.2rem] place-items-center rounded-full text-[1.1rem] text-[#333] transition hover:bg-gris"
    >
      <FaArrowsRotate aria-hidden className={enCours ? "animate-spin" : ""} />
    </button>
  );
}
