/**
 * Choix d'un ou plusieurs patients (« Patients(s) : »), avec recherche.
 * Plusieurs patients = séance de groupe (un RDV par patient côté backend).
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Patient } from "@/types";

interface Props {
  patients: Patient[];
  valeur: number[];
  onChange: (ids: number[]) => void;
  idLibelle: string; // id du libellé « Patients(s) : » (accessibilité)
}

const nom = (p: Patient) => `${p.nom} ${p.prenom}`;

export function SelectPatients({ patients, valeur, onChange, idLibelle }: Props) {
  const [ouvert, setOuvert] = useState(false);
  const [recherche, setRecherche] = useState("");
  const idListe = useId();
  const racine = useRef<HTMLDivElement>(null);

  // Fermeture en cliquant ailleurs
  useEffect(() => {
    if (!ouvert) return;
    const clic = (e: MouseEvent) => {
      if (!racine.current?.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener("mousedown", clic);
    return () => document.removeEventListener("mousedown", clic);
  }, [ouvert]);

  const tries = useMemo(
    () => [...patients].sort((a, b) => (a.chambre?.numero ?? 9999) - (b.chambre?.numero ?? 9999) || nom(a).localeCompare(nom(b))),
    [patients],
  );
  const filtres = tries.filter((p) =>
    `${nom(p)} ${p.chambre?.numero ?? ""}`.toLowerCase().includes(recherche.trim().toLowerCase()),
  );
  const choisis = tries.filter((p) => valeur.includes(p.id));

  const basculer = (id: number) => onChange(valeur.includes(id) ? valeur.filter((v) => v !== id) : [...valeur, id]);

  return (
    <div ref={racine} className="relative min-w-0 flex-1">
      <button
        type="button"
        aria-labelledby={idLibelle}
        aria-expanded={ouvert}
        aria-controls={idListe}
        onClick={() => setOuvert((o) => !o)}
        onKeyDown={(e) => e.key === "Escape" && ouvert && (e.stopPropagation(), setOuvert(false))}
        className="champ-rdv w-full truncate text-left"
      >
        {choisis.length ? choisis.map(nom).join(", ") : <span className="text-[#888]">Choisir…</span>}
      </button>
      {ouvert && (
        <div
          id={idListe}
          className="absolute left-0 right-0 top-full z-10 mt-[0.2rem] rounded-charte border border-[#999] bg-white p-[0.5rem] shadow-lg"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setOuvert(false);
            }
          }}
        >
          <input
            autoFocus
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un nom ou une chambre"
            aria-label="Rechercher un patient"
            className="mb-[0.4rem] w-full rounded-[0.4rem] border border-[#bbb] px-[0.5rem] py-[0.2rem] text-[0.95rem]"
          />
          <ul className="max-h-[12rem] overflow-y-auto text-[0.95rem]">
            {filtres.map((p) => (
              <li key={p.id}>
                <label className="flex cursor-pointer items-center gap-[0.5rem] rounded-[0.3rem] px-[0.3rem] hover:bg-gris">
                  <input type="checkbox" checked={valeur.includes(p.id)} onChange={() => basculer(p.id)} />
                  <span>{nom(p)}</span>
                  {p.chambre && <span className="ml-auto text-[#666]">ch. {p.chambre.numero}</span>}
                </label>
              </li>
            ))}
            {!filtres.length && <li className="px-[0.3rem] text-[#666]">Aucun patient trouvé.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
