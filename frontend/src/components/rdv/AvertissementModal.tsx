/**
 * Conflit d'avertissement renvoyé par le backend : l'action est enregistrée,
 * l'utilisateur choisit de la conserver ou de revenir en arrière
 * (le planning reste flexible).
 */
import { useState } from "react";
import { FaTriangleExclamation } from "react-icons/fa6";
import { Modal } from "@/components/ui/Modal";
import { COULEURS_UI } from "@/theme/couleursRdv";
import type { Conflit } from "@/types";

interface Props {
  conflits: Conflit[];
  onConserver: () => void;
  onRenoncer: () => Promise<void>;
}

export function AvertissementModal({ conflits, onConserver, onRenoncer }: Props) {
  const [envoi, setEnvoi] = useState(false);
  return (
    <Modal titre="Attention : conflit dans le planning" titreAccessible="Conflit dans le planning" couleurBandeau={COULEURS_UI.orange} onFermer={onConserver}>
      <p>Le rendez-vous a bien été enregistré, mais le planning signale :</p>
      <ul className="mt-[0.6rem] space-y-[0.3rem]">
        {conflits.map((c) => (
          <li key={c.id} className="flex items-baseline gap-[0.5rem]">
            <FaTriangleExclamation aria-hidden className="shrink-0 translate-y-[0.15rem] text-[#c96a00]" />
            {c.message}
          </li>
        ))}
      </ul>
      <p className="mt-[0.8rem]">Voulez-vous conserver ce changement ?</p>
      <div className="mt-[1rem] flex items-baseline justify-between gap-[1rem]">
        <button type="button" data-autofocus disabled={envoi} onClick={onConserver} className="text-[1.45rem] text-valider underline">
          Conserver
        </button>
        <button
          type="button"
          disabled={envoi}
          onClick={async () => {
            setEnvoi(true);
            await onRenoncer();
          }}
          className="text-[1.45rem] text-supprimer underline disabled:opacity-50"
        >
          {envoi ? "Retour en arrière…" : "Annuler le changement"}
        </button>
      </div>
    </Modal>
  );
}
