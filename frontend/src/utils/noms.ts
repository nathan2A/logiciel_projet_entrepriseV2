/**
 * Affichage des noms de personnes, partout dans l'interface :
 * NOM en majuscules, Prénom avec une majuscule initiale (« DUPONT Daniel »,
 * « DUBOIS Marie-Claire »). Même règle que le backend (app/conflits.py, nom_affiche).
 */

/** « marie-claire » → « Marie-Claire », « jean pierre » → « Jean Pierre ». */
export function formatPrenom(prenom: string): string {
  return (prenom ?? "")
    .trim()
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, lettre: string) => sep + lettre.toUpperCase());
}

/** « DUPONT Daniel ». */
export function formatNom(p: { nom: string; prenom: string }): string {
  return `${(p.nom ?? "").trim().toUpperCase()} ${formatPrenom(p.prenom)}`.trim();
}

/** Plusieurs personnes : « QUINET Marc, MADEC Claire », ou « Aucun ». */
export function formatNoms(personnes: { nom: string; prenom: string }[], vide = "Aucun"): string {
  return personnes.length ? personnes.map(formatNom).join(", ") : vide;
}

const comparable = (t: string) =>
  t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Identifiant affiché comme à la connexion : un identifiant de la forme
 * « nom prénom » s'écrit « DUPONT Daniel » ; un identifiant technique (a05, kine1) reste tel quel.
 */
export const identifiantAffiche = (u: { login: string; nom: string; prenom: string }) =>
  comparable(u.login) === comparable(`${u.nom} ${u.prenom}`) ? formatNom(u) : u.login;
