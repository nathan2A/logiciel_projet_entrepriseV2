/**
 * Types du frontend. Ils suivent le backend FastAPI réel (app/schemas.py),
 * convertis en camelCase par services/api/adaptateurs.ts.
 * Dates : chaînes ISO 8601 sans fuseau (heure locale Europe/Paris), comme le backend.
 */
import type { CategorieRdv } from "@/theme/couleursRdv";

/** Rôle tel que renvoyé par le backend. */
export type RoleBackend = "patient" | "soignant" | "administrateur";

/**
 * Rôle utilisé par l'interface. Pour l'instant tous les soignants sont
 * administrateurs : soignant et administrateur ont donc les mêmes vues et droits.
 */
export type Role = "patient" | "soignant";

export interface Chambre {
  id: number;
  numero: number;
  etage: number; // 0 = Unité 0, 1 = Unité 1
}

export interface Lieu {
  id: number;
  libelle: string;
}

export interface TypeRdv {
  id: number;
  libelle: string;
  couleurBackend: string;
  dureeParDefaut: number; // minutes
  categorie: CategorieRdv; // déduite du libellé, donne la couleur de la charte
}

export interface PatientResume {
  id: number;
  login: string;
  nom: string;
  prenom: string;
}

/** Coordonnées facultatives d'un profil. */
export interface Coordonnees {
  dateNaissance?: string; // AAAA-MM-JJ
  email?: string;
  telephone?: string;
}

export interface Patient extends PatientResume, Coordonnees {
  dateArrivee: string;
  dateDepartPrevue: string | null;
  chambre: Chambre | null;
}

export interface SoignantResume {
  id: number;
  nom: string;
  prenom: string;
  profession: string;
}

export interface Soignant extends SoignantResume, Coordonnees {
  login: string;
  role: RoleBackend;
}

/* ---------------- Gestion des profils ---------------- */

export type TypeProfil = "patient" | "soignant";

/** Saisie du formulaire de création / modification d'un profil. */
export interface SaisieProfil {
  type: TypeProfil;
  nom: string;
  prenom: string;
  dateNaissance: string; // AAAA-MM-JJ
  email: string;
  telephone: string;
  identifiant: string;
  motDePasse: string; // vide en modification = inchangé
  profession: string; // soignant
  chambreId: number | null; // patient
  dateArrivee: string; // patient
  dateDepartPrevue: string; // patient (modification) ; vide = inconnue
}

/** Devenir d'un RDV à venir d'un soignant supprimé. */
export interface RdvTransfere {
  rdvId: number;
  debut: string;
  fin: string;
  type: string;
  patient: string | null;
  remplacant: string | null;
  resultat: "meme_heure" | "replanifie" | "en_attente" | "sans_remplacant" | "annule";
}

export interface ResultatSuppression {
  utilisateurId: number;
  role: RoleBackend;
  rdvAnnules: number; // patient
  rdv: RdvTransfere[]; // soignant
}

/** Personne connectée (GET /auth/moi). Les champs facultatifs peuvent manquer côté backend. */
export interface Utilisateur {
  id: number;
  login: string;
  nom: string;
  prenom: string;
  role: Role;
  roleBackend: RoleBackend;
  profession?: string;
  chambre?: Chambre | null;
  dateArrivee?: string;
  dateDepartPrevue?: string | null;
  dateNaissance?: string;
  email?: string;
  telephone?: string;
}

export type StatutRdv = "planifie" | "en_attente" | "realise" | "annule";

export interface RendezVous {
  id: number;
  debut: string;
  fin: string;
  statut: StatutRdv;
  descriptif: string; // champ « commentaire » du backend
  preparation: string; // « Préparation antérieure » (voir adaptateurs.ts)
  createurId: number;
  patient: PatientResume | null; // null : RDV entre soignants (staff, transmissions…)
  soignants: SoignantResume[]; // zéro, un ou plusieurs soignants
  type: TypeRdv;
  lieu: Lieu;
}

/** Données saisies dans le formulaire « Nouveau RDV » / « Modifier le RDV ». */
export interface SaisieRdv {
  typeId: number;
  lieuId: number;
  soignantIds: number[]; // zéro, un ou plusieurs soignants (tous partagent le RDV)
  patientIds: number[]; // plusieurs patients = un RDV créé par patient ; aucun = RDV sans patient
  debut: string;
  fin: string;
  descriptif: string;
  preparation: string;
  /**
   * Statut à enregistrer. « en_attente » : RDV à planifier automatiquement
   * (seuls le jour et la durée comptent, le solveur choisit l'heure au
   * prochain « Synchroniser »). Absent : statut inchangé (planifié à la création).
   */
  statut?: StatutRdv;
}

/* ---------------- Synchronisation (solveur OR-Tools) ---------------- */

export interface JourSynchronise {
  jour: string; // AAAA-MM-JJ
  /** « rien_a_planifier », « optimal », « faisable » (enregistré) ; sinon rien n'est enregistré ce jour-là. */
  statut: string;
  message: string;
  nbEnAttente: number;
  nbPlanifies: number;
  ignores: { rdvId: number; raison: string }[];
}

export interface ResultatSynchronisation {
  du: string;
  au: string;
  totalPlanifies: number;
  totalRestants: number;
  jours: JourSynchronise[];
}

/* ---------------- Conflits (calculés par le backend uniquement) ---------------- */

export type TypeConflit =
  | "PATIENT_DOUBLE_TACHE"
  | "SOIGNANT_DOUBLE_TACHE"
  | "SOIGNANT_DOUBLE_CHAMBRE"
  | "KINE_DOUBLE_PATIENT"
  | "HORS_HORAIRES"
  | "TOILETTE_AVANT_REEDUC"
  | "PLAGE_REPAS"
  | "PLATEAU_COMPLET";

export interface Conflit {
  id: string;
  type: TypeConflit;
  gravite: "bloquant" | "avertissement";
  message: string; // en français, affiché tel quel
  rdvIds: number[];
  patientId?: number;
  soignantId?: number;
}

/** Réponse d'une création / modification : le RDV et les conflits éventuels. */
export interface ReponseRdv {
  rdv: RendezVous;
  conflits: Conflit[];
}

/** Erreur normalisée, quelle que soit la forme renvoyée par FastAPI. */
export interface ErreurApi {
  status: number; // 0 = backend injoignable
  code: string;
  message: string; // en français, prêt à afficher
  conflits?: Conflit[];
}

/** Une chambre et les patients qui l'occupent un jour donné (vues Unité). */
export interface OccupationChambre {
  chambre: Chambre;
  patients: PatientResume[];
}
