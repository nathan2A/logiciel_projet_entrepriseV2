/** Configuration lue dans les variables d'environnement Vite (.env). */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";
export const API_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");
export const POLLING_MS = Number(import.meta.env.VITE_POLLING_MS) || 30_000;
