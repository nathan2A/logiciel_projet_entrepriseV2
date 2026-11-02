import { jjmmaaaa } from "@/utils/dates";

/** « Date 14/10/2026 » centré en haut des écrans (lettres espacées, comme la maquette). */
export function EnteteDate({ prefixe = "Date" }: { prefixe?: string }) {
  return (
    <p className="pt-[0.9rem] text-center text-[0.95rem] tracking-date">
      {prefixe} {jjmmaaaa(new Date())}
    </p>
  );
}
