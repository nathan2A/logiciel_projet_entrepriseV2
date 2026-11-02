/**
 * Client HTTP unique. Aucun composant n'appelle fetch directement.
 * En mode mock (VITE_USE_MOCK=true), le « transport » est remplacé par un
 * faux backend en mémoire qui renvoie exactement le même JSON que FastAPI :
 * le reste du code (adaptateurs, hooks, écrans) est identique dans les deux modes.
 */
import type { Conflit, ErreurApi } from "@/types";
import { API_URL, USE_MOCK } from "./config";
import { versConflit } from "./adaptateurs";
import type { ConflitJSON } from "./backendTypes";
import { transportMock } from "@/mocks/serveurMock";

export type Methode = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface Requete {
  methode: Methode;
  chemin: string; // ex. "/rdv"
  query?: Record<string, string | number | boolean | undefined | null>;
  json?: unknown;
  formulaire?: Record<string, string>; // envoyé en application/x-www-form-urlencoded
  jeton?: string | null;
}

export interface Reponse {
  status: number;
  data: unknown;
}

export type Transport = (r: Requete) => Promise<Reponse>;

/* ------------------------- Jeton de connexion ------------------------- */

const CLE_JETON = "smr-agenda-jeton";

export const stockageJeton = {
  lire(): string | null {
    try {
      return sessionStorage.getItem(CLE_JETON);
    } catch {
      return null;
    }
  },
  ecrire(jeton: string | null) {
    try {
      if (jeton) sessionStorage.setItem(CLE_JETON, jeton);
      else sessionStorage.removeItem(CLE_JETON);
    } catch {
      /* stockage indisponible : la session ne survivra pas au rechargement */
    }
  },
};

/* ------------------------- Transport réel (fetch) ------------------------- */

function construireUrl(chemin: string, query?: Requete["query"]): string {
  const params = new URLSearchParams();
  Object.entries(query ?? {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  });
  const qs = params.toString();
  return `${API_URL}${chemin}${qs ? `?${qs}` : ""}`;
}

const transportHttp: Transport = async (r) => {
  const headers: Record<string, string> = { Accept: "application/json" };
  let body: BodyInit | undefined;
  if (r.formulaire) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(r.formulaire).toString();
  } else if (r.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(r.json);
  }
  if (r.jeton) headers.Authorization = `Bearer ${r.jeton}`;

  const res = await fetch(construireUrl(r.chemin, r.query), { method: r.methode, headers, body });
  const texte = await res.text();
  let data: unknown = null;
  try {
    data = texte ? JSON.parse(texte) : null;
  } catch {
    data = texte;
  }
  return { status: res.status, data };
};

const transport: Transport = USE_MOCK ? transportMock : transportHttp;

/* ------------------------- Erreurs ------------------------- */

const MESSAGES_PAR_STATUT: Record<number, string> = {
  0: "Le serveur est injoignable. Les dernières données connues restent affichées.",
  401: "Votre session a expiré. Merci de vous reconnecter.",
  403: "Vous n'avez pas les droits pour effectuer cette action.",
  404: "L'élément demandé n'existe plus.",
  409: "L'action est refusée car elle crée un conflit dans le planning.",
  422: "Certaines informations saisies sont invalides.",
  500: "Erreur interne du serveur. Réessayez dans un instant.",
};

/**
 * FastAPI renvoie { detail: "texte" }, { detail: [ {msg, loc}, ... ] } (validation)
 * ou, pour les conflits bloquants, { detail: { code, message, conflits } }.
 */
function normaliserErreur(status: number, data: unknown): ErreurApi {
  const base: ErreurApi = {
    status,
    code: `HTTP_${status}`,
    message: MESSAGES_PAR_STATUT[status] ?? "L'action n'a pas pu être effectuée.",
  };
  const detail = (data as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return { ...base, message: detail };
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) => (d as { msg?: string }).msg?.replace(/^Value error, /, ""))
      .filter(Boolean);
    return { ...base, code: "VALIDATION", message: msgs.join(" ") || base.message };
  }
  if (detail && typeof detail === "object") {
    const d = detail as { code?: string; message?: string; conflits?: ConflitJSON[] };
    return {
      ...base,
      code: d.code ?? base.code,
      message: d.message ?? base.message,
      conflits: d.conflits?.map(versConflit) as Conflit[] | undefined,
    };
  }
  return base;
}

export function estErreurApi(e: unknown): e is ErreurApi {
  return typeof e === "object" && e !== null && "status" in e && "message" in e && "code" in e;
}

/* ------------------------- Appel générique ------------------------- */

/** Prévenu quand le backend répond 401 (jeton expiré) : l'AuthProvider déconnecte. */
let surNonAutorise: (() => void) | null = null;
export function quandNonAutorise(f: (() => void) | null) {
  surNonAutorise = f;
}

export async function appeler<T>(r: Omit<Requete, "jeton">, avecJeton = true): Promise<T> {
  let reponse: Reponse;
  try {
    reponse = await transport({ ...r, jeton: avecJeton ? stockageJeton.lire() : null });
  } catch {
    throw normaliserErreur(0, null);
  }
  if (reponse.status >= 200 && reponse.status < 300) return reponse.data as T;
  if (reponse.status === 401 && avecJeton) surNonAutorise?.();
  throw normaliserErreur(reponse.status, reponse.data);
}
