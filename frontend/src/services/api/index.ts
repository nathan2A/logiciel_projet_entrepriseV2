/** Point d'entrée unique de la couche d'accès aux données. */
export * as authApi from "./auth";
export * as rdvApi from "./rdv";
export * as referentielApi from "./referentiel";
export * as planApi from "./plan";
export * as planificationApi from "./planification";
export { estErreurApi, quandNonAutorise } from "./client";
export { USE_MOCK, POLLING_MS } from "./config";
