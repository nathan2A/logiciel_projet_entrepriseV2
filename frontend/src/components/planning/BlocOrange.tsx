import type { ReactNode } from "react";

/** Bloc orange arrondi : « NOM Prénom : chambre » et « Ajouter un RDV ». */
export function BlocOrange({ children, onClick, libelleAccessible }: { children: ReactNode; onClick?: () => void; libelleAccessible?: string }) {
  const classes =
    "flex min-h-[3.9rem] w-full items-center justify-center rounded-charte bg-orange px-[1rem] text-center text-[1.55rem] font-bold leading-tight";
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label={libelleAccessible} className={`${classes} transition hover:brightness-95 active:brightness-90`}>
        {children}
      </button>
    );
  }
  return <div className={classes}>{children}</div>;
}
