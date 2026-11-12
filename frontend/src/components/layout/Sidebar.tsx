/**
 * Menu latéral noir (maquettes 01-04) : replié, il n'affiche que les icônes ;
 * le bouton « burger » le déplie avec les libellés.
 * Les entrées « prochaine version » sont visibles mais inactives.
 */
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { FaBars, FaBug, FaCalendarDays, FaDumbbell, FaPlus, FaUser, FaUsers, FaUtensils } from "react-icons/fa6";
import type { Role } from "@/types";

interface Entree {
  libelle: string;
  icone: ReactNode;
  vers?: string; // absent = prochaine version
  petit?: boolean; // libellé en petit (« Signaler un bug » sur la maquette)
}

const texteUnite = (n: number) => <span className="text-[1.75rem] font-light leading-none tracking-tight">U{n}</span>;

const ENTREES: Record<Role, Entree[]> = {
  patient: [
    { libelle: "Agenda", icone: <FaCalendarDays />, vers: "/agenda" },
    { libelle: "Mon profil", icone: <FaUser />, vers: "/profil" },
    { libelle: "Activité", icone: <FaDumbbell className="-rotate-45" /> },
    { libelle: "Menu", icone: <FaUtensils /> },
  ],
  soignant: [
    { libelle: "Agenda", icone: <FaCalendarDays />, vers: "/agenda" },
    { libelle: "Mon profil", icone: <FaUser />, vers: "/profil" },
    { libelle: "Annuaire", icone: <FaUsers />, vers: "/annuaire" },
    { libelle: "Unité 0", icone: texteUnite(0), vers: "/unites/0" },
    { libelle: "Unité 1", icone: texteUnite(1), vers: "/unites/1" },
    { libelle: "Menu", icone: <FaUtensils /> },
    { libelle: "Signaler un bug", icone: <FaBug />, petit: true },
    { libelle: "Ajouter un compte", icone: <FaPlus />, vers: "/profils/nouveau", petit: true },
  ],
};

interface Props {
  role: Role;
  deplie: boolean;
  onBasculer: () => void;
}

export function Sidebar({ role, deplie, onBasculer }: Props) {
  const ligne = "flex h-[3.7rem] w-full items-center gap-[1.1rem] px-[1.35rem] text-white";
  return (
    <nav
      aria-label="Menu principal"
      className={`flex shrink-0 flex-col bg-black pt-[0.9rem] transition-[width] duration-200 ${deplie ? "w-[16rem]" : "w-[5.2rem]"}`}
    >
      <button
        type="button"
        onClick={onBasculer}
        aria-expanded={deplie}
        aria-label={deplie ? "Replier le menu" : "Déplier le menu"}
        className={`${ligne} text-[2.3rem]`}
      >
        <FaBars aria-hidden />
      </button>
      <ul className="mt-[0.3rem]">
        {ENTREES[role].map((e) => {
          const contenu = (
            <>
              <span aria-hidden className="grid w-[2.4rem] shrink-0 place-items-center text-[2.1rem]">
                {e.icone}
              </span>
              <span className={`${deplie ? "" : "sr-only"} whitespace-nowrap ${e.petit ? "text-[0.95rem]" : "text-[1.35rem]"}`}>
                {e.libelle}
              </span>
            </>
          );
          return (
            <li key={e.libelle}>
              {e.vers ? (
                <NavLink to={e.vers} title={deplie ? undefined : e.libelle} className={ligne}>
                  {contenu}
                </NavLink>
              ) : (
                <span
                  role="link"
                  aria-disabled="true"
                  title="Disponible dans une prochaine version"
                  className={`${ligne} cursor-not-allowed`}
                >
                  {contenu}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
