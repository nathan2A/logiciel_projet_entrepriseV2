/**
 * Boutons « Modifier le profil » / « Supprimer le profil » des fiches profil,
 * dans le style des boutons « Valider les modifications » / « Supprimer le RDV »
 * du pop-up de RDV (confirmation avant suppression).
 *
 * Supprimer archive le profil (historique conservé). Ensuite :
 * - son propre profil : déconnexion ;
 * - sinon : retour à l'Annuaire, qui affiche le bilan (RDV annulés ou transférés).
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { useProfils } from "@/hooks/useProfils";
import { estErreurApi } from "@/services/api/client";
import type { TypeProfil } from "@/types";
import { formatNom } from "@/utils/noms";
import type { EtatSuppression } from "./BilanSuppression";

interface Props {
  cible: { id: number; type: TypeProfil; nom: string; prenom: string };
  lienModifier: string;
}

export function ActionsProfil({ cible, lienModifier }: Props) {
  const navigate = useNavigate();
  const { utilisateur, deconnexion } = useAuth();
  const { erreur, succes } = useNotifications();
  const profils = useProfils();
  const [confirmer, setConfirmer] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const soiMeme = utilisateur?.id === cible.id;

  const consequence =
    cible.type === "patient"
      ? "Ses RDV à venir seront annulés ; l’historique est conservé."
      : "Ses RDV à venir seront confiés à des collègues de même profession ; l’historique est conservé.";

  const supprimer = async () => {
    setEnvoi(true);
    try {
      const resultat = await profils.supprimer(cible.id);
      if (soiMeme) {
        deconnexion();
        succes("Votre profil a été supprimé.");
        return;
      }
      const etat: EtatSuppression = { nom: formatNom(cible), resultat };
      navigate("/annuaire", { state: { suppression: etat } });
      void profils.recharger();
    } catch (e) {
      setEnvoi(false);
      setConfirmer(false);
      erreur(estErreurApi(e) ? e.message : undefined);
    }
  };

  return (
    <div className="mt-[2.2rem] flex flex-wrap items-baseline justify-between gap-[1rem]">
      <Link to={lienModifier} className="text-[1.45rem] text-valider underline">
        Modifier le profil
      </Link>
      {confirmer ? (
        <div role="group" aria-label="Confirmer la suppression du profil" className="max-w-[24rem] text-right text-[1.05rem] leading-[1.5rem]">
          <p>
            Supprimer le profil de {formatNom(cible)} ? {consequence}
            {soiMeme && " Vous serez déconnecté(e)."}
          </p>
          <span className="mt-[0.3rem] inline-flex items-baseline gap-[0.8rem]">
            <button type="button" disabled={envoi} onClick={supprimer} className="font-medium text-supprimer underline disabled:opacity-50">
              {envoi ? "Suppression…" : "Confirmer la suppression"}
            </button>
            <button type="button" disabled={envoi} onClick={() => setConfirmer(false)} className="underline">
              Annuler
            </button>
          </span>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmer(true)} className="text-[1.45rem] text-supprimer underline">
          Supprimer le profil
        </button>
      )}
    </div>
  );
}
