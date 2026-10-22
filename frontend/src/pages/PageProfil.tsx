/**
 * « Mon profil » : fiche d'identité de la personne connectée
 * (maquette 15 pour le patient, 14 pour le soignant).
 * Les champs que le backend ne fournit pas encore s'affichent « Non renseigné ».
 * Le mot de passe n'est jamais renvoyé par le backend : il est masqué.
 */
import { EnteteDate } from "@/components/layout/EnteteDate";
import { useUtilisateur } from "@/hooks/useAuth";
import { useSoignants } from "@/hooks/useReferentiel";
import { depuisIso, jjmmaaaa } from "@/utils/dates";

const NON_RENSEIGNE = "Non renseigné";
const date = (iso?: string | null) => (iso ? jjmmaaaa(depuisIso(iso)) : NON_RENSEIGNE);

function Section({ titre, lignes }: { titre: string; lignes: [string, string | undefined | null][] }) {
  return (
    <section className="mt-[1.6rem] first:mt-0" aria-labelledby={`section-${titre}`}>
      <h2 id={`section-${titre}`} className="font-normal underline underline-offset-[0.2rem]">
        {titre} :
      </h2>
      <dl>
        {lignes.map(([libelle, valeur]) => (
          <div key={libelle}>
            <dt className="inline">{libelle} : </dt>
            <dd className={`inline ${valeur ? "" : "text-[#777]"}`}>{valeur || NON_RENSEIGNE}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function PageProfil() {
  const u = useUtilisateur();
  // Le backend actuel ne renvoie pas la profession dans /auth/moi : on la retrouve dans la liste des soignants.
  const soignants = useSoignants(u.role === "soignant" && !u.profession);
  const profession = u.profession ?? soignants.data?.find((s) => s.id === u.id)?.profession;

  const identite: [string, string | undefined | null][] = [
    ["Nom", u.nom],
    ["Prénom", u.prenom],
    ...(u.role === "soignant" ? ([["Profession", profession]] as [string, string | undefined][]) : []),
    ["Date de naissance", u.dateNaissance ? date(u.dateNaissance) : undefined],
    ["Email", u.email],
    ["Téléphone", u.telephone],
  ];

  return (
    <div className="px-[2.2rem] pb-[2rem]">
      <EnteteDate />
      <h1 className="mt-[0.4rem] text-center text-[2.9rem] font-normal">MON PROFIL</h1>
      <div className="mx-auto mt-[1.4rem] w-full max-w-[44rem] text-[1.55rem] leading-[2.15rem]">
        <Section titre="Identité" lignes={identite} />
        <Section
          titre="Identification"
          lignes={[
            ["Identifiant", u.login],
            ["Mot de passe", "••••••••"],
          ]}
        />
        {u.role === "patient" && (
          <Section
            titre="Séjour"
            lignes={[
              ["Chambre", u.chambre ? String(u.chambre.numero) : undefined],
              ["Date d’entrée", u.dateArrivee ? date(u.dateArrivee) : undefined],
            ]}
          />
        )}
      </div>
    </div>
  );
}
