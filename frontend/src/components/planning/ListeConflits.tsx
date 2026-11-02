/** Liste des conflits signalés par le backend après la dernière action (au-dessus du planning). */
import { FaCircleExclamation, FaTriangleExclamation, FaXmark } from "react-icons/fa6";
import type { Conflit } from "@/types";

export function ListeConflits({ conflits, onMasquer }: { conflits: Conflit[]; onMasquer: () => void }) {
  if (!conflits.length) return null;
  return (
    <div role="status" aria-label="Conflits du planning" className="relative rounded-charte border border-[#f0b46a] bg-[#fff6ea] px-[1rem] py-[0.35rem] pr-[2.5rem] text-[0.9rem]">
      <ul>
        {conflits.map((c) => (
          <li key={c.id} className="flex items-baseline gap-[0.5rem]">
            {c.gravite === "bloquant" ? (
              <FaCircleExclamation aria-label="Bloquant" className="shrink-0 translate-y-[0.1rem] text-erreur" />
            ) : (
              <FaTriangleExclamation aria-label="Avertissement" className="shrink-0 translate-y-[0.1rem] text-[#c96a00]" />
            )}
            {c.message}
          </li>
        ))}
      </ul>
      <button type="button" onClick={onMasquer} aria-label="Masquer les conflits" className="absolute right-[0.6rem] top-[0.35rem] text-[1.1rem]">
        <FaXmark aria-hidden />
      </button>
    </div>
  );
}
