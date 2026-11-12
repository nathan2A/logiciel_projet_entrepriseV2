/**
 * Fiche d'un patient, vue par un soignant (en cliquant sur le nom du patient
 * en haut de son agenda). Identité, identification, séjour ; modifier ou
 * supprimer le profil.
 */
import { Link, useParams } from "react-router-dom";
import { EnteteDate } from "@/components/layout/EnteteDate";
import { ActionsProfil } from "@/components/profils/ActionsProfil";
import { BandeauHorsLigne, Chargement, ListeVide } from "@/components/ui/Etats";
import { usePatients } from "@/hooks/useReferentiel";
import { depuisIso, jjmmaaaa } from "@/utils/dates";
import { formatNom, formatPrenom, identifiantAffiche } from "@/utils/noms";
import { Section } from "./PageProfil";

const date = (iso?: string | null) => (iso ? jjmmaaaa(depuisIso(iso)) : undefined);

export function PageFichePatient() {
  const id = Number(useParams().patientId);
  const { data: patients, isPending, isError, refetch } = usePatients();
  if (isPending) return <Chargement />;
  if (isError && !patients) return <BandeauHorsLigne message="Impossible de charger la fiche du patient." onReessayer={() => refetch()} />;
  const p = patients?.find((x) => x.id === id);
  if (!p) return <ListeVide texte="Ce patient est introuvable." />;

  return (
    <div className="px-[2.2rem] pb-[2rem]">
      <EnteteDate />
      <h1 className="mt-[0.4rem] text-center text-[2.9rem] font-normal">FICHE PATIENT</h1>
      <div className="mx-auto mt-[1.4rem] w-full max-w-[44rem] text-[1.55rem] leading-[2.15rem]">
        <Section
          titre="Identité"
          lignes={[
            ["Nom", p.nom.toUpperCase()],
            ["Prénom", formatPrenom(p.prenom)],
            ["Date de naissance", date(p.dateNaissance)],
            ["Email", p.email],
            ["Téléphone", p.telephone],
          ]}
        />
        <Section titre="Identification" lignes={[["Identifiant", identifiantAffiche(p)]]} />
        <Section
          titre="Séjour"
          lignes={[
            ["Chambre", p.chambre ? String(p.chambre.numero) : undefined],
            ["Date d’entrée", date(p.dateArrivee)],
            ["Date de sortie prévue", date(p.dateDepartPrevue)],
          ]}
        />
        <ActionsProfil cible={{ id: p.id, type: "patient", nom: p.nom, prenom: p.prenom }} lienModifier={`/patients/${p.id}/profil/modifier`} />
        <p className="mt-[2rem]">
          <Link to={`/patients/${p.id}/agenda`} className="text-lien underline">
            Retour à l’agenda de {formatNom(p)}
          </Link>
        </p>
      </div>
    </div>
  );
}
