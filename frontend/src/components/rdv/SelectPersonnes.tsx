/**
 * Choix de zéro, une ou plusieurs personnes (soignants ou patients), avec recherche.
 * La première ligne « Aucun » est cochée tant que personne n'est choisi ;
 * la cocher vide la sélection.
 *  - Patients : plusieurs patients = séance de groupe (un RDV par patient côté backend).
 *  - Soignants : tous les soignants choisis partagent le RDV (il apparaît dans chaque agenda).
 */
import { useEffect, useId, useRef, useState } from "react";

export interface OptionPersonne {
  id: number;
  libelle: string; // « DUPONT Daniel »
  detail?: string; // « ch. 101 », « Kinésithérapeute »
}

interface Props {
  options: OptionPersonne[]; // déjà triées
  valeur: number[];
  onChange: (ids: number[]) => void;
  idLibelle: string; // id du libellé de la ligne (accessibilité)
  placeholderRecherche: string;
  aucunTrouve: string;
}

export function SelectPersonnes({ options, valeur, onChange, idLibelle, placeholderRecherche, aucunTrouve }: Props) {
  const [ouvert, setOuvert] = useState(false);
  const [recherche, setRecherche] = useState("");
  const idListe = useId();
  const racine = useRef<HTMLDivElement>(null);

  // Fermeture en cliquant n'importe où ailleurs. Écoute en phase de capture :
  // le pop-up (Modal) arrête la propagation des clics, un écouteur classique
  // sur document ne les recevrait donc jamais.
  useEffect(() => {
    if (!ouvert) return;
    const clic = (e: MouseEvent) => {
      if (!racine.current?.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener("mousedown", clic, true);
    return () => document.removeEventListener("mousedown", clic, true);
  }, [ouvert]);

  const filtres = options.filter((o) =>
    `${o.libelle} ${o.detail ?? ""}`.toLowerCase().includes(recherche.trim().toLowerCase()),
  );
  const choisis = options.filter((o) => valeur.includes(o.id));
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
        {choisis.length ? choisis.map((o) => o.libelle).join(", ") : "Aucun"}
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
            placeholder={placeholderRecherche}
            aria-label={placeholderRecherche}
            className="mb-[0.4rem] w-full rounded-[0.4rem] border border-[#bbb] px-[0.5rem] py-[0.2rem] text-[0.95rem]"
          />
          <ul className="max-h-[12rem] overflow-y-auto text-[0.95rem]">
            <li>
              <label className="flex cursor-pointer items-center gap-[0.5rem] rounded-[0.3rem] px-[0.3rem] italic hover:bg-gris">
                <input type="checkbox" checked={valeur.length === 0} onChange={() => onChange([])} />
                <span>Aucun</span>
              </label>
            </li>
            {filtres.map((o) => (
              <li key={o.id}>
                <label className="flex cursor-pointer items-center gap-[0.5rem] rounded-[0.3rem] px-[0.3rem] hover:bg-gris">
                  <input type="checkbox" checked={valeur.includes(o.id)} onChange={() => basculer(o.id)} />
                  <span>{o.libelle}</span>
                  {o.detail && <span className="ml-auto truncate pl-[0.5rem] text-[#666]">{o.detail}</span>}
                </label>
              </li>
            ))}
            {!filtres.length && <li className="px-[0.3rem] text-[#666]">{aucunTrouve}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
