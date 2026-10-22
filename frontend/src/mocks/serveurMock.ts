/**
 * Faux backend en mémoire (VITE_USE_MOCK=true).
 * Il imite les routes FastAPI réelles et renvoie le même JSON, avec les mêmes
 * codes HTTP. Les modifications sont gardées en mémoire jusqu'au rechargement.
 *
 * Il simule aussi les conflits que le backend calculera plus tard (format
 * proposé dans le README). C'est le seul endroit où des conflits sont
 * calculés : le frontend, lui, ne fait que les afficher.
 *
 * Connexion : n'importe quel mot de passe est accepté ; l'identifiant est
 * « NOM Prénom » d'une personne des données (ex. « DUPONT Daniel »).
 */
import type { Reponse, Requete, Transport } from "@/services/api/client";
import type { ConflitJSON, RDVCreationJSON, RDVJSON } from "@/services/api/backendTypes";
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
  const p = utilisateurs.find((u) => u.id === r.patient_id)!;
  const s = utilisateurs.find((u) => u.id === r.soignant_id)!;
  return {
    id: r.id, debut: r.debut, fin: r.fin, statut: r.statut, commentaire: r.commentaire,
    createur_id: r.createur_id,
    patient: { id: p.id, login: p.login, nom: p.nom, prenom: p.prenom },
    soignant: { id: s.id, nom: s.nom, prenom: s.prenom, profession: s.profession! },
    type: typesRdv.find((t) => t.id === r.type_id)!,
    lieu: lieux.find((l) => l.id === r.lieu_id)!,
  };
}

/* ----------------------------- Conflits simulés ----------------------------- */

const heureDe = (iso: string) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
const chevauche = (a: { debut: string; fin: string }, b: { debut: string; fin: string }) =>
  a.debut < b.fin && b.debut < a.fin;

function calculerConflits(r: RdvMock): ConflitJSON[] {
  const conflits: ConflitJSON[] = [];
  const soignant = utilisateurs.find((u) => u.id === r.soignant_id)!;
  const patient = utilisateurs.find((u) => u.id === r.patient_id)!;
  const type = typesRdv.find((t) => t.id === r.type_id)!;
  const nomPatient = `${patient.nom} ${patient.prenom}`;

  // Bloquant : les kinés travaillent de 9h à 18h
  if (/kin/i.test(soignant.profession ?? "") && (heureDe(r.debut) < 9 * 60 || heureDe(r.fin) > 18 * 60 || r.fin.slice(0, 10) !== r.debut.slice(0, 10))) {
    conflits.push({
      id: `k_${r.id}_horaires`, type: "HORS_HORAIRES", gravite: "bloquant",
      message: "Les kinésithérapeutes travaillent de 9h à 18h.",
      rdv_ids: [r.id], soignant_id: soignant.id,
    });
  }
  // Avertissement : le patient a déjà un RDV sur ce créneau
  const autres = rdvs.filter((x) => x.id !== r.id && x.statut !== "annule" && x.patient_id === r.patient_id && chevauche(x, r));
  if (autres.length) {
    conflits.push({
      id: `k_${r.id}_double`, type: "PATIENT_DOUBLE_TACHE", gravite: "avertissement",
      message: `${nomPatient} a déjà un rendez-vous sur ce créneau.`,
      rdv_ids: [r.id, ...autres.map((x) => x.id)], patient_id: patient.id,
    });
  }
  // Avertissement : plages repas à garder libres (11h-14h, 18h-20h)
  const d = heureDe(r.debut), f = heureDe(r.fin);
  const plageRepas = (d < 14 * 60 && f > 11 * 60) || (d < 20 * 60 && f > 18 * 60);
  if (type.libelle !== "Repas" && plageRepas) {
    conflits.push({
      id: `k_${r.id}_repas`, type: "PLAGE_REPAS", gravite: "avertissement",
      message: "Ce rendez-vous empiète sur une plage repas (11h-14h ou 18h-20h).",
      rdv_ids: [r.id], patient_id: patient.id,
    });
  }
  return conflits;
}

function verifierLiens(c: Partial<RDVCreationJSON>): Reponse | null {
  if (c.soignant_id != null && !utilisateurs.some((u) => u.id === c.soignant_id && estSoignant(u)))
    return erreur(404, `Soignant ${c.soignant_id} introuvable.`);
  if (c.patient_id != null && !utilisateurs.some((u) => u.id === c.patient_id && u.role === "patient"))
    return erreur(404, `Patient ${c.patient_id} introuvable.`);
  if (c.type_id != null && !typesRdv.some((t) => t.id === c.type_id)) return erreur(404, `Type de RDV ${c.type_id} introuvable.`);
  if (c.lieu_id != null && !lieux.some((l) => l.id === c.lieu_id)) return erreur(404, `Lieu ${c.lieu_id} introuvable.`);
  return null;
}

/** Enregistre si aucun conflit bloquant ; sinon 409 et rien n'est modifié. */
function enregistrer(candidat: RdvMock, creation: boolean): Reponse {
  if (candidat.fin <= candidat.debut) return erreur(422, "La fin du RDV doit être après son début.");
  const conflits = calculerConflits(candidat);
  const bloquants = conflits.filter((c) => c.gravite === "bloquant");
  if (bloquants.length) {
    return erreur(409, { code: "CONFLIT_BLOQUANT", message: bloquants[0].message, conflits: bloquants });
  }
  if (creation) rdvs.push(candidat);
  else rdvs = rdvs.map((x) => (x.id === candidat.id ? candidat : x));
  return ok({ ...rdvJSON(candidat), conflits }, creation ? 201 : 200);
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
        && (soignantId === undefined || x.soignant_id === soignantId)
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
    const refus = reserveSoignant();
    if (refus) return refus;
    if (methode === "PATCH" && !m[2]) {
      const changements = (r.json ?? {}) as Partial<RDVCreationJSON>;
      const lien = verifierLiens(changements);
      if (lien) return lien;
      const candidat: RdvMock = { ...existant };
      (Object.keys(changements) as (keyof RDVCreationJSON)[]).forEach((k) => {
        (candidat as unknown as Record<string, unknown>)[k] = changements[k];
      });
      return enregistrer(candidat, false);
    }
    if (methode === "POST" && m[2] === "/annuler") {
      existant.statut = "annule";
      return ok(rdvJSON(existant));
    }
    if (methode === "POST" && m[2] === "/terminer") {
      if (existant.statut === "annule") return erreur(409, "Ce RDV est annulé, il ne peut pas être terminé.");
      existant.statut = "realise";
      return ok(rdvJSON(existant));
    }
  }

  if (methode === "POST" && chemin === "/rdv") {
    const refus = reserveSoignant();
    if (refus) return refus;
    const c = r.json as RDVCreationJSON;
    const lien = verifierLiens(c);
    if (lien) return lien;
    const candidat: RdvMock = {
      id: prochainId++, debut: c.debut, fin: c.fin, statut: (c.statut as RdvMock["statut"]) ?? "planifie",
      commentaire: c.commentaire ?? null, createur_id: moi.id, soignant_id: c.soignant_id,
      patient_id: c.patient_id, type_id: c.type_id, lieu_id: c.lieu_id,
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
