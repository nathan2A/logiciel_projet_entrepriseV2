/** Valeurs initiales du formulaire de profil (création vide, ou depuis un profil existant). */
import type { Patient, SaisieProfil, Soignant, TypeProfil, Utilisateur } from "@/types";

const VIDE: Omit<SaisieProfil, "type"> = {
  nom: "",
  prenom: "",
  dateNaissance: "",
  email: "",
  telephone: "",
  identifiant: "",
  motDePasse: "",
  profession: "",
  chambreId: null,
  dateArrivee: "",
  dateDepartPrevue: "",
};

const jour = (iso?: string | null) => (iso ? iso.slice(0, 10) : "");

export const saisieVide = (type: TypeProfil): SaisieProfil => ({
  ...VIDE,
  type,
  dateArrivee: type === "patient" ? new Date().toLocaleDateString("sv-SE") : "", // AAAA-MM-JJ local
});

export const saisieDepuisPatient = (p: Patient): SaisieProfil => ({
  ...VIDE,
  type: "patient",
  nom: p.nom,
  prenom: p.prenom,
  dateNaissance: jour(p.dateNaissance),
  email: p.email ?? "",
  telephone: p.telephone ?? "",
  identifiant: p.login,
  chambreId: p.chambre?.id ?? null,
  dateArrivee: jour(p.dateArrivee),
  dateDepartPrevue: jour(p.dateDepartPrevue),
});

export const saisieDepuisSoignant = (s: Soignant | Utilisateur): SaisieProfil => ({
  ...VIDE,
  type: "soignant",
  nom: s.nom,
  prenom: s.prenom,
  dateNaissance: jour(s.dateNaissance),
  email: s.email ?? "",
  telephone: s.telephone ?? "",
  identifiant: s.login,
  profession: s.profession ?? "",
});
