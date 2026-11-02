/**
 * Rendez-vous : lecture, création, modification, déplacement, suppression.
 *
 * Aucune règle de planification ici : le backend enregistre et renvoie le RDV
 * (et les conflits quand il les calcule). Le frontend ne fait qu'enchaîner les
 * appels nécessaires et sait revenir en arrière.
 *
 * Une « séance » = un ou plusieurs RDV identiques (même horaire, type, lieu,
 * soignant), un par patient, car le backend n'accepte qu'un patient par RDV.
 * Chaque opération sur une séance :
 *  - en cas d'échec en cours de route, annule ce qui a déjà été fait puis
 *    remonte l'erreur (la séance revient exactement à son état d'origine) ;
 *  - en cas de succès, renvoie les conflits et une fonction `defaire()` qui
 *    permet à l'utilisateur de renoncer après un avertissement.
 */
import type { Conflit, RendezVous, SaisieRdv } from "@/types";
import { appeler } from "./client";
import { versConflit, versCreationJSON, versRendezVous } from "./adaptateurs";
import type { RDVCreationJSON, RDVJSON } from "./backendTypes";

export interface FiltreRdv {
  du: string; // ISO, inclus
  au: string; // ISO, exclu
  patientId?: number;
  soignantId?: number;
}

export interface ResultatAction {
  rdvs: RendezVous[];
  conflits: Conflit[];
  /** Revient à l'état d'avant l'action (utilisé si l'utilisateur ne confirme pas un avertissement). */
  defaire: () => Promise<void>;
}

/* ----------------------------- Appels unitaires ----------------------------- */

/** GET /rdv?du=&au=&patient_id=&soignant_id= — les RDV annulés sont masqués. */
export async function listerRdv(f: FiltreRdv): Promise<RendezVous[]> {
  const data = await appeler<RDVJSON[]>({
    methode: "GET",
    chemin: "/rdv",
    query: { du: f.du, au: f.au, patient_id: f.patientId, soignant_id: f.soignantId, limite: 3000 },
  });
  return data.filter((r) => r.statut !== "annule").map(versRendezVous);
}

const poster = (corps: RDVCreationJSON) => appeler<RDVJSON>({ methode: "POST", chemin: "/rdv", json: corps });
const patcher = (id: number, corps: Partial<RDVCreationJSON>) =>
  appeler<RDVJSON>({ methode: "PATCH", chemin: `/rdv/${id}`, json: corps });
/** Le backend n'efface jamais un RDV : « supprimer » = annuler (POST /rdv/{id}/annuler). */
const annuler = (id: number) => appeler<RDVJSON>({ methode: "POST", chemin: `/rdv/${id}/annuler` });

/** Saisie équivalente à un RDV existant (pour pouvoir le remettre à l'identique). */
export function saisieDepuisRdv(r: RendezVous, patientIds = [r.patient.id]): SaisieRdv {
  return {
    typeId: r.type.id,
    lieuId: r.lieu.id,
    soignantId: r.soignant.id,
    patientIds,
    debut: r.debut,
    fin: r.fin,
    descriptif: r.descriptif,
    preparation: r.preparation,
  };
}

/* ----------------------------- Exécution avec retour arrière ----------------------------- */

type Etape = { faire: () => Promise<RDVJSON | null>; defaire: () => Promise<unknown> };

async function executer(etapes: Etape[]): Promise<ResultatAction> {
  const faites: Etape[] = [];
  const reponses: RDVJSON[] = [];
  const toutDefaire = async () => {
    // Dans l'ordre inverse ; on continue même si un retour arrière échoue
    for (const e of [...faites].reverse()) await e.defaire().catch(() => undefined);
  };
  try {
    for (const e of etapes) {
      const r = await e.faire();
      faites.push(e);
      if (r) reponses.push(r);
    }
  } catch (err) {
    await toutDefaire();
    throw err;
  }
  const conflits = new Map<string, Conflit>();
  reponses.forEach((r) => (r.conflits ?? []).forEach((c) => conflits.set(c.id, versConflit(c))));
  return {
    rdvs: reponses.filter((r) => r.statut !== "annule").map(versRendezVous),
    conflits: [...conflits.values()],
    defaire: toutDefaire,
  };
}

/** Étape « créer un RDV pour ce patient » ; son retour arrière l'annule. */
function etapeCreation(s: SaisieRdv, patientId: number): Etape {
  let id: number | null = null;
  return {
    faire: async () => {
      const r = await poster(versCreationJSON(s, patientId));
      id = r.id;
      return r;
    },
    defaire: async () => (id !== null ? annuler(id) : undefined),
  };
}

/** Étape « modifier un RDV » ; son retour arrière remet les valeurs d'origine. */
function etapeModification(original: RendezVous, corps: Partial<RDVCreationJSON>): Etape {
  return {
    faire: () => patcher(original.id, corps),
    defaire: () => patcher(original.id, versCreationJSON(saisieDepuisRdv(original), original.patient.id)),
  };
}

/** Étape « annuler un RDV » ; son retour arrière le remet au statut planifié. */
function etapeAnnulation(original: RendezVous): Etape {
  return {
    faire: async () => {
      await annuler(original.id);
      return null;
    },
    defaire: () => patcher(original.id, { statut: original.statut === "annule" ? "planifie" : original.statut }),
  };
}

/* ----------------------------- Opérations sur une séance ----------------------------- */

/** Nouveau RDV : un RDV par patient choisi. */
export function creerSeance(s: SaisieRdv): Promise<ResultatAction> {
  return executer(s.patientIds.map((p) => etapeCreation(s, p)));
}

/**
 * Modifier une séance : les RDV des patients conservés sont modifiés,
 * ceux des patients retirés sont annulés, les patients ajoutés reçoivent un RDV.
 */
export function modifierSeance(existants: RendezVous[], s: SaisieRdv): Promise<ResultatAction> {
  const gardes = existants.filter((r) => s.patientIds.includes(r.patient.id));
  const retires = existants.filter((r) => !s.patientIds.includes(r.patient.id));
  const ajoutes = s.patientIds.filter((p) => !existants.some((r) => r.patient.id === p));
  return executer([
    ...gardes.map((r) => etapeModification(r, versCreationJSON(s, r.patient.id))),
    ...ajoutes.map((p) => etapeCreation(s, p)),
    ...retires.map(etapeAnnulation),
  ]);
}

/** Glisser-déposer : seules les heures changent. */
export function deplacerSeance(existants: RendezVous[], debut: string, fin: string): Promise<ResultatAction> {
  return executer(existants.map((r) => etapeModification(r, { debut, fin })));
}

/** « Supprimer le RDV » : tous les RDV de la séance sont annulés. */
export function supprimerSeance(existants: RendezVous[]): Promise<ResultatAction> {
  return executer(existants.map(etapeAnnulation));
}
