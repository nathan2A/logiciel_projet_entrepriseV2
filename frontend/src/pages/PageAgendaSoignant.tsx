/**
 * Agenda d'un soignant consulté par un autre soignant (depuis l'Annuaire).
 * Même écran que « Agenda » ; cliquer sur le nom ouvre sa fiche.
 */
import { Navigate, useParams } from "react-router-dom";
import { VueSemaine } from "@/components/planning/VueSemaine";
import { Chargement, ListeVide } from "@/components/ui/Etats";
import { useUtilisateur } from "@/hooks/useAuth";
import { useSoignants } from "@/hooks/useReferentiel";
import { formatNom } from "@/utils/noms";

export function PageAgendaSoignant() {
  const id = Number(useParams().soignantId);
  const moi = useUtilisateur();
  const { data: soignants, isPending } = useSoignants();
  if (id === moi.id) return <Navigate to="/agenda" replace />;
  if (isPending) return <Chargement />;
  const s = soignants?.find((x) => x.id === id);
  if (!s) return <ListeVide texte="Ce soignant est introuvable." />;
  return (
    <VueSemaine
      key={id}
      titre={formatNom(s)}
      lienTitre={`/soignants/${id}/profil`}
      soignantId={id}
      modifiable
      regrouperSeances
      defautsCreation={{ soignantIds: [id] }}
    />
  );
}
