/**
 * Code couleur STRICT des rendez-vous (charte graphique du projet).
 * C'est la seule source de vérité : planning, pastilles des unités,
 * légende et pop-ups lisent tous cette table.
 */

export type CategorieRdv =
  | "repas"
  | "prise_de_sang"
  | "kine_chambre"
  | "kine_plateau"
  | "rdv_exterieur"
  | "visite"
  | "indisponible"
  | "etp"
  | "arthromoteur"
  | "soins_pluripro"
  | "staff"
  | "transmissions"
  | "autre";

export interface DefinitionCategorie {
  libelle: string; // libellé affiché (légende, liste « Nom RDV »)
  couleur: string; // couleur de fond imposée par la charte
}

export const CATEGORIES_RDV: Record<Exclude<CategorieRdv, "autre">, DefinitionCategorie> = {
  repas: { libelle: "Repas", couleur: "#3f128a" },
  prise_de_sang: { libelle: "Prise de sang", couleur: "#b32c2c" },
  kine_chambre: { libelle: "Rdv Kiné chambre", couleur: "#a430c1" },
  kine_plateau: { libelle: "Rdv Kiné plateau", couleur: "#e2a9f0" },
  rdv_exterieur: { libelle: "RdV extérieur", couleur: "#c1ff72" },
  visite: { libelle: "Visite", couleur: "#ce7600" },
  indisponible: { libelle: "Indisponible", couleur: "#ff9999" },
  etp: { libelle: "ETP", couleur: "#3b99f0" },
  arthromoteur: { libelle: "Arthromoteur", couleur: "#ff5757" },
  soins_pluripro: { libelle: "Soins pluripro", couleur: "#995a34" },
  staff: { libelle: "Staff", couleur: "#6d7624" },
  transmissions: { libelle: "Transmissions", couleur: "#ff914d" },
};

/** Ordre d'affichage dans la légende et les listes. */
export const ORDRE_CATEGORIES = Object.keys(CATEGORIES_RDV) as Exclude<CategorieRdv, "autre">[];

/** Couleurs de l'interface (hors rendez-vous), relevées sur les maquettes Canva. */
export const COULEURS_UI = {
  jourActuel: "#9de6ba",
  orange: "#ffe4bb", // blocs nom / chambre, « Ajouter un RDV », connexion
  gris: "#e5ebeb", // colonnes du planning, bandeau « Nouveau RDV »
  violet: "#3f128a", // flèches de navigation
  lien: "#004aad", // « Modifier le RDV », « Cliquez pour vous déconnecter »
  valider: "#145504", // « Valider le RDV »
  supprimer: "#b32c2c", // « Supprimer le RDV »
  erreur: "#e61c26",
  succes: "#45c540",
};

/** Supprime accents et majuscules pour comparer des libellés. */
function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Retrouve la catégorie de la charte à partir du libellé d'un type de RDV
 * renvoyé par le backend (table types_rdv). Les libellés de la charte sont
 * reconnus tels quels ; quelques variantes courantes aussi.
 * Si rien ne correspond, on renvoie « autre » et la couleur du backend est utilisée.
 */
export function categorieDepuisLibelle(libelle: string): CategorieRdv {
  const l = normaliser(libelle);
  if (l.includes("repas")) return "repas";
  if (l.includes("prise de sang") || l.includes("bilan sanguin")) return "prise_de_sang";
  if (l.includes("kine") && l.includes("chambre")) return "kine_chambre";
  if (l.includes("kine")) return "kine_plateau";
  if (l.includes("exterieur")) return "rdv_exterieur";
  if (l.includes("visite")) return "visite";
  if (l.includes("indisponible")) return "indisponible";
  if (l === "etp" || l.includes("education therapeutique")) return "etp";
  if (l.includes("arthromoteur")) return "arthromoteur";
  if (l.includes("pluripro")) return "soins_pluripro";
  if (l.includes("staff")) return "staff";
  if (l.includes("transmission")) return "transmissions";
  return "autre";
}

/** Couleur de fond d'un RDV : la charte d'abord, sinon la couleur fournie par le backend. */
export function couleurRdv(categorie: CategorieRdv, couleurBackend?: string): string {
  if (categorie !== "autre") return CATEGORIES_RDV[categorie].couleur;
  return couleurBackend || "#888888";
}

/* ---------- Contraste (WCAG) : texte blanc ou noir selon le fond ---------- */

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Renvoie la couleur de texte (blanc ou quasi-noir) offrant le meilleur contraste. */
export function couleurTexteSur(fond: string): string {
  const L = luminance(fond);
  const contrasteBlanc = 1.05 / (L + 0.05);
  const contrasteNoir = (L + 0.05) / 0.05;
  return contrasteBlanc >= contrasteNoir ? "#ffffff" : "#111111";
}
