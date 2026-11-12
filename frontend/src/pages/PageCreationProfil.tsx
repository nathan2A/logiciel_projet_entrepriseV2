/**
 * « Création de profil » (maquette 25, puis 24 ou 19) : on choisit d'abord le
 * type de compte (patient ou soignant), puis on remplit le formulaire.
 * Chaque écran a un lien « retour ». « Créer le profil » enregistre, affiche un
 * message de confirmation et ouvre la fiche du nouveau profil.
 */
import { useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BoutonRetour } from "@/components/profils/BoutonRetour";
import { erreurProfil } from "@/components/profils/erreurs";
import { FormulaireProfil } from "@/components/profils/FormulaireProfil";
import { saisieVide } from "@/components/profils/saisie";
import { useNotifications } from "@/hooks/useNotifications";
import { useProfils } from "@/hooks/useProfils";
import type { SaisieProfil, TypeProfil } from "@/types";
import { formatNom } from "@/utils/noms";

export function PageCreationProfil() {
  const navigate = useNavigate();
  const { erreur, succes } = useNotifications();
  const profils = useProfils();
  const idChoix = useId();
  const [choix, setChoix] = useState<TypeProfil | "">("");
  const [type, setType] = useState<TypeProfil | null>(null);
  const [alerte, setAlerte] = useState(false);

  const creer = async (s: SaisieProfil) => {
    try {
      const { id } = await profils.creer(s);
      succes(`Le profil de ${formatNom(s)} a été créé.`);
      navigate(s.type === "patient" ? `/patients/${id}/profil` : `/soignants/${id}/profil`, { replace: true });
      return true;
    } catch (e) {
      const { titre, message } = erreurProfil(e);
      erreur(message, undefined, titre);
      return false;
    }
  };

  if (type) {
    return (
      <FormulaireProfil
        key={type}
        titre={type === "patient" ? "Création de profil patient" : "Création de profil soignant"}
        mode="creation"
        initiale={saisieVide(type)}
        onValider={creer}
        onRetour={() => setType(null)}
      />
    );
  }

  return (
    <div className="px-[2.2rem] pb-[2rem]">
      <div className="mx-auto mt-[1rem] flex max-w-[52rem] items-start justify-between gap-[1rem]">
        <h1 className="text-[2.6rem] font-normal leading-tight">Création de profil</h1>
        <div className="mt-[0.8rem]">
          <BoutonRetour onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/annuaire"))} />
        </div>
      </div>
      <form
        className="mx-auto mt-[2.4rem] max-w-[52rem] text-[1.6rem]"
        onSubmit={(e) => {
          e.preventDefault();
          if (!choix) return setAlerte(true);
          setType(choix);
        }}
      >
        <label htmlFor={idChoix} className="block text-center">
          Quel est le type de compte à créer ?
        </label>
        <select
          id={idChoix}
          value={choix}
          onChange={(e) => {
            setChoix(e.target.value as TypeProfil | "");
            setAlerte(false);
          }}
          className={`mx-auto mt-[1rem] block w-[24rem] border border-black bg-white px-[0.6rem] py-[0.6rem] ${choix ? "" : "italic"}`}
        >
          <option value="">Choisir un type</option>
          <option value="patient">Patient</option>
          <option value="soignant">Soignant</option>
        </select>
        {alerte && (
          <p role="alert" className="mt-[0.5rem] text-center text-[1.05rem] text-erreur">
            Choisissez le type de compte.
          </p>
        )}
        <button type="submit" className="ml-[calc(50%-17rem)] mt-[0.6rem] text-[1.45rem] text-valider underline">
          Valider
        </button>
      </form>
    </div>
  );
}
