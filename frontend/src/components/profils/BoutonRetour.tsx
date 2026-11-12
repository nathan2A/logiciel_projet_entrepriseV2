/** Lien « retour » des écrans de création / modification de profil (maquettes 19, 24). */
import { TbArrowBackUp } from "react-icons/tb";

export function BoutonRetour({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex shrink-0 items-center gap-[0.3rem] text-[1.3rem] text-lien">
      <TbArrowBackUp aria-hidden className="text-[1.9rem]" />
      <span className="underline">retour</span>
    </button>
  );
}
