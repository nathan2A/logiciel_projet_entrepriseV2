/**
 * Agenda d'un patient consulté par un soignant (depuis l'Annuaire ou une Unité).
 * Même écran que la vue patient.
 */
import { useParams } from "react-router-dom";
import { VueSemaine } from "@/components/planning/VueSemaine";
import { Chargement, ListeVide } from "@/components/ui/Etats";
import { usePatients } from "@/hooks/useReferentiel";
import { useUtilisateur } from "@/hooks/useAuth";

export function PageAgendaPatient() {
  const id = Number(useParams().patientId);
  const moi = useUtilisateur();
  const { data: patients, isPending } = usePatients();
  if (isPending) return <Chargement />;
  const p = patients?.find((x) => x.id === id);
  if (!p) return <ListeVide texte="Ce patient est introuvable." />;
  const titre = `${p.nom} ${p.prenom}${p.chambre ? ` : ${p.chambre.numero}` : ""}`;
  return (
    <VueSemaine
      key={id}
      titre={titre}
      patientId={id}
      modifiable
      defautsCreation={{ patientIds: [id], soignantId: moi.id }}
    />
  );
}
