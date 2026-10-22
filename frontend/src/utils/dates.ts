/** Petits utilitaires de dates (affichage en français, ISO local comme le backend). */
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";

/** Date → "2026-11-03T09:30:00" (heure locale, sans fuseau, comme FastAPI). */
export const versIsoLocal = (d: Date): string => format(d, "yyyy-MM-dd'T'HH:mm:ss");

export const depuisIso = (iso: string): Date => parseISO(iso);

/** Lundi 00:00 de la semaine contenant d. */
export const lundiDe = (d: Date): Date => startOfWeek(d, { weekStartsOn: 1 });

/** "14/10/2026" */
export const jjmmaaaa = (d: Date): string => format(d, "dd/MM/yyyy");

/** "LUN.12" (en-têtes de colonnes du planning) */
export const enteteJour = (d: Date): string =>
  `${format(d, "EEE", { locale: fr }).replace(".", "").slice(0, 3).toUpperCase()}.${format(d, "d")}`;

/** "Lun. 12/10/2026" (pop-up d'information) */
export const jourCourtEtDate = (d: Date): string => {
  const j = format(d, "EEE", { locale: fr }).replace(".", "");
  return `${j.charAt(0).toUpperCase()}${j.slice(1, 3)}. ${jjmmaaaa(d)}`;
};

/** "8h", "14h30" */
export const heureCourte = (d: Date): string => {
  const m = d.getMinutes();
  return `${d.getHours()}h${m ? String(m).padStart(2, "0") : ""}`;
};

/** "14h - 15h" */
export const plageHoraire = (debut: Date, fin: Date): string => `${heureCourte(debut)} - ${heureCourte(fin)}`;

export { addDays };
