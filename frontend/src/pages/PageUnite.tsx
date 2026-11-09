/**
 * « Unité 0 » / « Unité 1 » (maquettes 20-22) : toutes les chambres de l'unité
 * pour la journée, par ordre croissant. Colonne 1 : chambre et patient (clic →
 * agenda du patient) ; colonne 2 : RDV du matin ; colonne 3 : RDV de l'après-midi
 * (à partir de 13h), en pastilles au code couleur, par ordre chronologique.
 * Unité n = chambres de l'étage n (données du backend).
 *
 * Les flèches autour de la date changent de jour ; la date est surlignée en
 * vert quand c'est aujourd'hui (comme la colonne du jour dans l'agenda).
 * « Ajouter un RDV » (au-dessus de la légende) ouvre le formulaire « Nouveau RDV »
 * à la date affichée.
 *
 * Mise en page : le titre reste en haut, seul le tableau défile (sa barre de
 * défilement est entre le tableau et la légende, qui reste visible à droite).
 */
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { addDays, format, isSameDay } from "date-fns";
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

function Pastille({ rdv, onClick }: { rdv: RendezVous; onClick: () => void }) {
  const fond = couleurRdv(rdv.type.categorie, rdv.type.couleurBackend);
  const horaire = `${heureCourte(depuisIso(rdv.debut))}-${heureCourte(depuisIso(rdv.fin))}`;
  return (
    <button
      type="button"
      onClick={onClick}
      title={rdv.type.libelle}
      aria-label={`${rdv.type.libelle}, ${horaire}`}
      className="min-h-[1.8rem] rounded-full px-[0.75rem] text-[0.8rem] transition hover:brightness-95"
      style={{ backgroundColor: fond, color: couleurTexteSur(fond) }}
    >
      {horaire}
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
      if (r.patient) rdvParPatient.set(r.patient.id, [...(rdvParPatient.get(r.patient.id) ?? []), r]);
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
            matin: rdvs.filter((r) => depuisIso(r.debut).getHours() < DEBUT_APRES_MIDI),
            apresMidi: rdvs.filter((r) => depuisIso(r.debut).getHours() >= DEBUT_APRES_MIDI),
          };
        }),
      );
  }, [occupation.data, rdvJour.data, numeroUnite]);

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
          aria-live="polite"
          className="rounded-full px-[1.6rem] py-[0.35rem] text-center text-[1.2rem] font-normal"
          style={{ backgroundColor: estAujourdhui ? COULEURS_UI.jourActuel : COULEURS_UI.gris }}
        >
          Unité {numeroUnite}, Date : {jjmmaaaa(jour)}
          {estAujourdhui && <span className="sr-only"> (aujourd'hui)</span>}
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
              Rendez-vous du jour, unité {numeroUnite}, par chambre : matin puis après-midi (à partir de {DEBUT_APRES_MIDI}h)
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
                  {[l.matin, l.apresMidi].map((rdvs, i) => (
                    <td key={i} className={cellule}>
                      <div className="flex flex-wrap gap-[0.35rem]">
                        {rdvs.map((r) => (
                          <Pastille key={r.id} rdv={r} onClick={() => setSelection(r)} />
                        ))}
                      </div>
                    </td>
                  ))}
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
