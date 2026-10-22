import type { Utilisateur } from "@/types";
import { appeler, stockageJeton } from "./client";
import { versUtilisateur } from "./adaptateurs";
import type { MoiJSON, TokenJSON } from "./backendTypes";

/** POST /auth/connexion (formulaire OAuth2 : username + password), puis GET /auth/moi. */
export async function connexion(identifiant: string, motDePasse: string): Promise<Utilisateur> {
  const jeton = await appeler<TokenJSON>(
    {
      methode: "POST",
      chemin: "/auth/connexion",
      formulaire: { username: identifiant.trim(), password: motDePasse },
    },
    false,
  );
  stockageJeton.ecrire(jeton.access_token);
  try {
    return await moi();
  } catch (e) {
    stockageJeton.ecrire(null);
    throw e;
  }
}

/** GET /auth/moi : la personne connectée. */
export async function moi(): Promise<Utilisateur> {
  return versUtilisateur(await appeler<MoiJSON>({ methode: "GET", chemin: "/auth/moi" }));
}

/** Le backend n'a pas de route de déconnexion : le jeton est simplement oublié. */
export function deconnexion() {
  stockageJeton.ecrire(null);
}
