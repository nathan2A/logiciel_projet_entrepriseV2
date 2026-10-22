/**
 * Pop-ups de message (maquettes 09 « Erreur » et 16 « Action réalisée »),
 * accessibles depuis n'importe quel écran.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { PopupMessage } from "@/components/ui/PopupMessage";

type Notification = { variante: "erreur" | "succes"; message: string; details?: string[] } | null;

interface ValeurNotifications {
  /** `details` : liste affichée sous le message (ex. conflits bloquants). */
  erreur: (message?: string, details?: string[]) => void;
  succes: (message?: string) => void;
}

const Contexte = createContext<ValeurNotifications | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notif, setNotif] = useState<Notification>(null);

  const erreur = useCallback(
    (message = "L’action n’a pas pu être effectuée.", details?: string[]) =>
      setNotif({ variante: "erreur", message, details }),
    [],
  );
  const succes = useCallback((message = "Action réalisée !") => setNotif({ variante: "succes", message }), []);
  const valeur = useMemo(() => ({ erreur, succes }), [erreur, succes]);

  return (
    <Contexte.Provider value={valeur}>
      {children}
      {notif?.variante === "erreur" && (
        <PopupMessage variante="erreur" titre="Erreur" onFermer={() => setNotif(null)}>
          {notif.message}
          {notif.details?.length ? (
            <ul className="mt-[0.3rem] list-disc pl-[1.2rem] text-left text-[0.95rem]">
              {notif.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          ) : null}
        </PopupMessage>
      )}
      {notif?.variante === "succes" && (
        <PopupMessage variante="succes" onFermer={() => setNotif(null)} fermetureAuto>
          {notif.message}
        </PopupMessage>
      )}
    </Contexte.Provider>
  );
}

export function useNotifications(): ValeurNotifications {
  const v = useContext(Contexte);
  if (!v) throw new Error("useNotifications doit être utilisé dans <NotificationsProvider>");
  return v;
}
