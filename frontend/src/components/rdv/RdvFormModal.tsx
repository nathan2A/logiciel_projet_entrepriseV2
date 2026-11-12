/**
 * Pop-ups « Nouveau RDV » (maquette 13) et « Modifier le RDV » (maquette 12).
 * Même formulaire : Nom RDV, Couleur RDV, Descriptif, Horaire, Lieu,
 * Soignant(s), Patients(s), Date, Préparation antérieure.
 *
 * Le formulaire vérifie seulement que la saisie est complète et cohérente
 * (fin après début, au moins un patient ou un soignant…). Les règles du
 * planning (conflits) sont vérifiées par le backend.
 *
 * « À planifier automatiquement » (soignants) : le RDV est créé « en attente »,
 * avec seulement un jour et une durée ; le solveur choisit l'heure au prochain
 * « Synchroniser ». Décocher la case redonne un horaire fixe.
 *
 * Mode patient : le patient ajoute ou modifie une visite ou un RDV extérieur
 * pour lui-même (lieu « Extérieur » proposé pour un RDV extérieur).
 * Nom RDV = Visite, Soignant(s) = Aucun et Patient = lui-même sont imposés ;
 * le lieu est « Chambre du patient » par défaut et reste modifiable.
 */
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { Modal } from "@/components/ui/Modal";
import { Chargement } from "@/components/ui/Etats";
import { useLieux, usePatients, useSoignants, useTypesRdv } from "@/hooks/useReferentiel";
import { couleurRdv, ORDRE_CATEGORIES } from "@/theme/couleursRdv";
import type { PatientResume, RendezVous, SaisieRdv, TypeRdv } from "@/types";
import { depuisIso, plageHoraire } from "@/utils/dates";
import { formatNom } from "@/utils/noms";
import { SelectPersonnes } from "./SelectPersonnes";

interface Props {
  mode: "creation" | "modification";
  initiale: SaisieRdv;
  /** Modification : RDV d'origine (bandeau de titre à sa couleur). */
  original?: RendezVous;
  /** Renvoie true si l'action a été enregistrée (le pop-up se ferme alors). */
  onValider: (s: SaisieRdv) => Promise<boolean>;
  onSupprimer?: () => Promise<boolean>;
  onFermer: () => void;
  /** Formulaire ouvert par un patient (visite pour lui-même). */
  patientConnecte?: PatientResume;
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const sansAccents = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const DUREES = Array.from({ length: 48 }, (_, i) => (i + 1) * 5); // 5 min à 4 h
const HEURE_PROVISOIRE = 8 * 60; // horaire provisoire d'un RDV en attente (seule la durée compte)

/**
 * Choix d'une heure : champ où l'on peut écrire l'heure au clavier (« 14:35 »),
 * les flèches avancent par pas de 5 minutes.
 */
function ChoixHeure({ id, valeur, onChange, libelle }: { id: string; valeur: string; onChange: (v: string) => void; libelle: string }) {
  return (
    <input
      id={id}
      type="time"
      step={300}
      aria-label={libelle}
      className="champ-rdv not-italic"
      value={valeur}
      onChange={(e) => onChange(e.target.value.slice(0, 5))}
    />
  );
}

const rangType = (t: TypeRdv) => {
  const i = ORDRE_CATEGORIES.indexOf(t.categorie as (typeof ORDRE_CATEGORIES)[number]);
  return i === -1 ? 99 : i;
};

/** Une ligne « Libellé : champ » de la maquette. */
function Ligne({ libelle, id, idLibelle, children }: { libelle: string; id?: string; idLibelle?: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-[0.5rem]">
      <label id={idLibelle} htmlFor={id} className="shrink-0 not-italic">
        {libelle} :
      </label>
      {children}
    </div>
  );
}

export function RdvFormModal({ mode, initiale, original, onValider, onSupprimer, onFermer, patientConnecte }: Props) {
  const modePatient = patientConnecte !== undefined;
  const types = useTypesRdv();
  const lieux = useLieux();
  // Un patient n'a pas accès aux listes des soignants et des patients (inutiles ici)
  const soignants = useSoignants(!modePatient);
  const patients = usePatients(!modePatient);
  const ids = { type: useId(), desc: useId(), debut: useId(), fin: useId(), lieu: useId(), soignant: useId(), patients: useId(), date: useId(), prep: useId(), auto: useId(), duree: useId() };

  const [typeId, setTypeId] = useState(initiale.typeId ? String(initiale.typeId) : "");
  const [descriptif, setDescriptif] = useState(initiale.descriptif);
  const [date, setDate] = useState(initiale.debut.slice(0, 10));
  const [heureDebut, setHeureDebut] = useState(initiale.debut.slice(11, 16));
  const [heureFin, setHeureFin] = useState(initiale.fin.slice(11, 16));
  const [finChoisie, setFinChoisie] = useState(mode === "modification"); // sinon : durée par défaut du type
  const [lieuId, setLieuId] = useState(initiale.lieuId ? String(initiale.lieuId) : "");
  const [soignantIds, setSoignantIds] = useState(modePatient ? [] : initiale.soignantIds);
  const [patientIds, setPatientIds] = useState(modePatient ? [patientConnecte.id] : initiale.patientIds);
  const [preparation, setPreparation] = useState(initiale.preparation);
  const [aPlanifier, setAPlanifier] = useState(initiale.statut === "en_attente");
  const [duree, setDuree] = useState(() => {
    const d = minutes(initiale.fin.slice(11, 16)) - minutes(initiale.debut.slice(11, 16));
    return d > 0 ? Math.ceil(d / 5) * 5 : 30;
  });
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const [confirmerSuppression, setConfirmerSuppression] = useState(false);

  const typesTries = useMemo(() => [...(types.data ?? [])].sort((a, b) => rangType(a) - rangType(b) || a.libelle.localeCompare(b.libelle)), [types.data]);
  const typeChoisi = typesTries.find((t) => String(t.id) === typeId);
  const couleur = typeChoisi ? couleurRdv(typeChoisi.categorie, typeChoisi.couleurBackend) : null;

  /** Fin proposée automatiquement = début + durée par défaut du type (tant que l'utilisateur n'a pas choisi). */
  const ajusterFin = (debut: string, type: TypeRdv | undefined) => {
    if (finChoisie || !debut || !type) return;
    setHeureFin(hhmm(minutes(debut) + type.dureeParDefaut));
    setDuree(Math.ceil(type.dureeParDefaut / 5) * 5);
  };

  // Mode patient : seulement « Visite » et « RDV extérieur »
  const typesPatient = useMemo(
    () => (types.data ?? []).filter((t) => t.categorie === "visite" || t.categorie === "rdv_exterieur"),
    [types.data],
  );
  const lieuPourType = (t: TypeRdv | undefined) => {
    const l = (lieux.data ?? []).find((x) =>
      t?.categorie === "rdv_exterieur" ? sansAccents(x.libelle).includes("exterieur") : sansAccents(x.libelle).includes("chambre"),
    );
    if (l) setLieuId(String(l.id));
  };

  // Mode patient : Nom RDV = Visite, lieu = Chambre du patient par défaut
  useEffect(() => {
    if (!modePatient) return;
    if (!typeId && types.data) {
      const visite = types.data.find((t) => sansAccents(t.libelle).startsWith("visite"));
      if (visite) {
        setTypeId(String(visite.id));
        ajusterFin(heureDebut, visite);
      }
    }
    if (!lieuId && lieux.data) {
      const chambre = lieux.data.find((l) => sansAccents(l.libelle).includes("chambre"));
      if (chambre) setLieuId(String(chambre.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modePatient, types.data, lieux.data]);

  const optionsSoignants = useMemo(
    () =>
      [...(soignants.data ?? [])]
        .sort((a, b) => formatNom(a).localeCompare(formatNom(b)))
        .map((s) => ({ id: s.id, libelle: formatNom(s), detail: s.profession })),
    [soignants.data],
  );
  const optionsPatients = useMemo(
    () =>
      [...(patients.data ?? [])]
        .sort((a, b) => (a.chambre?.numero ?? 9999) - (b.chambre?.numero ?? 9999) || formatNom(a).localeCompare(formatNom(b)))
        .map((p) => ({ id: p.id, libelle: formatNom(p), detail: p.chambre ? `ch. ${p.chambre.numero}` : undefined })),
    [patients.data],
  );

  const chargement = types.isPending || lieux.isPending || (!modePatient && (soignants.isPending || patients.isPending));
  const erreurChargement = types.isError || lieux.isError || (!modePatient && (soignants.isError || patients.isError));

  const valider = async () => {
    const e: string[] = [];
    if (!typeId) e.push("Choisissez le nom du RDV.");
    if (!date) e.push("Indiquez la date.");
    if (aPlanifier) {
      if (date && date < format(new Date(), "yyyy-MM-dd")) e.push("Un RDV à planifier doit être aujourd'hui ou plus tard.");
    } else if (!heureDebut || !heureFin) e.push("Indiquez l'horaire.");
    else if (minutes(heureFin) <= minutes(heureDebut)) e.push("L'heure de fin doit être après l'heure de début.");
    if (!lieuId) e.push("Choisissez le lieu.");
    if (!soignantIds.length && !patientIds.length) e.push("Choisissez au moins un patient ou un soignant.");
    setErreurs(e);
    if (e.length) return;
    setEnvoi(true);
    const ok = await onValider({
      typeId: Number(typeId),
      lieuId: Number(lieuId),
      soignantIds,
      patientIds,
      debut: aPlanifier ? `${date}T${hhmm(HEURE_PROVISOIRE)}:00` : `${date}T${heureDebut}:00`,
      fin: aPlanifier ? `${date}T${hhmm(HEURE_PROVISOIRE + duree)}:00` : `${date}T${heureFin}:00`,
      descriptif,
      preparation,
      // En attente si la case est cochée ; un RDV en attente décoché devient planifié ;
      // sinon le statut reste celui d'origine (non envoyé à la création).
      statut: aPlanifier ? "en_attente" : initiale.statut === "en_attente" ? "planifie" : initiale.statut,
    });
    setEnvoi(false);
    if (ok) onFermer();
  };

  const supprimer = async () => {
    if (!onSupprimer) return;
    setEnvoi(true);
    const ok = await onSupprimer();
    setEnvoi(false);
    if (ok) onFermer();
  };

  const titre =
    mode === "creation" || !original ? (
      "Nouveau RDV"
    ) : (
      <>
        {original.type.libelle} :
        <span className="ml-[1.6rem]">
          {original.statut === "en_attente" ? "à planifier" : plageHoraire(depuisIso(original.debut), depuisIso(original.fin))}
        </span>
      </>
    );

  return (
    <Modal
      titre={titre}
      titreAccessible={mode === "creation" ? "Nouveau RDV" : `Modifier le RDV ${original?.type.libelle ?? ""}`}
      couleurBandeau={original && mode === "modification" ? couleurRdv(original.type.categorie, original.type.couleurBackend) : undefined}
      onFermer={onFermer}
    >
      {chargement ? (
        <Chargement texte="Chargement des listes…" />
      ) : erreurChargement ? (
        <p role="alert" className="text-erreur">Les listes (types, lieux{modePatient ? "" : ", soignants, patients"}) n'ont pas pu être chargées.</p>
      ) : (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            valider();
          }}
          className="space-y-[0.15rem] pl-[0.9rem]"
        >
          <Ligne libelle="Nom RDV" id={modePatient ? undefined : ids.type}>
            {modePatient ? (
              <select
                aria-label="Nom RDV"
                className="champ-rdv min-w-0 flex-1"
                value={typeId}
                onChange={(e) => {
                  const t = typesPatient.find((x) => String(x.id) === e.target.value);
                  setTypeId(e.target.value);
                  ajusterFin(heureDebut, t);
                  lieuPourType(t);
                }}
              >
                {typesPatient.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.libelle}
                  </option>
                ))}
              </select>
            ) : (
            <select
              id={ids.type}
              data-autofocus
              className="champ-rdv min-w-0 flex-1"
              value={typeId}
              aria-invalid={!typeId && erreurs.length > 0}
              onChange={(e) => {
                setTypeId(e.target.value);
                ajusterFin(heureDebut, typesTries.find((t) => String(t.id) === e.target.value));
              }}
            >
              <option value="">Choisir…</option>
              {typesTries.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.libelle}
                </option>
              ))}
            </select>
            )}
          </Ligne>

          <Ligne libelle="Couleur RDV">
            {/* Couleur imposée par la charte : déduite du type, non modifiable */}
            <span className="flex items-center gap-[0.5rem] italic text-[#333]">
              {couleur ? (
                <>
                  <span aria-hidden className="inline-block h-[1rem] w-[1.6rem] rounded-[0.3rem] border border-black/20" style={{ backgroundColor: couleur }} />
                  {couleur}
                </>
              ) : (
                <span className="text-[#888]">selon le nom du RDV</span>
              )}
            </span>
          </Ligne>

          <Ligne libelle="Descriptif" id={ids.desc}>
            <input id={ids.desc} className="champ-rdv min-w-0 flex-1" value={descriptif} onChange={(e) => setDescriptif(e.target.value)} />
          </Ligne>

          <div className="h-[1.2rem]" aria-hidden />

          {!modePatient && (
            <Ligne libelle="Planification" id={ids.auto}>
              <label className="flex cursor-pointer items-center gap-[0.5rem]">
                <input
                  id={ids.auto}
                  type="checkbox"
                  checked={aPlanifier}
                  onChange={(e) => {
                    setAPlanifier(e.target.checked);
                    // On garde la durée de l'horaire déjà saisi
                    const d = heureDebut && heureFin ? minutes(heureFin) - minutes(heureDebut) : 0;
                    if (e.target.checked && d > 0) setDuree(Math.min(240, Math.ceil(d / 5) * 5));
                  }}
                />
                <span>À planifier automatiquement</span>
              </label>
            </Ligne>
          )}

          {aPlanifier ? (
            <Ligne libelle="Durée" id={ids.duree}>
              <span className="flex flex-wrap items-baseline gap-x-[0.8rem]">
                <select id={ids.duree} className="champ-rdv" value={duree} onChange={(e) => setDuree(Number(e.target.value))}>
                  {DUREES.map((d) => (
                    <option key={d} value={d}>
                      {d >= 60 ? `${Math.floor(d / 60)} h${d % 60 ? String(d % 60).padStart(2, "0") : ""}` : `${d} min`}
                    </option>
                  ))}
                </select>
                <span className="text-[0.9rem] italic text-[#555]">
                  L'heure sera choisie par « Synchroniser » (7 jours à venir).
                </span>
              </span>
            </Ligne>
          ) : (
          <Ligne libelle="Horaire" id={ids.debut}>
            <span className="flex items-baseline gap-[0.6rem]">
              <ChoixHeure
                id={ids.debut}
                libelle="Heure de début"
                valeur={heureDebut}
                onChange={(v) => {
                  setHeureDebut(v);
                  ajusterFin(v, typeChoisi);
                }}
              />
              <span aria-hidden>-</span>
              <ChoixHeure
                id={ids.fin}
                libelle="Heure de fin"
                valeur={heureFin}
                onChange={(v) => {
                  setHeureFin(v);
                  setFinChoisie(true);
                }}
              />
            </span>
          </Ligne>
          )}

          <Ligne libelle="Lieu" id={ids.lieu}>
            <select id={ids.lieu} className="champ-rdv min-w-0 flex-1" value={lieuId} onChange={(e) => setLieuId(e.target.value)}>
              <option value="">Choisir…</option>
              {(lieux.data ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.libelle}
                </option>
              ))}
            </select>
          </Ligne>

          <Ligne libelle="Soignant(s)" idLibelle={ids.soignant}>
            {modePatient ? (
              <span className="italic text-[#333]">Aucun</span>
            ) : (
              <SelectPersonnes
                options={optionsSoignants}
                valeur={soignantIds}
                onChange={setSoignantIds}
                idLibelle={ids.soignant}
                placeholderRecherche="Rechercher un soignant ou une profession"
                aucunTrouve="Aucun soignant trouvé."
              />
            )}
          </Ligne>

          <Ligne libelle="Patients(s)" idLibelle={ids.patients}>
            {modePatient ? (
              <span className="italic text-[#333]">{formatNom(patientConnecte)}</span>
            ) : (
              <SelectPersonnes
                options={optionsPatients}
                valeur={patientIds}
                onChange={setPatientIds}
                idLibelle={ids.patients}
                placeholderRecherche="Rechercher un nom ou une chambre"
                aucunTrouve="Aucun patient trouvé."
              />
            )}
          </Ligne>

          <Ligne libelle="Date" id={ids.date}>
            <input id={ids.date} type="date" className="champ-rdv" value={date} onChange={(e) => setDate(e.target.value)} />
          </Ligne>

          <Ligne libelle="Préparation antérieure" id={ids.prep}>
            <input id={ids.prep} className="champ-rdv min-w-0 flex-1" value={preparation} onChange={(e) => setPreparation(e.target.value)} />
          </Ligne>

          {erreurs.length > 0 && (
            <ul role="alert" className="!mt-[0.8rem] list-disc pl-[1.2rem] text-[0.95rem] text-erreur">
              {erreurs.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}

          {mode === "creation" ? (
            <button type="submit" disabled={envoi} className="!mt-[1.2rem] -ml-[0.9rem] text-[2.2rem] leading-none text-valider underline disabled:opacity-50">
              {envoi ? "Enregistrement…" : "Valider le RDV"}
            </button>
          ) : (
            <div className="!mt-[1.2rem] -ml-[0.9rem] flex items-baseline justify-between gap-[1rem]">
              <button type="submit" disabled={envoi} className="text-[1.45rem] text-valider underline disabled:opacity-50">
                {envoi ? "Enregistrement…" : "Valider les modifications"}
              </button>
              {onSupprimer &&
                (confirmerSuppression ? (
                  <span className="flex items-baseline gap-[0.8rem] text-[1.05rem]">
                    <button type="button" disabled={envoi} onClick={supprimer} className="font-medium text-supprimer underline">
                      Confirmer la suppression
                    </button>
                    <button type="button" onClick={() => setConfirmerSuppression(false)} className="underline">
                      Annuler
                    </button>
                  </span>
                ) : (
                  <button type="button" disabled={envoi} onClick={() => setConfirmerSuppression(true)} className="text-[1.45rem] text-supprimer underline">
                    Supprimer le RDV
                  </button>
                ))}
            </div>
          )}
        </form>
      )}
    </Modal>
  );
}
