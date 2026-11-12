/**
 * Formes JSON exactes renvoyées par le backend FastAPI (app/schemas.py).
 * Seul adaptateurs.ts les manipule ; le reste du frontend utilise types/.
 */

export interface TokenJSON {
  access_token: string;
  token_type: string;
}

export interface ChambreJSON {
  id: number;
  numero: number;
  etage: number;
}

export interface LieuJSON {
  id: number;
  libelle: string;
}

export interface TypeRDVJSON {
  id: number;
  libelle: string;
  couleur: string;
  duree_par_defaut: number;
}

export interface PatientResumeJSON {
  id: number;
  login: string;
  nom: string;
  prenom: string;
}

export interface CoordonneesJSON {
  date_naissance?: string | null;
  email?: string | null;
  telephone?: string | null;
}

export interface PatientJSON extends PatientResumeJSON, CoordonneesJSON {
  date_arrivee: string;
  date_depart_prevue: string | null;
  chambre: ChambreJSON | null;
}

export interface SoignantResumeJSON {
  id: number;
  nom: string;
  prenom: string;
  profession: string;
}

export interface SoignantJSON extends SoignantResumeJSON, CoordonneesJSON {
  login: string;
  role: string;
}

/** GET/POST/PATCH /utilisateurs (UtilisateurOut). */
export interface UtilisateurJSON extends CoordonneesJSON {
  id: number;
  login: string;
  nom: string;
  prenom: string;
  role: string;
  profession: string | null;
  date_arrivee: string | null;
  date_depart_prevue: string | null;
  chambre_id: number | null;
  actif: boolean;
}

/** POST /utilisateurs (CompteCreation) ; PATCH : mêmes champs, tous facultatifs, sans role. */
export interface CompteJSON {
  role?: string;
  login?: string;
  nom?: string;
  prenom?: string;
  mot_de_passe?: string;
  profession?: string | null;
  date_arrivee?: string | null;
  date_depart_prevue?: string | null;
  chambre_id?: number | null;
  date_naissance?: string | null;
  email?: string | null;
  telephone?: string | null;
}

/** DELETE /utilisateurs/{id} (SuppressionOut). */
export interface SuppressionJSON {
  utilisateur_id: number;
  role: string;
  rdv_annules: number;
  rdv: {
    rdv_id: number;
    debut: string;
    fin: string;
    type: string;
    patient: string | null;
    remplacant: string | null;
    resultat: string;
  }[];
}

/**
 * GET /auth/moi. Le backend renvoie aussi la profession (soignant), la chambre
 * et les dates de séjour (patient). Les autres champs restent facultatifs.
 */
export interface MoiJSON {
  id: number;
  login: string;
  nom: string;
  prenom: string;
  role: string;
  profession?: string | null;
  chambre?: ChambreJSON | null;
  date_arrivee?: string | null;
  date_depart_prevue?: string | null;
  date_naissance?: string | null;
  email?: string | null;
  telephone?: string | null;
}

/** Conflit renvoyé par le backend après une création ou une modification (app/conflits.py). */
export interface ConflitJSON {
  id: string;
  type: string;
  gravite: "bloquant" | "avertissement";
  message: string;
  rdv_ids: number[];
  patient_id?: number | null;
  soignant_id?: number | null;
}

export interface RDVJSON {
  id: number;
  debut: string;
  fin: string;
  statut: string;
  commentaire: string | null;
  createur_id: number;
  patient: PatientResumeJSON | null;
  soignants: SoignantResumeJSON[];
  type: TypeRDVJSON;
  lieu: LieuJSON;
  /** Conflits concernant ce RDV, renvoyés après une création ou une modification. */
  conflits?: ConflitJSON[];
}

/** Corps de POST /rdv (RDVCreation) et PATCH /rdv/{id} (RDVModification). */
export interface RDVCreationJSON {
  debut: string;
  fin: string;
  statut?: string;
  commentaire?: string | null;
  soignant_ids: number[];
  patient_id: number | null;
  type_id: number;
  lieu_id: number;
}

/** POST /planification/synchroniser (SynchronisationOut). */
export interface SynchronisationJSON {
  du: string;
  au: string;
  total_planifies: number;
  total_restants: number;
  jours: {
    jour: string;
    statut: string;
    message: string;
    nb_en_attente: number;
    nb_planifies: number;
    incoherences: { code: string; gravite: string; message: string }[];
    ignores: { rdv_id: number; raison: string }[];
  }[];
}

/** GET /plan : chambres, patients présents ce jour-là, séance en cours. */
export interface PlanJSON {
  moment: string;
  chambres: {
    id: number;
    numero: number;
    etage: number;
    patients: { patient: PatientResumeJSON; rdv_en_cours: unknown | null }[];
  }[];
  hors_chambre: { patient: PatientResumeJSON; rdv_en_cours: unknown | null }[];
}
