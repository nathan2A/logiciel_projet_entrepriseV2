/**
 * Pop-up « Information sur le RDV » (maquette 11) : bandeau à la couleur du
 * type avec le titre et l'heure, puis le détail. « Modifier le RDV » n'apparaît
 * que pour les profils autorisés à modifier.
 */
import { Modal } from "@/components/ui/Modal";
import { couleurRdv } from "@/theme/couleursRdv";
import type { RendezVous } from "@/types";
import { depuisIso, jourCourtEtDate, plageHoraire } from "@/utils/dates";
import { formatNom, formatNoms } from "@/utils/noms";

interface Props {
  rdv: RendezVous;
  /** Patients du même RDV de groupe (même horaire, type, lieu, soignants). */
  patientsDuGroupe?: string[];
  onFermer: () => void;
  onModifier?: () => void;
}

export function RdvInfoModal({ rdv, patientsDuGroupe, onFermer, onModifier }: Props) {
  const debut = depuisIso(rdv.debut);
  const fin = depuisIso(rdv.fin);
  const horaire = plageHoraire(debut, fin);
  const patients = patientsDuGroupe?.length ? patientsDuGroupe : rdv.patient ? [formatNom(rdv.patient)] : [];
  const lignes: [string, string][] = [
    ["Horaire", horaire],
    ["Lieu", rdv.lieu.libelle],
    ["Soignant(s)", rdv.soignants.length ? rdv.soignants.map((s) => `${formatNom(s)} (${s.profession})`).join(", ") : "Aucun"],
    ["Patients(s)", patients.length ? patients.join(", ") : formatNoms([])],
    ["Date", jourCourtEtDate(debut)],
    ["Préparation antérieure", rdv.preparation || "Aucune"],
  ];

  return (
    <Modal
      titreAccessible={`${rdv.type.libelle}, ${horaire}`}
      couleurBandeau={couleurRdv(rdv.type.categorie, rdv.type.couleurBackend)}
      onFermer={onFermer}
      titre={
        <>
          {rdv.type.libelle} :<span className="ml-[1.6rem]">{horaire}</span>
        </>
      }
    >
      <p>Descriptif : {rdv.descriptif || "—"}</p>
      <dl className="mt-[1.75rem]">
        {lignes.map(([libelle, valeur]) => (
          <div key={libelle}>
            <dt className="inline">{libelle} : </dt>
            <dd className="inline">{valeur}</dd>
          </div>
        ))}
      </dl>
      {onModifier && (
        <button type="button" onClick={onModifier} className="mt-[2rem] text-[2.2rem] leading-none text-lien underline">
          Modifier le RDV
        </button>
      )}
    </Modal>
  );
}
