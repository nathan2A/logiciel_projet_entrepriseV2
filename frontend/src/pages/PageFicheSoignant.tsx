/**
 * Fiche d'un soignant, vue par un autre soignant (en cliquant sur son nom en
 * haut de son agenda, ouvert depuis l'Annuaire). Modifier / supprimer le profil.
 */
import { Link, Navigate, useParams } from "react-router-dom";
import { EnteteDate } from "@/components/layout/EnteteDate";
import { ActionsProfil } from "@/components/profils/ActionsProfil";
import { BandeauHorsLigne, Chargement, ListeVide } from "@/components/ui/Etats";
import { useUtilisateur } from "@/hooks/useAuth";
import { useSoignants } from "@/hooks/useReferentiel";
import { depuisIso, jjmmaaaa } from "@/utils/dates";
import { formatNom, formatPrenom, identifiantAffiche } from "@/utils/noms";
import { Section } from "./PageProfil";

const date = (iso?: string | null) => (iso ? jjmmaaaa(depuisIso(iso)) : undefined);

export function PageFicheSoignant() {
  const id = Number(useParams().soignantId);
  const moi = useUtilisateur();
  const { data: soignants, isPending, isError, refetch } = useSoignants();
  if (id === moi.id) return <Navigate to="/profil" replace />;
  if (isPending) return <Chargement />;
  if (isError && !soignants) return <BandeauHorsLigne message="Impossible de charger la fiche du soignant." onReessayer={() => refetch()} />;
  const s = soignants?.find((x) => x.id === id);
  if (!s) return <ListeVide texte="Ce soignant est introuvable." />;

  return (
    <div className="px-[2.2rem] pb-[2rem]">
      <EnteteDate />
      <h1 className="mt-[0.4rem] text-center text-[2.9rem] font-normal">FICHE SOIGNANT</h1>
      <div className="mx-auto mt-[1.4rem] w-full max-w-[44rem] text-[1.55rem] leading-[2.15rem]">
        <Section
          titre="Identité"
          lignes={[
            ["Nom", s.nom.toUpperCase()],
            ["Prénom", formatPrenom(s.prenom)],
            ["Profession", s.profession],
            ["Date de naissance", date(s.dateNaissance)],
            ["Email", s.email],
            ["Téléphone", s.telephone],
          ]}
        />
        <Section titre="Identification" lignes={[["Identifiant", identifiantAffiche(s)]]} />
        <ActionsProfil cible={{ id: s.id, type: "soignant", nom: s.nom, prenom: s.prenom }} lienModifier={`/soignants/${s.id}/profil/modifier`} />
        <p className="mt-[2rem]">
          <Link to={`/soignants/${s.id}/agenda`} className="text-lien underline">
            Retour à l’agenda de {formatNom(s)}
          </Link>
        </p>
      </div>
    </div>
  );
}
