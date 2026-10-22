/**
 * Comportement commun des pop-ups (accessibilité) : fermeture avec Échap,
 * focus placé dans la fenêtre à l'ouverture, Tab bloqué à l'intérieur,
 * focus rendu à l'élément d'origine à la fermeture.
 */
import { useEffect, useRef } from "react";

const FOCUSABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Pile des fenêtres ouvertes : seule celle du dessus réagit au clavier. */
const pile: object[] = [];

export function useDialogue<T extends HTMLElement>(onFermer: () => void) {
  const ref = useRef<T>(null);
  const fermer = useRef(onFermer);
  fermer.current = onFermer;

  useEffect(() => {
    const jeton = {};
    pile.push(jeton);
    const precedent = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const premier = el?.querySelector<HTMLElement>("[data-autofocus]") ?? el?.querySelector<HTMLElement>(FOCUSABLES);
    (premier ?? el)?.focus();

    const auClavier = (e: KeyboardEvent) => {
      if (pile[pile.length - 1] !== jeton) return; // une autre fenêtre est au-dessus
      if (e.key === "Escape") {
        e.stopPropagation();
        fermer.current();
      }
      if (e.key === "Tab" && el) {
        const liste = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLES));
        if (!liste.length) return;
        const [debut, fin] = [liste[0], liste[liste.length - 1]];
        if (e.shiftKey && document.activeElement === debut) {
          e.preventDefault();
          fin.focus();
        } else if (!e.shiftKey && document.activeElement === fin) {
          e.preventDefault();
          debut.focus();
        }
      }
    };
    document.addEventListener("keydown", auClavier);
    return () => {
      document.removeEventListener("keydown", auClavier);
      pile.splice(pile.indexOf(jeton), 1);
      precedent?.focus?.();
    };
  }, []);

  return ref;
}
