/**
 * Faux backend en mémoire (VITE_USE_MOCK=true).
 * Il imite les routes FastAPI réelles et renvoie le même JSON, avec les mêmes
 * codes HTTP. Les modifications sont gardées en mémoire jusqu'au rechargement.
 *
 * Il simule aussi les conflits avec les mêmes règles que le backend
 * (app/conflits.py). Le frontend, lui, ne fait que les afficher.
 *
 * Connexion : n'importe quel mot de passe est accepté ; l'identifiant est
 * « NOM Prénom » d'une personne des données (ex. « DUPONT Daniel »).
 */
import type { Reponse, Requete, Transport } from "@/services/api/client";
import type { ConflitJSON, RDVCreationJSON, RDVJSON } from "@/services/api/backendTypes";
import { formatNom } from "@/utils/noms";
import { chambres, genererRdv, lieux, typesRdv, utilisateurs, type RdvMock, type UtilisateurMock } from "./donnees";

let rdvs: RdvMock[] = genererRdv();
let prochainId = rdvs.length + 1;

const DELAI_MS = 250; // pour voir les états de chargement

const ok = (data: unknown, status = 200): Reponse => ({ status, data });
const erreur = (status: number, detail: unknown): Reponse => ({ status, data: { detail } });

const normaliser = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const JETON_PREFIXE = "mock-jeton-";

function utilisateurDuJeton(jeton?: string | null): UtilisateurMock | undefined {
  if (!jeton?.startsWith(JETON_PREFIXE)) return undefined;
  return utilisateurs.find((u) => u.id === Number(jeton.slice(JETON_PREFIXE.length)));
}

const estSoignant = (u: UtilisateurMock) => u.role !== "patient";

/* ----------------------------- Sérialisation ----------------------------- */

const chambreJSON = (id?: number | null) => (id == null ? null : chambres.find((c) => c.id === id) ?? null);

function patientJSON(u: UtilisateurMock) {
  return {
    id: u.id, login: u.login, nom: u.nom, prenom: u.prenom,
    date_arrivee: u.date_arrivee!, date_depart_prevue: u.date_depart_prevue ?? null,
    chambre: chambreJSON(u.chambre_id),
  };
}

function rdvJSON(r: RdvMock): RDVJSON {
  const p = r.patient_id == null ? undefined : utilisateurs.find((u) => u.id === r.patient_id);
  const soignantsDuRdv = r.soignant_ids
    .map((id) => utilisateurs.find((u) => u.id === id)!)
    .sort((a, b) => a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom));
  return {
    id: r.id, debut: r.debut, fin: r.fin, statut: r.statut, commentaire: r.commentaire,
    createur_id: r.createur_id,
    patient: p ? { id: p.id, login: p.login, nom: p.nom, prenom: p.prenom } : null,
    soignants: soignantsDuRdv.map((s) => ({ id: s.id, nom: s.nom, prenom: s.prenom, profession: s.profession! })),
    type: typesRdv.find((t) => t.id === r.type_id)!,
    lieu: lieux.find((l) => l.id === r.lieu_id)!,
  };
}

/* ----------------------------- Conflits simulés ----------------------------- */
// Mêmes règles et mêmes messages que le backend (app/conflits.py) : ce sont
// toutes des avertissements, dans l'ordre patient puis soignants.

const heureDe = (iso: string) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
const chevauche = (a: { debut: string; fin: string }, b: { debut: string; fin: string }) =>
  a.debut < b.fin && b.debut < a.fin;
const memeSeance = (a: RdvMock, b: RdvMock) =>
  a.debut === b.debut && a.fin === b.fin && a.type_id === b.type_id && a.lieu_id === b.lieu_id;

/** Horaires habituels par profession (minutes depuis minuit), comme le backend. */
const HORAIRES: [string, number, number][] = [
  ["kine", 9 * 60, 18 * 60],
  ["infirmi", 6 * 60 + 30, 21 * 60 + 30],
  ["soignant", 6 * 60 + 30, 21 * 60 + 30],
];
const horairesDe = (u: UtilisateurMock) => HORAIRES.find(([mot]) => normaliser(u.profession ?? "").includes(mot));

function calculerConflits(r: RdvMock): ConflitJSON[] {
  // Seuls les RDV planifiés comptent (un RDV en attente n'a qu'un horaire provisoire)
  if (r.statut !== "planifie") return [];
  const conflits: ConflitJSON[] = [];
  const voisins = rdvs.filter((x) => x.id !== r.id && x.statut === "planifie" && chevauche(x, r));
  const type = typesRdv.find((t) => t.id === r.type_id)!;

  const patient = r.patient_id == null ? undefined : utilisateurs.find((u) => u.id === r.patient_id);
  if (patient) {
    const nom = formatNom(patient);
    const autres = voisins.filter((x) => x.patient_id === patient.id);
    if (autres.length) {
      conflits.push({
        id: `patient-${patient.id}-double-${r.id}`, type: "PATIENT_DOUBLE_TACHE", gravite: "avertissement",
        message: `${nom} a déjà un rendez-vous sur ce créneau.`,
        rdv_ids: [r.id, ...autres.map((x) => x.id)], patient_id: patient.id,
      });
    }
    const d = heureDe(r.debut), f = heureDe(r.fin);
    const plageRepas = (d < 14 * 60 && f > 11 * 60) || (d < 20 * 60 && f > 18 * 60);
    if (!normaliser(type.libelle).includes("repas") && plageRepas) {
      conflits.push({
        id: `patient-${patient.id}-repas-${r.id}`, type: "PLAGE_REPAS", gravite: "avertissement",
        message: `Ce rendez-vous de ${nom} empiète sur une plage repas (11h-14h ou 18h-20h).`,
        rdv_ids: [r.id], patient_id: patient.id,
      });
    }
  }

  const soignantsDuRdv = r.soignant_ids
    .map((id) => utilisateurs.find((u) => u.id === id)!)
    .sort((a, b) => a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom));
  for (const s of soignantsDuRdv) {
    const nom = formatNom(s);
    const horaires = horairesDe(s);
    if (horaires) {
      const [, debut, fin] = horaires;
      if (heureDe(r.debut) < debut || heureDe(r.fin) > fin || r.fin.slice(0, 10) !== r.debut.slice(0, 10)) {
        conflits.push({
          id: `soignant-${s.id}-horaires-${r.id}`, type: "HORS_HORAIRES", gravite: "avertissement",
          message: `Ce rendez-vous n'est pas compris dans les horaires habituels de ce soignant : ${nom}.`,
          rdv_ids: [r.id], soignant_id: s.id,
        });
      }
    }
    const autres = voisins.filter((x) => x.soignant_ids.includes(s.id) && !memeSeance(x, r));
    if (autres.length) {
      conflits.push({
        id: `soignant-${s.id}-double-${r.id}`, type: "SOIGNANT_DOUBLE_TACHE", gravite: "avertissement",
        message: `${nom} a déjà un rendez-vous sur ce créneau.`,
        rdv_ids: [r.id, ...autres.map((x) => x.id)], soignant_id: s.id,
      });
    }
  }
  return conflits;
}

/* ----------------------------- Synchronisation simulée ----------------------------- */
// Le vrai backend utilise le solveur OR-Tools. Ici, simple placement « au plus
// tôt » qui respecte les horaires des soignants et évite les chevauchements
// (patient et soignants) : suffisant pour tester l'interface.

const enIso = (jour: string, minutes: number) =>
  `${jour}T${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00`;

function synchroniserJour(jour: string) {
  const enAttente = rdvs.filter((x) => x.statut === "en_attente" && x.debut.slice(0, 10) === jour);
  if (!enAttente.length) {
    return { jour, statut: "rien_a_planifier", message: "", nb_en_attente: 0, nb_planifies: 0, incoherences: [], ignores: [] };
  }
  const ignores: { rdv_id: number; raison: string }[] = [];
  let planifies = 0;
  for (const r of enAttente) {
    const duree = heureDe(r.fin) - heureDe(r.debut);
    const soignantsDuRdv = r.soignant_ids.map((id) => utilisateurs.find((u) => u.id === id)!);
    const sansHoraire = soignantsDuRdv.filter((s) => !horairesDe(s));
    if (sansHoraire.length) {
      ignores.push({ rdv_id: r.id, raison: `Horaire inconnu pour ${sansHoraire.map((s) => formatNom(s)).join(", ")}.` });
      continue;
    }
    const debutMin = Math.max(8 * 60, ...soignantsDuRdv.map((s) => horairesDe(s)![1]));
    const finMax = Math.min(20 * 60, ...soignantsDuRdv.map((s) => horairesDe(s)![2]));
    const occupes = rdvs.filter(
      (x) => x.statut === "planifie" && x.debut.slice(0, 10) === jour
        && ((r.patient_id != null && x.patient_id === r.patient_id) || x.soignant_ids.some((id) => r.soignant_ids.includes(id))),
    );
    let place: number | null = null;
    for (let t = debutMin; t + duree <= finMax && place === null; t += 5) {
      const candidat = { debut: enIso(jour, t), fin: enIso(jour, t + duree) };
      if (!occupes.some((x) => chevauche(x, candidat))) place = t;
    }
    if (place === null) {
      ignores.push({ rdv_id: r.id, raison: "Aucun créneau libre ce jour-là." });
      continue;
    }
    r.debut = enIso(jour, place);
    r.fin = enIso(jour, place + duree);
    r.statut = "planifie";
    planifies++;
  }
  return {
    jour, statut: "optimal", message: "", nb_en_attente: enAttente.length, nb_planifies: planifies, incoherences: [], ignores,
  };
}

function verifierLiens(c: Partial<RDVCreationJSON>): Reponse | null {
  for (const id of c.soignant_ids ?? []) {
    if (!utilisateurs.some((u) => u.id === id && estSoignant(u))) return erreur(404, `Soignant ${id} introuvable.`);
  }
  if (c.patient_id != null && !utilisateurs.some((u) => u.id === c.patient_id && u.role === "patient"))
    return erreur(404, `Patient ${c.patient_id} introuvable.`);
  if (c.type_id != null && !typesRdv.some((t) => t.id === c.type_id)) return erreur(404, `Type de RDV ${c.type_id} introuvable.`);
  if (c.lieu_id != null && !lieux.some((l) => l.id === c.lieu_id)) return erreur(404, `Lieu ${c.lieu_id} introuvable.`);
  return null;
}

const estVisite = (typeId: number | undefined) =>
  normaliser(typesRdv.find((t) => t.id === typeId)?.libelle ?? "").startsWith("visite");

/** Un patient ne gère que les visites qu'il a créées lui-même, pour lui-même. */
const patientPeutGerer = (moi: UtilisateurMock, r: RdvMock) =>
  r.createur_id === moi.id && r.patient_id === moi.id && estVisite(r.type_id);

/** Enregistre toujours (les conflits sont des avertissements) et renvoie les conflits. */
function enregistrer(candidat: RdvMock, creation: boolean): Reponse {
  if (candidat.fin <= candidat.debut) return erreur(422, "La fin du RDV doit être après son début.");
  if (candidat.patient_id == null && candidat.soignant_ids.length === 0)
    return erreur(422, "Choisissez au moins un patient ou un soignant.");
  if (creation) rdvs.push(candidat);
  else rdvs = rdvs.map((x) => (x.id === candidat.id ? candidat : x));
  return ok({ ...rdvJSON(candidat), conflits: calculerConflits(candidat) }, creation ? 201 : 200);
}

/* ----------------------------- Routes ----------------------------- */

function router(r: Requete): Reponse {
  const { methode, chemin } = r;

  if (methode === "POST" && chemin === "/auth/connexion") {
    const identifiant = normaliser(r.formulaire?.username ?? "");
    const u = utilisateurs.find((x) => normaliser(x.login) === identifiant);
    if (!u) return erreur(401, "Login ou mot de passe incorrect.");
    return ok({ access_token: `${JETON_PREFIXE}${u.id}`, token_type: "bearer" });
  }

  const moi = utilisateurDuJeton(r.jeton);
  if (!moi) return erreur(401, "Non connecté, ou session expirée. Connectez-vous à nouveau.");
  const reserveSoignant = () => (estSoignant(moi) ? null : erreur(403, "Accès réservé aux soignants."));

  if (methode === "GET" && chemin === "/auth/moi") {
    return ok({
      id: moi.id, login: moi.login, nom: moi.nom, prenom: moi.prenom, role: moi.role,
      profession: moi.profession ?? null,
      chambre: chambreJSON(moi.chambre_id),
      date_arrivee: moi.date_arrivee ?? null,
      date_depart_prevue: moi.date_depart_prevue ?? null,
      date_naissance: moi.date_naissance ?? null,
      email: moi.email ?? null,
      telephone: moi.telephone ?? null,
    });
  }

  if (methode === "GET" && chemin === "/types-rdv") return ok(typesRdv);
  if (methode === "GET" && chemin === "/lieux") return ok(lieux);

  if (methode === "GET" && chemin === "/patients") {
    return reserveSoignant() ?? ok(utilisateurs.filter((u) => u.role === "patient").map(patientJSON));
  }
  if (methode === "GET" && chemin === "/soignants") {
    return reserveSoignant() ?? ok(
      utilisateurs.filter(estSoignant).map((u) => ({ id: u.id, login: u.login, nom: u.nom, prenom: u.prenom, profession: u.profession, role: u.role })),
    );
  }

  if (methode === "GET" && chemin === "/plan") {
    const refus = reserveSoignant();
    if (refus) return refus;
    const jour = String(r.query?.moment ?? new Date().toISOString()).slice(0, 10);
    const presents = utilisateurs.filter(
      (u) => u.role === "patient" && u.date_arrivee! <= jour && (!u.date_depart_prevue || u.date_depart_prevue >= jour),
    );
    const resume = (u: UtilisateurMock) => ({ patient: { id: u.id, login: u.login, nom: u.nom, prenom: u.prenom }, rdv_en_cours: null });
    return ok({
      moment: r.query?.moment ?? null,
      chambres: chambres.map((c) => ({ ...c, patients: presents.filter((u) => u.chambre_id === c.id).map(resume) })),
      hors_chambre: [],
    });
  }

  if (methode === "POST" && chemin === "/planification/synchroniser") {
    const refus = reserveSoignant();
    if (refus) return refus;
    const demande = (r.json ?? {}) as { du?: string; jours?: number };
    const du = demande.du ?? new Date().toISOString().slice(0, 10);
    const jours = Array.from({ length: demande.jours ?? 7 }, (_, i) => {
      const d = new Date(`${du}T12:00:00`);
      d.setDate(d.getDate() + i);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    });
    const resultats = jours.map(synchroniserJour);
    return ok({
      du: jours[0],
      au: jours[jours.length - 1],
      total_planifies: resultats.reduce((n, j) => n + j.nb_planifies, 0),
      total_restants: rdvs.filter((x) => x.statut === "en_attente" && jours.includes(x.debut.slice(0, 10))).length,
      jours: resultats,
    });
  }

  if (methode === "GET" && chemin === "/rdv") {
    const q = r.query ?? {};
    let patientId = q.patient_id != null ? Number(q.patient_id) : undefined;
    if (moi.role === "patient") {
      if (patientId !== undefined && patientId !== moi.id)
        return erreur(403, "Vous ne pouvez consulter que votre propre agenda.");
      patientId = moi.id;
    }
    const soignantId = q.soignant_id != null ? Number(q.soignant_id) : undefined;
    const du = q.du ? String(q.du) : undefined;
    const au = q.au ? String(q.au) : undefined;
    const liste = rdvs
      .filter((x) => (patientId === undefined || x.patient_id === patientId)
        && (soignantId === undefined || x.soignant_ids.includes(soignantId))
        && (!du || x.debut >= du) && (!au || x.debut < au))
      .sort((a, b) => a.debut.localeCompare(b.debut) || a.id - b.id)
      .slice(0, Number(q.limite ?? 500));
    return ok(liste.map(rdvJSON));
  }

  const m = chemin.match(/^\/rdv\/(\d+)(\/annuler|\/terminer)?$/);
  if (m) {
    const existant = rdvs.find((x) => x.id === Number(m[1]));
    if (!existant) return erreur(404, `RDV ${m[1]} introuvable.`);
    if (methode === "GET" && !m[2]) {
      if (moi.role === "patient" && existant.patient_id !== moi.id) return erreur(403, "Ce RDV n'est pas le vôtre.");
      return ok(rdvJSON(existant));
    }
    if (methode === "POST" && m[2] === "/terminer") {
      const refus = reserveSoignant();
      if (refus) return refus;
      if (existant.statut === "annule") return erreur(409, "Ce RDV est annulé, il ne peut pas être terminé.");
      existant.statut = "realise";
      return ok(rdvJSON(existant));
    }
    if (methode === "PATCH" && !m[2]) {
      const changements = (r.json ?? {}) as Partial<RDVCreationJSON>;
      const lien = verifierLiens(changements);
      if (lien) return lien;
      if (moi.role === "patient") {
        if (!patientPeutGerer(moi, existant))
          return erreur(403, "Vous ne pouvez modifier que les visites que vous avez ajoutées.");
        if ("patient_id" in changements && changements.patient_id !== moi.id) return erreur(403, "Une visite reste à votre nom.");
        if (changements.soignant_ids?.length) return erreur(403, "Une visite ajoutée par un patient n'a pas de soignant.");
        if (changements.type_id !== undefined && !estVisite(changements.type_id))
          return erreur(403, "Un patient ne peut ajouter que des visites.");
      }
      const candidat: RdvMock = { ...existant };
      (Object.keys(changements) as (keyof RDVCreationJSON)[]).forEach((k) => {
        (candidat as unknown as Record<string, unknown>)[k] = changements[k];
      });
      return enregistrer(candidat, false);
    }
    if (methode === "POST" && m[2] === "/annuler") {
      if (moi.role === "patient" && !patientPeutGerer(moi, existant))
        return erreur(403, "Vous ne pouvez annuler que les visites que vous avez ajoutées.");
      existant.statut = "annule";
      return ok(rdvJSON(existant));
    }
  }

  if (methode === "POST" && chemin === "/rdv") {
    const c = r.json as RDVCreationJSON;
    const lien = verifierLiens(c);
    if (lien) return lien;
    let patientId = c.patient_id ?? null;
    if (moi.role === "patient") {
      // Un patient ne peut ajouter qu'une visite, pour lui-même, sans soignant
      if (!estVisite(c.type_id)) return erreur(403, "Un patient ne peut ajouter que des visites.");
      if (patientId !== null && patientId !== moi.id) return erreur(403, "Vous ne pouvez ajouter une visite que pour vous-même.");
      if (c.soignant_ids?.length) return erreur(403, "Une visite ajoutée par un patient n'a pas de soignant.");
      patientId = moi.id;
    }
    const candidat: RdvMock = {
      id: prochainId++, debut: c.debut, fin: c.fin, statut: (c.statut as RdvMock["statut"]) ?? "planifie",
      commentaire: c.commentaire ?? null, createur_id: moi.id, soignant_ids: [...new Set(c.soignant_ids ?? [])],
      patient_id: patientId, type_id: c.type_id, lieu_id: c.lieu_id,
    };
    return enregistrer(candidat, true);
  }

  return erreur(404, "Not Found");
}

export const transportMock: Transport = async (r) => {
  await new Promise((res) => setTimeout(res, DELAI_MS));
  // Copie profonde : l'appelant ne peut pas modifier l'état interne par accident
  return JSON.parse(JSON.stringify(router(r))) as Reponse;
};

/** Exemples d'identifiants affichés sur l'écran de connexion en mode mock. */
export const COMPTES_DEMO = {
  patient: "DUPONT Daniel",
  soignant: "QUINET Marc",
};
