import { FaXmark } from "react-icons/fa6";

/** La croix en haut à droite des pop-ups. */
export function BoutonFermer({ onClick, clair = false }: { onClick: () => void; clair?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Fermer"
      className={`absolute right-[0.6rem] top-[0.5rem] grid h-[2rem] w-[2rem] place-items-center rounded-full text-[1.35rem] transition hover:bg-black/10 ${clair ? "text-white" : "text-black"}`}
    >
      <FaXmark aria-hidden />
    </button>
  );
}
