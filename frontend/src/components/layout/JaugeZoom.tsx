/**
 * Jauge de zoom (en haut à droite, à côté de « Actualiser ») : agrandit ou
 * réduit la zone de travail (agenda, unités, profil…) sans toucher au menu
 * latéral ni aux boutons du haut. Le niveau est mémorisé sur cet ordinateur.
 */
import { useCallback, useState } from "react";
import { FaMagnifyingGlassMinus, FaMagnifyingGlassPlus } from "react-icons/fa6";

export const ZOOM_MIN = 75;
export const ZOOM_MAX = 150;
const PAS = 10;
const CLE = "agenda-smr.zoom";

const borner = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z)));

function lireZoom(): number {
  try {
    const v = Number(localStorage.getItem(CLE));
    return v ? borner(v) : 100;
  } catch {
    return 100; // stockage indisponible (navigation privée…) : 100 %
  }
}

/** Niveau de zoom en %, mémorisé dans le navigateur. */
export function useZoom() {
  const [zoom, setZoomEtat] = useState(lireZoom);
  const setZoom = useCallback((z: number) => {
    const b = borner(z);
    setZoomEtat(b);
    try {
      localStorage.setItem(CLE, String(b));
    } catch {
      /* sans conséquence : le zoom ne sera simplement pas mémorisé */
    }
  }, []);
  return { zoom, setZoom };
}

export function JaugeZoom({ zoom, onChange }: { zoom: number; onChange: (z: number) => void }) {
  const bouton =
    "grid h-[2.2rem] w-[2.2rem] place-items-center rounded-full text-[1rem] text-[#333] transition hover:bg-gris disabled:opacity-40";
  return (
    <div role="group" aria-label="Zoom de l'affichage" className="flex items-center gap-[0.15rem] rounded-full bg-white/90 pr-[0.4rem]">
      <button type="button" className={bouton} onClick={() => onChange(zoom - PAS)} disabled={zoom <= ZOOM_MIN} aria-label="Réduire" title="Réduire">
        <FaMagnifyingGlassMinus aria-hidden />
      </button>
      <input
        type="range"
        min={ZOOM_MIN}
        max={ZOOM_MAX}
        step={PAS}
        value={zoom}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Niveau de zoom"
        aria-valuetext={`${zoom} %`}
        className="w-[6rem] accent-[#555]"
      />
      <button type="button" className={bouton} onClick={() => onChange(zoom + PAS)} disabled={zoom >= ZOOM_MAX} aria-label="Agrandir" title="Agrandir">
        <FaMagnifyingGlassPlus aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => onChange(100)}
        title="Revenir à 100 %"
        aria-label={`Zoom ${zoom} %, revenir à 100 %`}
        className="min-w-[3rem] rounded-full px-[0.3rem] text-[0.85rem] tabular-nums text-[#333] hover:bg-gris"
      >
        {zoom} %
      </button>
    </div>
  );
}
