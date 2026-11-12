/**
 * Conversion entre le JSON du backend (snake_case) et les types du frontend.
 * Si le backend évolue, c'est ici (et seulement ici) qu'il faut adapter.
 */
import { categorieDepuisLibelle } from "@/theme/couleursRdv";
import type {
  Chambre,
  Conflit,
  Lieu,
  Patient,
  RendezVous,
  RoleBackend,
  SaisieRdv,
  Soignant,
  StatutRdv,
  TypeConflit,
  TypeRdv,
  Utilisateur,
} from "@/types";
import type {
  ChambreJSON,
  ConflitJSON,
  LieuJSON,
  MoiJSON,
  PatientJSON,
  RDVCreationJSON,
  RDVJSON,
  SoignantJSON,
  TypeRDVJSON,
} from "./backendTypes";

const vide = <T>(v: T | null | undefined): T | undefined => (v == null ? undefined : v);

export const versChambre = (c: ChambreJSON): Chambre => ({ id: c.id, numero: c.numero, etage: c.etage });

export const versLieu = (l: LieuJSON): Lieu => ({ id: l.id, libelle: l.libelle });

export const versTypeRdv = (t: TypeRDVJSON): TypeRdv => ({
  id: t.id,
  libelle: t.libelle,
  couleurBackend: t.couleur,
  dureeParDefaut: t.duree_par_defaut,
  categorie: categorieDepuisLibelle(t.libelle),
});

export const versPatient = (p: PatientJSON): Patient => ({
  id: p.id,
  login: p.login,
  nom: p.nom,
  prenom: p.prenom,
  dateArrivee: p.date_arrivee,
  dateDepartPrevue: p.date_depart_prevue,
  chambre: p.chambre ? versChambre(p.chambre) : null,
  dateNaissance: vide(p.date_naissance),
  email: vide(p.email),
  telephone: vide(p.telephone),
});

export const versSoignant = (s: SoignantJSON): Soignant => ({
  id: s.id,
  login: s.login,
  nom: s.nom,
  prenom: s.prenom,
  profession: s.profession,
  role: s.role as RoleBackend,
  dateNaissance: vide(s.date_naissance),
  email: vide(s.email),
  telephone: vide(s.telephone),
});

export function versUtilisateur(m: MoiJSON): Utilisateur {
  const roleBackend = m.role as RoleBackend;
  return {
    id: m.id,
    login: m.login,
    nom: m.nom,
    prenom: m.prenom,
    roleBackend,
    // Tous les soignants sont administrateurs pour l'instant : même interface.
    role: roleBackend === "patient" ? "patient" : "soignant",
    profession: vide(m.profession),
    chambre: m.chambre ? versChambre(m.chambre) : m.chambre === null ? null : undefined,
    dateArrivee: vide(m.date_arrivee),
    dateDepartPrevue: m.date_depart_prevue ?? undefined,
    dateNaissance: vide(m.date_naissance),
    email: vide(m.email),
    telephone: vide(m.telephone),
  };
}

export const versConflit = (c: ConflitJSON): Conflit => ({
  id: c.id,
  type: c.type as TypeConflit,
  gravite: c.gravite,
  message: c.message,
  rdvIds: c.rdv_ids ?? [],
  patientId: vide(c.patient_id),
  soignantId: vide(c.soignant_id),
});

/* ------------------------------------------------------------------------
 * « Préparation antérieure » n'existe pas encore dans le backend.
 * En attendant une colonne dédiée, elle est rangée à la fin du champ
 * `commentaire`, après un séparateur reconnaissable, puis relue ici.
 * ---------------------------------------------------------------------- */
const SEPARATEUR_PREPARATION = "\n\nPréparation antérieure : ";

export function decouperCommentaire(commentaire: string | null): { descriptif: string; preparation: string } {
  const texte = commentaire ?? "";
  const i = texte.lastIndexOf(SEPARATEUR_PREPARATION);
  if (i === -1) return { descriptif: texte, preparation: "" };
  return {
    descriptif: texte.slice(0, i),
    preparation: texte.slice(i + SEPARATEUR_PREPARATION.length),
  };
}

export function assemblerCommentaire(descriptif: string, preparation: string): string | null {
  const d = descriptif.trim();
  const p = preparation.trim();
  if (!d && !p) return null;
  return p ? `${d}${SEPARATEUR_PREPARATION}${p}` : d;
}

export function versRendezVous(r: RDVJSON): RendezVous {
  const { descriptif, preparation } = decouperCommentaire(r.commentaire);
  return {
    id: r.id,
    debut: r.debut,
    fin: r.fin,
    statut: r.statut as StatutRdv,
    descriptif,
    preparation,
    createurId: r.createur_id,
    patient: r.patient
      ? { id: r.patient.id, login: r.patient.login, nom: r.patient.nom, prenom: r.patient.prenom }
      : null,
    soignants: (r.soignants ?? []).map((s) => ({ ...s })),
    type: versTypeRdv(r.type),
    lieu: versLieu(r.lieu),
  };
}

/** Corps envoyé au backend pour UN patient de la saisie (null : RDV sans patient). */
export function versCreationJSON(s: SaisieRdv, patientId: number | null): RDVCreationJSON {
  return {
    debut: s.debut,
    fin: s.fin,
    commentaire: assemblerCommentaire(s.descriptif, s.preparation),
    soignant_ids: s.soignantIds,
    patient_id: patientId,
    type_id: s.typeId,
    lieu_id: s.lieuId,
    ...(s.statut ? { statut: s.statut } : {}),
  };
}
