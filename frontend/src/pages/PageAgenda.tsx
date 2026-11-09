/**
 * « Agenda » : planning de la semaine de la personne connectée.
 * Patient → ses RDV ; il peut ajouter des visites (et modifier celles qu'il a ajoutées).
 * Soignant → les RDV auxquels il participe (édition complète).
 * Cliquer sur le bloc du nom ouvre « Mon profil ».
 */
import { VueSemaine } from "@/components/planning/VueSemaine";
import { useUtilisateur } from "@/hooks/useAuth";
import { formatNom } from "@/utils/noms";

export function PageAgenda() {
  const u = useUtilisateur();

  if (u.role === "patient") {
    const titre = `${formatNom(u)}${u.chambre ? ` : ${u.chambre.numero}` : ""}`;
    return (
      <VueSemaine
        titre={titre}
        lienTitre="/profil"
        patientId={u.id}
        modifiable={false}
        patientConnecte={{ id: u.id, login: u.login, nom: u.nom, prenom: u.prenom }}
      />
    );
  }

  return (
    <VueSemaine
      titre={formatNom(u)}
      lienTitre="/profil"
      soignantId={u.id}
      modifiable
      regrouperSeances
      defautsCreation={{ soignantIds: [u.id] }}
    />
  );
}
