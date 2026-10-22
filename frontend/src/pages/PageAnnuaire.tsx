/**
 * « Annuaire » (pas de maquette) : choisir un patient pour ouvrir son agenda.
 * Mise en forme reprise de la charte : titre comme « MON PROFIL », blocs orange
 * « NOM Prénom : chambre » comme sur le planning. Patients présents aujourd'hui
 * rangés par unité, puis les autres (séjour terminé ou à venir).
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { EnteteDate } from "@/components/layout/EnteteDate";
import { BandeauHorsLigne, Chargement, ListeVide } from "@/components/ui/Etats";
import { usePatients } from "@/hooks/useReferentiel";
import type { Patient } from "@/types";
import { depuisIso, jjmmaaaa } from "@/utils/dates";

const normaliser = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function CartePatient({ p, present }: { p: Patient; present: boolean }) {
  return (
    <li>
      <Link
        to={`/patients/${p.id}/agenda`}
        className="flex min-h-[3.4rem] flex-col items-center justify-center rounded-charte bg-orange px-[0.8rem] py-[0.4rem] text-center transition hover:brightness-95"
      >
        <span className="text-[1.15rem] font-bold leading-tight">
          {p.nom} {p.prenom}
          {p.chambre ? ` : ${p.chambre.numero}` : ""}
        </span>
        {!present && (
          <span className="text-[0.8rem] text-[#555]">
            séjour du {jjmmaaaa(depuisIso(p.dateArrivee))}
            {p.dateDepartPrevue ? ` au ${jjmmaaaa(depuisIso(p.dateDepartPrevue))}` : ""}
          </span>
        )}
      </Link>
    </li>
  );
}

export function PageAnnuaire() {
  const patients = usePatients();
  const [recherche, setRecherche] = useState("");
  const jour = format(new Date(), "yyyy-MM-dd");

  const sections = useMemo(() => {
    const filtre = normaliser(recherche.trim());
    const liste = (patients.data ?? [])
      .filter((p) => !filtre || normaliser(`${p.nom} ${p.prenom} ${p.chambre?.numero ?? ""}`).includes(filtre))
      .sort(
        (a, b) =>
          (a.chambre?.numero ?? 9999) - (b.chambre?.numero ?? 9999) ||
          `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, "fr", { numeric: true }),
      );
    const estPresent = (p: Patient) => p.dateArrivee <= jour && (!p.dateDepartPrevue || p.dateDepartPrevue >= jour);
    const presents = liste.filter(estPresent);
    // Unités par étage croissant, puis les patients sans chambre (hôpital de jour) à la fin
    const etages = [...new Set(presents.map((p) => p.chambre?.etage ?? 999))].sort((a, b) => a - b);
    return [
      ...etages.map((e) => ({
        titre: e === 999 ? "Sans chambre (hôpital de jour)" : `Unité ${e}`,
        present: true,
        patients: presents.filter((p) => (p.chambre?.etage ?? 999) === e),
      })),
      { titre: "Autres patients (séjour terminé ou à venir)", present: false, patients: liste.filter((p) => !estPresent(p)) },
    ].filter((s) => s.patients.length);
  }, [patients.data, recherche, jour]);

  return (
    <div className="px-[2.2rem] pb-[2rem]">
      <EnteteDate />
      <h1 className="mt-[0.4rem] text-center text-[2.9rem] font-normal">ANNUAIRE</h1>

      <div className="mx-auto mt-[1rem] max-w-[60rem]">
        <label className="flex items-center gap-[1rem] border border-black px-[0.6rem] text-[1.15rem]">
          <span className="shrink-0">Rechercher :</span>
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="NOM, prénom ou numéro de chambre"
            className="min-w-0 flex-1 bg-transparent py-[0.6rem] outline-none placeholder:italic placeholder:text-[#8a8a8a]"
          />
        </label>

        {patients.isError && patients.data && (
          <div className="mt-[0.6rem]">
            <BandeauHorsLigne message="Connexion au serveur perdue : liste peut-être incomplète." onReessayer={() => patients.refetch()} />
          </div>
        )}

        {patients.isPending ? (
          <Chargement texte="Chargement des patients…" />
        ) : patients.isError && !patients.data ? (
          <div className="mt-[1rem]">
            <BandeauHorsLigne message="Impossible de charger la liste des patients." onReessayer={() => patients.refetch()} />
          </div>
        ) : sections.length === 0 ? (
          <ListeVide texte="Aucun patient ne correspond à la recherche." />
        ) : (
          sections.map((s) => (
            <section key={s.titre} className="mt-[1.6rem]" aria-labelledby={`annuaire-${s.titre}`}>
              <h2 id={`annuaire-${s.titre}`} className="mb-[0.6rem] text-[1.4rem] font-normal underline underline-offset-[0.2rem]">
                {s.titre} :
              </h2>
              <ul className="grid grid-cols-3 gap-[0.8rem]">
                {s.patients.map((p) => (
                  <CartePatient key={p.id} p={p} present={s.present} />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
