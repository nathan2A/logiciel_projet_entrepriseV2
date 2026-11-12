/**
 * Gestion des profils (tous les soignants sont administrateurs) :
 * POST / PATCH / DELETE /utilisateurs.
 * « Supprimer » archive le profil côté backend (historique conservé).
 */
import type { ResultatSuppression, SaisieProfil } from "@/types";
import { appeler } from "./client";
import type { CompteJSON, SuppressionJSON, UtilisateurJSON } from "./backendTypes";

const ouNull = (t: string) => (t.trim() ? t.trim() : null);

/** Corps envoyé au backend. En modification, un mot de passe vide n'est pas envoyé. */
function versCompteJSON(s: SaisieProfil, creation: boolean): CompteJSON {
  const corps: CompteJSON = {
    login: s.identifiant.trim(),
    nom: s.nom.trim(),
    prenom: s.prenom.trim(),
    date_naissance: ouNull(s.dateNaissance),
    email: ouNull(s.email),
    telephone: ouNull(s.telephone),
  };
  if (creation) corps.role = s.type;
  if (s.motDePasse) corps.mot_de_passe = s.motDePasse;
  if (s.type === "soignant") {
    corps.profession = s.profession.trim();
  } else {
    corps.chambre_id = s.chambreId;
    corps.date_arrivee = s.dateArrivee;
    if (!creation || s.dateDepartPrevue) corps.date_depart_prevue = ouNull(s.dateDepartPrevue);
  }
  return corps;
}

export async function creerProfil(s: SaisieProfil): Promise<{ id: number }> {
  const r = await appeler<UtilisateurJSON>({ methode: "POST", chemin: "/utilisateurs", json: versCompteJSON(s, true) });
  return { id: r.id };
}

export async function modifierProfil(id: number, s: SaisieProfil): Promise<void> {
  await appeler<UtilisateurJSON>({ methode: "PATCH", chemin: `/utilisateurs/${id}`, json: versCompteJSON(s, false) });
}

export async function supprimerProfil(id: number): Promise<ResultatSuppression> {
  const r = await appeler<SuppressionJSON>({ methode: "DELETE", chemin: `/utilisateurs/${id}` });
  return {
    utilisateurId: r.utilisateur_id,
    role: r.role as ResultatSuppression["role"],
    rdvAnnules: r.rdv_annules,
    rdv: r.rdv.map((x) => ({
      rdvId: x.rdv_id,
      debut: x.debut,
      fin: x.fin,
      type: x.type,
      patient: x.patient,
      remplacant: x.remplacant,
      resultat: x.resultat as ResultatSuppression["rdv"][number]["resultat"],
    })),
  };
}
