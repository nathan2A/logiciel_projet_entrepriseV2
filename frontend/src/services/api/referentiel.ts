/** Listes de référence : patients, soignants, types de RDV, lieux, chambres. */
import type { Chambre, Lieu, Patient, Soignant, TypeRdv } from "@/types";
import { appeler } from "./client";
import { versChambre, versLieu, versPatient, versSoignant, versTypeRdv } from "./adaptateurs";
import type { ChambreJSON, LieuJSON, PatientJSON, SoignantJSON, TypeRDVJSON } from "./backendTypes";

/** GET /chambres (soignants uniquement). */
export async function listerChambres(): Promise<Chambre[]> {
  return (await appeler<ChambreJSON[]>({ methode: "GET", chemin: "/chambres" })).map(versChambre);
}

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
