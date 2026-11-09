/**
 * Bandeau « À planifier » au-dessus du planning : RDV « en attente » de la
 * semaine affichée, qui n'ont pas encore d'heure. Le bouton « Synchroniser »
 * (en haut à droite) les place avec le solveur. Cliquer sur un RDV ouvre sa
 * fiche (modifier, supprimer, ou lui donner une heure fixe).
 */
import { useState } from "react";
import { FaHourglassHalf } from "react-icons/fa6";
import type { RendezVous } from "@/types";
import { depuisIso, jourCourtEtDate } from "@/utils/dates";
import { formatNom } from "@/utils/noms";

export function ListeEnAttente({ rdvs, onOuvrir }: { rdvs: RendezVous[]; onOuvrir: (r: RendezVous) => void }) {
  const [ouvert, setOuvert] = useState(true);
  if (!rdvs.length) return null;
  const tries = [...rdvs].sort((a, b) => a.debut.localeCompare(b.debut) || a.id - b.id);
  const duree = (r: RendezVous) => Math.round((depuisIso(r.fin).getTime() - depuisIso(r.debut).getTime()) / 60000);

  return (
    <div className="rounded-charte border border-dashed border-[#b88400] bg-[#fff8e6] px-[0.9rem] py-[0.4rem] text-[0.95rem]">
      <div className="flex items-center gap-[0.6rem]">
        <FaHourglassHalf aria-hidden className="text-[#b88400]" />
        <span>
          <strong>{rdvs.length} RDV à planifier</strong> cette semaine : cliquez sur « Synchroniser » (en haut à droite)
          pour que le solveur leur choisisse une heure.
        </span>
        <button type="button" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} className="ml-auto text-lien underline">
          {ouvert ? "Masquer" : "Afficher"}
        </button>
      </div>
      {ouvert && (
        <ul className="mt-[0.3rem] flex flex-wrap gap-[0.4rem]">
          {tries.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onOuvrir(r)}
                className="rounded-full border border-[#b88400]/40 bg-white px-[0.7rem] py-[0.1rem] hover:bg-orange"
              >
                {jourCourtEtDate(depuisIso(r.debut))} · {r.type.libelle} · {duree(r)} min
                {r.patient ? ` · ${formatNom(r.patient)}` : ""}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
