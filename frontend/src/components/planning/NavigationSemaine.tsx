import { FaArrowLeft, FaArrowRight } from "react-icons/fa6";
import { jjmmaaaa } from "@/utils/dates";

/** Flèches violettes et « Semaine du JJ/MM/AAAA ». */
export function NavigationSemaine({ lundi, onPrecedente, onSuivante }: { lundi: Date; onPrecedente: () => void; onSuivante: () => void }) {
  const fleche = "grid h-[2.2rem] w-[2.2rem] place-items-center rounded-full text-[1.6rem] text-violet transition hover:bg-gris";
  return (
    <div className="flex items-center justify-between">
      <button type="button" onClick={onPrecedente} aria-label="Semaine précédente" className={fleche}>
        <FaArrowLeft aria-hidden />
      </button>
      <h2 className="text-[0.95rem] font-normal tracking-date" aria-live="polite">
        Semaine du {jjmmaaaa(lundi)}
      </h2>
      <button type="button" onClick={onSuivante} aria-label="Semaine suivante" className={fleche}>
        <FaArrowRight aria-hidden />
      </button>
    </div>
  );
}
