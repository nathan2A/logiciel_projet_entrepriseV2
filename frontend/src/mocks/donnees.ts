/**
 * Données fictives du mode mock, au format JSON exact du backend.
 * Les RDV sont générés autour de la date du jour pour que l'agenda soit
 * toujours rempli, de façon déterministe (même résultat à chaque chargement).
 */
import { addDays, format, startOfWeek } from "date-fns";
import { CATEGORIES_RDV, type CategorieRdv } from "@/theme/couleursRdv";
import type { ChambreJSON, LieuJSON, TypeRDVJSON } from "@/services/api/backendTypes";

export interface UtilisateurMock {
  id: number;
  login: string;
  nom: string;
  prenom: string;
  role: "patient" | "soignant" | "administrateur";
  profession?: string;
  date_naissance?: string;
  email?: string;
  telephone?: string;
  // patients
  date_arrivee?: string;
  date_depart_prevue?: string | null;
  chambre_id?: number | null;
}

export interface RdvMock {
  id: number;
  debut: string;
  fin: string;
  statut: "planifie" | "en_attente" | "realise" | "annule";
  commentaire: string | null;
  createur_id: number;
  soignant_ids: number[]; // zéro, un ou plusieurs soignants
  patient_id: number | null; // null : RDV entre soignants
  type_id: number;
  lieu_id: number;
}

/* ------------------------------ Chambres ------------------------------ */
// Comme donnees_v1.xlsx : 101-118 à l'étage 0 (Unité 0), 201-224 à l'étage 1 (Unité 1)
export const chambres: ChambreJSON[] = [
  ...Array.from({ length: 18 }, (_, i) => ({ id: i + 1, numero: 101 + i, etage: 0 })),
  ...Array.from({ length: 24 }, (_, i) => ({ id: 19 + i, numero: 201 + i, etage: 1 })),
];
const chambreId = (numero: number) => chambres.find((c) => c.numero === numero)!.id;

/* ------------------------------ Lieux ------------------------------ */
export const lieux: LieuJSON[] = [
  { id: 1, libelle: "Chambre du patient" },
  { id: 2, libelle: "Plateau de kiné" },
  { id: 3, libelle: "Salle de restaurant" },
  { id: 4, libelle: "Unité de soins" },
  { id: 5, libelle: "Salle d'éducation thérapeutique" },
  { id: 6, libelle: "Extérieur" },
];
const LIEU = { chambre: 1, plateau: 2, restaurant: 3, soins: 4, etp: 5, exterieur: 6 };

/* ------------------------------ Types de RDV ------------------------------ */
// Les libellés sont ceux de la charte, les couleurs aussi.
const DUREES: Record<string, number> = {
  repas: 60, prise_de_sang: 15, kine_chambre: 30, kine_plateau: 60, rdv_exterieur: 120,
  visite: 30, indisponible: 60, etp: 60, arthromoteur: 30, soins_pluripro: 30, staff: 30, transmissions: 30,
};
export const typesRdv: TypeRDVJSON[] = Object.entries(CATEGORIES_RDV).map(([cle, def], i) => ({
  id: i + 1,
  libelle: def.libelle,
  couleur: def.couleur,
  duree_par_defaut: DUREES[cle] ?? 30,
}));
const typeId = (c: Exclude<CategorieRdv, "autre">) =>
  typesRdv.find((t) => t.libelle === CATEGORIES_RDV[c].libelle)!.id;

/* ------------------------------ Soignants ------------------------------ */
// Pour l'instant, tous les soignants sont administrateurs.
const soignant = (id: number, nom: string, prenom: string, profession: string, naissance: string): UtilisateurMock => ({
  id,
  login: `${nom} ${prenom}`,
  nom,
  prenom,
  role: "administrateur",
  profession,
  date_naissance: naissance,
  email: `${prenom}.${nom}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s/g, "") + "@chu-brest.fr",
  telephone: `02 98 99 ${String(10 + id).padStart(2, "0")} ${String(30 + id * 3).padStart(2, "0")}`,
});

export const soignants: UtilisateurMock[] = [
  soignant(1, "QUINET", "Marc", "Kinésithérapeute", "1984-03-12"),
  soignant(2, "LE FUR", "Sophie", "Kinésithérapeute", "1990-07-25"),
  soignant(3, "MADEC", "Claire", "Aide-soignante", "1979-11-02"),
  soignant(4, "RIOU", "Nathalie", "Aide-soignante", "1988-01-18"),
  soignant(5, "JAOUEN", "Julie", "Infirmière", "1992-05-30"),
  soignant(6, "LE MEUR", "Pierre", "Médecin", "1975-09-08"),
];
const S = { quinet: 1, leFur: 2, madec: 3, riou: 4, jaouen: 5, leMeur: 6 };

/* ------------------------------ Patients ------------------------------ */
const aujourdhui = new Date();
const jour = (decalage: number) => format(addDays(aujourdhui, decalage), "yyyy-MM-dd");

const patient = (
  id: number, nom: string, prenom: string, chambre: number, arrivee: number, depart: number, naissance: string,
): UtilisateurMock => ({
  id,
  login: `${nom} ${prenom}`,
  nom,
  prenom,
  role: "patient",
  date_naissance: naissance,
  email: `${prenom}.${nom}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s/g, "") + "@exemple.fr",
  telephone: `06 ${String(id).padStart(2, "0")} 45 ${String(id * 7 % 100).padStart(2, "0")} 12`,
  date_arrivee: jour(arrivee),
  date_depart_prevue: jour(depart),
  chambre_id: chambreId(chambre),
});

export const patients: UtilisateurMock[] = [
  // Unité 0
  patient(101, "DUPONT", "Daniel", 101, -14, 14, "1946-04-03"),
  patient(102, "DUBOIS", "Marie-Claire", 102, -9, 12, "1951-08-21"),
  patient(103, "MARTIN", "Jean-Pierre", 103, -20, 3, "1939-12-14"),
  patient(104, "DUBOIS", "Marise", 104, -5, 19, "1944-02-27"),
  patient(105, "LE GALL", "Yvonne", 106, -12, 9, "1937-06-09"),
  patient(106, "MORVAN", "Anne", 109, -3, 20, "1958-10-30"),
  patient(107, "LE BIHAN", "Hervé", 112, -16, 6, "1949-03-17"),
  // Unité 1
  patient(108, "KERHERVÉ", "Louis", 201, -8, 13, "1942-01-05"),
  patient(109, "GUILLOU", "Marie", 203, -2, 22, "1953-07-11"),
  patient(110, "LE ROUX", "Françoise", 205, -18, 4, "1940-09-19"),
  patient(111, "TANGUY", "Paul", 208, -6, 16, "1947-11-23"),
  patient(112, "PRIGENT", "Jeanne", 212, -11, 10, "1935-04-28"),
  patient(113, "CORRE", "René", 215, -1, 21, "1950-02-02"),
];

export const utilisateurs: UtilisateurMock[] = [...soignants, ...patients];

/* ------------------------------ Rendez-vous ------------------------------ */

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function aleatoire(graine: number) {
  let a = graine;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (d: Date, hhmm: string) => `${format(d, "yyyy-MM-dd")}T${hhmm}:00`;
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function genererRdv(): RdvMock[] {
  const hasard = aleatoire(2026);
  const choisir = <T,>(liste: T[]) => liste[Math.floor(hasard() * liste.length)];
  const rdv: RdvMock[] = [];
  let id = 1;
  const debutPeriode = addDays(startOfWeek(aujourdhui, { weekStartsOn: 1 }), -21);
  // Créneaux des kinés (9h-18h) : groupes sur le plateau, et séances individuelles en chambre
  const SEANCES_PLATEAU: [string, number][] = [["09:30", S.quinet], ["14:30", S.quinet], ["10:00", S.leFur], ["16:00", S.leFur]];
  const SEANCES_CHAMBRE: [string, number][] = [
    ["10:30", S.quinet], ["15:30", S.quinet], ["16:00", S.quinet], ["16:30", S.quinet], ["17:00", S.quinet],
    ["09:00", S.leFur], ["09:30", S.leFur], ["14:00", S.leFur], ["14:30", S.leFur], ["15:00", S.leFur], ["17:00", S.leFur],
  ];
  const kineOccupe = new Set<string>();

  for (let j = 0; j < 7 * 8; j++) {
    const date = addDays(debutPeriode, j);
    const cle = format(date, "yyyy-MM-dd");
    const ouvre = date.getDay() >= 1 && date.getDay() <= 5;

    for (const p of patients) {
      if (cle < p.date_arrivee! || cle > p.date_depart_prevue!) continue;
      const occupe: [number, number][] = [];
      const ajouter = (
        cat: Exclude<CategorieRdv, "autre">, debut: string, duree: number, soignantIds: number[], lieuId: number,
        commentaire: string | null, createurId: number = S.leMeur,
      ): boolean => {
        const d = minutes(debut);
        const f = d + duree;
        if (occupe.some(([a, b]) => d < b && a < f)) return false;
        occupe.push([d, f]);
        rdv.push({
          id: id++, debut: iso(date, debut), fin: iso(date, hhmm(f)), statut: "planifie", commentaire,
          createur_id: createurId, soignant_ids: soignantIds, patient_id: p.id, type_id: typeId(cat), lieu_id: lieuId,
        });
        return true;
      };

      // Repas tous les jours
      ajouter("repas", "12:00", 60, [S.madec], LIEU.restaurant, "Déjeuner en salle de restaurant");
      ajouter("repas", "18:00", 60, [S.riou], LIEU.restaurant, "Dîner");

      if (ouvre) {
        // Prise de sang deux matins par semaine environ
        if (hasard() < 0.35) ajouter("prise_de_sang", "08:00", 15, [S.jaouen], LIEU.chambre, "Bilan sanguin à jeun");
        // Une séance de kiné par jour : séance de groupe sur le plateau (créneaux
        // fixes) ou séance individuelle en chambre (un seul patient à la fois par kiné).
        if (hasard() < 0.7) {
          const [debut, kine] = choisir(SEANCES_PLATEAU);
          ajouter("kine_plateau", debut, 60, [kine], LIEU.plateau, "Exercices sur le plateau de kiné");
        } else {
          const libres = SEANCES_CHAMBRE.filter(([d, k]) => !kineOccupe.has(`${cle}|${d}|${k}`));
          for (const [debut, kine] of libres.sort(() => hasard() - 0.5)) {
            if (ajouter("kine_chambre", debut, 30, [kine], LIEU.chambre, "Mobilisation au lit et transferts")) {
              kineOccupe.add(`${cle}|${debut}|${kine}`);
              break;
            }
          }
        }
        if (hasard() < 0.2) ajouter("visite", "10:30", 30, [S.leMeur], LIEU.chambre, "Visite médicale");
        if (hasard() < 0.15) ajouter("etp", "16:30", 60, [S.jaouen], LIEU.etp, "Atelier « Bien vivre avec son traitement »");
        if (hasard() < 0.15) ajouter("arthromoteur", "17:30", 30, [S.riou], LIEU.chambre, "Arthromoteur genou droit");
        if (hasard() < 0.12) ajouter("soins_pluripro", "17:00", 30, [S.jaouen, S.madec], LIEU.soins, "Pansement et point douleur (IDE + aide-soignante)");
        if (hasard() < 0.05) ajouter("rdv_exterieur", "09:00", 120, [S.jaouen], LIEU.exterieur, "Consultation au CHU de Brest (transport en VSL)");
        if (hasard() < 0.04) ajouter("indisponible", "14:00", 60, [S.leMeur], LIEU.chambre, "Examen d'imagerie");
      } else if (hasard() < 0.5) {
        // Week-end : visite des proches, ajoutée par le patient lui-même (sans soignant)
        ajouter("visite", "14:00", 120, [], LIEU.chambre, "Visite de la famille", p.id);
      }
    }

    // RDV entre soignants, sans patient : staff le lundi, transmissions chaque jour ouvré
    const reunion = (cat: "staff" | "transmissions", debut: string, duree: number, soignantIds: number[], commentaire: string) =>
      rdv.push({
        id: id++, debut: iso(date, debut), fin: iso(date, hhmm(minutes(debut) + duree)), statut: "planifie", commentaire,
        createur_id: S.leMeur, soignant_ids: soignantIds, patient_id: null, type_id: typeId(cat), lieu_id: LIEU.soins,
      });
    if (date.getDay() === 1) reunion("staff", "13:30", 30, [S.leMeur, S.quinet, S.leFur, S.jaouen], "Staff pluridisciplinaire");
    if (ouvre) reunion("transmissions", "13:00", 30, [S.madec, S.riou, S.jaouen], "Transmissions de l'équipe");
  }
  return rdv;
}
