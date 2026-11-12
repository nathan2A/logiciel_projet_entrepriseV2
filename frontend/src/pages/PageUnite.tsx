/**
 * « Unité 0 » / « Unité 1 » (maquettes 20-22) : toutes les chambres de l'unité
 * pour la journée, par ordre croissant. Colonne 1 : chambre et patient (clic →
 * agenda du patient) ; colonne 2 : matin ; colonne 3 : après-midi (à partir
 * de 13h). Les RDV sont des pastilles au code couleur placées sur une échelle
 * de temps (maquette 27) : leur longueur est proportionnelle à leur durée, un
 * RDV long peut passer d'une colonne à l'autre et des RDV simultanés se
 * superposent (le plus court au-dessus ; survol : horaire complet).
 * Unité n = chambres de l'étage n (données du backend).
 *
 * Les flèches autour de la date changent de jour ; cliquer sur la date permet
 * d'en choisir ou d'en écrire une. La date est surlignée en vert quand c'est
 * aujourd'hui (comme la colonne du jour dans l'agenda).
 * « Ajouter un RDV » (au-dessus de la légende) ouvre le formulaire « Nouveau RDV »
 * à la date affichée.
 *
 * Mise en page : le titre reste en haut, seul le tableau défile (sa barre de
 * défilement est entre le tableau et la légende, qui reste visible à droite).
 */
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { addDays, format, isSameDay, isValid, parseISO } from "date-fns";
import { FaCaretLeft, FaCaretRight } from "react-icons/fa6";
import { BlocOrange } from "@/components/planning/BlocOrange";
import { AvertissementModal } from "@/components/rdv/AvertissementModal";
import { RdvFormModal } from "@/components/rdv/RdvFormModal";
import { RdvInfoModal } from "@/components/rdv/RdvInfoModal";
import { BandeauHorsLigne, Chargement, ListeVide } from "@/components/ui/Etats";
import { LegendeCouleurs } from "@/components/unite/LegendeCouleurs";
import { useUtilisateur } from "@/hooks/useAuth";
import { useEditionPlanning } from "@/hooks/useEditionPlanning";
import { useRdvJour } from "@/hooks/useRdv";
import { useOccupation } from "@/hooks/useReferentiel";
import { rdvApi } from "@/services/api";
import { saisieDepuisRdv } from "@/services/api/rdv";
import { couleurRdv, couleurTexteSur, COULEURS_UI } from "@/theme/couleursRdv";
import type { PatientResume, RendezVous, SaisieRdv } from "@/types";
import { depuisIso, heureCourte, jjmmaaaa } from "@/utils/dates";
import { formatNom } from "@/utils/noms";

/** Heure de coupure entre la colonne « matin » et la colonne « après-midi ». */
const DEBUT_APRES_MIDI = 13;
/** Échelle de temps par défaut, élargie si des RDV du jour commencent avant ou finissent après. */
const DEBUT_ECHELLE = 8;
const FIN_ECHELLE = 19;

/** Heure décimale d'un RDV (une fin le lendemain compte pour 24h). */
const heureDecimale = (iso: string, jourRef: Date) => {
  const d = depuisIso(iso);
  return isSameDay(d, jourRef) ? d.getHours() + d.getMinutes() / 60 : d < jourRef ? 0 : 24;
};

/** Trait vertical au milieu de la case : séparation matin / après-midi (toute la hauteur). */
const SEPARATION_MIDI = {
  backgroundImage: "linear-gradient(#000, #000)",
  backgroundSize: "0.15rem 100%",
  backgroundPosition: "center",
  backgroundRepeat: "no-repeat",
} as const;

interface Echelle {
  debut: number;
  fin: number;
}

/** Position (en % de la ligne) d'une heure : matin sur la 1re moitié, après-midi sur la 2de. */
function position(h: number, e: Echelle): number {
  const x = Math.min(Math.max(h, e.debut), e.fin);
  return x <= DEBUT_APRES_MIDI
    ? ((x - e.debut) / (DEBUT_APRES_MIDI - e.debut)) * 50
    : 50 + ((x - DEBUT_APRES_MIDI) / (e.fin - DEBUT_APRES_MIDI)) * 50;
}

function Pastille({ rdv, echelle, jour, onClick }: { rdv: RendezVous; echelle: Echelle; jour: Date; onClick: () => void }) {
  const fond = couleurRdv(rdv.type.categorie, rdv.type.couleurBackend);
  const horaire = `${heureCourte(depuisIso(rdv.debut))}-${heureCourte(depuisIso(rdv.fin))}`;
  const gauche = position(heureDecimale(rdv.debut, jour), echelle);
  const droite = position(heureDecimale(rdv.fin, jour), echelle);
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${rdv.type.libelle}, ${horaire}`}
      aria-label={`${rdv.type.libelle}, ${horaire}`}
      className="pastille-unite absolute top-1/2 z-10 h-[1.8rem] min-w-[1.4rem] -translate-y-1/2 overflow-hidden whitespace-nowrap rounded-full px-[0.3rem] text-left text-[0.8rem] leading-[1.8rem] shadow-[0_0_0_1px_rgba(255,255,255,0.7)] transition hover:z-30 hover:min-w-[5.2rem] hover:brightness-95 focus-visible:z-30 focus-visible:min-w-[5.2rem]"
      style={{ left: `${gauche}%`, width: `${Math.max(droite - gauche, 0)}%`, backgroundColor: fond, color: couleurTexteSur(fond) }}
    >
      {/* Texte adapté à la longueur de la pastille (voir .pastille-unite dans index.css) */}
      <span aria-hidden className="horaire-complet">{horaire}</span>
      <span aria-hidden className="horaire-debut">{heureCourte(depuisIso(rdv.debut))}</span>
    </button>
  );
}

export function PageUnite() {
  const numeroUnite = Number(useParams().numero);
  const moi = useUtilisateur();
  const [jour, setJour] = useState(() => new Date());
  const estAujourdhui = isSameDay(jour, new Date());
  const occupation = useOccupation(format(jour, "yyyy-MM-dd"));
  const rdvJour = useRdvJour(jour);
  const edition = useEditionPlanning();
  const [selection, setSelection] = useState<RendezVous | null>(null);
  const [aModifier, setAModifier] = useState<RendezVous | null>(null);
  const [creation, setCreation] = useState<SaisieRdv | null>(null);

  /** « Ajouter un RDV » : formulaire vide à la date affichée, la personne connectée comme soignant. */
  const ouvrirCreation = () => {
    const d = format(jour, "yyyy-MM-dd");
    setCreation({
      typeId: 0,
      lieuId: 0,
      soignantIds: [moi.id],
      patientIds: [],
      debut: `${d}T09:00:00`,
      fin: `${d}T09:30:00`,
      descriptif: "",
      preparation: "",
    });
  };

  /** Une ligne par patient présent ; une chambre vide garde une ligne avec son seul numéro. */
  const lignes = useMemo(() => {
    const rdvParPatient = new Map<number, RendezVous[]>();
    (rdvJour.data ?? []).forEach((r) => {
      // Un RDV en attente n'a pas encore d'heure : il apparaîtra après « Synchroniser »
      if (r.patient && r.statut !== "en_attente") rdvParPatient.set(r.patient.id, [...(rdvParPatient.get(r.patient.id) ?? []), r]);
    });
    return (occupation.data ?? [])
      .filter((o) => o.chambre.etage === numeroUnite)
      .sort((a, b) => a.chambre.numero - b.chambre.numero)
      .flatMap((o) =>
        (o.patients.length ? o.patients : [null]).map((p: PatientResume | null) => {
          const rdvs = p ? [...(rdvParPatient.get(p.id) ?? [])].sort((a, b) => a.debut.localeCompare(b.debut)) : [];
          return {
            cle: `${o.chambre.id}-${p?.id ?? "vide"}`,
            numero: o.chambre.numero,
            patient: p,
            // Les plus longs d'abord : les plus courts s'affichent par-dessus
            rdvs: [...rdvs].sort((a, b) => depuisIso(b.fin).getTime() - depuisIso(b.debut).getTime() - (depuisIso(a.fin).getTime() - depuisIso(a.debut).getTime()) || a.debut.localeCompare(b.debut)),
          };
        }),
      );
  }, [occupation.data, rdvJour.data, numeroUnite]);

  /** Même échelle pour toutes les lignes de la journée. */
  const echelle = useMemo<Echelle>(() => {
    const tous = lignes.flatMap((l) => l.rdvs);
    const debut = Math.min(DEBUT_ECHELLE, ...tous.map((r) => Math.floor(heureDecimale(r.debut, jour))));
    const fin = Math.max(FIN_ECHELLE, ...tous.map((r) => Math.ceil(heureDecimale(r.fin, jour))));
    return { debut: Math.min(debut, DEBUT_APRES_MIDI - 1), fin: Math.max(fin, DEBUT_APRES_MIDI + 1) };
  }, [lignes, jour]);

  const fleche =
    "grid h-[2.2rem] w-[2.2rem] place-items-center rounded-full text-[1.5rem] text-[#777] transition hover:bg-gris hover:text-black";

  const enErreur = occupation.isError || rdvJour.isError;
  const cellule = "border-[0.15rem] border-black px-[0.5rem] py-[0.35rem] align-middle";

  return (
    <div className="flex h-full min-h-[30rem] flex-col px-[2.2rem] pb-[1rem]">
      <div className="flex shrink-0 items-center justify-center gap-[0.6rem] pb-[0.3rem] pt-[0.6rem]">
        <span aria-hidden className="w-[6.5rem]" />
        <button type="button" onClick={() => setJour((j) => addDays(j, -1))} aria-label="Jour précédent" title="Jour précédent" className={fleche}>
          <FaCaretLeft aria-hidden />
        </button>
        <h1
          className="flex items-center rounded-full px-[1.6rem] py-[0.35rem] text-center text-[1.2rem] font-normal"
          style={{ backgroundColor: estAujourdhui ? COULEURS_UI.jourActuel : COULEURS_UI.gris }}
        >
          <span aria-hidden>Unité {numeroUnite}, Date :&nbsp;</span>
          <span className="sr-only" aria-live="polite">
            Unité {numeroUnite}, date : {jjmmaaaa(jour)}
            {estAujourdhui && " (aujourd'hui)"}
          </span>
          {/* Cliquer sur la date ouvre le calendrier ; on peut aussi l'écrire au clavier */}
          <input
            type="date"
            aria-label="Choisir la date"
            title="Choisir une date"
            value={format(jour, "yyyy-MM-dd")}
            onClick={(e) => {
              try {
                e.currentTarget.showPicker();
              } catch {
                /* navigateur sans calendrier : saisie au clavier */
              }
            }}
            onChange={(e) => {
              const d = parseISO(e.target.value);
              // Pendant la saisie de l'année au clavier, on attend une année complète
              if (e.target.value && isValid(d) && d.getFullYear() >= 2000 && d.getFullYear() <= 2100) setJour(d);
            }}
            className="date-unite cursor-pointer bg-transparent text-[1.2rem] outline-none"
          />
        </h1>
        <button type="button" onClick={() => setJour((j) => addDays(j, 1))} aria-label="Jour suivant" title="Jour suivant" className={fleche}>
          <FaCaretRight aria-hidden />
        </button>
        {/* Retour à aujourd'hui ; place réservée (invisible) pour que la date ne bouge pas */}
        <button
          type="button"
          onClick={() => setJour(new Date())}
          className={`w-[6.5rem] text-left text-[0.95rem] text-lien underline ${estAujourdhui ? "invisible" : ""}`}
          tabIndex={estAujourdhui ? -1 : undefined}
          aria-hidden={estAujourdhui || undefined}
        >
          Aujourd'hui
        </button>
      </div>

      {enErreur && (occupation.data || rdvJour.data) && (
        <div className="mx-auto mt-[0.5rem] w-full max-w-[50rem] shrink-0">
          <BandeauHorsLigne
            message="Connexion au serveur perdue : les dernières données connues sont affichées."
            onReessayer={() => {
              occupation.refetch();
              rdvJour.refetch();
            }}
          />
        </div>
      )}

      <div className="mt-[0.6rem] flex min-h-0 flex-1 items-start gap-[1.2rem] pr-[1rem]">
        <div className="max-h-full min-w-0 flex-1 overflow-y-auto pr-[0.3rem]" data-testid="defilement-unite">
        {occupation.isPending || rdvJour.isPending ? (
          <Chargement texte="Chargement de l'unité…" />
        ) : enErreur && !occupation.data ? (
          <BandeauHorsLigne message="Impossible de charger l'unité." onReessayer={() => occupation.refetch()} />
        ) : lignes.length === 0 ? (
          <ListeVide texte={`Aucune chambre trouvée pour l'unité ${numeroUnite}.`} />
        ) : (
          <table className="w-full table-fixed border-collapse">
            <caption className="sr-only">
              Rendez-vous du jour, unité {numeroUnite}, par chambre : matin puis après-midi (à partir de {DEBUT_APRES_MIDI}h),
              sur une échelle de temps de {echelle.debut}h à {echelle.fin}h
            </caption>
            <colgroup>
              <col className="w-[18%]" />
              <col />
              <col />
            </colgroup>
            <thead className="sr-only">
              <tr>
                <th scope="col">Chambre et patient</th>
                <th scope="col">Matin</th>
                <th scope="col">Après-midi</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.cle} className="h-[2.6rem]">
                  <th scope="row" className={`${cellule} p-0 text-center text-[0.85rem] font-normal`}>
                    {l.patient ? (
                      <Link
                        to={`/patients/${l.patient.id}/agenda`}
                        className="flex h-full min-h-[2.4rem] w-full items-center justify-center px-[0.4rem] transition hover:bg-orange"
                        aria-label={`Agenda de ${formatNom(l.patient)}, chambre ${l.numero}`}
                      >
                        <span>
                          {formatNom(l.patient)} <strong>{l.numero}</strong>
                        </span>
                      </Link>
                    ) : (
                      <span aria-label={`Chambre ${l.numero}, inoccupée`}>{l.numero}</span>
                    )}
                  </th>
                  {/* Matin et après-midi : une seule case sur deux colonnes, séparées par un trait */}
                  <td colSpan={2} className={`${cellule} p-0`} style={SEPARATION_MIDI}>
                    <div className="relative h-[2.4rem] w-full">
                      {l.rdvs.map((r) => (
                        <Pastille key={r.id} rdv={r} echelle={echelle} jour={jour} onClick={() => setSelection(r)} />
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        </div>

        <div className="w-[11rem] shrink-0 space-y-[1rem]">
          <BlocOrange onClick={ouvrirCreation}>
            <span className="text-[1.1rem]">Ajouter un RDV</span>
          </BlocOrange>
          <LegendeCouleurs />
        </div>
      </div>

      {selection && (
        <RdvInfoModal
          rdv={selection}
          onFermer={() => setSelection(null)}
          onModifier={() => {
            setAModifier(selection);
            setSelection(null);
          }}
        />
      )}

      {creation && (
        <RdvFormModal
          mode="creation"
          initiale={creation}
          onFermer={() => setCreation(null)}
          onValider={(s) => edition.lancer(() => rdvApi.creerSeance(s))}
        />
      )}

      {aModifier && (
        <RdvFormModal
          mode="modification"
          initiale={saisieDepuisRdv(aModifier)}
          original={aModifier}
          onFermer={() => setAModifier(null)}
          onValider={(s) => edition.lancer(() => rdvApi.modifierSeance([aModifier], s), [aModifier.id])}
          onSupprimer={() => edition.lancer(() => rdvApi.supprimerSeance([aModifier]), [aModifier.id])}
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
