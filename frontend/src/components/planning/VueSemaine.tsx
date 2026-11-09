/**
 * Écran « planning de la semaine », commun au patient et au soignant
 * (même gabarit visuel) : date du jour, bloc nom, bloc « Ajouter un RDV »,
 * navigation entre semaines, planning et pop-ups.
 *
 * Si `modifiable` (soignants) : création, modification, suppression et
 * glisser-déposer. Chaque action part au backend ; seule sa réponse fait foi.
 * Si `patientConnecte` (patient) : il ajoute des visites pour lui-même, et
 * modifie ou supprime seulement les visites qu'il a ajoutées.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import type { PatientResume, RendezVous, SaisieRdv } from "@/types";
import { lundiDe } from "@/utils/dates";
import { formatNom } from "@/utils/noms";
import { BlocOrange } from "./BlocOrange";
import { ListeConflits } from "./ListeConflits";
import { NavigationSemaine } from "./NavigationSemaine";
import { PlanningSemaine } from "./PlanningSemaine";
import { ListeEnAttente } from "./ListeEnAttente";

interface Props {
  /** Texte du bloc orange de gauche, ex. « DUPONT Daniel : 101 ». */
  titre: string;
  /** Page ouverte en cliquant sur le bloc du nom (profil ou fiche patient). */
  lienTitre?: string;
  patientId?: number;
  soignantId?: number;
  /** Création / modification / suppression / glisser-déposer autorisés (soignants). */
  modifiable: boolean;
  /** Valeurs pré-remplies du pop-up « Nouveau RDV ». */
  defautsCreation?: { soignantIds?: number[]; patientIds?: number[] };
  /** Agenda vu par le patient lui-même : il peut ajouter ses visites. */
  patientConnecte?: PatientResume;
  /**
   * Regroupe les RDV identiques (même horaire, type, lieu et soignants) en un
   * seul bloc : séances de groupe côté soignant.
   */
  regrouperSeances?: boolean;
}

type Formulaire =
  | { mode: "creation"; initiale: SaisieRdv }
  | { mode: "modification"; initiale: SaisieRdv; seance: RendezVous[] }
  | null;

const cleSeance = (r: RendezVous) =>
  `${r.debut}|${r.fin}|${r.type.id}|${r.lieu.id}|${r.soignants.map((s) => s.id).sort((a, b) => a - b).join(",")}`;

/** Une visite que ce patient a ajoutée lui-même : il peut la modifier ou la supprimer. */
const visiteDuPatient = (r: RendezVous, p: PatientResume) =>
  r.type.categorie === "visite" && r.createurId === p.id && r.patient?.id === p.id;

export function VueSemaine({ titre, lienTitre, patientId, soignantId, modifiable, defautsCreation, patientConnecte, regrouperSeances }: Props) {
  const navigate = useNavigate();
  const [lundi, setLundi] = useState(() => lundiDe(new Date()));
  const [selection, setSelection] = useState<RendezVous | null>(null);
  const [formulaire, setFormulaire] = useState<Formulaire>(null);
  const requete = useRdvSemaine({ lundi, patientId, soignantId });
  const edition = useEditionPlanning();
  // Les RDV « en attente » n'ont pas encore d'heure : ils ne vont pas dans la
  // grille mais dans le bandeau « À planifier » (soignants uniquement).
  const rdvs = useMemo(() => (requete.data ?? []).filter((r) => r.statut !== "en_attente"), [requete.data]);
  const enAttente = useMemo(
    () => (patientConnecte ? [] : (requete.data ?? []).filter((r) => r.statut === "en_attente")),
    [requete.data, patientConnecte],
  );

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
    if (!modifiable && !patientConnecte) return;
    const aujourdhui = new Date();
    const jour = isWithinInterval(aujourdhui, { start: lundi, end: addDays(lundi, 7) }) ? aujourdhui : lundi;
    const d = format(jour, "yyyy-MM-dd");
    setFormulaire({
      mode: "creation",
      initiale: {
        typeId: 0,
        lieuId: 0,
        soignantIds: defautsCreation?.soignantIds ?? [],
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
    setFormulaire({ mode: "modification", seance, initiale: saisieDepuisRdv(r, seance.flatMap((x) => (x.patient ? [x.patient.id] : []))) });
  };

  const deplacer = async (r: RendezVous, debut: string, fin: string, revenir: () => void) => {
    const seance = seanceDe(r);
    const ok = await edition.lancer(() => rdvApi.deplacerSeance(seance, debut, fin), ids(seance));
    if (!ok) revenir(); // refus ou erreur : le bloc retourne à sa place d'origine
  };

  const groupeSelection = selection && regrouperSeances ? groupes.get(cleSeance(selection)) : undefined;
  const peutModifier = (r: RendezVous) => modifiable || (patientConnecte !== undefined && visiteDuPatient(r, patientConnecte));

  return (
    <div className="flex h-full min-h-[38rem] flex-col px-[2.2rem] pb-[1rem]">
      <EnteteDate />

      <div className="mx-auto mt-[0.5rem] grid w-full max-w-[64rem] grid-cols-2 gap-x-[5rem] px-[3.5rem]">
        <BlocOrange onClick={lienTitre ? () => navigate(lienTitre) : undefined} titreBulle={lienTitre ? "Voir la fiche" : undefined}>
          {titre}
        </BlocOrange>
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
        <ListeEnAttente rdvs={enAttente} onOuvrir={setSelection} />
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
          </>
        )}
      </section>

      {selection && (
        <RdvInfoModal
          rdv={selection}
          patientsDuGroupe={groupeSelection?.flatMap((x) => (x.patient ? [formatNom(x.patient)] : []))}
          onFermer={() => setSelection(null)}
          onModifier={
            peutModifier(selection)
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
          patientConnecte={patientConnecte}
          onFermer={() => setFormulaire(null)}
          onValider={(s) => edition.lancer(() => rdvApi.creerSeance(s))}
        />
      )}

      {formulaire?.mode === "modification" && (
        <RdvFormModal
          mode="modification"
          initiale={formulaire.initiale}
          original={formulaire.seance[0]}
          patientConnecte={patientConnecte}
          onFermer={() => setFormulaire(null)}
          onValider={(s) => edition.lancer(() => rdvApi.modifierSeance(formulaire.seance, s), ids(formulaire.seance))}
          onSupprimer={() => edition.lancer(() => rdvApi.supprimerSeance(formulaire.seance), ids(formulaire.seance))}
        />
      )}

      {edition.avertissement && (
        <AvertissementModal
          key={edition.avertissement.index}
          conflit={edition.avertissement.conflits[edition.avertissement.index]}
          position={edition.avertissement.index + 1}
          total={edition.avertissement.conflits.length}
          onContinuer={edition.continuer}
          onRenoncer={edition.renoncer}
        />
      )}
    </div>
  );
}
