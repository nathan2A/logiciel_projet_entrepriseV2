/**
 * « Agenda » : planning de la semaine de la personne connectée.
 * Patient → ses RDV (consultation seule). Soignant → les RDV qu'il réalise (édition).
 */
import { VueSemaine } from "@/components/planning/VueSemaine";
import { useUtilisateur } from "@/hooks/useAuth";

export function PageAgenda() {
  const u = useUtilisateur();

  if (u.role === "patient") {
    const titre = `${u.nom} ${u.prenom}${u.chambre ? ` : ${u.chambre.numero}` : ""}`;
    // V1 : le bouton « Ajouter un RDV » du patient est affiché mais ne fait rien.
    return <VueSemaine titre={titre} patientId={u.id} modifiable={false} />;
  }

  return (
    <VueSemaine
      titre={`${u.nom} ${u.prenom}`}
      soignantId={u.id}
      modifiable
      regrouperSeances
      defautsCreation={{ soignantId: u.id }}
    />
  );
}
