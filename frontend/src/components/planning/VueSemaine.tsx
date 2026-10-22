/**
 * Écran « planning de la semaine », commun au patient et au soignant
 * (même gabarit visuel) : date du jour, bloc nom, bloc « Ajouter un RDV »,
 * navigation entre semaines, planning et pop-ups.
 *
 * Si `modifiable` (soignants) : création, modification, suppression et
 * glisser-déposer. Chaque action part au backend ; seule sa réponse fait foi.
 */
import { useMemo, useState } from "react";
import { addDays, format, isWithinInterval } from "date-fns";
import { EnteteDate } from "@/components/layout/EnteteDate";
import { BandeauHorsLigne, Chargement } from "@/components/ui/Etats";
import { AvertissementModal } from "@/components/rdv/AvertissementModal";
import { RdvFormModal } from "@/components/rdv/RdvFormModal";
import { RdvInfoModal } from "@/components/rdv/RdvInfoModal";
import { useEditionPlanning } from "@/hooks/useEditionPlanning";
import { useRdvSemaine } from "@/hooks/useRdv";
import { rdvApi } from "@/services/api";
import { saisieDepuisRdv } from "@/services/api/rdv";
import type { RendezVous, SaisieRdv } from "@/types";
import { lundiDe } from "@/utils/dates";
import { BlocOrange } from "./BlocOrange";
import { ListeConflits } from "./ListeConflits";
import { NavigationSemaine } from "./NavigationSemaine";
import { PlanningSemaine } from "./PlanningSemaine";

interface Props {
  /** Texte du bloc orange de gauche, ex. « DUPONT Daniel : 101 ». */
  titre: string;
  patientId?: number;
  soignantId?: number;
  /** Création / modification / suppression / glisser-déposer autorisés (soignants). */
  modifiable: boolean;
  /** Valeurs pré-remplies du pop-up « Nouveau RDV ». */
  defautsCreation?: { soignantId?: number; patientIds?: number[] };
  /**
   * Regroupe les RDV identiques (même horaire, type, lieu et soignant) en un
   * seul bloc : séances de groupe côté soignant.
   */
  regrouperSeances?: boolean;
}

type Formulaire =
  | { mode: "creation"; initiale: SaisieRdv }
  | { mode: "modification"; initiale: SaisieRdv; seance: RendezVous[] }
  | null;

const cleSeance = (r: RendezVous) => `${r.debut}|${r.fin}|${r.type.id}|${r.lieu.id}|${r.soignant.id}`;
const nomPatient = (r: RendezVous) => `${r.patient.nom.charAt(0)}${r.patient.nom.slice(1).toLowerCase()} ${r.patient.prenom}`;

export function VueSemaine({ titre, patientId, soignantId, modifiable, defautsCreation, regrouperSeances }: Props) {
  const [lundi, setLundi] = useState(() => lundiDe(new Date()));
  const [selection, setSelection] = useState<RendezVous | null>(null);
  const [formulaire, setFormulaire] = useState<Formulaire>(null);
  const requete = useRdvSemaine({ lundi, patientId, soignantId });
  const edition = useEditionPlanning();
  const rdvs = requete.data ?? [];

  // Séances : un bloc affiché par séance de groupe, la liste des patients dans le pop-up
  const { affiches, groupes } = useMemo(() => {
    const groupes = new Map<string, RendezVous[]>();
    rdvs.forEach((r) => groupes.set(cleSeance(r), [...(groupes.get(cleSeance(r)) ?? []), r]));
    const affiches = regrouperSeances ? [...groupes.values()].map((g) => g[0]) : rdvs;
    return { affiches, groupes };
  }, [rdvs, regrouperSeances]);

  const seanceDe = (r: RendezVous): RendezVous[] => (regrouperSeances ? groupes.get(cleSeance(r)) ?? [r] : [r]);
  const ids = (seance: RendezVous[]) => seance.map((r) => r.id);

  // Surbrillance : un bloc affiché prend la gravité la plus forte de sa séance
  const conflitParBloc = useMemo(() => {
    const m: Record<number, "bloquant" | "avertissement"> = {};
    affiches.forEach((r) => {
      const g = seanceDe(r).map((x) => edition.graviteParRdv[x.id]);
      if (g.includes("bloquant")) m[r.id] = "bloquant";
      else if (g.includes("avertissement")) m[r.id] = "avertissement";
    });
    return m;
  }, [affiches, edition.graviteParRdv, groupes]);

  const blocsEnCours = useMemo(
    () => affiches.filter((r) => seanceDe(r).some((x) => edition.rdvEnCours.includes(x.id))).map((r) => r.id),
    [affiches, edition.rdvEnCours, groupes],
  );

  /* ------------------------------ Actions ------------------------------ */

  const ouvrirCreation = () => {
    if (!modifiable) return; // V1 : sans effet pour le patient
    const aujourdhui = new Date();
    const jour = isWithinInterval(aujourdhui, { start: lundi, end: addDays(lundi, 7) }) ? aujourdhui : lundi;
    const d = format(jour, "yyyy-MM-dd");
    setFormulaire({
      mode: "creation",
      initiale: {
        typeId: 0,
        lieuId: 0,
        soignantId: defautsCreation?.soignantId ?? 0,
        patientIds: defautsCreation?.patientIds ?? [],
        debut: `${d}T09:00:00`,
        fin: `${d}T09:30:00`,
        descriptif: "",
        preparation: "",
      },
    });
  };

  const ouvrirModification = (r: RendezVous) => {
    const seance = seanceDe(r);
    setFormulaire({ mode: "modification", seance, initiale: saisieDepuisRdv(r, seance.map((x) => x.patient.id)) });
  };

  const deplacer = async (r: RendezVous, debut: string, fin: string, revenir: () => void) => {
    const seance = seanceDe(r);
    const ok = await edition.lancer(() => rdvApi.deplacerSeance(seance, debut, fin), ids(seance));
    if (!ok) revenir(); // refus ou erreur : le bloc retourne à sa place d'origine
  };

  const groupeSelection = selection && regrouperSeances ? groupes.get(cleSeance(selection)) : undefined;

  return (
    <div className="flex h-full min-h-[38rem] flex-col px-[2.2rem] pb-[1rem]">
      <EnteteDate />

      <div className="mx-auto mt-[0.5rem] grid w-full max-w-[64rem] grid-cols-2 gap-x-[5rem] px-[3.5rem]">
        <BlocOrange>{titre}</BlocOrange>
        <BlocOrange onClick={ouvrirCreation}>Ajouter un RDV</BlocOrange>
      </div>

      <div className="mt-[0.6rem] space-y-[0.3rem]">
        <NavigationSemaine
          lundi={lundi}
          onPrecedente={() => setLundi((l) => addDays(l, -7))}
          onSuivante={() => setLundi((l) => addDays(l, 7))}
        />
        {requete.isError && requete.data && (
          <BandeauHorsLigne
            message="Connexion au serveur perdue : les dernières données connues sont affichées."
            onReessayer={() => requete.refetch()}
          />
        )}
        <ListeConflits conflits={edition.conflits} onMasquer={edition.effacerConflits} />
      </div>

      <section aria-label={`Planning de la semaine, ${titre}`} className="relative mt-[0.4rem] min-h-0 flex-1">
        {requete.isError && !requete.data ? (
          <div className="grid h-full place-items-center">
            <BandeauHorsLigne message="Impossible de charger le planning." onReessayer={() => requete.refetch()} />
          </div>
        ) : (
          <>
            <PlanningSemaine
              lundi={lundi}
              rdvs={affiches}
              onClicRdv={setSelection}
              onDeplacer={modifiable ? deplacer : undefined}
              rdvEnCours={blocsEnCours}
              rdvEnConflit={conflitParBloc}
            />
            {requete.isPending && (
              <div className="absolute inset-0 grid place-items-center bg-white/60">
                <Chargement texte="Chargement du planning…" />
              </div>
            )}
            {requete.isSuccess && rdvs.length === 0 && (
              <p className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-[1.1rem] text-[#444]">
                Aucun rendez-vous cette semaine.
              </p>
            )}
          </>
        )}
      </section>

      {selection && (
        <RdvInfoModal
          rdv={selection}
          patientsDuGroupe={groupeSelection?.map(nomPatient)}
          onFermer={() => setSelection(null)}
          onModifier={
            modifiable
              ? () => {
                  setSelection(null);
                  ouvrirModification(selection);
                }
              : undefined
          }
        />
      )}

      {formulaire?.mode === "creation" && (
        <RdvFormModal
          mode="creation"
          initiale={formulaire.initiale}
          onFermer={() => setFormulaire(null)}
          onValider={(s) => edition.lancer(() => rdvApi.creerSeance(s))}
        />
      )}

      {formulaire?.mode === "modification" && (
        <RdvFormModal
          mode="modification"
          initiale={formulaire.initiale}
          original={formulaire.seance[0]}
          onFermer={() => setFormulaire(null)}
          onValider={(s) => edition.lancer(() => rdvApi.modifierSeance(formulaire.seance, s), ids(formulaire.seance))}
          onSupprimer={() => edition.lancer(() => rdvApi.supprimerSeance(formulaire.seance), ids(formulaire.seance))}
        />
      )}

      {edition.avertissement && (
        <AvertissementModal
          conflits={edition.avertissement.conflits}
          onConserver={edition.conserver}
          onRenoncer={edition.renoncer}
        />
      )}
    </div>
  );
}
