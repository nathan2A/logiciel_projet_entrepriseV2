import { estErreurApi } from "@/services/api/client";

/** Message d'erreur d'une création / modification de profil (doublon → pop-up dédié). */
export function erreurProfil(e: unknown): { titre: string; message: string } {
  if (estErreurApi(e) && e.code === "PROFIL_EXISTANT") return { titre: "Profil déjà existant", message: e.message };
  return { titre: "Erreur", message: estErreurApi(e) ? e.message : "L’action n’a pas pu être effectuée." };
}
