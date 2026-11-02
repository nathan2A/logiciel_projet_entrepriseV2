/** Listes de référence : patients, soignants, types de RDV, lieux. */
import type { Lieu, Patient, Soignant, TypeRdv } from "@/types";
import { appeler } from "./client";
import { versLieu, versPatient, versSoignant, versTypeRdv } from "./adaptateurs";
import type { LieuJSON, PatientJSON, SoignantJSON, TypeRDVJSON } from "./backendTypes";

/** GET /patients (soignants uniquement). */
export async function listerPatients(): Promise<Patient[]> {
  return (await appeler<PatientJSON[]>({ methode: "GET", chemin: "/patients" })).map(versPatient);
}

/** GET /soignants (soignants uniquement). */
export async function listerSoignants(): Promise<Soignant[]> {
  return (await appeler<SoignantJSON[]>({ methode: "GET", chemin: "/soignants" })).map(versSoignant);
}

/** GET /types-rdv (tout utilisateur connecté). */
export async function listerTypesRdv(): Promise<TypeRdv[]> {
  return (await appeler<TypeRDVJSON[]>({ methode: "GET", chemin: "/types-rdv" })).map(versTypeRdv);
}

/** GET /lieux (tout utilisateur connecté). */
export async function listerLieux(): Promise<Lieu[]> {
  return (await appeler<LieuJSON[]>({ methode: "GET", chemin: "/lieux" })).map(versLieu);
}
