/**
 * Pop-ups « Nouveau RDV » (maquette 13) et « Modifier le RDV » (maquette 12).
 * Même formulaire : Nom RDV, Couleur RDV, Descriptif, Horaire, Lieu,
 * Soignant(s), Patients(s), Date, Préparation antérieure.
 *
 * Le formulaire vérifie seulement que la saisie est complète et cohérente
 * (fin après début…). Les règles du planning (conflits) sont vérifiées par le backend.
 */
import { useId, useMemo, useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { Chargement } from "@/components/ui/Etats";
import { useLieux, usePatients, useSoignants, useTypesRdv } from "@/hooks/useReferentiel";
import { couleurRdv, ORDRE_CATEGORIES } from "@/theme/couleursRdv";
import type { RendezVous, SaisieRdv, TypeRdv } from "@/types";
import { depuisIso, plageHoraire } from "@/utils/dates";
import { SelectPatients } from "./SelectPatients";

interface Props {
  mode: "creation" | "modification";
  initiale: SaisieRdv;
  /** Modification : RDV d'origine (bandeau de titre à sa couleur). */
  original?: RendezVous;
  /** Renvoie true si l'action a été enregistrée (le pop-up se ferme alors). */
  onValider: (s: SaisieRdv) => Promise<boolean>;
  onSupprimer?: () => Promise<boolean>;
  onFermer: () => void;
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
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

export function RdvFormModal({ mode, initiale, original, onValider, onSupprimer, onFermer }: Props) {
  const types = useTypesRdv();
  const lieux = useLieux();
  const soignants = useSoignants();
  const patients = usePatients();
  const ids = { type: useId(), desc: useId(), debut: useId(), fin: useId(), lieu: useId(), soignant: useId(), patients: useId(), date: useId(), prep: useId() };

  const [typeId, setTypeId] = useState(initiale.typeId ? String(initiale.typeId) : "");
  const [descriptif, setDescriptif] = useState(initiale.descriptif);
  const [date, setDate] = useState(initiale.debut.slice(0, 10));
  const [heureDebut, setHeureDebut] = useState(initiale.debut.slice(11, 16));
  const [heureFin, setHeureFin] = useState(initiale.fin.slice(11, 16));
  const [finChoisie, setFinChoisie] = useState(mode === "modification"); // sinon : durée par défaut du type
  const [lieuId, setLieuId] = useState(initiale.lieuId ? String(initiale.lieuId) : "");
  const [soignantId, setSoignantId] = useState(initiale.soignantId ? String(initiale.soignantId) : "");
  const [patientIds, setPatientIds] = useState(initiale.patientIds);
  const [preparation, setPreparation] = useState(initiale.preparation);
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
  };

  const chargement = types.isPending || lieux.isPending || soignants.isPending || patients.isPending;
  const erreurChargement = types.isError || lieux.isError || soignants.isError || patients.isError;

  const valider = async () => {
    const e: string[] = [];
    if (!typeId) e.push("Choisissez le nom du RDV.");
    if (!date) e.push("Indiquez la date.");
    if (!heureDebut || !heureFin) e.push("Indiquez l'horaire.");
    else if (minutes(heureFin) <= minutes(heureDebut)) e.push("L'heure de fin doit être après l'heure de début.");
    if (!lieuId) e.push("Choisissez le lieu.");
    if (!soignantId) e.push("Choisissez le soignant.");
    if (!patientIds.length) e.push("Choisissez au moins un patient.");
    setErreurs(e);
    if (e.length) return;
    setEnvoi(true);
    const ok = await onValider({
      typeId: Number(typeId),
      lieuId: Number(lieuId),
      soignantId: Number(soignantId),
      patientIds,
      debut: `${date}T${heureDebut}:00`,
      fin: `${date}T${heureFin}:00`,
      descriptif,
      preparation,
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
        {original.type.libelle} :<span className="ml-[1.6rem]">{plageHoraire(depuisIso(original.debut), depuisIso(original.fin))}</span>
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
        <p role="alert" className="text-erreur">Les listes (types, lieux, soignants, patients) n'ont pas pu être chargées.</p>
      ) : (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            valider();
          }}
          className="space-y-[0.15rem] pl-[0.9rem]"
        >
          <Ligne libelle="Nom RDV" id={ids.type}>
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

          <Ligne libelle="Horaire" id={ids.debut}>
            <span className="flex items-baseline gap-[0.4rem]">
              <input
                id={ids.debut}
                type="time"
                step={900}
                className="champ-rdv"
                value={heureDebut}
                onChange={(e) => {
                  setHeureDebut(e.target.value);
                  ajusterFin(e.target.value, typeChoisi);
                }}
              />
              <span aria-hidden>-</span>
              <input
                id={ids.fin}
                type="time"
                step={900}
                aria-label="Heure de fin"
                className="champ-rdv"
                value={heureFin}
                onChange={(e) => {
                  setHeureFin(e.target.value);
                  setFinChoisie(true);
                }}
              />
            </span>
          </Ligne>

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

          <Ligne libelle="Soignant(s)" id={ids.soignant}>
            <select id={ids.soignant} className="champ-rdv min-w-0 flex-1" value={soignantId} onChange={(e) => setSoignantId(e.target.value)}>
              <option value="">Choisir…</option>
              {(soignants.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.prenom} {s.nom} ({s.profession})
                </option>
              ))}
            </select>
          </Ligne>

          <Ligne libelle="Patients(s)" idLibelle={ids.patients}>
            <SelectPatients patients={patients.data ?? []} valeur={patientIds} onChange={setPatientIds} idLibelle={ids.patients} />
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
