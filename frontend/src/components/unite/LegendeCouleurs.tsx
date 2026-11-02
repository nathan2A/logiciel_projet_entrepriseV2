/** Rappel du code couleur des RDV (maquettes Unité 0 / Unité 1). */
import { CATEGORIES_RDV, couleurTexteSur, ORDRE_CATEGORIES } from "@/theme/couleursRdv";

export function LegendeCouleurs() {
  return (
    <aside aria-label="Code couleur des rendez-vous">
      <ul className="space-y-[0.4rem]">
        {ORDRE_CATEGORIES.map((c) => {
          const { libelle, couleur } = CATEGORIES_RDV[c];
          return (
            <li
              key={c}
              className="flex min-h-[2rem] items-center justify-center rounded-full px-[0.6rem] text-center text-[0.85rem] leading-tight"
              style={{ backgroundColor: couleur, color: couleurTexteSur(couleur) }}
            >
              {libelle}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
