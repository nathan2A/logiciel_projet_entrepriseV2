/**
 * Conflit renvoyé par le backend : l'action est déjà enregistrée, et chaque
 * conflit est présenté l'un après l'autre (le patient d'abord, puis chaque
 * soignant concerné). Pour chacun, l'utilisateur choisit :
 *  - « Continuer » : passe au conflit suivant ; après le dernier, l'action est conservée ;
 *  - « Annuler le changement » : toute l'action est annulée (retour à l'état d'avant).
 */
import { useState } from "react";
import { FaTriangleExclamation } from "react-icons/fa6";
import { Modal } from "@/components/ui/Modal";
import { COULEURS_UI } from "@/theme/couleursRdv";
import type { Conflit } from "@/types";

interface Props {
  conflit: Conflit;
  position: number; // 1 = premier conflit
  total: number;
  onContinuer: () => void;
  onRenoncer: () => Promise<void>;
}

/** « … : DUPONT Daniel. » → « … : DUPONT Daniel, souhaitez-vous continuer ? » */
const question = (message: string) => `${message.trim().replace(/[.\s]+$/, "")}, souhaitez-vous continuer ?`;

export function AvertissementModal({ conflit, position, total, onContinuer, onRenoncer }: Props) {
  const [envoi, setEnvoi] = useState(false);
  return (
    <Modal
      titre="Attention"
      titreAccessible={`Attention : conflit ${position} sur ${total}`}
      couleurBandeau={COULEURS_UI.orange}
      onFermer={onContinuer}
    >
      <p className="flex items-baseline gap-[0.6rem]">
        <FaTriangleExclamation aria-hidden className="shrink-0 translate-y-[0.15rem] text-[#c96a00]" />
        <span>{question(conflit.message)}</span>
      </p>
      {total > 1 && (
        <p className="mt-[0.5rem] text-[0.9rem] text-[#666]">
          Conflit {position} sur {total}
        </p>
      )}
      <div className="mt-[1.2rem] flex items-baseline justify-between gap-[1rem]">
        <button type="button" data-autofocus disabled={envoi} onClick={onContinuer} className="text-[1.45rem] text-valider underline">
          Continuer
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
