import type { ReactNode } from "react";

/**
 * Bloc orange arrondi : « NOM Prénom : chambre » et « Ajouter un RDV ».
 * Cliquable si `onClick` (le bloc du nom ouvre le profil ou la fiche patient).
 */
export function BlocOrange({
  children,
  onClick,
  libelleAccessible,
  titreBulle,
}: {
  children: ReactNode;
  onClick?: () => void;
  libelleAccessible?: string;
  titreBulle?: string;
}) {
  const classes =
    "flex min-h-[3.9rem] w-full items-center justify-center rounded-charte bg-orange px-[1rem] text-center text-[1.55rem] font-bold leading-tight";
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={libelleAccessible}
        title={titreBulle}
        className={`${classes} transition hover:brightness-95 active:brightness-90`}
      >
        {children}
      </button>
    );
  }
  return <div className={classes}>{children}</div>;
}
