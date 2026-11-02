import type { Config } from "tailwindcss";
import { COULEURS_UI, CATEGORIES_RDV } from "./src/theme/couleursRdv";

// Thème centralisé, construit à partir de la charte graphique (maquettes Canva).
// Les couleurs des RDV sont exposées sous la forme `bg-rdv-repas`, `bg-rdv-etp`…
const couleursRdv = Object.fromEntries(
  Object.entries(CATEGORIES_RDV).map(([cle, def]) => [cle.replace(/_/g, "-"), def.couleur]),
);

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Poppins", "system-ui", "sans-serif"] },
      colors: {
        jour: COULEURS_UI.jourActuel,
        orange: COULEURS_UI.orange,
        gris: COULEURS_UI.gris,
        violet: COULEURS_UI.violet,
        lien: COULEURS_UI.lien,
        valider: COULEURS_UI.valider,
        supprimer: COULEURS_UI.supprimer,
        erreur: COULEURS_UI.erreur,
        succes: COULEURS_UI.succes,
        rdv: couleursRdv,
      },
      // « Angles arrondis à 10 » sur Canva
      borderRadius: { charte: "0.625rem" },
      letterSpacing: { date: "0.25em" },
    },
  },
  plugins: [],
} satisfies Config;
